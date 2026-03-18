// Package vm provides a simple client for managing Morph VMs via Convex API.
package vm

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestFormatAPIError401(t *testing.T) {
	err := formatAPIError(http.StatusUnauthorized, "invalid token", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "401") {
		t.Errorf("expected error to contain '401', got: %s", errStr)
	}
	if !strings.Contains(errStr, "authentication failed") {
		t.Errorf("expected error to contain 'authentication failed', got: %s", errStr)
	}
	if !strings.Contains(errStr, "devsh login") {
		t.Errorf("expected error to mention 'devsh login', got: %s", errStr)
	}
	if !strings.Contains(errStr, "CMUX_TASK_RUN_JWT") {
		t.Errorf("expected error to mention JWT, got: %s", errStr)
	}
}

func TestFormatAPIError403(t *testing.T) {
	err := formatAPIError(http.StatusForbidden, "access denied", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "403") {
		t.Errorf("expected error to contain '403', got: %s", errStr)
	}
	if !strings.Contains(errStr, "access denied") {
		t.Errorf("expected error to contain 'access denied', got: %s", errStr)
	}
	if !strings.Contains(errStr, "permission") {
		t.Errorf("expected error to mention permission, got: %s", errStr)
	}
}

func TestFormatAPIError404(t *testing.T) {
	err := formatAPIError(http.StatusNotFound, "not found", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "404") {
		t.Errorf("expected error to contain '404', got: %s", errStr)
	}
	if !strings.Contains(errStr, "not found") {
		t.Errorf("expected error to contain 'not found', got: %s", errStr)
	}
}

func TestFormatAPIError429(t *testing.T) {
	err := formatAPIError(http.StatusTooManyRequests, "rate limited", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "429") {
		t.Errorf("expected error to contain '429', got: %s", errStr)
	}
	if !strings.Contains(errStr, "rate limited") {
		t.Errorf("expected error to contain 'rate limited', got: %s", errStr)
	}
}

func TestFormatAPIError500(t *testing.T) {
	err := formatAPIError(http.StatusInternalServerError, "internal error", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "500") {
		t.Errorf("expected error to contain '500', got: %s", errStr)
	}
	if !strings.Contains(errStr, "server error") {
		t.Errorf("expected error to contain 'server error', got: %s", errStr)
	}
}

func TestFormatAPIError502(t *testing.T) {
	err := formatAPIError(http.StatusBadGateway, "bad gateway", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "502") {
		t.Errorf("expected error to contain '502', got: %s", errStr)
	}
	if !strings.Contains(errStr, "unavailable") {
		t.Errorf("expected error to mention unavailable, got: %s", errStr)
	}
}

func TestFormatAPIErrorDefault(t *testing.T) {
	err := formatAPIError(418, "I'm a teapot", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "418") {
		t.Errorf("expected error to contain '418', got: %s", errStr)
	}
	if !strings.Contains(errStr, "I'm a teapot") {
		t.Errorf("expected error to contain body, got: %s", errStr)
	}
}

func TestReadErrorBodyEmpty(t *testing.T) {
	result := readErrorBody(strings.NewReader(""))
	if result != "(empty response)" {
		t.Errorf("expected '(empty response)', got: %s", result)
	}
}

func TestReadErrorBodyWithContent(t *testing.T) {
	result := readErrorBody(strings.NewReader("error message"))
	if result != "error message" {
		t.Errorf("expected 'error message', got: %s", result)
	}
}

func TestReadErrorBodyLongContent(t *testing.T) {
	longContent := strings.Repeat("a", 1000)
	result := readErrorBody(strings.NewReader(longContent))
	if result != longContent {
		t.Errorf("expected long content to be preserved")
	}
}

