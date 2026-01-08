package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
)

var (
	clonePathPattern = regexp.MustCompile(`^/api2/json/nodes/([^/]+)/lxc/(\d+)/clone/?$`)
	hopByHopHeaders  = map[string]struct{}{
		"Connection":          {},
		"Proxy-Connection":    {},
		"Keep-Alive":          {},
		"Proxy-Authenticate":  {},
		"Proxy-Authorization": {},
		"Te":                  {},
		"Trailer":             {},
		"Transfer-Encoding":   {},
		"Upgrade":             {},
	}
)

// config holds runtime settings sourced from environment variables.
type config struct {
	listenAddr    string
	targetURL     string
	pollInterval  time.Duration
	pollTimeout   time.Duration
	skipTLSVerify bool
}

func main() {
	cfg := config{
		listenAddr:    getenv("CLONE_PROXY_LISTEN", "127.0.0.1:8081"),
		targetURL:     getenv("CLONE_PROXY_TARGET", getenv("PVE_API_URL", "https://127.0.0.1:8006")),
		pollInterval:  mustParseDuration(getenv("CLONE_PROXY_POLL_INTERVAL", "2s")),
		pollTimeout:   mustParseDuration(getenv("CLONE_PROXY_POLL_TIMEOUT", "15m")),
		skipTLSVerify: strings.EqualFold(getenv("CLONE_PROXY_SKIP_TLS_VERIFY", "false"), "true"),
	}

	proxy, err := newCloneProxy(cfg)
	if err != nil {
		log.Fatalf("failed to initialize proxy: %v", err)
	}

	srv := &http.Server{
		Addr:              cfg.listenAddr,
		Handler:           proxy,
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	shutdownCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		<-shutdownCtx.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("graceful shutdown failed: %v", err)
		}
	}()

	log.Printf("pve clone proxy listening on %s -> %s", cfg.listenAddr, cfg.targetURL)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server exited with error: %v", err)
	}
}

// cloneProxy proxies requests to the PVE API while serializing clone operations.
type cloneProxy struct {
	target       *url.URL
	reverseProxy *httputil.ReverseProxy
	httpClient   *http.Client
	pollInterval time.Duration
	pollTimeout  time.Duration

	cloneSlots chan struct{}
	mu         sync.Mutex
}

func newCloneProxy(cfg config) (*cloneProxy, error) {
	target, err := url.Parse(cfg.targetURL)
	if err != nil {
		return nil, err
	}

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: cfg.skipTLSVerify},
	}

	rp := httputil.NewSingleHostReverseProxy(target)
	rp.Transport = transport
	rp.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("proxy error: %v", err)
		http.Error(w, "upstream error", http.StatusBadGateway)
	}

	return &cloneProxy{
		target:       target,
		reverseProxy: rp,
		httpClient:   &http.Client{Transport: transport},
		pollInterval: cfg.pollInterval,
		pollTimeout:  cfg.pollTimeout,
		cloneSlots:   make(chan struct{}, 1),
	}, nil
}

func (p *cloneProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost && clonePathPattern.MatchString(r.URL.Path) {
		p.handleClone(w, r)
		return
	}
	p.reverseProxy.ServeHTTP(w, r)
}

func (p *cloneProxy) handleClone(w http.ResponseWriter, r *http.Request) {
	p.cloneSlots <- struct{}{} // blocks and queues clone operations

	release := func() {
		<-p.cloneSlots
	}

	matches := clonePathPattern.FindStringSubmatch(r.URL.Path)
	node := matches[1]

	body, err := io.ReadAll(r.Body)
	if err != nil {
		release()
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	r.Body.Close()

	upstreamURL := p.joinURL(r.URL)
	upstreamReq, err := http.NewRequestWithContext(r.Context(), r.Method, upstreamURL.String(), bytes.NewReader(body))
	if err != nil {
		release()
		http.Error(w, "failed to build upstream request", http.StatusBadRequest)
		return
	}
	upstreamReq.ContentLength = int64(len(body))
	upstreamReq.Host = p.target.Host
	copyHeaders(upstreamReq.Header, r.Header)
	addForwardHeaders(upstreamReq, r)

	resp, err := p.httpClient.Do(upstreamReq)
	if err != nil {
		release()
		log.Printf("clone request failed: %v", err)
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		release()
		log.Printf("failed reading upstream response: %v", err)
		http.Error(w, "failed to read upstream response", http.StatusBadGateway)
		return
	}

	copyResponseHeaders(w.Header(), resp.Header)
	w.WriteHeader(resp.StatusCode)
	if _, err := w.Write(respBody); err != nil {
		log.Printf("failed writing response to client: %v", err)
	}

	if resp.StatusCode >= 300 {
		release()
		return
	}

	upid := extractUPID(respBody)
	if upid == "" {
		release()
		return
	}

	authHeaders := cloneAuthHeaders(r.Header)

	go func() {
		defer release()
		ctx, cancel := context.WithTimeout(context.Background(), p.pollTimeout)
		defer cancel()
		p.waitForTask(ctx, node, upid, authHeaders)
	}()
}

func (p *cloneProxy) waitForTask(ctx context.Context, node, upid string, authHeaders http.Header) {
	statusURL := p.taskStatusURL(node, upid)

	ticker := time.NewTicker(p.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("poll timeout for %s: %v", upid, ctx.Err())
			return
		case <-ticker.C:
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
			if err != nil {
				log.Printf("failed to build status request: %v", err)
				continue
			}
			copyHeaders(req.Header, authHeaders)

			resp, err := p.httpClient.Do(req)
			if err != nil {
				log.Printf("status poll failed for %s: %v", upid, err)
				continue
			}

			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				log.Printf("status response read failed for %s: %v", upid, err)
				continue
			}

			if resp.StatusCode >= 300 {
				log.Printf("status poll returned %d for %s: %s", resp.StatusCode, upid, strings.TrimSpace(string(body)))
				continue
			}

			status := parseTaskStatus(body)
			if status == "running" {
				continue
			}

			log.Printf("clone task %s finished with status=%s", upid, status)
			return
		}
	}
}

