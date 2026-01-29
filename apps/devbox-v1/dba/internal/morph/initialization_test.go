// internal/morph/initialization_test.go
// Tests for Manager initialization edge cases
package morph

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestManager_NilInstances tests Manager with nil instances map
func TestManager_NilInstances(t *testing.T) {
	manager := &Manager{
		instances: nil, // Deliberately nil
	}

	// These operations should panic or be handled gracefully
	// Document expected behavior
	defer func() {
		if r := recover(); r != nil {
			t.Logf("Panic occurred as expected with nil instances: %v", r)
		}
	}()

	// This will panic - nil map access
	manager.SetInstance("ws1", &Instance{ID: "inst_1"})
}

// TestManager_EmptyInstances tests Manager with empty instances map
func TestManager_EmptyInstances(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// All operations should work on empty map
	if manager.IsRunning("nonexistent") {
		t.Error("empty manager should not have running instances")
	}

	if manager.GetInstanceByID("nonexistent") != nil {
		t.Error("empty manager should not find instances by ID")
	}

	instances := manager.ListInstances()
	if len(instances) != 0 {
		t.Error("empty manager should list no instances")
	}

	// Remove on empty should not panic
	manager.RemoveInstance("nonexistent")

	ctx := context.Background()
	_, err := manager.GetInstance(ctx, "nonexistent")
	if err == nil {
		t.Error("GetInstance on empty should return error")
	}
}

// TestManager_InitializeThenUse tests proper initialization pattern
func TestManager_InitializeThenUse(t *testing.T) {
	// Proper initialization
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Now all operations should work
	manager.SetInstance("ws1", &Instance{
		ID:     "inst_1",
		Status: StatusRunning,
	})

	if !manager.IsRunning("ws1") {
		t.Error("should be running after set")
	}
}

// TestManager_ConcurrentInitialization tests concurrent access during initialization
func TestManager_ConcurrentInitialization(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	numGoroutines := 100

	// All goroutines try to set their own workspace simultaneously
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			wsID := string(rune('a' + (idx % 26)))
			manager.SetInstance(wsID, &Instance{
				ID:     "inst_" + wsID,
				Status: StatusRunning,
			})
		}(i)
	}

	wg.Wait()

	// Should have at most 26 instances
	instances := manager.ListInstances()
	if len(instances) > 26 || len(instances) == 0 {
		t.Errorf("expected 1-26 instances, got %d", len(instances))
	}
}

// TestManager_ZeroValue tests zero value Manager behavior
func TestManager_ZeroValue(t *testing.T) {
	var manager Manager // Zero value

	// Document that zero value Manager panics on use
	defer func() {
		if r := recover(); r != nil {
			t.Logf("Zero value Manager panics as expected: %v", r)
		}
	}()

	// This will panic due to nil map
	manager.SetInstance("ws1", &Instance{})
}

// TestManager_RepeatedOperations tests repeated same operations
func TestManager_RepeatedOperations(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{ID: "inst_1", Status: StatusRunning}

	// Set same instance 1000 times
	for i := 0; i < 1000; i++ {
		manager.SetInstance("ws1", inst)
	}

	// Should still have just one
	instances := manager.ListInstances()
	if len(instances) != 1 {
		t.Errorf("expected 1 instance, got %d", len(instances))
	}

	// Remove same workspace 1000 times
	for i := 0; i < 1000; i++ {
		manager.RemoveInstance("ws1")
	}

	instances = manager.ListInstances()
	if len(instances) != 0 {
		t.Errorf("expected 0 instances, got %d", len(instances))
	}
}

// TestManager_AlternatingOperations tests alternating add/remove
func TestManager_AlternatingOperations(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{ID: "inst_1", Status: StatusRunning}

	for i := 0; i < 1000; i++ {
		manager.SetInstance("ws1", inst)
		if !manager.IsRunning("ws1") {
			t.Errorf("iteration %d: should be running after set", i)
		}

		manager.RemoveInstance("ws1")
		if manager.IsRunning("ws1") {
			t.Errorf("iteration %d: should not be running after remove", i)
		}
	}
}

// TestManager_RapidStateChanges tests rapid status transitions
func TestManager_RapidStateChanges(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	statuses := []InstanceStatus{
		StatusPending, StatusStarting, StatusRunning,
		StatusStopping, StatusStopped, StatusError,
	}

	for i := 0; i < 1000; i++ {
		status := statuses[i%len(statuses)]
		manager.SetInstance("ws1", &Instance{
			ID:     "inst_1",
			Status: status,
		})

		// Only StatusRunning should report as running
		isRunning := manager.IsRunning("ws1")
		shouldBeRunning := status == StatusRunning

		if isRunning != shouldBeRunning {
			t.Errorf("iteration %d: status=%s, isRunning=%v, expected=%v",
				i, status, isRunning, shouldBeRunning)
		}
	}
}

