// internal/morph/lifecycle_test.go
// Tests for instance lifecycle edge cases
package morph

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestLifecycle_AllStateTransitions tests all valid state transitions
func TestLifecycle_AllStateTransitions(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	transitions := []struct {
		from InstanceStatus
		to   InstanceStatus
	}{
		{StatusPending, StatusStarting},
		{StatusStarting, StatusRunning},
		{StatusRunning, StatusStopping},
		{StatusStopping, StatusStopped},
		{StatusStopped, StatusStarting}, // Restart
		{StatusStarting, StatusRunning},
		{StatusRunning, StatusError},
		{StatusError, StatusStarting}, // Recovery
		{StatusStarting, StatusRunning},
	}

	inst := &Instance{ID: "inst_1", Status: StatusPending}
	manager.SetInstance("ws1", inst)

	for _, tr := range transitions {
		if inst.Status != tr.from {
			t.Errorf("expected status %s, got %s", tr.from, inst.Status)
		}

		inst.Status = tr.to

		// Verify IsRunning only true for StatusRunning
		isRunning := manager.IsRunning("ws1")
		shouldBeRunning := tr.to == StatusRunning

		if isRunning != shouldBeRunning {
			t.Errorf("transition %s->%s: IsRunning=%v, expected=%v",
				tr.from, tr.to, isRunning, shouldBeRunning)
		}
	}
}

// TestLifecycle_InvalidStateTransitions tests handling of invalid transitions
func TestLifecycle_InvalidStateTransitions(t *testing.T) {
	// These are logically invalid but should not panic
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Stopped -> Running (should go through Starting)
	inst := &Instance{ID: "inst_1", Status: StatusStopped}
	manager.SetInstance("ws1", inst)

	inst.Status = StatusRunning
	if !manager.IsRunning("ws1") {
		t.Error("direct transition to Running should work at data level")
	}

	// Error -> Stopped
	inst.Status = StatusError
	inst.Status = StatusStopped
	if manager.IsRunning("ws1") {
		t.Error("should not be running")
	}
}

// TestLifecycle_RapidTransitions tests rapid state changes
func TestLifecycle_RapidTransitions(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{ID: "inst_1", Status: StatusPending}
	manager.SetInstance("ws1", inst)

	allStatuses := []InstanceStatus{
		StatusPending, StatusStarting, StatusRunning,
		StatusStopping, StatusStopped, StatusError,
	}

	// Rapidly cycle through all states
	for i := 0; i < 10000; i++ {
		inst.Status = allStatuses[i%len(allStatuses)]
	}

	// Final state
	finalStatus := allStatuses[9999%len(allStatuses)]
	if inst.Status != finalStatus {
		t.Errorf("expected final status %s, got %s", finalStatus, inst.Status)
	}
}

// TestLifecycle_TTLBehavior tests TTL-related edge cases
func TestLifecycle_TTLBehavior(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	testCases := []struct {
		name       string
		ttl        int
		shouldWork bool
	}{
		{"zero_ttl", 0, true},
		{"one_second", 1, true},
		{"negative_ttl", -1, true}, // API may reject but we store it
		{"typical_ttl", 3600, true},
		{"one_day", 86400, true},
		{"one_week", 604800, true},
		{"one_year", 31536000, true},
		{"max_int", 2147483647, true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			inst := &Instance{
				ID:         "inst_" + tc.name,
				Status:     StatusRunning,
				TTLSeconds: tc.ttl,
			}
			manager.SetInstance(tc.name, inst)

			retrieved := manager.GetInstanceByID("inst_" + tc.name)
			if retrieved == nil {
				t.Fatal("should find instance")
			}
			if retrieved.TTLSeconds != tc.ttl {
				t.Errorf("TTL not preserved: got %d, want %d", retrieved.TTLSeconds, tc.ttl)
			}
		})
	}
}