func TestInstanceStruct(t *testing.T) {
	inst := Instance{
		ID:              "inst-123",
		MorphInstanceID: "morphvm_abc",
		Status:          "running",
		VSCodeURL:       "https://vscode.example.com",
		VNCURL:          "https://vnc.example.com",
		WorkerURL:       "https://worker.example.com",
		ChromeURL:       "https://chrome.example.com",
	}

	if inst.ID != "inst-123" {
		t.Errorf("expected ID 'inst-123', got '%s'", inst.ID)
	}
	if inst.MorphInstanceID != "morphvm_abc" {
		t.Errorf("expected MorphInstanceID 'morphvm_abc', got '%s'", inst.MorphInstanceID)
	}
	if inst.Status != "running" {
		t.Errorf("expected Status 'running', got '%s'", inst.Status)
	}
}

func TestInstanceJSON(t *testing.T) {
	inst := Instance{
		ID:              "inst-json",
		MorphInstanceID: "morphvm_json",
		Status:          "ready",
		VSCodeURL:       "https://vscode.test",
	}

	// Marshal
	data, err := json.Marshal(inst)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	// Unmarshal
	var decoded Instance
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if decoded.ID != inst.ID {
		t.Errorf("expected ID '%s', got '%s'", inst.ID, decoded.ID)
	}
	if decoded.MorphInstanceID != inst.MorphInstanceID {
		t.Errorf("expected MorphInstanceID '%s', got '%s'", inst.MorphInstanceID, decoded.MorphInstanceID)
	}
}

func TestCreateOptionsStruct(t *testing.T) {
	opts := CreateOptions{
		SnapshotID: "snap-123",
		Name:       "test-instance",
		TTLSeconds: 3600,
	}

	if opts.SnapshotID != "snap-123" {
		t.Errorf("expected SnapshotID 'snap-123', got '%s'", opts.SnapshotID)
	}
	if opts.Name != "test-instance" {
		t.Errorf("expected Name 'test-instance', got '%s'", opts.Name)
	}
	if opts.TTLSeconds != 3600 {
		t.Errorf("expected TTLSeconds 3600, got %d", opts.TTLSeconds)
	}
}

func TestCreateOptionsDefaults(t *testing.T) {
	opts := CreateOptions{}

	if opts.SnapshotID != "" {
		t.Errorf("expected empty SnapshotID, got '%s'", opts.SnapshotID)
	}
	if opts.Name != "" {
		t.Errorf("expected empty Name, got '%s'", opts.Name)
	}
	if opts.TTLSeconds != 0 {
		t.Errorf("expected TTLSeconds 0, got %d", opts.TTLSeconds)
	}
}

func TestClientSetTeamSlug(t *testing.T) {
	c := &Client{}

	if c.teamSlug != "" {
		t.Errorf("expected empty teamSlug initially, got '%s'", c.teamSlug)
	}

	c.SetTeamSlug("test-team")
	if c.teamSlug != "test-team" {
		t.Errorf("expected teamSlug 'test-team', got '%s'", c.teamSlug)
	}

	c.SetTeamSlug("another-team")
	if c.teamSlug != "another-team" {
		t.Errorf("expected teamSlug 'another-team', got '%s'", c.teamSlug)
	}
}

func TestClientStruct(t *testing.T) {
	c := &Client{
		baseURL:  "https://api.example.com",
		teamSlug: "my-team",
	}

	if c.baseURL != "https://api.example.com" {
		t.Errorf("expected baseURL 'https://api.example.com', got '%s'", c.baseURL)
	}
	if c.teamSlug != "my-team" {
		t.Errorf("expected teamSlug 'my-team', got '%s'", c.teamSlug)
	}
}

func TestFormatAPIErrorIncludesEndpoint(t *testing.T) {
	// While endpoint is passed, it's not currently used in the message
	// This test verifies the function doesn't fail with various endpoint values
	endpoints := []string{
		"/api/v1/instances",
		"/api/v1/cmux/sandboxes",
		"",
		"/very/long/path/to/some/resource",
	}

	for _, endpoint := range endpoints {
		err := formatAPIError(500, "test error", endpoint)
		if err == nil {
			t.Errorf("expected error for endpoint '%s', got nil", endpoint)
		}
	}
}
