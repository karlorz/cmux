// lxc-clone-queue - PVE LXC clone request serialization proxy
//
// This service solves the problem of concurrent LXC clone operations failing
// when multiple requests hit the same template simultaneously. PVE acquires
// locks on templates/storage during clone operations, causing "CT is locked"
// errors for concurrent requests.
//
// Solution: Queue clone requests per template and serialize them. Only one
// clone operation per template runs at a time. Other requests wait in queue.
//
// Architecture:
//   - Intercepts POST /api2/json/nodes/{node}/lxc/{vmid}/clone requests
//   - Queues requests per template VMID with a semaphore (concurrency=1)
//   - Forwards request to actual PVE API on port 8006
//   - Polls UPID until task completes
//   - Returns final result to caller
//   - Retries on lock errors with jittered exponential backoff
//
// Deployment:
//   - Runs on PVE host as systemd service (port 8081)
//   - Caddy routes clone requests to this service
//   - All other PVE API requests go directly to port 8006
//
// Build:
//   CGO_ENABLED=0 go build -ldflags="-s -w" -o lxc-clone-queue .

package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Config holds service configuration
type Config struct {
	ListenAddr      string        // Address to listen on (default :8081)
	PVEAPIAddr      string        // PVE API address (default https://127.0.0.1:8006)
	MaxRetries      int           // Max retries on lock errors (default 5)
	TaskPollInterval time.Duration // Interval for polling task status (default 2s)
	TaskTimeout     time.Duration // Max time to wait for task completion (default 5m)
	RequestTimeout  time.Duration // Max time for entire request including retries (default 10m)
	InsecureSkipTLS bool          // Skip TLS verification (default true for local PVE)
}

// TemplateQueue manages serialization of clone operations per template
type TemplateQueue struct {
	mu     sync.Mutex
	queues map[int]chan struct{} // Per-template semaphores (capacity 1)
}

// NewTemplateQueue creates a new template queue manager
func NewTemplateQueue() *TemplateQueue {
	return &TemplateQueue{
		queues: make(map[int]chan struct{}),
	}
}

// Acquire gets exclusive access to clone from a template
func (tq *TemplateQueue) Acquire(templateVmid int) {
	tq.mu.Lock()
	ch, ok := tq.queues[templateVmid]
	if !ok {
		ch = make(chan struct{}, 1)
		tq.queues[templateVmid] = ch
	}
	tq.mu.Unlock()

	// Acquire semaphore (blocks if another clone is in progress)
	ch <- struct{}{}
}

// Release frees the template for the next clone operation
func (tq *TemplateQueue) Release(templateVmid int) {
	tq.mu.Lock()
	ch, ok := tq.queues[templateVmid]
	tq.mu.Unlock()

	if ok {
		<-ch
	}
}

// QueueStats returns current queue statistics
func (tq *TemplateQueue) QueueStats() map[int]int {
	tq.mu.Lock()
	defer tq.mu.Unlock()

	stats := make(map[int]int)
	for vmid, ch := range tq.queues {
		stats[vmid] = len(ch)
	}
	return stats
}

// PVEResponse wraps PVE API responses
type PVEResponse struct {
	Data   interface{} `json:"data"`
	Errors interface{} `json:"errors,omitempty"`
}

// PVETaskStatus represents task status from PVE
type PVETaskStatus struct {
	Status     string `json:"status"`
	ExitStatus string `json:"exitstatus,omitempty"`
	Type       string `json:"type,omitempty"`
	Node       string `json:"node,omitempty"`
	UPID       string `json:"upid,omitempty"`
}

// CloneProxy handles clone request proxying with serialization
type CloneProxy struct {
	config      *Config
	queue       *TemplateQueue
	httpClient  *http.Client
	cloneRegex  *regexp.Regexp
	statusRegex *regexp.Regexp
}

// NewCloneProxy creates a new clone proxy
func NewCloneProxy(config *Config) *CloneProxy {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: config.InsecureSkipTLS,
		},
		MaxIdleConns:        100,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
	}

	return &CloneProxy{
		config: config,
		queue:  NewTemplateQueue(),
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   config.RequestTimeout,
		},
		// Match: POST /api2/json/nodes/{node}/lxc/{vmid}/clone
		cloneRegex: regexp.MustCompile(`^/api2/json/nodes/([^/]+)/lxc/(\d+)/clone$`),
		// Match: GET /api2/json/nodes/{node}/tasks/{upid}/status
		statusRegex: regexp.MustCompile(`^/api2/json/nodes/([^/]+)/tasks/([^/]+)/status$`),
	}
}