// TestLifecycle_CreatedAtBehavior tests CreatedAt edge cases
func TestLifecycle_CreatedAtBehavior(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	testCases := []struct {
		name      string
		createdAt time.Time
	}{
		{"zero", time.Time{}},
		{"now", time.Now()},
		{"past", time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)},
		{"future", time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)},
		{"epoch", time.Unix(0, 0)},
		{"before_epoch", time.Unix(-86400, 0)},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			inst := &Instance{
				ID:        "inst_" + tc.name,
				Status:    StatusRunning,
				CreatedAt: tc.createdAt,
			}
			manager.SetInstance(tc.name, inst)

			retrieved := manager.GetInstanceByID("inst_" + tc.name)
			if retrieved == nil {
				t.Fatal("should find instance")
			}
			if !retrieved.CreatedAt.Equal(tc.createdAt) {
				t.Errorf("CreatedAt not preserved")
			}
		})
	}
}

// TestLifecycle_URLBehavior tests URL-related edge cases
func TestLifecycle_URLBehavior(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{
		ID:      "inst_1",
		Status:  StatusRunning,
		BaseURL: "https://example.com",
		CDPURL:  "wss://example.com/cdp",
		VNCURL:  "https://example.com:6080/vnc",
		CodeURL: "https://example.com:8080/code",
		AppURL:  "https://example.com:3000",
	}
	manager.SetInstance("ws1", inst)

	// Verify all URLs preserved
	retrieved := manager.GetInstanceByID("inst_1")
	if retrieved.BaseURL != inst.BaseURL {
		t.Error("BaseURL not preserved")
	}
	if retrieved.CDPURL != inst.CDPURL {
		t.Error("CDPURL not preserved")
	}
	if retrieved.VNCURL != inst.VNCURL {
		t.Error("VNCURL not preserved")
	}
	if retrieved.CodeURL != inst.CodeURL {
		t.Error("CodeURL not preserved")
	}
	if retrieved.AppURL != inst.AppURL {
		t.Error("AppURL not preserved")
	}
}

// TestLifecycle_MetadataBehavior tests metadata lifecycle
func TestLifecycle_MetadataBehavior(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Initial metadata
	inst := &Instance{
		ID:     "inst_1",
		Status: StatusRunning,
		Metadata: map[string]string{
			"version": "1.0",
			"env":     "prod",
		},
	}
	manager.SetInstance("ws1", inst)

	// Modify metadata through pointer
	inst.Metadata["new_key"] = "new_value"
	delete(inst.Metadata, "version")

	// Changes should be reflected
	retrieved := manager.GetInstanceByID("inst_1")
	if retrieved.Metadata["new_key"] != "new_value" {
		t.Error("metadata addition not reflected")
	}
	if _, exists := retrieved.Metadata["version"]; exists {
		t.Error("metadata deletion not reflected")
	}
}

