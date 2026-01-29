// internal/morph/manager_edge_test.go
package morph

import (
	"context"
	"sync"
	"testing"
	"time"
)

// TestManager_InstanceCacheOperations tests all cache operations
func TestManager_InstanceCacheOperations(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Test SetInstance
	inst := &Instance{
		ID:     "inst_123",
		Status: StatusRunning,
	}
	manager.SetInstance("workspace1", inst)

	if !manager.IsRunning("workspace1") {
		t.Error("workspace1 should be running after SetInstance")
	}

	// Test GetInstanceByID
	found := manager.GetInstanceByID("inst_123")
	if found == nil {
		t.Error("should find instance by ID")
	}
	if found.ID != "inst_123" {
		t.Errorf("expected 'inst_123', got '%s'", found.ID)
	}

	// Test GetInstanceByID with non-existent ID
	notFound := manager.GetInstanceByID("inst_nonexistent")
	if notFound != nil {
		t.Error("should not find non-existent instance")
	}

	// Test ListInstances
	instances := manager.ListInstances()
	if len(instances) != 1 {
		t.Errorf("expected 1 instance, got %d", len(instances))
	}

	// Test RemoveInstance
	manager.RemoveInstance("workspace1")
	if manager.IsRunning("workspace1") {
		t.Error("workspace1 should not be running after RemoveInstance")
	}

	instances = manager.ListInstances()
	if len(instances) != 0 {
		t.Errorf("expected 0 instances after remove, got %d", len(instances))
	}
}

// TestManager_IsRunning tests the IsRunning method
func TestManager_IsRunning(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Non-existent workspace
	if manager.IsRunning("nonexistent") {
		t.Error("non-existent workspace should not be running")
	}

	// Running instance
	manager.SetInstance("running_ws", &Instance{
		ID:     "inst_1",
		Status: StatusRunning,
	})
	if !manager.IsRunning("running_ws") {
		t.Error("running workspace should be running")
	}

	// Stopped instance
	manager.SetInstance("stopped_ws", &Instance{
		ID:     "inst_2",
		Status: StatusStopped,
	})
	if manager.IsRunning("stopped_ws") {
		t.Error("stopped workspace should not be running")
	}

	// Pending instance
	manager.SetInstance("pending_ws", &Instance{
		ID:     "inst_3",
		Status: StatusPending,
	})
	if manager.IsRunning("pending_ws") {
		t.Error("pending workspace should not be running")
	}

	// Error instance
	manager.SetInstance("error_ws", &Instance{
		ID:     "inst_4",
		Status: StatusError,
	})
	if manager.IsRunning("error_ws") {
		t.Error("error workspace should not be running")
	}
}

// TestManager_MultipleInstances tests handling multiple instances
func TestManager_MultipleInstances(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Add multiple instances
	for i := 0; i < 10; i++ {
		wsID := "workspace_" + string(rune('0'+i))
		manager.SetInstance(wsID, &Instance{
			ID:     "inst_" + string(rune('0'+i)),
			Status: StatusRunning,
		})
	}

	instances := manager.ListInstances()
	if len(instances) != 10 {
		t.Errorf("expected 10 instances, got %d", len(instances))
	}

	// Remove half
	for i := 0; i < 5; i++ {
		wsID := "workspace_" + string(rune('0'+i))
		manager.RemoveInstance(wsID)
	}

	instances = manager.ListInstances()
	if len(instances) != 5 {
		t.Errorf("expected 5 instances, got %d", len(instances))
	}
}

// TestManager_ConcurrentReads tests concurrent read operations
func TestManager_ConcurrentReads(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Set up some instances
	for i := 0; i < 5; i++ {
		wsID := "workspace_" + string(rune('a'+i))
		manager.SetInstance(wsID, &Instance{
			ID:     "inst_" + string(rune('a'+i)),
			Status: StatusRunning,
		})
	}

	var wg sync.WaitGroup
	errors := make(chan error, 100)

	// Concurrent reads
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			wsID := "workspace_" + string(rune('a'+(idx%5)))

			if !manager.IsRunning(wsID) {
				errors <- ErrNotRunning
				return
			}

			_ = manager.ListInstances()
			_ = manager.GetInstanceByID("inst_" + string(rune('a'+(idx%5))))
		}(i)
	}

	wg.Wait()
	close(errors)

	for err := range errors {
		t.Errorf("concurrent read error: %v", err)
	}
}

