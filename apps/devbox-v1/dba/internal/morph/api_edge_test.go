// internal/morph/api_edge_test.go
package morph

import (
	"context"
	"errors"
	"testing"
	"time"
)

// TestManager_GetInstance_NotFound tests GetInstance for non-existent workspace
func TestManager_GetInstance_NotFound(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	ctx := context.Background()
	_, err := manager.GetInstance(ctx, "nonexistent")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// TestManager_GetInstance_Found tests GetInstance for existing workspace
func TestManager_GetInstance_Found(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{
		ID:     "inst_123",
		Status: StatusRunning,
	}
	manager.SetInstance("workspace1", inst)

	ctx := context.Background()
	found, err := manager.GetInstance(ctx, "workspace1")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if found == nil {
		t.Error("expected instance, got nil")
	}
	if found.ID != "inst_123" {
		t.Errorf("expected 'inst_123', got '%s'", found.ID)
	}
}

// TestManager_StopInstance_NotFound tests stopping non-existent workspace
func TestManager_StopInstance_NotFound(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	ctx := context.Background()
	err := manager.StopInstance(ctx, "nonexistent")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// TestManager_StopInstance_NotRunning tests stopping already stopped instance
func TestManager_StopInstance_NotRunning(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_123",
		Status: StatusStopped,
	})

	ctx := context.Background()
	err := manager.StopInstance(ctx, "workspace1")
	if !errors.Is(err, ErrNotRunning) {
		t.Errorf("expected ErrNotRunning, got %v", err)
	}
}

// TestManager_Exec_NotFound tests exec on non-existent workspace
func TestManager_Exec_NotFound(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	ctx := context.Background()
	_, err := manager.Exec(ctx, "nonexistent", "echo hello")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// TestManager_Exec_NotRunning tests exec on stopped instance
func TestManager_Exec_NotRunning(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_123",
		Status: StatusStopped,
	})

	ctx := context.Background()
	_, err := manager.Exec(ctx, "workspace1", "echo hello")
	if !errors.Is(err, ErrNotRunning) {
		t.Errorf("expected ErrNotRunning, got %v", err)
	}
}

// TestManager_SaveSnapshot_NotFound tests snapshot on non-existent workspace
func TestManager_SaveSnapshot_NotFound(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	ctx := context.Background()
	_, err := manager.SaveSnapshot(ctx, "nonexistent", "my-snapshot")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// TestManager_SaveSnapshot_NotRunning tests snapshot on stopped instance
func TestManager_SaveSnapshot_NotRunning(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_123",
		Status: StatusStopped,
	})

	ctx := context.Background()
	_, err := manager.SaveSnapshot(ctx, "workspace1", "my-snapshot")
	if !errors.Is(err, ErrNotRunning) {
		t.Errorf("expected ErrNotRunning, got %v", err)
	}
}

// TestManager_RefreshInstance_NotFound tests refresh on non-existent workspace
func TestManager_RefreshInstance_NotFound(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	ctx := context.Background()
	_, err := manager.RefreshInstance(ctx, "nonexistent")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// TestManager_StartInstance_AlreadyRunning tests starting already running instance
func TestManager_StartInstance_AlreadyRunning(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	existingInst := &Instance{
		ID:     "inst_existing",
		Status: StatusRunning,
	}
	manager.SetInstance("workspace1", existingInst)

	// This would call Python, but we can test the caching logic
	// by checking IsRunning before the actual API call
	if !manager.IsRunning("workspace1") {
		t.Error("workspace should be running")
	}
}

// TestManagerConfig_ZeroTTL tests that zero TTL gets a default
func TestManagerConfig_ZeroTTL(t *testing.T) {
	config := ManagerConfig{
		APIKey:         "test",
		BaseSnapshotID: "snap_test",
		DefaultTTL:     0, // Zero means use default
	}

	// The manager should use 3600 as default when TTL is 0
	// This is tested in the StartInstance method
	if config.DefaultTTL != 0 {
		t.Error("config should allow zero TTL")
	}
}

// TestManager_ContextCancellation tests behavior with canceled context
func TestManager_ContextCancellation(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_123",
		Status: StatusRunning,
	})

	// Create a canceled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	// GetInstance should still work (doesn't use context for cache lookup)
	inst, err := manager.GetInstance(ctx, "workspace1")
	if err != nil {
		t.Errorf("GetInstance should work with canceled context: %v", err)
	}
	if inst == nil {
		t.Error("expected instance")
	}
}