// TestLifecycle_ConcurrentStateChanges tests concurrent state modifications
func TestLifecycle_ConcurrentStateChanges(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Create instances with different statuses
	for i := 0; i < 10; i++ {
		manager.SetInstance(fmt.Sprintf("ws%d", i), &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	changes := int64(0)

	// Multiple goroutines changing states
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			wsID := fmt.Sprintf("ws%d", idx%10)
			statuses := []InstanceStatus{StatusRunning, StatusStopped, StatusError}

			for {
				select {
				case <-ctx.Done():
					return
				default:
					newStatus := statuses[atomic.AddInt64(&changes, 1)%3]
					manager.SetInstance(wsID, &Instance{
						ID:     fmt.Sprintf("inst_%d", idx%10),
						Status: newStatus,
					})
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("Made %d state changes", changes)
}

// TestLifecycle_ReplaceInstance tests replacing an instance
func TestLifecycle_ReplaceInstance(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Original instance
	old := &Instance{
		ID:         "old_inst",
		Status:     StatusRunning,
		TTLSeconds: 3600,
	}
	manager.SetInstance("ws1", old)

	// Replace with new instance
	new := &Instance{
		ID:         "new_inst",
		Status:     StatusPending,
		TTLSeconds: 7200,
	}
	manager.SetInstance("ws1", new)

	// Old should be gone
	if manager.GetInstanceByID("old_inst") != nil {
		t.Error("old instance should be gone")
	}

	// New should be found
	if manager.GetInstanceByID("new_inst") == nil {
		t.Error("new instance should be found")
	}

	// Status should be updated
	if manager.IsRunning("ws1") {
		t.Error("should not be running (pending)")
	}
}

// TestLifecycle_ErrorRecovery tests error state recovery
func TestLifecycle_ErrorRecovery(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{
		ID:     "inst_1",
		Status: StatusError,
	}
	manager.SetInstance("ws1", inst)

	if manager.IsRunning("ws1") {
		t.Error("error state should not be running")
	}

	// Simulate recovery
	inst.Status = StatusStarting
	if manager.IsRunning("ws1") {
		t.Error("starting state should not be running")
	}

	inst.Status = StatusRunning
	if !manager.IsRunning("ws1") {
		t.Error("should be running after recovery")
	}
}

// TestLifecycle_MultipleWorkspaces tests multiple workspaces lifecycle
func TestLifecycle_MultipleWorkspaces(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	numWorkspaces := 100

	// Create all
	for i := 0; i < numWorkspaces; i++ {
		manager.SetInstance(fmt.Sprintf("ws%d", i), &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	// Verify all running
	for i := 0; i < numWorkspaces; i++ {
		if !manager.IsRunning(fmt.Sprintf("ws%d", i)) {
			t.Errorf("ws%d should be running", i)
		}
	}

	// Stop half
	for i := 0; i < numWorkspaces/2; i++ {
		inst := manager.GetInstanceByID(fmt.Sprintf("inst_%d", i))
		if inst != nil {
			inst.Status = StatusStopped
		}
	}

	// Verify states
	for i := 0; i < numWorkspaces; i++ {
		isRunning := manager.IsRunning(fmt.Sprintf("ws%d", i))
		shouldBeRunning := i >= numWorkspaces/2

		if isRunning != shouldBeRunning {
			t.Errorf("ws%d: isRunning=%v, expected=%v", i, isRunning, shouldBeRunning)
		}
	}

	// Remove all
	for i := 0; i < numWorkspaces; i++ {
		manager.RemoveInstance(fmt.Sprintf("ws%d", i))
	}

	// Verify all gone
	instances := manager.ListInstances()
	if len(instances) != 0 {
		t.Errorf("expected 0 instances, got %d", len(instances))
	}
}

// TestLifecycle_GetInstanceNotFound tests GetInstance with not found error
func TestLifecycle_GetInstanceNotFound(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	ctx := context.Background()
	_, err := manager.GetInstance(ctx, "nonexistent")

	if err == nil {
		t.Error("should return error for nonexistent")
	}

	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// TestLifecycle_RefreshInstanceNotFound tests RefreshInstance with not found error
func TestLifecycle_RefreshInstanceNotFound(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	ctx := context.Background()
	_, err := manager.RefreshInstance(ctx, "nonexistent")

	if err == nil {
		t.Error("should return error for nonexistent")
	}

	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// TestLifecycle_SnapshotIDPreservation tests snapshot ID preservation
func TestLifecycle_SnapshotIDPreservation(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{
		ID:         "inst_1",
		SnapshotID: "snap_123",
		Status:     StatusRunning,
	}
	manager.SetInstance("ws1", inst)

	retrieved := manager.GetInstanceByID("inst_1")
	if retrieved.SnapshotID != "snap_123" {
		t.Errorf("SnapshotID not preserved: got %s", retrieved.SnapshotID)
	}
}

// TestLifecycle_EmptyInstance tests empty instance
func TestLifecycle_EmptyInstance(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Empty instance (all zero values)
	inst := &Instance{}
	manager.SetInstance("ws1", inst)

	// Should not be running (empty status)
	if manager.IsRunning("ws1") {
		t.Error("empty instance should not be running")
	}

	// Should not find by empty ID
	found := manager.GetInstanceByID("")
	// This depends on implementation - document behavior
	t.Logf("GetInstanceByID('') returned: %v", found)
}

// TestLifecycle_PointerMutability tests that instance pointers are mutable
func TestLifecycle_PointerMutability(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{
		ID:       "inst_1",
		Status:   StatusPending,
		Metadata: make(map[string]string),
	}
	manager.SetInstance("ws1", inst)

	// Get pointer
	retrieved := manager.GetInstanceByID("inst_1")

	// Modify through retrieved pointer
	retrieved.Status = StatusRunning
	retrieved.Metadata["key"] = "value"

	// Original should reflect changes
	if inst.Status != StatusRunning {
		t.Error("original should reflect status change")
	}
	if inst.Metadata["key"] != "value" {
		t.Error("original should reflect metadata change")
	}

	// Manager should see changes
	if !manager.IsRunning("ws1") {
		t.Error("manager should see running status")
	}
}
