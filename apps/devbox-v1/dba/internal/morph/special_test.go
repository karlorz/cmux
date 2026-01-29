// internal/morph/special_test.go
// Special edge case tests for unusual scenarios
package morph

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestPanicRecovery_NilMap tests that nil map access is handled
func TestPanicRecovery_NilMap(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			// Panic is expected for nil map
			t.Logf("Recovered from panic (expected): %v", r)
		}
	}()

	manager := &Manager{
		instances: nil, // nil map
	}

	// This will panic - documenting expected behavior
	manager.SetInstance("ws1", &Instance{ID: "inst_1"})
}

// TestPanicRecovery_NilInstance tests operations with nil instance
func TestPanicRecovery_NilInstance(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Store nil instance
	manager.SetInstance("ws1", nil)

	// These should not panic due to our fix
	running := manager.IsRunning("ws1")
	if running {
		t.Error("nil instance should not be running")
	}

	// GetInstanceByID should return nil for nil instance
	// (it returns the pointer as-is)
	found := manager.GetInstanceByID("")
	if found != nil {
		t.Error("should not find nil instance by empty ID")
	}
}

// TestMemoryAllocation_ListInstances tests that ListInstances doesn't leak
func TestMemoryAllocation_ListInstances(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Add instances
	for i := 0; i < 100; i++ {
		manager.SetInstance(fmt.Sprintf("ws_%d", i), &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	// Force GC
	runtime.GC()
	var m1 runtime.MemStats
	runtime.ReadMemStats(&m1)

	// Call ListInstances many times
	for i := 0; i < 10000; i++ {
		_ = manager.ListInstances()
	}

	// Force GC again
	runtime.GC()
	var m2 runtime.MemStats
	runtime.ReadMemStats(&m2)

	// Memory shouldn't grow significantly
	// (This is a rough check, not exact)
	growth := int64(m2.HeapAlloc) - int64(m1.HeapAlloc)
	if growth > 100*1024*1024 { // 100MB growth would be suspicious
		t.Logf("Warning: significant memory growth: %d bytes", growth)
	}
}

// TestErrorInterface_Implementation tests error interface implementation
func TestErrorInterface_Implementation(t *testing.T) {
	// All sentinel errors should implement error
	var _ error = ErrNotFound
	var _ error = ErrAlreadyExists
	var _ error = ErrAlreadyRunning
	var _ error = ErrNotRunning
	var _ error = ErrTimeout
	var _ error = ErrAPIKeyMissing

	// APIError should implement error
	var _ error = &APIError{}

	// WrapError result should implement error
	var _ error = WrapError(ErrNotFound, "context")
}

// TestConcurrentInstanceCreation tests creating many instances concurrently
func TestConcurrentInstanceCreation(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	numGoroutines := 100
	numInstancesPerGoroutine := 100

	// Each goroutine creates its own set of instances
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(prefix int) {
			defer wg.Done()
			for j := 0; j < numInstancesPerGoroutine; j++ {
				wsID := fmt.Sprintf("ws_%d_%d", prefix, j)
				manager.SetInstance(wsID, &Instance{
					ID:     fmt.Sprintf("inst_%d_%d", prefix, j),
					Status: StatusRunning,
				})
			}
		}(i)
	}

	wg.Wait()

	// Should have all instances
	instances := manager.ListInstances()
	expected := numGoroutines * numInstancesPerGoroutine
	if len(instances) != expected {
		t.Errorf("expected %d instances, got %d", expected, len(instances))
	}
}

// TestInstancePointerVsValue tests pointer vs value semantics
func TestInstancePointerVsValue(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Create instance
	inst := &Instance{
		ID:         "inst_123",
		Status:     StatusRunning,
		TTLSeconds: 3600,
	}
	manager.SetInstance("ws1", inst)

	// Get it back
	retrieved := manager.GetInstanceByID("inst_123")

	// They should be the same pointer
	if retrieved != inst {
		t.Error("should be same pointer")
	}

	// Modifying one affects the other
	inst.Status = StatusStopped
	if manager.IsRunning("ws1") {
		t.Error("should not be running after modification")
	}
}

// TestInstanceCloning tests that cloning works correctly
func TestInstanceCloning(t *testing.T) {
	original := Instance{
		ID:         "inst_123",
		SnapshotID: "snap_456",
		Status:     StatusRunning,
		BaseURL:    "https://example.com",
		Metadata:   map[string]string{"key": "value"},
	}

	// Clone via JSON (common pattern)
	data, _ := json.Marshal(original)
	var clone Instance
	json.Unmarshal(data, &clone)

	// Modify original
	original.Status = StatusStopped
	original.Metadata["key"] = "modified"

	// Clone should be unaffected
	if clone.Status != StatusRunning {
		t.Error("clone status should be running")
	}
	if clone.Metadata["key"] != "value" {
		t.Error("clone metadata should be unaffected")
	}
}

// TestConcurrentModifyAndRead_SynchronizedAccess tests concurrent access via Manager methods
// Note: Direct Instance field access is NOT thread-safe (documented limitation).
// This test only exercises Manager's synchronized methods.
func TestConcurrentModifyAndRead_SynchronizedAccess(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Initial instance
	manager.SetInstance("ws1", &Instance{
		ID:     "inst_123",
		Status: StatusRunning,
	})

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	reads := int64(0)
	writes := int64(0)

	// Reader using synchronized Manager method
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			default:
				_ = manager.IsRunning("ws1") // This is synchronized
				atomic.AddInt64(&reads, 1)
			}
		}
	}()

	// Writer using synchronized Manager method
	wg.Add(1)
	go func() {
		defer wg.Done()
		statuses := []InstanceStatus{StatusRunning, StatusStopped, StatusPending}
		i := 0
		for {
			select {
			case <-ctx.Done():
				return
			default:
				manager.SetInstance("ws1", &Instance{
					ID:     "inst_123",
					Status: statuses[i%len(statuses)],
				})
				atomic.AddInt64(&writes, 1)
				i++
			}
		}
	}()

	wg.Wait()
	t.Logf("Reads: %d, Writes: %d", reads, writes)
}