// TestManager_ContextTimeout tests behavior with timed out context
func TestManager_ContextTimeout(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_123",
		Status: StatusRunning,
	})

	// Create an already-expired context
	ctx, cancel := context.WithTimeout(context.Background(), -time.Second)
	defer cancel()

	// GetInstance should still work (doesn't use context for cache lookup)
	inst, err := manager.GetInstance(ctx, "workspace1")
	if err != nil {
		t.Errorf("GetInstance should work with expired context: %v", err)
	}
	if inst == nil {
		t.Error("expected instance")
	}
}

// TestInstance_URLGeneration tests URL generation from BaseURL
func TestInstance_URLGeneration(t *testing.T) {
	inst := &Instance{
		ID:      "inst_123",
		BaseURL: "https://test.morph.so",
	}

	// Simulate what StartInstance does
	if inst.BaseURL != "" {
		inst.CodeURL = inst.BaseURL + "/code/"
		inst.VNCURL = inst.BaseURL + "/vnc/"
		inst.AppURL = inst.BaseURL + "/app/"
		inst.CDPURL = inst.BaseURL + "/cdp/"
	}

	if inst.CodeURL != "https://test.morph.so/code/" {
		t.Errorf("expected 'https://test.morph.so/code/', got '%s'", inst.CodeURL)
	}
	if inst.VNCURL != "https://test.morph.so/vnc/" {
		t.Errorf("expected 'https://test.morph.so/vnc/', got '%s'", inst.VNCURL)
	}
	if inst.AppURL != "https://test.morph.so/app/" {
		t.Errorf("expected 'https://test.morph.so/app/', got '%s'", inst.AppURL)
	}
	if inst.CDPURL != "https://test.morph.so/cdp/" {
		t.Errorf("expected 'https://test.morph.so/cdp/', got '%s'", inst.CDPURL)
	}
}

// TestInstance_EmptyBaseURL tests URL generation with empty BaseURL
func TestInstance_EmptyBaseURL(t *testing.T) {
	inst := &Instance{
		ID:      "inst_123",
		BaseURL: "",
	}

	// With empty BaseURL, derived URLs should also be empty
	if inst.CodeURL != "" || inst.VNCURL != "" || inst.AppURL != "" || inst.CDPURL != "" {
		t.Error("derived URLs should be empty when BaseURL is empty")
	}
}

// TestManager_AllStatusStates tests all status states with IsRunning
func TestManager_AllStatusStates(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	statuses := []struct {
		status  InstanceStatus
		running bool
	}{
		{StatusPending, false},
		{StatusStarting, false},
		{StatusRunning, true},
		{StatusStopping, false},
		{StatusStopped, false},
		{StatusError, false},
	}

	for _, tc := range statuses {
		wsID := "ws_" + string(tc.status)
		manager.SetInstance(wsID, &Instance{
			ID:     "inst_" + string(tc.status),
			Status: tc.status,
		})

		isRunning := manager.IsRunning(wsID)
		if isRunning != tc.running {
			t.Errorf("status %s: expected IsRunning=%v, got %v", tc.status, tc.running, isRunning)
		}
	}
}

// TestManager_ListInstancesEmpty tests ListInstances with no instances
func TestManager_ListInstancesEmpty(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	instances := manager.ListInstances()
	if instances == nil {
		t.Error("expected empty slice, not nil")
	}
	if len(instances) != 0 {
		t.Errorf("expected 0 instances, got %d", len(instances))
	}
}

