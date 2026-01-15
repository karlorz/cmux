package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// listenerConfig describes a single listener endpoint
type listenerConfig struct {
	bindAddr string // e.g., "0.0.0.0" or "127.0.0.1"
	port     int
	name     string // descriptive name for logging
}

type proxyConfig struct {
	listeners  []listenerConfig
	targetPort int
	targetHost string
	hostHeader string
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func parsePort(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 || value > 65535 {
		log.Fatalf("invalid port value %q", raw)
	}
	return value
}

// parseInternalPorts parses CMUX_CDP_INTERNAL_PORTS env var (CSV of ports)
// Returns empty slice if not set or empty
func parseInternalPorts(raw string) []int {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	var ports []int
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		port, err := strconv.Atoi(p)
		if err != nil || port <= 0 || port > 65535 {
			log.Printf("warning: ignoring invalid internal port %q", p)
			continue
		}
		ports = append(ports, port)
	}
	return ports
}

func loadConfig() proxyConfig {
	targetPort := parsePort(getenv("CMUX_CDP_TARGET_PORT", "39382"), 39382)
	externalPort := parsePort(getenv("CMUX_CDP_PROXY_PORT", "39381"), 39381)

	// Build listener list
	listeners := []listenerConfig{
		{
			bindAddr: "0.0.0.0",
			port:     externalPort,
			name:     "external",
		},
	}

	// Parse internal ports from env var
	// Default: enable 9222 if CMUX_CDP_INTERNAL_PORTS is not set
	internalPortsEnv := os.Getenv("CMUX_CDP_INTERNAL_PORTS")
	var internalPorts []int
	if internalPortsEnv == "" {
		// Default: enable 9222 for MCP tools
		internalPorts = []int{9222}
	} else if internalPortsEnv == "none" || internalPortsEnv == "disabled" {
		// Explicitly disabled
		internalPorts = nil
	} else {
		internalPorts = parseInternalPorts(internalPortsEnv)
	}

	// Add internal listeners (bound to 127.0.0.1 only for security)
	for i, port := range internalPorts {
		name := "internal"
		if i == 0 {
			name = "internal-primary"
		} else {
			name = fmt.Sprintf("internal-%d", i+1)
		}
		listeners = append(listeners, listenerConfig{
			bindAddr: "127.0.0.1",
			port:     port,
			name:     name,
		})
	}

	return proxyConfig{
		listeners:  listeners,
		targetPort: targetPort,
		targetHost: getenv("CMUX_CDP_TARGET_HOST", "127.0.0.1"),
		hostHeader: getenv("CMUX_CDP_TARGET_HOST_HEADER", fmt.Sprintf("localhost:%d", targetPort)),
	}
}

// createProxy creates the reverse proxy handler for CDP forwarding
func createProxy(cfg proxyConfig) *httputil.ReverseProxy {
	targetURL := &url.URL{
		Scheme: "http",
		Host:   net.JoinHostPort(cfg.targetHost, strconv.Itoa(cfg.targetPort)),
	}

	// Custom dialer with TCP_NODELAY for low-latency proxying
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	// Custom transport with TCP_NODELAY enabled
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			conn, err := dialer.DialContext(ctx, network, addr)
			if err != nil {
				return nil, err
			}
			if tcpConn, ok := conn.(*net.TCPConn); ok {
				if err := tcpConn.SetNoDelay(true); err != nil {
					log.Printf("warning: failed to set TCP_NODELAY: %v", err)
				}
			}
			return conn, nil
		},
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	proxy.Transport = transport
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = cfg.hostHeader
		req.Header.Set("Host", cfg.hostHeader)
		req.Header.Del("Proxy-Connection")
	}

	proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
		log.Printf("proxy error: %v", err)
		rw.Header().Set("Content-Type", "text/plain")
		rw.WriteHeader(http.StatusBadGateway)
		_, _ = rw.Write([]byte("Bad Gateway"))
	}

	proxy.FlushInterval = 100 * time.Millisecond

	return proxy
}

// startListener starts an HTTP server on the specified listener config
// Returns when the server exits or encounters an error
func startListener(lc listenerConfig, handler http.Handler, errCh chan<- error) {
	addr := net.JoinHostPort(lc.bindAddr, strconv.Itoa(lc.port))
	server := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("[%s] starting listener on %s", lc.name, addr)

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		errCh <- fmt.Errorf("[%s] listener on %s failed: %w", lc.name, addr, err)
	}
}

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	cfg := loadConfig()

	if len(cfg.listeners) == 0 {
		log.Fatal("no listeners configured")
	}

	proxy := createProxy(cfg)
	log.Print("TCP_NODELAY enabled for low-latency proxying")

	targetAddr := net.JoinHostPort(cfg.targetHost, strconv.Itoa(cfg.targetPort))
	log.Printf("forwarding all listeners to %s (Host header: %s)", targetAddr, cfg.hostHeader)

	// Log listener summary
	for _, lc := range cfg.listeners {
		bindType := "external"
		if lc.bindAddr == "127.0.0.1" {
			bindType = "internal-only"
		}
		log.Printf("  - %s:%d (%s, %s)", lc.bindAddr, lc.port, lc.name, bindType)
	}

	// Channel to collect errors from listeners
	errCh := make(chan error, len(cfg.listeners))

	// Start all listeners concurrently
	var wg sync.WaitGroup
	for _, lc := range cfg.listeners {
		wg.Add(1)
		go func(lc listenerConfig) {
			defer wg.Done()
			startListener(lc, proxy, errCh)
		}(lc)
	}

	// Wait for first error or all listeners to exit
	go func() {
		wg.Wait()
		close(errCh)
	}()

	// Block until we receive an error
	for err := range errCh {
		log.Printf("listener error: %v", err)
	}

	log.Fatal("all listeners have stopped")
}