// TestManager_ConcurrentWrites tests concurrent write operations
func TestManager_ConcurrentWrites(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	numWriters := 50

	// Concurrent writes
	for i := 0; i < numWriters; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			wsID := "workspace_" + string(rune('a'+(idx%26)))
			manager.SetInstance(wsID, &Instance{
				ID:     "inst_" + string(rune('a'+(idx%26))),
				Status: StatusRunning,
			})
		}(i)
	}

	wg.Wait()

	// Should have at most 26 unique instances (a-z)
	instances := manager.ListInstances()
	if len(instances) > 26 {
		t.Errorf("expected at most 26 instances, got %d", len(instances))
	}
}

// TestManager_ConcurrentReadWrite tests concurrent reads and writes
func TestManager_ConcurrentReadWrite(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Writers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					wsID := "workspace_" + string(rune('a'+(idx%10)))
					manager.SetInstance(wsID, &Instance{
						ID:     "inst_" + string(rune('a'+(idx%10))),
						Status: StatusRunning,
					})
					time.Sleep(time.Millisecond)
				}
			}
		}(i)
	}

	// Readers
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					wsID := "workspace_" + string(rune('a'+(idx%10)))
					_ = manager.IsRunning(wsID)
					_ = manager.ListInstances()
					time.Sleep(time.Millisecond)
				}
			}
		}(i)
	}

	// Deleters
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					wsID := "workspace_" + string(rune('a'+(idx%10)))
					manager.RemoveInstance(wsID)
					time.Sleep(2 * time.Millisecond)
				}
			}
		}(i)
	}

	<-ctx.Done()
	wg.Wait()

	// If we got here without deadlock or panic, test passes
}

// TestManager_InstanceStateTransitions tests instance status changes
func TestManager_InstanceStateTransitions(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{
		ID:     "inst_123",
		Status: StatusPending,
	}
	manager.SetInstance("workspace1", inst)

	// Pending -> Starting
	inst.Status = StatusStarting
	if manager.IsRunning("workspace1") {
		t.Error("starting instance should not be 'running'")
	}

	// Starting -> Running
	inst.Status = StatusRunning
	if !manager.IsRunning("workspace1") {
		t.Error("running instance should be 'running'")
	}

	// Running -> Stopping
	inst.Status = StatusStopping
	if manager.IsRunning("workspace1") {
		t.Error("stopping instance should not be 'running'")
	}

	// Stopping -> Stopped
	inst.Status = StatusStopped
	if manager.IsRunning("workspace1") {
		t.Error("stopped instance should not be 'running'")
	}

	// Stopped -> Running (restart)
	inst.Status = StatusRunning
	if !manager.IsRunning("workspace1") {
		t.Error("restarted instance should be 'running'")
	}

	// Running -> Error
	inst.Status = StatusError
	if manager.IsRunning("workspace1") {
		t.Error("error instance should not be 'running'")
	}
}

// TestManager_OverwriteInstance tests overwriting an existing instance
func TestManager_OverwriteInstance(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// First instance
	inst1 := &Instance{
		ID:     "inst_old",
		Status: StatusRunning,
	}
	manager.SetInstance("workspace1", inst1)

	// Overwrite with new instance
	inst2 := &Instance{
		ID:     "inst_new",
		Status: StatusStopped,
	}
	manager.SetInstance("workspace1", inst2)

	// Check it was overwritten
	found := manager.GetInstanceByID("inst_new")
	if found == nil {
		t.Error("should find new instance")
	}

	notFound := manager.GetInstanceByID("inst_old")
	if notFound != nil {
		t.Error("old instance should be gone")
	}

	if manager.IsRunning("workspace1") {
		t.Error("workspace1 should be stopped")
	}
}

// TestManager_RemoveNonExistent tests removing non-existent instance
func TestManager_RemoveNonExistent(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Should not panic
	manager.RemoveInstance("nonexistent")

	instances := manager.ListInstances()
	if len(instances) != 0 {
		t.Errorf("expected 0 instances, got %d", len(instances))
	}
}

