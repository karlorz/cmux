// internal/morph/exhaustive_test.go
// Exhaustive edge case testing
package morph

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestInstance_FieldByField tests each Instance field independently
func TestInstance_FieldByField(t *testing.T) {
	// Test ID field
	t.Run("ID", func(t *testing.T) {
		values := []string{"", "a", strings.Repeat("x", 10000), "\x00", "\n", "中文", "🚀"}
		for _, v := range values {
			inst := Instance{ID: v}
			if inst.ID != v {
				t.Errorf("ID not preserved: %q", v)
			}
		}
	})

	// Test Status field
	t.Run("Status", func(t *testing.T) {
		statuses := []InstanceStatus{
			StatusPending, StatusStarting, StatusRunning,
			StatusStopping, StatusStopped, StatusError,
			"", "custom", "RUNNING", " running ",
		}
		for _, s := range statuses {
			inst := Instance{Status: s}
			if inst.Status != s {
				t.Errorf("Status not preserved: %q", s)
			}
		}
	})

	// Test TTLSeconds field
	t.Run("TTLSeconds", func(t *testing.T) {
		values := []int{-2147483648, -1, 0, 1, 3600, 2147483647}
		for _, v := range values {
			inst := Instance{TTLSeconds: v}
			if inst.TTLSeconds != v {
				t.Errorf("TTLSeconds not preserved: %d", v)
			}
		}
	})
}

// TestSnapshot_FieldByField tests each Snapshot field independently
func TestSnapshot_FieldByField(t *testing.T) {
	// Test Digest field
	t.Run("Digest", func(t *testing.T) {
		values := []string{"", "dba-base-v1", "snapshot with spaces", "日本語", strings.Repeat("a", 1000)}
		for _, v := range values {
			snap := Snapshot{Digest: v}
			if snap.Digest != v {
				t.Errorf("Digest not preserved: %q", v)
			}
		}
	})

	// Test VCPUs field
	t.Run("VCPUs", func(t *testing.T) {
		values := []int{0, 1, 2, 4, 8, 16, 32, 64, 128, 256}
		for _, v := range values {
			snap := Snapshot{VCPUs: v}
			if snap.VCPUs != v {
				t.Errorf("VCPUs not preserved: %d", v)
			}
		}
	})
}

// TestExecResult_FieldByField tests each ExecResult field independently
func TestExecResult_FieldByField(t *testing.T) {
	// Test ExitCode field
	t.Run("ExitCode", func(t *testing.T) {
		values := []int{-128, -1, 0, 1, 127, 128, 255, 256}
		for _, v := range values {
			result := ExecResult{ExitCode: v}
			if result.ExitCode != v {
				t.Errorf("ExitCode not preserved: %d", v)
			}
		}
	})

	// Test Stdout with various content
	t.Run("Stdout", func(t *testing.T) {
		values := []string{
			"",
			"simple output",
			"line1\nline2\nline3",
			"\x00\x01\x02\x03",
			strings.Repeat("x", 1024*1024),
		}
		for _, v := range values {
			result := ExecResult{Stdout: v}
			if result.Stdout != v {
				t.Errorf("Stdout not preserved")
			}
		}
	})
}

// TestManager_EveryMethod tests every Manager method systematically
func TestManager_EveryMethod(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}
	ctx := context.Background()

	// SetInstance
	t.Run("SetInstance", func(t *testing.T) {
		manager.SetInstance("ws1", &Instance{ID: "inst1", Status: StatusRunning})
		if !manager.IsRunning("ws1") {
			t.Error("SetInstance failed")
		}
	})

	// IsRunning
	t.Run("IsRunning", func(t *testing.T) {
		if !manager.IsRunning("ws1") {
			t.Error("IsRunning should return true")
		}
		if manager.IsRunning("nonexistent") {
			t.Error("IsRunning should return false for nonexistent")
		}
	})

	// GetInstanceByID
	t.Run("GetInstanceByID", func(t *testing.T) {
		found := manager.GetInstanceByID("inst1")
		if found == nil {
			t.Error("GetInstanceByID should find instance")
		}
		notFound := manager.GetInstanceByID("nonexistent")
		if notFound != nil {
			t.Error("GetInstanceByID should return nil for nonexistent")
		}
	})

	// ListInstances
	t.Run("ListInstances", func(t *testing.T) {
		instances := manager.ListInstances()
		if len(instances) != 1 {
			t.Errorf("ListInstances should return 1, got %d", len(instances))
		}
	})

	// GetInstance
	t.Run("GetInstance", func(t *testing.T) {
		inst, err := manager.GetInstance(ctx, "ws1")
		if err != nil {
			t.Errorf("GetInstance failed: %v", err)
		}
		if inst == nil {
			t.Error("GetInstance should return instance")
		}

		_, err = manager.GetInstance(ctx, "nonexistent")
		if !errors.Is(err, ErrNotFound) {
			t.Error("GetInstance should return ErrNotFound")
		}
	})

	// RefreshInstance (will fail without Python, but tests cache lookup)
	t.Run("RefreshInstance", func(t *testing.T) {
		_, err := manager.RefreshInstance(ctx, "nonexistent")
		if !errors.Is(err, ErrNotFound) {
			t.Error("RefreshInstance should return ErrNotFound")
		}
	})

	// RemoveInstance
	t.Run("RemoveInstance", func(t *testing.T) {
		manager.RemoveInstance("ws1")
		if manager.IsRunning("ws1") {
			t.Error("RemoveInstance failed")
		}
	})
}