// isCloneRequest checks if this is an LXC clone request
func (cp *CloneProxy) isCloneRequest(r *http.Request) (node string, vmid int, ok bool) {
	if r.Method != http.MethodPost {
		return "", 0, false
	}

	matches := cp.cloneRegex.FindStringSubmatch(r.URL.Path)
	if matches == nil {
		return "", 0, false
	}

	vmidInt, err := strconv.Atoi(matches[2])
	if err != nil {
		return "", 0, false
	}

	return matches[1], vmidInt, true
}

// forwardRequest forwards a request to the actual PVE API
func (cp *CloneProxy) forwardRequest(r *http.Request, body []byte) (*http.Response, error) {
	targetURL := cp.config.PVEAPIAddr + r.URL.Path
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = bytes.NewReader(body)
	}

	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create proxy request: %w", err)
	}

	// Copy headers (especially Authorization)
	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	return cp.httpClient.Do(proxyReq)
}

// pollTaskCompletion waits for a PVE task to complete
func (cp *CloneProxy) pollTaskCompletion(ctx context.Context, node, upid, authHeader string) (*PVETaskStatus, error) {
	encodedUpid := url.PathEscape(upid)
	statusURL := fmt.Sprintf("%s/api2/json/nodes/%s/tasks/%s/status", cp.config.PVEAPIAddr, node, encodedUpid)

	deadline := time.Now().Add(cp.config.TaskTimeout)
	ticker := time.NewTicker(cp.config.TaskPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
			if time.Now().After(deadline) {
				return nil, fmt.Errorf("task timeout after %v", cp.config.TaskTimeout)
			}

			req, err := http.NewRequestWithContext(ctx, http.MethodGet, statusURL, nil)
			if err != nil {
				return nil, fmt.Errorf("create status request: %w", err)
			}
			req.Header.Set("Authorization", authHeader)

			resp, err := cp.httpClient.Do(req)
			if err != nil {
				log.Printf("[poll] Error checking task status: %v", err)
				continue
			}

			body, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				log.Printf("[poll] Error reading status response: %v", err)
				continue
			}

			if resp.StatusCode != http.StatusOK {
				log.Printf("[poll] Status check returned %d: %s", resp.StatusCode, string(body))
				continue
			}

			var pveResp PVEResponse
			if err := json.Unmarshal(body, &pveResp); err != nil {
				log.Printf("[poll] Error parsing status response: %v", err)
				continue
			}

			statusData, ok := pveResp.Data.(map[string]interface{})
			if !ok {
				log.Printf("[poll] Unexpected status data format")
				continue
			}

			status := &PVETaskStatus{}
			if v, ok := statusData["status"].(string); ok {
				status.Status = v
			}
			if v, ok := statusData["exitstatus"].(string); ok {
				status.ExitStatus = v
			}

			if status.Status == "stopped" {
				return status, nil
			}

			log.Printf("[poll] Task %s still running (status=%s)", upid, status.Status)
		}
	}
}

// isLockError checks if an error response indicates a lock conflict
func isLockError(statusCode int, body []byte) bool {
	if statusCode == http.StatusLocked || statusCode == http.StatusConflict {
		return true
	}

	// Check response body for lock-related error messages
	bodyStr := strings.ToLower(string(body))
	lockIndicators := []string{
		"locked",
		"lock",
		"busy",
		"in use",
		"already running",
		"task is active",
	}

	for _, indicator := range lockIndicators {
		if strings.Contains(bodyStr, indicator) {
			return true
		}
	}

	return false
}

// jitteredBackoff calculates backoff duration with jitter
func jitteredBackoff(attempt int, baseDelay time.Duration, maxDelay time.Duration) time.Duration {
	delay := baseDelay * time.Duration(1<<uint(attempt))
	if delay > maxDelay {
		delay = maxDelay
	}

	// Add 10-50% jitter
	jitter := time.Duration(rand.Int63n(int64(delay) / 2))
	return delay + jitter
}

