// internal/morph/api.go
// Pure Go client for Morph Cloud REST API - no Python dependency
package morph

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const (
	// DefaultBaseURL is the Morph Cloud API base URL
	DefaultBaseURL = "https://cloud.morph.so/api"

	// DefaultTimeout for API requests
	DefaultAPITimeout = 2 * time.Minute
)

// APIClient is a pure Go client for the Morph Cloud REST API
type APIClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// APIClientConfig contains configuration for the API client
type APIClientConfig struct {
	BaseURL string
	APIKey  string
	Timeout time.Duration
}

// NewAPIClient creates a new Morph Cloud API client
func NewAPIClient(config APIClientConfig) (*APIClient, error) {
	apiKey := config.APIKey
	if apiKey == "" {
		apiKey = os.Getenv("MORPH_API_KEY")
	}
	if apiKey == "" {
		return nil, ErrAPIKeyMissing
	}

	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}

	timeout := config.Timeout
	if timeout == 0 {
		timeout = DefaultAPITimeout
	}

	return &APIClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

// request makes an authenticated HTTP request to the Morph API
func (c *APIClient) request(ctx context.Context, method, path string, body interface{}) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	return resp, nil
}

// parseResponse reads and parses JSON response
func parseResponse[T any](resp *http.Response) (*T, error) {
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		var errResp struct {
			Error   string `json:"error"`
			Message string `json:"message"`
			Detail  string `json:"detail"`
		}
		if json.Unmarshal(body, &errResp) == nil && (errResp.Error != "" || errResp.Message != "" || errResp.Detail != "") {
			msg := errResp.Error
			if msg == "" {
				msg = errResp.Message
			}
			if msg == "" {
				msg = errResp.Detail
			}
			return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, msg)
		}
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, string(body))
	}

	var result T
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w\nbody: %s", err, string(body))
	}

	return &result, nil
}

// ========================================
// API Response Types
// ========================================

// APIInstance represents an instance from the API
type APIInstance struct {
	ID         string            `json:"id"`
	Status     string            `json:"status"`
	SnapshotID string            `json:"snapshot_id,omitempty"`
	Refs       *APIInstanceRefs  `json:"refs,omitempty"`
	Networking *APINetworking    `json:"networking,omitempty"`
	Spec       *APIInstanceSpec  `json:"spec,omitempty"`
	Metadata   map[string]string `json:"metadata,omitempty"`
	CreatedAt  string            `json:"created_at,omitempty"`
}

// APIInstanceRefs contains reference URLs for an instance
type APIInstanceRefs struct {
	HTTP string `json:"http,omitempty"`
	SSH  string `json:"ssh,omitempty"`
}

// APINetworking contains networking info
type APINetworking struct {
	HTTPServices map[string]string `json:"http_services,omitempty"`
}

// UnmarshalJSON supports both legacy map and new array formats for http_services.
func (n *APINetworking) UnmarshalJSON(data []byte) error {
	type raw struct {
		HTTPServices json.RawMessage `json:"http_services"`
	}

	var r raw
	if err := json.Unmarshal(data, &r); err != nil {
		return err
	}

	if len(r.HTTPServices) == 0 || string(r.HTTPServices) == "null" {
		n.HTTPServices = nil
		return nil
	}

	// Legacy map[string]string format
	var legacy map[string]string
	if err := json.Unmarshal(r.HTTPServices, &legacy); err == nil {
		n.HTTPServices = legacy
		return nil
	}

	// New array format
	var services []APIHTTPService
	if err := json.Unmarshal(r.HTTPServices, &services); err == nil {
		m := make(map[string]string, len(services))
		for _, svc := range services {
			switch {
			case svc.Name != "" && svc.URL != "":
				m[svc.Name] = svc.URL
			case svc.URL != "" && svc.Port > 0:
				m[fmt.Sprintf("%d", svc.Port)] = svc.URL
			case svc.URL != "":
				m[svc.URL] = svc.URL
			}
		}
		n.HTTPServices = m
		return nil
	}

	// Fallback: array of strings
	var strings []string
	if err := json.Unmarshal(r.HTTPServices, &strings); err == nil {
		m := make(map[string]string, len(strings))
		for _, s := range strings {
			m[s] = s
		}
		n.HTTPServices = m
		return nil
	}

	// Unknown format; keep empty map to avoid hard failures.
	n.HTTPServices = map[string]string{}
	return nil
}