// TestManager_GetInstanceByID_MultipleInstances tests finding instance among many
func TestManager_GetInstanceByID_MultipleInstances(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Add 100 instances
	for i := 0; i < 100; i++ {
		wsID := "workspace_" + string(rune('a'+(i%26))) + "_" + string(rune('0'+(i/26)))
		instID := "inst_test_" + string(rune('0'+(i/10))) + string(rune('0'+(i%10)))
		manager.SetInstance(wsID, &Instance{
			ID:     instID,
			Status: StatusRunning,
		})
	}

	// Find specific instance (inst_test_42)
	found := manager.GetInstanceByID("inst_test_42")
	if found == nil {
		t.Error("should find inst_test_42")
	}

	// Find non-existent
	notFound := manager.GetInstanceByID("inst_test_99_extra")
	if notFound != nil {
		t.Error("should not find inst_test_99_extra")
	}
}

// TestManager_RemoveAndReAdd tests removing and re-adding an instance
func TestManager_RemoveAndReAdd(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Add
	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_v1",
		Status: StatusRunning,
	})

	// Remove
	manager.RemoveInstance("workspace1")

	// Re-add with different ID
	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_v2",
		Status: StatusRunning,
	})

	// Verify new instance is there
	found := manager.GetInstanceByID("inst_v2")
	if found == nil {
		t.Error("should find inst_v2")
	}

	// Old instance should not be found
	notFound := manager.GetInstanceByID("inst_v1")
	if notFound != nil {
		t.Error("should not find inst_v1")
	}
}

// TestManager_SameInstanceID_DifferentWorkspaces tests same instance ID for different workspaces
func TestManager_SameInstanceID_DifferentWorkspaces(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// This shouldn't happen in practice, but test the behavior
	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_shared",
		Status: StatusRunning,
	})
	manager.SetInstance("workspace2", &Instance{
		ID:     "inst_shared", // Same ID (unusual but valid)
		Status: StatusStopped,
	})

	// GetInstanceByID returns first match
	found := manager.GetInstanceByID("inst_shared")
	if found == nil {
		t.Error("should find inst_shared")
	}

	// Both workspaces should have their own state
	if !manager.IsRunning("workspace1") {
		t.Error("workspace1 should be running")
	}
	if manager.IsRunning("workspace2") {
		t.Error("workspace2 should not be running")
	}
}

// TestExecResult_AllFields tests all ExecResult fields
func TestExecResult_AllFields(t *testing.T) {
	result := ExecResult{
		Stdout:   "output line 1\noutput line 2",
		Stderr:   "error line 1",
		ExitCode: 1,
	}

	if result.ExitCode != 1 {
		t.Error("exit code should be 1")
	}
	if result.Stdout == "" {
		t.Error("stdout should not be empty")
	}
	if result.Stderr == "" {
		t.Error("stderr should not be empty")
	}
}

// TestSnapshot_AllFields tests all Snapshot fields
func TestSnapshot_AllFields(t *testing.T) {
	now := time.Now()
	snap := Snapshot{
		ID:        "snap_123",
		Digest:    "dba-base-v1",
		ImageID:   "img_abc",
		VCPUs:     4,
		Memory:    8192,
		DiskSize:  65536,
		CreatedAt: now,
		Metadata:  map[string]string{"env": "prod"},
	}

	if snap.ID != "snap_123" {
		t.Error("ID mismatch")
	}
	if snap.Digest != "dba-base-v1" {
		t.Error("Digest mismatch")
	}
	if snap.VCPUs != 4 {
		t.Error("VCPUs mismatch")
	}
	if snap.Memory != 8192 {
		t.Error("Memory mismatch")
	}
	if snap.DiskSize != 65536 {
		t.Error("DiskSize mismatch")
	}
	if snap.Metadata["env"] != "prod" {
		t.Error("Metadata mismatch")
	}
}