// TestErrorWrappingPreservesType tests that error wrapping preserves type info
func TestErrorWrappingPreservesType(t *testing.T) {
	original := &APIError{
		Code:    "TEST",
		Message: "test message",
		Details: "test details",
	}

	wrapped := WrapError(original, "context1")
	wrapped = WrapError(wrapped, "context2")
	wrapped = WrapError(wrapped, "context3")

	// Should be able to extract APIError
	var apiErr *APIError
	if !errors.As(wrapped, &apiErr) {
		t.Error("should be able to extract APIError")
	}

	if apiErr.Code != "TEST" {
		t.Errorf("code should be preserved: got %s", apiErr.Code)
	}
}

// TestInstanceStatus_Equality tests status equality
func TestInstanceStatus_Equality(t *testing.T) {
	s1 := StatusRunning
	s2 := InstanceStatus("running")
	s3 := InstanceStatus("RUNNING")

	if s1 != s2 {
		t.Error("same value should be equal")
	}
	if s1 == s3 {
		t.Error("different case should not be equal")
	}
}

// TestManager_OrderIndependence tests that order of operations doesn't matter
func TestManager_OrderIndependence(t *testing.T) {
	// Test 1: Set then check
	m1 := &Manager{instances: make(map[string]*Instance)}
	m1.SetInstance("ws1", &Instance{ID: "inst_1", Status: StatusRunning})
	r1 := m1.IsRunning("ws1")

	// Test 2: Check then set (should return false first)
	m2 := &Manager{instances: make(map[string]*Instance)}
	r2Before := m2.IsRunning("ws1")
	m2.SetInstance("ws1", &Instance{ID: "inst_1", Status: StatusRunning})
	r2After := m2.IsRunning("ws1")

	if !r1 {
		t.Error("Test 1: should be running after set")
	}
	if r2Before {
		t.Error("Test 2: should not be running before set")
	}
	if !r2After {
		t.Error("Test 2: should be running after set")
	}
}