// APIInstanceSpec contains instance specifications
type APIInstanceSpec struct {
	VCPUs    int `json:"vcpus,omitempty"`
	Memory   int `json:"memory,omitempty"`
	DiskSize int `json:"disk_size,omitempty"`
}

// APISnapshot represents a snapshot from the API
type APISnapshot struct {
	ID        string            `json:"id"`
	Digest    string            `json:"digest,omitempty"`
	Metadata  map[string]string `json:"metadata,omitempty"`
	CreatedAt string            `json:"created_at,omitempty"`
	Spec      *APIInstanceSpec  `json:"spec,omitempty"`
}

// APIExecResult represents the result of an exec command
type APIExecResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

// APIHTTPService represents an exposed HTTP service
type APIHTTPService struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Port int    `json:"port,omitempty"`
}

// ========================================
// Snapshot Operations
// ========================================

// ListSnapshots lists all snapshots
func (c *APIClient) ListSnapshots(ctx context.Context) ([]APISnapshot, error) {
	resp, err := c.request(ctx, http.MethodGet, "/snapshot", nil)
	if err != nil {
		return nil, err
	}

	result, err := parseResponse[[]APISnapshot](resp)
	if err != nil {
		return nil, err
	}

	return *result, nil
}

// GetSnapshot gets a specific snapshot
func (c *APIClient) GetSnapshot(ctx context.Context, snapshotID string) (*APISnapshot, error) {
	resp, err := c.request(ctx, http.MethodGet, "/snapshot/"+snapshotID, nil)
	if err != nil {
		return nil, err
	}

	return parseResponse[APISnapshot](resp)
}

// ========================================
// Instance Operations
// ========================================

// StartInstanceRequest contains parameters for starting an instance
type StartInstanceRequest struct {
	SnapshotID string `json:"snapshot_id"`
	TTLSeconds int    `json:"ttl_seconds,omitempty"`
	VCPUs      int    `json:"vcpus,omitempty"`
	Memory     int    `json:"memory,omitempty"`
	DiskSize   int    `json:"disk_size,omitempty"`
}

// StartInstance starts a new instance from a snapshot
func (c *APIClient) StartInstance(ctx context.Context, req StartInstanceRequest) (*APIInstance, error) {
	// Use the boot endpoint
	path := fmt.Sprintf("/snapshot/%s/boot", req.SnapshotID)

	body := map[string]interface{}{}
	if req.TTLSeconds > 0 {
		body["ttl_seconds"] = req.TTLSeconds
	}
	if req.VCPUs > 0 {
		body["vcpus"] = req.VCPUs
	}
	if req.Memory > 0 {
		body["memory"] = req.Memory
	}

	resp, err := c.request(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, err
	}

	return parseResponse[APIInstance](resp)
}

// GetInstance gets an instance by ID
func (c *APIClient) GetInstance(ctx context.Context, instanceID string) (*APIInstance, error) {
	resp, err := c.request(ctx, http.MethodGet, "/instance/"+instanceID, nil)
	if err != nil {
		return nil, err
	}

	return parseResponse[APIInstance](resp)
}

// ListInstances lists all instances
func (c *APIClient) ListInstances(ctx context.Context) ([]APIInstance, error) {
	resp, err := c.request(ctx, http.MethodGet, "/instance", nil)
	if err != nil {
		return nil, err
	}

	result, err := parseResponse[[]APIInstance](resp)
	if err != nil {
		return nil, err
	}

	return *result, nil
}

// StopInstance stops an instance
func (c *APIClient) StopInstance(ctx context.Context, instanceID string) error {
	resp, err := c.request(ctx, http.MethodDelete, "/instance/"+instanceID, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to stop instance: %s", string(body))
	}

	return nil
}