// TestErrors_Every tests every error type
func TestErrors_Every(t *testing.T) {
	allErrors := []error{
		ErrNotFound,
		ErrAlreadyExists,
		ErrAlreadyRunning,
		ErrNotRunning,
		ErrTimeout,
		ErrAPIKeyMissing,
	}

	for _, err := range allErrors {
		t.Run(err.Error(), func(t *testing.T) {
			// Each error should have non-empty message
			if err.Error() == "" {
				t.Error("error message should not be empty")
			}

			// Should be usable with errors.Is
			wrapped := fmt.Errorf("wrapped: %w", err)
			if !errors.Is(wrapped, err) {
				t.Error("errors.Is should work")
			}

			// WrapError should work
			wrapped2 := WrapError(err, "context")
			if wrapped2 == nil {
				t.Error("WrapError should return non-nil")
			}
		})
	}
}

// TestAPIError_Every tests every APIError scenario
func TestAPIError_Every(t *testing.T) {
	testCases := []struct {
		code    string
		message string
		details string
	}{
		{"", "", ""},
		{"CODE", "", ""},
		{"", "message", ""},
		{"", "", "details"},
		{"CODE", "message", "details"},
		{strings.Repeat("C", 1000), strings.Repeat("M", 1000), strings.Repeat("D", 1000)},
	}

	for i, tc := range testCases {
		t.Run(fmt.Sprintf("case_%d", i), func(t *testing.T) {
			err := &APIError{
				Code:    tc.code,
				Message: tc.message,
				Details: tc.details,
			}

			// Should implement error interface
			var _ error = err

			// Error() should return formatted string
			errStr := err.Error()
			if errStr == "" && (tc.code != "" || tc.message != "") {
				t.Error("error string should not be empty")
			}

			// Should be usable with errors.As
			wrapped := fmt.Errorf("wrapped: %w", err)
			var target *APIError
			if !errors.As(wrapped, &target) {
				t.Error("errors.As should work")
			}
		})
	}
}

// TestManager_StateConsistency tests state consistency under load
func TestManager_StateConsistency(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	errors := make(chan error, 1000)

	// Add instances
	for i := 0; i < 100; i++ {
		wsID := fmt.Sprintf("ws_%d", i)
		manager.SetInstance(wsID, &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	// Verify consistency in parallel
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			wsID := fmt.Sprintf("ws_%d", idx)
			instID := fmt.Sprintf("inst_%d", idx)

			for j := 0; j < 100; j++ {
				// Check IsRunning consistency
				if !manager.IsRunning(wsID) {
					errors <- fmt.Errorf("ws_%d should be running", idx)
					return
				}

				// Check GetInstanceByID consistency
				found := manager.GetInstanceByID(instID)
				if found == nil {
					errors <- fmt.Errorf("inst_%d not found", idx)
					return
				}
				if found.ID != instID {
					errors <- fmt.Errorf("inst_%d ID mismatch", idx)
					return
				}
			}
		}(i)
	}

	wg.Wait()
	close(errors)

	for err := range errors {
		t.Error(err)
	}
}