// TestManager_LockContention tests high lock contention
func TestManager_LockContention(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Pre-populate
	for i := 0; i < 10; i++ {
		manager.SetInstance(string(rune('a'+i)), &Instance{
			ID:     "inst_" + string(rune('a'+i)),
			Status: StatusRunning,
		})
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	operations := int64(0)

	// Many goroutines doing different operations
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			wsID := string(rune('a' + (idx % 10)))
			for {
				select {
				case <-ctx.Done():
					return
				default:
					switch idx % 5 {
					case 0:
						manager.IsRunning(wsID)
					case 1:
						manager.GetInstanceByID("inst_" + wsID)
					case 2:
						manager.ListInstances()
					case 3:
						manager.SetInstance(wsID, &Instance{
							ID:     "inst_" + wsID,
							Status: StatusRunning,
						})
					case 4:
						// Don't actually remove to keep data stable
						_ = manager.IsRunning(wsID)
					}
					atomic.AddInt64(&operations, 1)
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("Completed %d operations under high contention", atomic.LoadInt64(&operations))
}

// TestManager_InstancePointerStability tests that instance pointers remain stable
func TestManager_InstancePointerStability(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{ID: "inst_1", Status: StatusRunning}
	manager.SetInstance("ws1", inst)

	// Get back and verify same pointer
	found := manager.GetInstanceByID("inst_1")
	if found != inst {
		t.Error("should return same pointer")
	}

	// Modify through original pointer
	inst.Status = StatusStopped

	// Should reflect in manager
	if manager.IsRunning("ws1") {
		t.Error("status change should be reflected")
	}
}

// TestManager_NilContextBehavior tests behavior with nil context
func TestManager_NilContextBehavior(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("ws1", &Instance{
		ID:     "inst_1",
		Status: StatusRunning,
	})

	// GetInstance with nil context - should work for cache lookup
	// This documents expected behavior
	defer func() {
		if r := recover(); r != nil {
			t.Logf("nil context panics: %v", r)
		}
	}()

	// Note: Go's context package says context should not be nil
	// but cache lookup doesn't use context, so this might work
	inst, err := manager.GetInstance(nil, "ws1")
	if err != nil {
		t.Logf("GetInstance with nil context returned error: %v", err)
	} else if inst == nil {
		t.Error("should find cached instance")
	}
}

// TestManager_ContextWithValues tests context with various values
func TestManager_ContextWithValues(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("ws1", &Instance{
		ID:     "inst_1",
		Status: StatusRunning,
	})

	// Context with many nested values
	ctx := context.Background()
	for i := 0; i < 100; i++ {
		ctx = context.WithValue(ctx, i, i*2)
	}

	inst, err := manager.GetInstance(ctx, "ws1")
	if err != nil {
		t.Errorf("GetInstance with values failed: %v", err)
	}
	if inst == nil {
		t.Error("should find instance")
	}
}

// TestManager_DeadlineEdgeCases tests deadline edge cases
func TestManager_DeadlineEdgeCases(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("ws1", &Instance{
		ID:     "inst_1",
		Status: StatusRunning,
	})

	// Already expired deadline
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Hour))
	defer cancel()

	// GetInstance from cache should still work (doesn't use ctx for cache)
	inst, err := manager.GetInstance(ctx, "ws1")
	if err != nil {
		t.Logf("Expired context error: %v", err)
	}
	if inst == nil {
		t.Error("cache lookup should work regardless of deadline")
	}

	// Very short deadline
	ctx2, cancel2 := context.WithTimeout(context.Background(), time.Nanosecond)
	defer cancel2()
	time.Sleep(time.Microsecond) // Let it expire

	inst, err = manager.GetInstance(ctx2, "ws1")
	if inst == nil {
		t.Error("cache lookup should work regardless of deadline")
	}
}

// TestManager_InstanceIDCollisions tests when different workspaces have same instance ID
func TestManager_InstanceIDCollisions(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Two workspaces with same instance ID (shouldn't happen in practice but test it)
	inst1 := &Instance{ID: "same_id", Status: StatusRunning, BaseURL: "url1"}
	inst2 := &Instance{ID: "same_id", Status: StatusRunning, BaseURL: "url2"}

	manager.SetInstance("ws1", inst1)
	manager.SetInstance("ws2", inst2)

	// GetInstanceByID should return one of them (order not guaranteed)
	found := manager.GetInstanceByID("same_id")
	if found == nil {
		t.Error("should find one instance")
	}

	// Both workspaces should be running
	if !manager.IsRunning("ws1") {
		t.Error("ws1 should be running")
	}
	if !manager.IsRunning("ws2") {
		t.Error("ws2 should be running")
	}
}

// TestManager_WorkspaceIDValidation tests various workspace ID formats
func TestManager_WorkspaceIDValidation(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	testCases := []string{
		"",                        // Empty
		" ",                       // Single space
		"  ",                      // Multiple spaces
		"\t",                      // Tab
		"\n",                      // Newline
		"\r\n",                    // CRLF
		"\x00",                    // Null byte
		"normal",                  // Normal
		"with-dashes",             // Dashes
		"with_underscores",        // Underscores
		"with.dots",               // Dots
		"with:colons",             // Colons
		"with/slashes",            // Slashes
		"with\\backslashes",       // Backslashes
		"with spaces",             // Spaces
		"MixedCase",               // Mixed case
		"ALLCAPS",                 // All caps
		"12345",                   // Numbers only
		"ws_123_abc",              // Mixed
		"日本語",                     // Japanese
		"العربية",                  // Arabic
		"🚀🎉💻",                    // Emojis
		"a" + string(make([]byte, 10000)), // Very long
	}

	for _, wsID := range testCases {
		inst := &Instance{ID: "inst_" + wsID, Status: StatusRunning}
		manager.SetInstance(wsID, inst)

		if !manager.IsRunning(wsID) {
			t.Errorf("workspace %q should be running", wsID)
		}

		manager.RemoveInstance(wsID)

		if manager.IsRunning(wsID) {
			t.Errorf("workspace %q should not be running after remove", wsID)
		}
	}
}