func (p *cloneProxy) taskStatusURL(node, upid string) string {
	escaped := url.PathEscape(upid)
	path := "/api2/json/nodes/" + url.PathEscape(node) + "/tasks/" + escaped + "/status"

	u := *p.target
	u.Path = singleJoiningSlash(p.target.Path, path)
	u.RawQuery = ""
	return u.String()
}

func (p *cloneProxy) joinURL(reqURL *url.URL) *url.URL {
	target := *p.target
	target.Path = singleJoiningSlash(p.target.Path, reqURL.Path)
	if reqURL.RawQuery == "" {
		target.RawQuery = ""
	} else {
		target.RawQuery = reqURL.RawQuery
	}
	return &target
}

func extractUPID(body []byte) string {
	var payload struct {
		Data any `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}

	switch v := payload.Data.(type) {
	case string:
		return v
	case map[string]any:
		if upid, ok := v["upid"].(string); ok {
			return upid
		}
	}
	return ""
}

func parseTaskStatus(body []byte) string {
	var payload struct {
		Data struct {
			Status     string `json:"status"`
			ExitStatus string `json:"exitstatus"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}

	if payload.Data.Status != "" {
		return payload.Data.Status
	}
	if payload.Data.ExitStatus != "" {
		return payload.Data.ExitStatus
	}
	return ""
}

func copyHeaders(dst, src http.Header) {
	for k, vs := range src {
		if _, skip := hopByHopHeaders[k]; skip {
			continue
		}
		for _, v := range vs {
			dst.Add(k, v)
		}
	}
}

func copyResponseHeaders(dst, src http.Header) {
	for k, vs := range src {
		if _, skip := hopByHopHeaders[k]; skip {
			continue
		}
		for _, v := range vs {
			dst.Add(k, v)
		}
	}
}

func cloneAuthHeaders(src http.Header) http.Header {
	dst := http.Header{}
	for _, key := range []string{"Authorization", "Cookie", "CSRFPreventionToken", "Ticket"} {
		if values, ok := src[key]; ok {
			for _, v := range values {
				dst.Add(key, v)
			}
		}
	}
	return dst
}

func addForwardHeaders(outReq, inReq *http.Request) {
	clientIP, _, err := net.SplitHostPort(inReq.RemoteAddr)
	if err == nil {
		if prior := inReq.Header.Get("X-Forwarded-For"); prior != "" {
			clientIP = prior + ", " + clientIP
		}
		outReq.Header.Set("X-Forwarded-For", clientIP)
	}

	if xfProto := inReq.Header.Get("X-Forwarded-Proto"); xfProto != "" {
		outReq.Header.Set("X-Forwarded-Proto", xfProto)
	} else if inReq.TLS != nil {
		outReq.Header.Set("X-Forwarded-Proto", "https")
	} else {
		outReq.Header.Set("X-Forwarded-Proto", "http")
	}

	if xfHost := inReq.Header.Get("X-Forwarded-Host"); xfHost != "" {
		outReq.Header.Set("X-Forwarded-Host", xfHost)
	} else {
		outReq.Header.Set("X-Forwarded-Host", inReq.Host)
	}
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func mustParseDuration(v string) time.Duration {
	d, err := time.ParseDuration(v)
	if err != nil {
		log.Fatalf("invalid duration %q: %v", v, err)
	}
	return d
}

func singleJoiningSlash(a, b string) string {
	aslash := strings.HasSuffix(a, "/")
	bslash := strings.HasPrefix(b, "/")
	switch {
	case aslash && bslash:
		return a + b[1:]
	case !aslash && !bslash:
		return a + "/" + b
	}
	return a + b
}