// ExecCommand executes a command on an instance
func (c *APIClient) ExecCommand(ctx context.Context, instanceID, command string) (*APIExecResult, error) {
	// Morph API expects command as an array: ["bash", "-c", "command"]
	body := map[string]interface{}{
		"command": []string{"bash", "-c", command},
	}

	resp, err := c.request(ctx, http.MethodPost, "/instance/"+instanceID+"/exec", body)
	if err != nil {
		return nil, err
	}

	return parseResponse[APIExecResult](resp)
}

// SnapshotInstance creates a snapshot of an instance
func (c *APIClient) SnapshotInstance(ctx context.Context, instanceID, digest string) (*APISnapshot, error) {
	body := map[string]interface{}{}
	if digest != "" {
		body["digest"] = digest
	}

	resp, err := c.request(ctx, http.MethodPost, "/instance/"+instanceID+"/snapshot", body)
	if err != nil {
		return nil, err
	}

	return parseResponse[APISnapshot](resp)
}

// ExposeHTTPService exposes an HTTP service on an instance
func (c *APIClient) ExposeHTTPService(ctx context.Context, instanceID, serviceName string, port int) (*APIHTTPService, error) {
	body := map[string]interface{}{
		"name": serviceName,
		"port": port,
	}

	resp, err := c.request(ctx, http.MethodPost, "/instance/"+instanceID+"/http", body)
	if err != nil {
		return nil, err
	}

	return parseResponse[APIHTTPService](resp)
}

// HideHTTPService hides an HTTP service
func (c *APIClient) HideHTTPService(ctx context.Context, instanceID, serviceName string) error {
	resp, err := c.request(ctx, http.MethodDelete, "/instance/"+instanceID+"/http/"+serviceName, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to hide HTTP service: %s", string(body))
	}

	return nil
}

// WaitForInstance waits for an instance to reach a ready state
func (c *APIClient) WaitForInstance(ctx context.Context, instanceID string, timeout time.Duration) (*APIInstance, error) {
	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
			if time.Now().After(deadline) {
				return nil, ErrTimeout
			}

			instance, err := c.GetInstance(ctx, instanceID)
			if err != nil {
				continue // Retry on error
			}

			// Check if instance is ready
			if instance.Status == "running" || instance.Status == "ready" {
				return instance, nil
			}

			if instance.Status == "failed" || instance.Status == "error" {
				return nil, fmt.Errorf("instance failed to start: %s", instance.Status)
			}
		}
	}
}

// GetSSHKey gets the SSH key for an instance
func (c *APIClient) GetSSHKey(ctx context.Context, instanceID string) (string, error) {
	resp, err := c.request(ctx, http.MethodGet, "/instance/"+instanceID+"/ssh-key", nil)
	if err != nil {
		return "", err
	}

	result, err := parseResponse[map[string]string](resp)
	if err != nil {
		return "", err
	}

	if key, ok := (*result)["private_key"]; ok {
		return key, nil
	}
	if key, ok := (*result)["key"]; ok {
		return key, nil
	}

	return "", fmt.Errorf("no SSH key in response")
}

// UpdateTTL updates the TTL of an instance
func (c *APIClient) UpdateTTL(ctx context.Context, instanceID string, ttlSeconds int) error {
	body := map[string]interface{}{
		"ttl_seconds": ttlSeconds,
	}

	resp, err := c.request(ctx, http.MethodPost, "/instance/"+instanceID+"/ttl", body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to update TTL: %s", string(body))
	}

	return nil
}

// PauseInstance pauses an instance
func (c *APIClient) PauseInstance(ctx context.Context, instanceID string) error {
	resp, err := c.request(ctx, http.MethodPost, "/instance/"+instanceID+"/pause", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to pause instance: %s", string(body))
	}

	return nil
}

// ResumeInstance resumes a paused instance
func (c *APIClient) ResumeInstance(ctx context.Context, instanceID string) error {
	resp, err := c.request(ctx, http.MethodPost, "/instance/"+instanceID+"/resume", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to resume instance: %s", string(body))
	}

	return nil
}

// RebootInstance reboots an instance
func (c *APIClient) RebootInstance(ctx context.Context, instanceID string) error {
	resp, err := c.request(ctx, http.MethodPost, "/instance/"+instanceID+"/reboot", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to reboot instance: %s", string(body))
	}

	return nil
}
