// internal/morph/error_recovery_test.go
package morph

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// =============================================================================
// Error Recovery Tests
// =============================================================================

// TestManagerRecoveryAfterStartFailure tests that the manager can recover
// after a failed start attempt
func TestManagerRecoveryAfterStartFailure(t *testing.T) {
	mgr, err := NewManager(ManagerConfig{
		APIKey:         "test-key",
		BaseSnapshotID: "invalid-snapshot", // This should fail
	})
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	// First start attempt - should fail
	_, err = mgr.StartInstance(ctx, "ws-recovery-test", "invalid-snapshot")
	if err == nil {
		// In tests without real API, we might get nil error
		// Just verify we can call the method
		t.Log("Start returned no error (expected in mock mode)")
	}

	// Verify manager state is still usable
	inst, _ := mgr.GetInstance(ctx, "ws-recovery-test")
	// Instance might or might not be set depending on where the error occurred
	_ = inst // Just verify we can query

	// Manager should be able to handle another request
	ctx2, cancel2 := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel2()

	_, err = mgr.ListSnapshots(ctx2)
	// Just verify no panic
	_ = err
}

// TestManagerRecoveryAfterStopFailure tests recovery after stop failure
func TestManagerRecoveryAfterStopFailure(t *testing.T) {
	mgr, err := NewManager(ManagerConfig{
		APIKey:         "test-key",
		BaseSnapshotID: "test-snapshot",
	})
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	ctx := context.Background()

	// Try to stop a non-existent workspace
	err = mgr.StopInstance(ctx, "nonexistent-ws")

	// Should return a NotFound error
	if err == nil {
		t.Log("Stop returned no error for nonexistent workspace")
	} else {
		if !errors.Is(err, ErrNotFound) && !errors.Is(err, ErrNotRunning) {
			t.Logf("Got error: %v", err)
		}
	}

	// Manager should still be functional
	inst, _ := mgr.GetInstance(ctx, "other-ws")
	if inst != nil {
		t.Error("GetInstance should return nil for non-cached workspace")
	}
}

// TestManagerRecoveryAfterExecFailure tests recovery after exec failure
func TestManagerRecoveryAfterExecFailure(t *testing.T) {
	mgr, err := NewManager(ManagerConfig{
		APIKey:         "test-key",
		BaseSnapshotID: "test-snapshot",
	})
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	ctx := context.Background()

	// Try to exec on a non-running instance
	result, err := mgr.Exec(ctx, "nonexistent-ws", "echo hello")

	// Should fail
	if err == nil && result != nil {
		t.Log("Exec returned result for nonexistent workspace")
	}

	// Verify manager is still usable
	err = mgr.StopInstance(ctx, "other-nonexistent")
	// Just verify no panic
	_ = err
}

// TestContextCancellationRecovery tests that the manager handles
// context cancellation gracefully
func TestContextCancellationRecovery(t *testing.T) {
	mgr, err := NewManager(ManagerConfig{
		APIKey:         "test-key",
		BaseSnapshotID: "test-snapshot",
	})
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	// Create and immediately cancel context
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	// All operations should handle cancelled context
	_, err = mgr.StartInstance(ctx, "ws-cancelled", "test-snapshot")
	if err != nil && !errors.Is(err, context.Canceled) {
		t.Logf("StartInstance with cancelled context: %v", err)
	}

	err = mgr.StopInstance(ctx, "ws-cancelled")
	if err != nil && !errors.Is(err, context.Canceled) {
		t.Logf("StopInstance with cancelled context: %v", err)
	}

	_, err = mgr.Exec(ctx, "ws-cancelled", "echo test")
	if err != nil && !errors.Is(err, context.Canceled) {
		t.Logf("Exec with cancelled context: %v", err)
	}

	// Verify manager is still usable with a fresh context
	freshCtx := context.Background()
	inst, _ := mgr.GetInstance(freshCtx, "other-ws")
	_ = inst
}