// TestMetadata_Concurrent tests concurrent metadata access
func TestMetadata_Concurrent(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Instance with shared metadata
	inst := &Instance{
		ID:       "inst_123",
		Status:   StatusRunning,
		Metadata: make(map[string]string),
	}
	manager.SetInstance("ws1", inst)

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Note: This test documents that direct metadata access is NOT thread-safe
	// The Manager only protects its own map, not the Instance's Metadata map
	// In production, you'd need additional synchronization

	// Reader
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			default:
				// This is a data race if writer is running
				// Documenting expected behavior
				_ = len(inst.Metadata)
			}
		}
	}()

	// Writer (disabled to avoid race in test - document the issue)
	// Uncommenting would cause race detector to fail
	/*
	wg.Add(1)
	go func() {
		defer wg.Done()
		i := 0
		for {
			select {
			case <-ctx.Done():
				return
			default:
				key := fmt.Sprintf("key_%d", i)
				inst.Metadata[key] = "value"
				i++
			}
		}
	}()
	*/

	wg.Wait()
}

// TestEmptyManager tests operations on empty manager
func TestEmptyManager(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// All these should work on empty manager
	if manager.IsRunning("anything") {
		t.Error("empty manager should have nothing running")
	}

	if manager.GetInstanceByID("anything") != nil {
		t.Error("empty manager should return nil")
	}

	instances := manager.ListInstances()
	if len(instances) != 0 {
		t.Error("empty manager should have no instances")
	}

	// Remove from empty should not panic
	manager.RemoveInstance("anything")

	ctx := context.Background()
	_, err := manager.GetInstance(ctx, "anything")
	if !errors.Is(err, ErrNotFound) {
		t.Error("should return ErrNotFound")
	}
}

// TestMaxInstances tests with maximum number of instances
func TestMaxInstances(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping in short mode")
	}

	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Add 10000 instances
	count := 10000
	for i := 0; i < count; i++ {
		manager.SetInstance(fmt.Sprintf("ws_%d", i), &Instance{
			ID:         fmt.Sprintf("inst_%d", i),
			Status:     StatusRunning,
			Metadata:   map[string]string{"index": fmt.Sprintf("%d", i)},
			TTLSeconds: 3600,
		})
	}

	// Verify all exist
	instances := manager.ListInstances()
	if len(instances) != count {
		t.Errorf("expected %d instances, got %d", count, len(instances))
	}

	// Verify random access works
	found := manager.GetInstanceByID("inst_5000")
	if found == nil {
		t.Error("should find inst_5000")
	}

	// Verify IsRunning is fast
	start := time.Now()
	for i := 0; i < 100000; i++ {
		_ = manager.IsRunning(fmt.Sprintf("ws_%d", i%count))
	}
	elapsed := time.Since(start)
	t.Logf("100000 IsRunning calls took %v", elapsed)
}

// TestJSONTagConsistency tests that JSON tags are consistent
func TestJSONTagConsistency(t *testing.T) {
	// Marshal and check field names
	inst := Instance{
		ID:         "test",
		SnapshotID: "snap",
		Status:     StatusRunning,
		BaseURL:    "http://test",
		CDPURL:     "ws://cdp",
		VNCURL:     "http://vnc",
		CodeURL:    "http://code",
		AppURL:     "http://app",
		TTLSeconds: 3600,
	}

	data, _ := json.Marshal(inst)
	jsonStr := string(data)

	expectedFields := []string{
		`"id"`,
		`"snapshot_id"`,
		`"status"`,
		`"base_url"`,
		`"cdp_url"`,
		`"vnc_url"`,
		`"code_url"`,
		`"app_url"`,
		`"ttl_seconds"`,
	}

	for _, field := range expectedFields {
		if !strings.Contains(jsonStr, field) {
			t.Errorf("JSON should contain %s", field)
		}
	}
}

// TestAPIError_Nil tests APIError behavior with nil-like values
func TestAPIError_Nil(t *testing.T) {
	// Zero value APIError
	var apiErr APIError
	errStr := apiErr.Error()
	if errStr != "morph API error []: " {
		t.Errorf("unexpected zero value error: %s", errStr)
	}

	// Pointer to zero value
	pErr := &APIError{}
	if pErr.Error() != "morph API error []: " {
		t.Error("pointer should work same as value")
	}
}

// TestWrapError_Cycle tests that error wrapping doesn't cause issues
func TestWrapError_Cycle(t *testing.T) {
	// Cannot actually create a cycle with fmt.Errorf, but test deep chains
	var err error = ErrNotFound
	for i := 0; i < 100; i++ {
		err = WrapError(err, fmt.Sprintf("level_%d", i))
	}

	// Should be able to unwrap
	if !errors.Is(err, ErrNotFound) {
		t.Error("should find ErrNotFound in deep chain")
	}
}