// TestManager_EmptyWorkspaceID tests behavior with empty workspace ID
func TestManager_EmptyWorkspaceID(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Empty workspace ID is technically allowed
	manager.SetInstance("", &Instance{
		ID:     "inst_empty",
		Status: StatusRunning,
	})

	if !manager.IsRunning("") {
		t.Error("empty workspace should be running")
	}

	manager.RemoveInstance("")

	if manager.IsRunning("") {
		t.Error("empty workspace should be removed")
	}
}

// TestManager_SpecialWorkspaceIDs tests special characters in workspace IDs
func TestManager_SpecialWorkspaceIDs(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	specialIDs := []string{
		"workspace-with-dashes",
		"workspace_with_underscores",
		"workspace.with.dots",
		"workspace:with:colons",
		"workspace/with/slashes",
		"workspace with spaces",
		"workspace\twith\ttabs",
		"工作区",     // Chinese
		"рабочее", // Russian
		"🚀🎉",      // Emojis
	}

	for _, wsID := range specialIDs {
		manager.SetInstance(wsID, &Instance{
			ID:     "inst_" + wsID,
			Status: StatusRunning,
		})
	}

	for _, wsID := range specialIDs {
		if !manager.IsRunning(wsID) {
			t.Errorf("workspace '%s' should be running", wsID)
		}
	}

	instances := manager.ListInstances()
	if len(instances) != len(specialIDs) {
		t.Errorf("expected %d instances, got %d", len(specialIDs), len(instances))
	}
}

// TestManager_NilInstance tests handling nil instance
func TestManager_NilInstance(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Setting nil should work but IsRunning should return false
	manager.SetInstance("workspace1", nil)

	// This should not panic
	running := manager.IsRunning("workspace1")
	if running {
		t.Error("nil instance should not be running")
	}
}

// TestManager_InstanceMetadataPreservation tests that metadata is preserved
func TestManager_InstanceMetadataPreservation(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{
		ID:         "inst_123",
		Status:     StatusRunning,
		BaseURL:    "https://test.morph.so",
		CDPURL:     "https://test.morph.so/cdp/",
		VNCURL:     "https://test.morph.so/vnc/",
		CodeURL:    "https://test.morph.so/code/",
		AppURL:     "https://test.morph.so/app/",
		TTLSeconds: 3600,
		Metadata: map[string]string{
			"key1": "value1",
			"key2": "value2",
		},
	}
	manager.SetInstance("workspace1", inst)

	// Get it back
	retrieved := manager.GetInstanceByID("inst_123")
	if retrieved == nil {
		t.Fatal("should find instance")
	}

	if retrieved.BaseURL != inst.BaseURL {
		t.Errorf("BaseURL mismatch")
	}
	if retrieved.CDPURL != inst.CDPURL {
		t.Errorf("CDPURL mismatch")
	}
	if retrieved.TTLSeconds != inst.TTLSeconds {
		t.Errorf("TTLSeconds mismatch")
	}
	if retrieved.Metadata["key1"] != "value1" {
		t.Errorf("Metadata key1 mismatch")
	}
}

// BenchmarkManager_IsRunning benchmarks IsRunning
func BenchmarkManager_IsRunning(b *testing.B) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}
	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_123",
		Status: StatusRunning,
	})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = manager.IsRunning("workspace1")
	}
}

// BenchmarkManager_ListInstances benchmarks ListInstances with many instances
func BenchmarkManager_ListInstances(b *testing.B) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Add 100 instances
	for i := 0; i < 100; i++ {
		wsID := string(rune(i))
		manager.SetInstance(wsID, &Instance{
			ID:     "inst_" + wsID,
			Status: StatusRunning,
		})
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = manager.ListInstances()
	}
}

// BenchmarkManager_SetInstance benchmarks SetInstance
func BenchmarkManager_SetInstance(b *testing.B) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{
		ID:     "inst_123",
		Status: StatusRunning,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		manager.SetInstance("workspace1", inst)
	}
}

// BenchmarkManager_ConcurrentAccess benchmarks concurrent access
func BenchmarkManager_ConcurrentAccess(b *testing.B) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Add some instances
	for i := 0; i < 10; i++ {
		wsID := string(rune('a' + i))
		manager.SetInstance(wsID, &Instance{
			ID:     "inst_" + wsID,
			Status: StatusRunning,
		})
	}

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			wsID := string(rune('a' + (i % 10)))
			_ = manager.IsRunning(wsID)
			i++
		}
	})
}