// handleCloneRequest handles a clone request with queuing and retry logic
func (cp *CloneProxy) handleCloneRequest(w http.ResponseWriter, r *http.Request, node string, templateVmid int) {
	requestID := fmt.Sprintf("%s-%d", time.Now().Format("150405"), rand.Intn(10000))
	log.Printf("[%s] Clone request: template=%d node=%s", requestID, templateVmid, node)

	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[%s] Error reading request body: %v", requestID, err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	// Get auth header for task polling
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		log.Printf("[%s] Missing Authorization header", requestID)
		http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
		return
	}

	// Acquire exclusive access to this template
	log.Printf("[%s] Acquiring queue lock for template %d", requestID, templateVmid)
	queueStart := time.Now()
	cp.queue.Acquire(templateVmid)
	queueWait := time.Since(queueStart)
	log.Printf("[%s] Acquired lock after %v", requestID, queueWait)

	defer func() {
		cp.queue.Release(templateVmid)
		log.Printf("[%s] Released queue lock for template %d", requestID, templateVmid)
	}()

	// Retry loop with exponential backoff on lock errors
	var lastErr error
	for attempt := 0; attempt <= cp.config.MaxRetries; attempt++ {
		if attempt > 0 {
			backoff := jitteredBackoff(attempt-1, 2*time.Second, 30*time.Second)
			log.Printf("[%s] Retry %d/%d after %v", requestID, attempt, cp.config.MaxRetries, backoff)
			time.Sleep(backoff)
		}

		// Forward the clone request
		resp, err := cp.forwardRequest(r, body)
		if err != nil {
			lastErr = fmt.Errorf("forward request: %w", err)
			log.Printf("[%s] Error forwarding request: %v", requestID, err)
			continue
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("read response: %w", err)
			log.Printf("[%s] Error reading response: %v", requestID, err)
			continue
		}

		// Check for lock errors
		if isLockError(resp.StatusCode, respBody) {
			lastErr = fmt.Errorf("lock error: status=%d body=%s", resp.StatusCode, string(respBody))
			log.Printf("[%s] Lock error detected, will retry: %v", requestID, lastErr)
			continue
		}

		// Non-lock errors are fatal
		if resp.StatusCode != http.StatusOK {
			log.Printf("[%s] Clone request failed: status=%d body=%s", requestID, resp.StatusCode, string(respBody))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(resp.StatusCode)
			w.Write(respBody)
			return
		}

		// Parse UPID from response
		var pveResp PVEResponse
		if err := json.Unmarshal(respBody, &pveResp); err != nil {
			log.Printf("[%s] Error parsing response: %v", requestID, err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write(respBody)
			return
		}

		upid, ok := pveResp.Data.(string)
		if !ok {
			// Response might be in different format, return as-is
			log.Printf("[%s] No UPID in response, returning raw response", requestID)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write(respBody)
			return
		}

		log.Printf("[%s] Clone task started: UPID=%s", requestID, upid)

		// Poll for task completion
		ctx, cancel := context.WithTimeout(r.Context(), cp.config.TaskTimeout)
		taskStatus, err := cp.pollTaskCompletion(ctx, node, upid, authHeader)
		cancel()

		if err != nil {
			if isLockError(0, []byte(err.Error())) {
				lastErr = err
				log.Printf("[%s] Task poll detected lock error: %v", requestID, err)
				continue
			}
			log.Printf("[%s] Task polling failed: %v", requestID, err)
			http.Error(w, fmt.Sprintf("Task polling failed: %v", err), http.StatusInternalServerError)
			return
		}

		// Check task result
		if taskStatus.ExitStatus != "OK" && taskStatus.ExitStatus != "" {
			// Check if this is a lock error in the task result
			if isLockError(0, []byte(taskStatus.ExitStatus)) {
				lastErr = fmt.Errorf("task failed with lock error: %s", taskStatus.ExitStatus)
				log.Printf("[%s] Task failed with lock error, will retry: %v", requestID, lastErr)
				continue
			}

			log.Printf("[%s] Clone task failed: %s", requestID, taskStatus.ExitStatus)
			errorResp := PVEResponse{
				Errors: map[string]string{"task": taskStatus.ExitStatus},
			}
			respBytes, _ := json.Marshal(errorResp)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			w.Write(respBytes)
			return
		}

		// Success!
		log.Printf("[%s] Clone completed successfully", requestID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(respBody)
		return
	}

	// All retries exhausted
	log.Printf("[%s] All retries exhausted: %v", requestID, lastErr)
	http.Error(w, fmt.Sprintf("Clone failed after %d retries: %v", cp.config.MaxRetries, lastErr), http.StatusServiceUnavailable)
}

// handleHealthz handles health check requests
func (cp *CloneProxy) handleHealthz(w http.ResponseWriter, r *http.Request) {
	stats := cp.queue.QueueStats()
	response := map[string]interface{}{
		"status":      "ok",
		"service":     "lxc-clone-queue",
		"queue_stats": stats,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleStats handles statistics requests
func (cp *CloneProxy) handleStats(w http.ResponseWriter, r *http.Request) {
	stats := cp.queue.QueueStats()
	response := map[string]interface{}{
		"queued_templates": stats,
		"config": map[string]interface{}{
			"max_retries":        cp.config.MaxRetries,
			"task_poll_interval": cp.config.TaskPollInterval.String(),
			"task_timeout":       cp.config.TaskTimeout.String(),
			"request_timeout":    cp.config.RequestTimeout.String(),
		},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ServeHTTP implements http.Handler
func (cp *CloneProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Health check endpoint
	if r.URL.Path == "/healthz" {
		cp.handleHealthz(w, r)
		return
	}

	// Stats endpoint
	if r.URL.Path == "/stats" {
		cp.handleStats(w, r)
		return
	}

	// Check if this is a clone request
	if node, vmid, ok := cp.isCloneRequest(r); ok {
		cp.handleCloneRequest(w, r, node, vmid)
		return
	}

	// For non-clone requests, proxy directly (shouldn't happen if Caddy is configured correctly)
	log.Printf("[proxy] Non-clone request received, forwarding: %s %s", r.Method, r.URL.Path)
	body, _ := io.ReadAll(r.Body)
	resp, err := cp.forwardRequest(r, body)
	if err != nil {
		log.Printf("[proxy] Forward error: %v", err)
		http.Error(w, "Proxy error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func main() {
	// Parse flags
	listenAddr := flag.String("listen", ":8081", "Address to listen on")
	pveAddr := flag.String("pve-addr", "https://127.0.0.1:8006", "PVE API address")
	maxRetries := flag.Int("max-retries", 5, "Maximum retries on lock errors")
	taskPollInterval := flag.Duration("task-poll-interval", 2*time.Second, "Task polling interval")
	taskTimeout := flag.Duration("task-timeout", 5*time.Minute, "Task timeout")
	requestTimeout := flag.Duration("request-timeout", 10*time.Minute, "Request timeout (including retries)")
	insecureTLS := flag.Bool("insecure-tls", true, "Skip TLS verification for PVE API")
	flag.Parse()

	// Allow environment variable overrides
	if env := os.Getenv("LISTEN_ADDR"); env != "" {
		*listenAddr = env
	}
	if env := os.Getenv("PVE_API_ADDR"); env != "" {
		*pveAddr = env
	}
	if env := os.Getenv("MAX_RETRIES"); env != "" {
		if v, err := strconv.Atoi(env); err == nil {
			*maxRetries = v
		}
	}

	config := &Config{
		ListenAddr:       *listenAddr,
		PVEAPIAddr:       *pveAddr,
		MaxRetries:       *maxRetries,
		TaskPollInterval: *taskPollInterval,
		TaskTimeout:      *taskTimeout,
		RequestTimeout:   *requestTimeout,
		InsecureSkipTLS:  *insecureTLS,
	}

	// Seed random for jitter
	rand.Seed(time.Now().UnixNano())

	proxy := NewCloneProxy(config)

	log.Printf("lxc-clone-queue starting on %s", config.ListenAddr)
	log.Printf("  PVE API: %s", config.PVEAPIAddr)
	log.Printf("  Max retries: %d", config.MaxRetries)
	log.Printf("  Task poll interval: %v", config.TaskPollInterval)
	log.Printf("  Task timeout: %v", config.TaskTimeout)
	log.Printf("  Request timeout: %v", config.RequestTimeout)
	log.Printf("  Insecure TLS: %v", config.InsecureSkipTLS)

	server := &http.Server{
		Addr:         config.ListenAddr,
		Handler:      proxy,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: config.RequestTimeout + 30*time.Second,
		IdleTimeout:  120 * time.Second,
	}

	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