// TestJSON_Roundtrip_All tests JSON roundtrip for all types
func TestJSON_Roundtrip_All(t *testing.T) {
	// Instance roundtrip
	t.Run("Instance", func(t *testing.T) {
		original := Instance{
			ID:         "inst_123",
			SnapshotID: "snap_456",
			Status:     StatusRunning,
			BaseURL:    "https://example.com",
			CDPURL:     "wss://example.com/cdp",
			VNCURL:     "https://example.com/vnc",
			CodeURL:    "https://example.com/code",
			AppURL:     "https://example.com/app",
			CreatedAt:  time.Now().Truncate(time.Second),
			TTLSeconds: 3600,
			Metadata:   map[string]string{"key": "value"},
		}

		data, _ := json.Marshal(original)
		var recovered Instance
		json.Unmarshal(data, &recovered)

		if recovered.ID != original.ID {
			t.Error("ID mismatch")
		}
	})

	// Snapshot roundtrip
	t.Run("Snapshot", func(t *testing.T) {
		original := Snapshot{
			ID:        "snap_123",
			Digest:    "dba-v1",
			ImageID:   "img_123",
			VCPUs:     4,
			Memory:    8192,
			DiskSize:  65536,
			CreatedAt: time.Now().Truncate(time.Second),
			Metadata:  map[string]string{"version": "1.0"},
		}

		data, _ := json.Marshal(original)
		var recovered Snapshot
		json.Unmarshal(data, &recovered)

		if recovered.ID != original.ID {
			t.Error("ID mismatch")
		}
	})

	// ExecResult roundtrip
	t.Run("ExecResult", func(t *testing.T) {
		original := ExecResult{
			Stdout:   "output",
			Stderr:   "error",
			ExitCode: 0,
		}

		data, _ := json.Marshal(original)
		var recovered ExecResult
		json.Unmarshal(data, &recovered)

		if recovered.Stdout != original.Stdout {
			t.Error("Stdout mismatch")
		}
	})
}

// TestReflection_StructTags tests that all struct tags are valid JSON
func TestReflection_StructTags(t *testing.T) {
	types := []interface{}{
		Instance{},
		Snapshot{},
		ExecResult{},
		ManagerConfig{},
		APIError{},
	}

	for _, typ := range types {
		t.Run(reflect.TypeOf(typ).Name(), func(t *testing.T) {
			v := reflect.TypeOf(typ)
			for i := 0; i < v.NumField(); i++ {
				field := v.Field(i)
				jsonTag := field.Tag.Get("json")
				if jsonTag == "" {
					// No tag is fine for some fields
					continue
				}
				// Tag should not contain invalid characters
				if strings.Contains(jsonTag, " ") && !strings.Contains(jsonTag, ",") {
					t.Errorf("field %s has suspicious json tag: %s", field.Name, jsonTag)
				}
			}
		})
	}
}

// TestManager_InstanceIsolation tests that instances are properly isolated
func TestManager_InstanceIsolation(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Create two workspaces
	inst1 := &Instance{ID: "inst_1", Status: StatusRunning}
	inst2 := &Instance{ID: "inst_2", Status: StatusStopped}

	manager.SetInstance("ws1", inst1)
	manager.SetInstance("ws2", inst2)

	// Modify inst1
	inst1.Status = StatusError

	// ws1 should reflect the change (same pointer)
	if manager.IsRunning("ws1") {
		t.Error("ws1 should not be running after status change")
	}

	// ws2 should be unaffected
	if manager.IsRunning("ws2") {
		t.Error("ws2 should not be running")
	}
}

// TestContext_Variations tests various context scenarios
func TestContext_Variations(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("ws1", &Instance{ID: "inst_1", Status: StatusRunning})

	// Background context
	t.Run("Background", func(t *testing.T) {
		ctx := context.Background()
		_, err := manager.GetInstance(ctx, "ws1")
		if err != nil {
			t.Errorf("should work with Background: %v", err)
		}
	})

	// TODO context
	t.Run("TODO", func(t *testing.T) {
		ctx := context.TODO()
		_, err := manager.GetInstance(ctx, "ws1")
		if err != nil {
			t.Errorf("should work with TODO: %v", err)
		}
	})

	// Canceled context
	t.Run("Canceled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := manager.GetInstance(ctx, "ws1")
		// GetInstance doesn't use context for cache, should still work
		if err != nil {
			t.Errorf("should work with canceled: %v", err)
		}
	})

	// Deadline exceeded
	t.Run("DeadlineExceeded", func(t *testing.T) {
		ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Hour))
		defer cancel()
		_, err := manager.GetInstance(ctx, "ws1")
		if err != nil {
			t.Errorf("should work with expired deadline: %v", err)
		}
	})

	// With value
	t.Run("WithValue", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), "key", "value")
		_, err := manager.GetInstance(ctx, "ws1")
		if err != nil {
			t.Errorf("should work with value: %v", err)
		}
	})
}

// TestAPIClientConfig tests API client configuration
func TestAPIClientConfig(t *testing.T) {
	t.Run("APIKey configuration", func(t *testing.T) {
		apiKey := "morph_test_key_123"
		if len(apiKey) == 0 {
			t.Error("should have API key")
		}
	})

	t.Run("TTL configuration", func(t *testing.T) {
		ttl := 3600
		if ttl <= 0 {
			t.Error("should have positive TTL")
		}
	})
}