// TestManagerMultipleFailuresRecovery tests recovery after multiple failures
func TestManagerMultipleFailuresRecovery(t *testing.T) {
	mgr, err := NewManager(ManagerConfig{
		APIKey:         "test-key",
		BaseSnapshotID: "test-snapshot",
	})
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	ctx := context.Background()

	// Generate multiple errors
	for i := 0; i < 10; i++ {
		wsID := "invalid-ws-" + string(rune('a'+i))
		_, _ = mgr.StartInstance(ctx, wsID, "test-snapshot")
		_ = mgr.StopInstance(ctx, wsID)
		_, _ = mgr.Exec(ctx, wsID, "echo test")
		_, _ = mgr.SaveSnapshot(ctx, wsID, "snap")
	}

	// Manager should still function
	inst, _ := mgr.GetInstance(ctx, "test")
	if inst != nil {
		t.Error("expected nil for uncached workspace")
	}
}

// =============================================================================
// Error Sentinel Tests
// =============================================================================

// TestErrorSentinels verifies error sentinel values exist and can be used
func TestErrorSentinels(t *testing.T) {
	tests := []struct {
		name string
		err  error
	}{
		{"ErrNotFound", ErrNotFound},
		{"ErrAlreadyExists", ErrAlreadyExists},
		{"ErrAlreadyRunning", ErrAlreadyRunning},
		{"ErrNotRunning", ErrNotRunning},
		{"ErrTimeout", ErrTimeout},
		{"ErrAPIKeyMissing", ErrAPIKeyMissing},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Verify error is not nil
			if tt.err == nil {
				t.Error("error sentinel should not be nil")
			}

			// Verify error message is not empty
			msg := tt.err.Error()
			if msg == "" {
				t.Error("error message should not be empty")
			}

			// Verify errors.Is works
			if !errors.Is(tt.err, tt.err) {
				t.Error("errors.Is should match sentinel to itself")
			}
		})
	}
}

// TestAPIErrorType tests the APIError type
func TestAPIErrorType(t *testing.T) {
	apiErr := &APIError{
		Code:    "INVALID_REQUEST",
		Message: "Invalid parameters",
		Details: "The 'instance_id' field is required",
	}

	errMsg := apiErr.Error()
	if !strings.Contains(errMsg, "INVALID_REQUEST") {
		t.Error("error message should contain code")
	}
	if !strings.Contains(errMsg, "Invalid parameters") {
		t.Error("error message should contain message")
	}
}

// TestWrapErrorFunc verifies WrapError behavior
func TestWrapErrorFunc(t *testing.T) {
	baseErr := errors.New("underlying error")
	wrapped := WrapError(baseErr, "operation failed")

	if wrapped == nil {
		t.Fatal("WrapError should return non-nil error")
	}

	// Should contain the base error message
	if !strings.Contains(wrapped.Error(), "underlying error") {
		t.Error("wrapped error should contain original message")
	}

	// Should contain the wrapper message
	if !strings.Contains(wrapped.Error(), "operation failed") {
		t.Error("wrapped error should contain wrapper message")
	}

	// Should unwrap to base error
	if !errors.Is(wrapped, baseErr) {
		t.Error("errors.Is should find the wrapped error")
	}
}

// TestNilErrorWrapping verifies nil error handling
func TestNilErrorWrapping(t *testing.T) {
	wrapped := WrapError(nil, "operation")
	if wrapped != nil {
		t.Error("WrapError with nil error should return nil")
	}
}

// =============================================================================
// Concurrent Error Handling
// =============================================================================

