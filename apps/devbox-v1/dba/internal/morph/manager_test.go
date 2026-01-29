// internal/morph/manager_test.go
package morph

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestAPIClientCreation(t *testing.T) {
	// Save and restore env
	origKey := os.Getenv("MORPH_API_KEY")
	defer os.Setenv("MORPH_API_KEY", origKey)

	// Test missing API key
	os.Unsetenv("MORPH_API_KEY")
	_, err := NewAPIClient(APIClientConfig{})
	if err != ErrAPIKeyMissing {
		t.Errorf("expected ErrAPIKeyMissing, got %v", err)
	}

	// Test with API key
	os.Setenv("MORPH_API_KEY", "test_key")
	client, err := NewAPIClient(APIClientConfig{})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if client == nil {
		t.Error("expected client, got nil")
	}
}

func TestAPIClientDefaults(t *testing.T) {
	os.Setenv("MORPH_API_KEY", "test_key")
	client, err := NewAPIClient(APIClientConfig{})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	// Check defaults are set
	if client.baseURL != DefaultBaseURL {
		t.Errorf("expected default base URL %s, got %s", DefaultBaseURL, client.baseURL)
	}

	if client.httpClient.Timeout != DefaultAPITimeout {
		t.Errorf("expected default timeout %v, got %v", DefaultAPITimeout, client.httpClient.Timeout)
	}
}

func TestAPIClientCustomConfig(t *testing.T) {
	client, err := NewAPIClient(APIClientConfig{
		APIKey:  "custom_key",
		BaseURL: "https://custom.api.com",
		Timeout: 5 * time.Minute,
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	if client.baseURL != "https://custom.api.com" {
		t.Errorf("expected custom base URL, got %s", client.baseURL)
	}

	if client.httpClient.Timeout != 5*time.Minute {
		t.Errorf("expected custom timeout, got %v", client.httpClient.Timeout)
	}
}

func TestErrorTypes(t *testing.T) {
	// Test error strings
	errors := []struct {
		err      error
		expected string
	}{
		{ErrNotFound, "resource not found"},
		{ErrAlreadyExists, "resource already exists"},
		{ErrAlreadyRunning, "instance is already running"},
		{ErrNotRunning, "instance is not running"},
		{ErrTimeout, "operation timed out"},
		{ErrAPIKeyMissing, "MORPH_API_KEY environment variable not set"},
	}

	for _, tc := range errors {
		if tc.err.Error() != tc.expected {
			t.Errorf("expected '%s', got '%s'", tc.expected, tc.err.Error())
		}
	}
}

func TestAPIError(t *testing.T) {
	apiErr := &APIError{
		Code:    "RATE_LIMITED",
		Message: "Too many requests",
		Details: "Please wait before retrying",
	}

	expected := "morph API error [RATE_LIMITED]: Too many requests"
	if apiErr.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, apiErr.Error())
	}
}

func TestWrapError(t *testing.T) {
	// Test nil error
	result := WrapError(nil, "context")
	if result != nil {
		t.Error("WrapError with nil should return nil")
	}

	// Test with error
	wrapped := WrapError(ErrNotFound, "getting workspace")
	if wrapped == nil {
		t.Error("WrapError should return non-nil")
	}
	if wrapped.Error() != "getting workspace: resource not found" {
		t.Errorf("unexpected error message: %s", wrapped.Error())
	}
}

func TestManagerCreation(t *testing.T) {
	origKey := os.Getenv("MORPH_API_KEY")
	defer os.Setenv("MORPH_API_KEY", origKey)

	// Test missing API key
	os.Unsetenv("MORPH_API_KEY")
	_, err := NewManager(ManagerConfig{})
	if err == nil {
		t.Error("expected error for missing API key")
	}

	// Test with API key
	os.Setenv("MORPH_API_KEY", "test_key")
	mgr, err := NewManager(ManagerConfig{})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if mgr == nil {
		t.Error("expected manager, got nil")
	}
}

func TestManagerInstanceCache(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Test SetInstance
	inst := &Instance{ID: "inst_123", Status: StatusRunning}
	manager.SetInstance("ws1", inst)

	// Test IsRunning
	if !manager.IsRunning("ws1") {
		t.Error("expected IsRunning to return true")
	}

	if manager.IsRunning("nonexistent") {
		t.Error("expected IsRunning to return false for nonexistent")
	}

	// Test GetInstanceByID
	found := manager.GetInstanceByID("inst_123")
	if found == nil {
		t.Error("expected to find instance by ID")
	}

	notFound := manager.GetInstanceByID("nonexistent")
	if notFound != nil {
		t.Error("expected nil for nonexistent instance ID")
	}

	// Test ListInstances
	instances := manager.ListInstances()
	if len(instances) != 1 {
		t.Errorf("expected 1 instance, got %d", len(instances))
	}

	// Test RemoveInstance
	manager.RemoveInstance("ws1")
	if manager.IsRunning("ws1") {
		t.Error("expected IsRunning to return false after remove")
	}
}

func TestManagerGetInstance(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	ctx := context.Background()

	// Test nonexistent
	_, err := manager.GetInstance(ctx, "nonexistent")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	// Test existing
	manager.SetInstance("ws1", &Instance{ID: "inst_123"})
	inst, err := manager.GetInstance(ctx, "ws1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if inst.ID != "inst_123" {
		t.Errorf("expected inst_123, got %s", inst.ID)
	}
}

func TestManagerStopInstance(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	ctx := context.Background()

	// Test nonexistent
	err := manager.StopInstance(ctx, "nonexistent")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	// Test stopped instance
	manager.SetInstance("ws1", &Instance{ID: "inst_123", Status: StatusStopped})
	err = manager.StopInstance(ctx, "ws1")
	if err != ErrNotRunning {
		t.Errorf("expected ErrNotRunning, got %v", err)
	}
}
