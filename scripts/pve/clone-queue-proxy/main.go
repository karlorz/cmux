package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
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

// Config holds the proxy configuration
type Config struct {
	ListenAddr     string
	PVEBackend     string
	InsecureTLS    bool
	TaskPollDelay  time.Duration
	TaskTimeout    time.Duration
	RequestTimeout time.Duration
}

// CloneQueue manages serialized clone operations
type CloneQueue struct {
	mu       sync.Mutex
	inFlight bool
	queue    chan *cloneRequest
	config   *Config
	client   *http.Client
}

type cloneRequest struct {
	w          http.ResponseWriter
	r          *http.Request
	done       chan struct{}
	body       []byte
	node       string
	vmid       string
}

// PVE API response structures
type PVEResponse struct {
	Data interface{} `json:"data"`
}

type TaskStatus struct {
	Status     string `json:"status"`
	ExitStatus string `json:"exitstatus"`
	Type       string `json:"type"`
	Node       string `json:"node"`
	User       string `json:"user"`
	StartTime  int64  `json:"starttime"`
	EndTime    int64  `json:"endtime"`
	PID        int    `json:"pid"`
	UPID       string `json:"upid"`
}

// Clone endpoint pattern: POST /api2/json/nodes/{node}/lxc/{vmid}/clone
var clonePathRegex = regexp.MustCompile(`^/api2/json/nodes/([^/]+)/lxc/(\d+)/clone$`)

func main() {
	config := &Config{}
	flag.StringVar(&config.ListenAddr, "listen", ":8081", "Address to listen on")
	flag.StringVar(&config.PVEBackend, "backend", "https://127.0.0.1:8006", "PVE API backend URL")
	flag.BoolVar(&config.InsecureTLS, "insecure", true, "Skip TLS verification for backend")
	flag.DurationVar(&config.TaskPollDelay, "poll-delay", 500*time.Millisecond, "Delay between task status polls")
	flag.DurationVar(&config.TaskTimeout, "task-timeout", 5*time.Minute, "Maximum time to wait for clone task")
	flag.DurationVar(&config.RequestTimeout, "request-timeout", 30*time.Second, "Timeout for individual API requests")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.Printf("PVE Clone Queue Proxy starting")
	log.Printf("  Listen: %s", config.ListenAddr)
	log.Printf("  Backend: %s", config.PVEBackend)
	log.Printf("  Task timeout: %s", config.TaskTimeout)

	backendURL, err := url.Parse(config.PVEBackend)
	if err != nil {
		log.Fatalf("Invalid backend URL: %v", err)
	}

	// HTTP client for task status polling
	httpClient := &http.Client{
		Timeout: config.RequestTimeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: config.InsecureTLS,
			},
		},
	}

	queue := &CloneQueue{
		queue:  make(chan *cloneRequest, 100),
		config: config,
		client: httpClient,
	}

	// Start the queue processor
	go queue.processor(backendURL)

	// Create reverse proxy for pass-through requests
	proxy := httputil.NewSingleHostReverseProxy(backendURL)
	proxy.Transport = &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: config.InsecureTLS,
		},
	}

	// Custom error handler
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("Proxy error: %v", err)
		http.Error(w, fmt.Sprintf("Proxy error: %v", err), http.StatusBadGateway)
	}

	handler := &ProxyHandler{
		queue:      queue,
		proxy:      proxy,
		backendURL: backendURL,
	}

	server := &http.Server{
		Addr:         config.ListenAddr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: config.TaskTimeout + 30*time.Second, // Allow for task completion
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf("Listening on %s", config.ListenAddr)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
	log.Println("Server stopped")
}

// ProxyHandler routes requests to either the queue or direct proxy
type ProxyHandler struct {
	queue      *CloneQueue
	proxy      *httputil.ReverseProxy
	backendURL *url.URL
}

func (h *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Check if this is a clone request
	if r.Method == http.MethodPost && clonePathRegex.MatchString(r.URL.Path) {
		h.handleCloneRequest(w, r)
		return
	}

	// Pass through all other requests
	log.Printf("PASS-THROUGH: %s %s", r.Method, r.URL.Path)
	h.proxy.ServeHTTP(w, r)
}

func (h *ProxyHandler) handleCloneRequest(w http.ResponseWriter, r *http.Request) {
	matches := clonePathRegex.FindStringSubmatch(r.URL.Path)
	if len(matches) != 3 {
		http.Error(w, "Invalid clone path", http.StatusBadRequest)
		return
	}

	node := matches[1]
	vmid := matches[2]

	// Read the body so we can replay it
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("CLONE ERROR: Failed to read body: %v", err)
		http.Error(w, "Failed to read request body", http.StatusInternalServerError)
		return
	}
	r.Body.Close()

	log.Printf("CLONE QUEUED: node=%s vmid=%s", node, vmid)

	req := &cloneRequest{
		w:    w,
		r:    r,
		done: make(chan struct{}),
		body: body,
		node: node,
		vmid: vmid,
	}

	// Queue the request
	select {
	case h.queue.queue <- req:
		// Wait for completion
		<-req.done
	default:
		log.Printf("CLONE REJECTED: Queue full")
		http.Error(w, "Clone queue full", http.StatusServiceUnavailable)
	}
}

// processor handles queued clone requests one at a time
func (q *CloneQueue) processor(backendURL *url.URL) {
	for req := range q.queue {
		q.processClone(req, backendURL)
		close(req.done)
	}
}