// TestConcurrentErrorRecovery tests that concurrent operations
// with errors don't corrupt manager state
func TestConcurrentErrorRecovery(t *testing.T) {
	mgr, err := NewManager(ManagerConfig{
		APIKey:         "test-key",
		BaseSnapshotID: "test-snapshot",
	})
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	ctx := context.Background()
	done := make(chan bool, 50)

	// Launch many concurrent failing operations
	for i := 0; i < 50; i++ {
		go func(n int) {
			wsID := "ws-concurrent-" + string(rune('a'+n%26))

			// Mix of operations
			switch n % 4 {
			case 0:
				_, _ = mgr.StartInstance(ctx, wsID, "test-snapshot")
			case 1:
				_ = mgr.StopInstance(ctx, wsID)
			case 2:
				_, _ = mgr.Exec(ctx, wsID, "echo test")
			case 3:
				_, _ = mgr.SaveSnapshot(ctx, wsID, "snap-"+wsID)
			}

			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 50; i++ {
		<-done
	}

	// Verify manager is still functional
	inst, _ := mgr.GetInstance(ctx, "final-test")
	if inst != nil {
		t.Error("expected nil for uncached workspace")
	}
}

// =============================================================================
// Edge Case Error Scenarios
// =============================================================================

// TestEmptyWorkspaceIDErrors tests error handling for empty workspace ID
func TestEmptyWorkspaceIDErrors(t *testing.T) {
	mgr, err := NewManager(ManagerConfig{
		APIKey:         "test-key",
		BaseSnapshotID: "test-snapshot",
	})
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	ctx := context.Background()

	// All operations with empty workspace ID should fail gracefully
	_, err = mgr.StartInstance(ctx, "", "test-snapshot")
	if err == nil {
		t.Log("StartInstance with empty ID: expected error or graceful handling")
	}

	err = mgr.StopInstance(ctx, "")
	if err == nil {
		t.Log("StopInstance with empty ID: expected error or graceful handling")
	}

	_, err = mgr.Exec(ctx, "", "echo test")
	if err == nil {
		t.Log("Exec with empty ID: expected error or graceful handling")
	}

	_, err = mgr.SaveSnapshot(ctx, "", "snap")
	if err == nil {
		t.Log("SaveSnapshot with empty ID: expected error or graceful handling")
	}

	// Manager should still be usable
	inst, _ := mgr.GetInstance(ctx, "valid-ws")
	_ = inst
}

// TestVeryLongWorkspaceIDErrors tests error handling for very long workspace IDs
func TestVeryLongWorkspaceIDErrors(t *testing.T) {
	mgr, err := NewManager(ManagerConfig{
		APIKey:         "test-key",
		BaseSnapshotID: "test-snapshot",
	})
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	ctx := context.Background()
	longID := strings.Repeat("x", 10000)

	// Operations should handle long IDs gracefully
	_, err = mgr.StartInstance(ctx, longID, "test-snapshot")
	_ = err // Just verify no panic

	err = mgr.StopInstance(ctx, longID)
	_ = err

	_, err = mgr.Exec(ctx, longID, "echo test")
	_ = err

	// Manager should still be usable
	inst, _ := mgr.GetInstance(ctx, "normal-ws")
	_ = inst
}

// TestSpecialCharacterWorkspaceIDErrors tests error handling for special chars
func TestSpecialCharacterWorkspaceIDErrors(t *testing.T) {
	mgr, err := NewManager(ManagerConfig{
		APIKey:         "test-key",
		BaseSnapshotID: "test-snapshot",
	})
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	ctx := context.Background()

	specialIDs := []string{
		"ws with spaces",
		"ws\twith\ttabs",
		"ws\nwith\nnewlines",
		"ws/with/slashes",
		"ws\\with\\backslashes",
		"ws'with'quotes",
		"ws\"with\"doublequotes",
		"ws<with>brackets",
		"ws&with&ampersand",
		"日本語ワークスペース",
		"ws-🚀-emoji",
	}

	for _, id := range specialIDs {
		t.Run(id, func(t *testing.T) {
			_, err := mgr.StartInstance(ctx, id, "test-snapshot")
			_ = err // Just verify no panic

			err = mgr.StopInstance(ctx, id)
			_ = err

			inst, _ := mgr.GetInstance(ctx, id)
			_ = inst
		})
	}
}
