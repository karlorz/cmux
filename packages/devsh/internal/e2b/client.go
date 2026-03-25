// Package e2b provides an E2B sandbox client that uses the Convex v2 devbox API.
package e2b

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/karlorz/devsh/internal/auth"
)

// Instance represents an E2B sandbox instance.
type Instance struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	VSCodeURL string `json:"vscodeUrl"`
	VNCURL    string `json:"vncUrl"`
	XTermURL  string `json:"xtermUrl,omitempty"`
	WorkerURL string `json:"workerUrl"`
}

// Client provides access to the v2 devbox API for E2B instances.
type Client struct {
	httpClient *http.Client
	baseURL    string
	teamSlug   string
}

// NewClient creates a new E2B client using the configured Convex site URL.
func NewClient() (*Client, error) {
	cfg := auth.GetConfig()
	return &Client{
		httpClient: &http.Client{Timeout: 180 * time.Second},
		baseURL:    cfg.ConvexSiteURL,
	}, nil
}

// SetTeamSlug sets the team slug for API calls.
func (c *Client) SetTeamSlug(teamSlug string) {
	c.teamSlug = teamSlug
}

func (c *Client) doRequest(ctx context.Context, method, path string, body interface{}) (*http.Response, error) {
	accessToken, err := auth.GetAccessToken()
	if err != nil {
		return nil, fmt.Errorf("not authenticated: %w", err)
	}

	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	url := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	return c.httpClient.Do(req)
}

func readErrorBody(body io.Reader) string {
	data, err := io.ReadAll(body)
	if err != nil {
		return fmt.Sprintf("(failed to read response body: %v)", err)
	}
	if len(data) == 0 {
		return "(empty response)"
	}
	return string(data)
}

// StartOptions configures instance creation.
type StartOptions struct {
	TemplateID string
	Name       string
}

// StartInstance creates a new E2B sandbox instance.
func (c *Client) StartInstance(ctx context.Context, opts StartOptions) (*Instance, error) {
	if c.teamSlug == "" {
		return nil, fmt.Errorf("team slug not set")
	}

	body := map[string]interface{}{
		"teamSlugOrId": c.teamSlug,
		"provider":     "e2b",
	}
	if opts.TemplateID != "" {
		body["templateId"] = opts.TemplateID
	}
	if opts.Name != "" {
		body["name"] = opts.Name
	}

	resp, err := c.doRequest(ctx, "POST", "/api/v2/devbox/instances", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, readErrorBody(resp.Body))
	}

	var result Instance
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// GetInstance gets the status of an instance.
func (c *Client) GetInstance(ctx context.Context, instanceID string) (*Instance, error) {
	if c.teamSlug == "" {
		return nil, fmt.Errorf("team slug not set")
	}

	path := fmt.Sprintf("/api/v2/devbox/instances/%s?teamSlugOrId=%s", instanceID, c.teamSlug)
	resp, err := c.doRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, readErrorBody(resp.Body))
	}

	var result Instance
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// WaitForReady waits for an instance to be ready.
func (c *Client) WaitForReady(ctx context.Context, instanceID string, timeout time.Duration) (*Instance, error) {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		instance, err := c.GetInstance(ctx, instanceID)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		if instance.Status == "running" {
			return instance, nil
		}

		if instance.Status == "stopped" || instance.Status == "error" {
			return nil, fmt.Errorf("instance failed with status: %s", instance.Status)
		}

		time.Sleep(2 * time.Second)
	}

	return nil, fmt.Errorf("timeout waiting for instance to be ready")
}

// StopInstance stops an E2B sandbox instance.
func (c *Client) StopInstance(ctx context.Context, instanceID string) error {
	if c.teamSlug == "" {
		return fmt.Errorf("team slug not set")
	}

	body := map[string]interface{}{
		"teamSlugOrId": c.teamSlug,
	}

	resp, err := c.doRequest(ctx, "POST", fmt.Sprintf("/api/v2/devbox/instances/%s/stop", instanceID), body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API error (%d): %s", resp.StatusCode, readErrorBody(resp.Body))
	}

	return nil
}

// PauseInstance pauses an E2B sandbox instance.
func (c *Client) PauseInstance(ctx context.Context, instanceID string) error {
	if c.teamSlug == "" {
		return fmt.Errorf("team slug not set")
	}

	body := map[string]interface{}{
		"teamSlugOrId": c.teamSlug,
	}

	resp, err := c.doRequest(ctx, "POST", fmt.Sprintf("/api/v2/devbox/instances/%s/pause", instanceID), body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API error (%d): %s", resp.StatusCode, readErrorBody(resp.Body))
	}

	return nil
}

// ResumeInstance resumes a paused E2B sandbox instance.
func (c *Client) ResumeInstance(ctx context.Context, instanceID string) error {
	if c.teamSlug == "" {
		return fmt.Errorf("team slug not set")
	}

	body := map[string]interface{}{
		"teamSlugOrId": c.teamSlug,
	}

	resp, err := c.doRequest(ctx, "POST", fmt.Sprintf("/api/v2/devbox/instances/%s/resume", instanceID), body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API error (%d): %s", resp.StatusCode, readErrorBody(resp.Body))
	}

	return nil
}

// ListInstances lists all E2B sandbox instances for the team.
func (c *Client) ListInstances(ctx context.Context) ([]Instance, error) {
	if c.teamSlug == "" {
		return nil, fmt.Errorf("team slug not set")
	}

	path := fmt.Sprintf("/api/v2/devbox/instances?teamSlugOrId=%s&provider=e2b", c.teamSlug)
	resp, err := c.doRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, readErrorBody(resp.Body))
	}

	var result struct {
		Instances []Instance `json:"instances"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Instances, nil
}

// ExecCommand executes a command in the E2B sandbox.
func (c *Client) ExecCommand(ctx context.Context, instanceID, command string, timeout int) (string, string, int, error) {
	if c.teamSlug == "" {
		return "", "", -1, fmt.Errorf("team slug not set")
	}

	body := map[string]interface{}{
		"teamSlugOrId": c.teamSlug,
		"command":      command,
		"timeout":      timeout,
	}

	resp, err := c.doRequest(ctx, "POST", fmt.Sprintf("/api/v2/devbox/instances/%s/exec", instanceID), body)
	if err != nil {
		return "", "", -1, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", -1, fmt.Errorf("API error (%d): %s", resp.StatusCode, readErrorBody(resp.Body))
	}

	var result struct {
		Stdout   string `json:"stdout"`
		Stderr   string `json:"stderr"`
		ExitCode int    `json:"exitCode"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", -1, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Stdout, result.Stderr, result.ExitCode, nil
}