func (q *CloneQueue) processClone(req *cloneRequest, backendURL *url.URL) {
	q.mu.Lock()
	q.inFlight = true
	q.mu.Unlock()
	defer func() {
		q.mu.Lock()
		q.inFlight = false
		q.mu.Unlock()
	}()

	startTime := time.Now()
	log.Printf("CLONE START: node=%s vmid=%s", req.node, req.vmid)

	// Build the backend request
	targetURL := *backendURL
	targetURL.Path = req.r.URL.Path
	targetURL.RawQuery = req.r.URL.RawQuery

	proxyReq, err := http.NewRequest(req.r.Method, targetURL.String(), strings.NewReader(string(req.body)))
	if err != nil {
		log.Printf("CLONE ERROR: Failed to create request: %v", err)
		http.Error(req.w, "Failed to create backend request", http.StatusInternalServerError)
		return
	}

	// Copy headers
	for key, values := range req.r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}
	proxyReq.Header.Set("Content-Length", fmt.Sprintf("%d", len(req.body)))

	// Make the clone request to PVE
	resp, err := q.client.Do(proxyReq)
	if err != nil {
		log.Printf("CLONE ERROR: Backend request failed: %v", err)
		http.Error(req.w, fmt.Sprintf("Backend request failed: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("CLONE ERROR: Failed to read response: %v", err)
		http.Error(req.w, "Failed to read backend response", http.StatusInternalServerError)
		return
	}

	// If the clone request failed, return the error immediately
	if resp.StatusCode >= 400 {
		log.Printf("CLONE FAILED: node=%s vmid=%s status=%d", req.node, req.vmid, resp.StatusCode)
		for key, values := range resp.Header {
			for _, value := range values {
				req.w.Header().Add(key, value)
			}
		}
		req.w.WriteHeader(resp.StatusCode)
		req.w.Write(respBody)
		return
	}

	// Parse the response to get the UPID
	var pveResp PVEResponse
	if err := json.Unmarshal(respBody, &pveResp); err != nil {
		log.Printf("CLONE WARNING: Failed to parse response, returning as-is: %v", err)
		for key, values := range resp.Header {
			for _, value := range values {
				req.w.Header().Add(key, value)
			}
		}
		req.w.WriteHeader(resp.StatusCode)
		req.w.Write(respBody)
		return
	}

	upid, ok := pveResp.Data.(string)
	if !ok || upid == "" {
		log.Printf("CLONE WARNING: No UPID in response, returning as-is")
		for key, values := range resp.Header {
			for _, value := range values {
				req.w.Header().Add(key, value)
			}
		}
		req.w.WriteHeader(resp.StatusCode)
		req.w.Write(respBody)
		return
	}

	log.Printf("CLONE TASK: node=%s vmid=%s upid=%s", req.node, req.vmid, upid)

	// Poll task status until completion
	taskComplete, taskErr := q.waitForTask(req.r, req.node, upid)
	elapsed := time.Since(startTime)

	if taskErr != nil {
		log.Printf("CLONE ERROR: Task polling failed: %v (elapsed: %s)", taskErr, elapsed)
		// Still return the original response - the task may have succeeded
	}

	if taskComplete {
		log.Printf("CLONE COMPLETE: node=%s vmid=%s upid=%s (elapsed: %s)", req.node, req.vmid, upid, elapsed)
	} else {
		log.Printf("CLONE TIMEOUT: node=%s vmid=%s upid=%s (elapsed: %s)", req.node, req.vmid, upid, elapsed)
	}

	// Return the original response
	for key, values := range resp.Header {
		for _, value := range values {
			req.w.Header().Add(key, value)
		}
	}
	req.w.WriteHeader(resp.StatusCode)
	req.w.Write(respBody)
}

// waitForTask polls the task status until completion or timeout
func (q *CloneQueue) waitForTask(originalReq *http.Request, node, upid string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), q.config.TaskTimeout)
	defer cancel()

	// URL-encode the UPID
	encodedUPID := url.PathEscape(upid)
	statusPath := fmt.Sprintf("/api2/json/nodes/%s/tasks/%s/status", node, encodedUPID)

	backendURL, _ := url.Parse(q.config.PVEBackend)

	for {
		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case <-time.After(q.config.TaskPollDelay):
			targetURL := *backendURL
			targetURL.Path = statusPath

			req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL.String(), nil)
			if err != nil {
				return false, fmt.Errorf("failed to create status request: %w", err)
			}

			// Copy auth headers from original request
			if auth := originalReq.Header.Get("Authorization"); auth != "" {
				req.Header.Set("Authorization", auth)
			}
			if cookie := originalReq.Header.Get("Cookie"); cookie != "" {
				req.Header.Set("Cookie", cookie)
			}
			// PVE API token header
			if apiToken := originalReq.Header.Get("Authorization"); apiToken != "" {
				req.Header.Set("Authorization", apiToken)
			}

			resp, err := q.client.Do(req)
			if err != nil {
				log.Printf("TASK POLL ERROR: %v", err)
				continue // Retry on network errors
			}

			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				log.Printf("TASK POLL ERROR: Failed to read body: %v", err)
				continue
			}

			if resp.StatusCode != http.StatusOK {
				log.Printf("TASK POLL ERROR: status=%d body=%s", resp.StatusCode, string(body))
				continue
			}

			var statusResp struct {
				Data TaskStatus `json:"data"`
			}
			if err := json.Unmarshal(body, &statusResp); err != nil {
				log.Printf("TASK POLL ERROR: Failed to parse: %v", err)
				continue
			}

			status := statusResp.Data.Status
			exitStatus := statusResp.Data.ExitStatus

			// Task is complete when status is "stopped"
			if status == "stopped" {
				if exitStatus != "OK" && exitStatus != "" {
					log.Printf("TASK FINISHED: status=%s exitstatus=%s", status, exitStatus)
				}
				return true, nil
			}

			log.Printf("TASK POLLING: status=%s", status)
		}
	}
}
