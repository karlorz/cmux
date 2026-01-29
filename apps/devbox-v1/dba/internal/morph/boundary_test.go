// internal/morph/boundary_test.go
// Tests for boundary conditions, edge values, and corner cases
package morph

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestInstance_TimeEdgeCases tests time-related edge cases
func TestInstance_TimeEdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		createdAt time.Time
	}{
		{"zero time", time.Time{}},
		{"unix epoch", time.Unix(0, 0)},
		{"before epoch", time.Unix(-1, 0)},
		{"far future", time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC)},
		{"far past", time.Date(1900, 1, 1, 0, 0, 0, 0, time.UTC)},
		{"max nanoseconds", time.Unix(0, 999999999)},
		{"now", time.Now()},
		{"now UTC", time.Now().UTC()},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			inst := Instance{
				ID:        "inst_123",
				CreatedAt: tc.createdAt,
			}

			// Should marshal/unmarshal correctly
			data, err := json.Marshal(inst)
			if err != nil {
				t.Fatalf("failed to marshal: %v", err)
			}

			var recovered Instance
			if err := json.Unmarshal(data, &recovered); err != nil {
				t.Fatalf("failed to unmarshal: %v", err)
			}
		})
	}
}

// TestInstance_TTLEdgeCases tests TTL edge cases
func TestInstance_TTLEdgeCases(t *testing.T) {
	ttlValues := []int{
		0,
		1,
		-1,
		60,
		3600,
		86400,
		86400 * 365,
		math.MaxInt32,
		math.MinInt32,
		math.MaxInt,
		math.MinInt,
	}

	for _, ttl := range ttlValues {
		t.Run(fmt.Sprintf("ttl_%d", ttl), func(t *testing.T) {
			inst := Instance{
				ID:         "inst_123",
				TTLSeconds: ttl,
			}

			data, err := json.Marshal(inst)
			if err != nil {
				t.Fatalf("failed to marshal: %v", err)
			}

			var recovered Instance
			if err := json.Unmarshal(data, &recovered); err != nil {
				t.Fatalf("failed to unmarshal: %v", err)
			}

			if recovered.TTLSeconds != ttl {
				t.Errorf("TTL not preserved: expected %d, got %d", ttl, recovered.TTLSeconds)
			}
		})
	}
}

// TestSnapshot_ResourceEdgeCases tests resource limit edge cases
func TestSnapshot_ResourceEdgeCases(t *testing.T) {
	resourceValues := []int{
		0,
		1,
		-1,
		1024,
		65536,
		math.MaxInt32,
		math.MinInt32,
	}

	for _, val := range resourceValues {
		t.Run(fmt.Sprintf("resource_%d", val), func(t *testing.T) {
			snap := Snapshot{
				ID:       "snap_123",
				VCPUs:    val,
				Memory:   val,
				DiskSize: val,
			}

			data, err := json.Marshal(snap)
			if err != nil {
				t.Fatalf("failed to marshal: %v", err)
			}

			var recovered Snapshot
			if err := json.Unmarshal(data, &recovered); err != nil {
				t.Fatalf("failed to unmarshal: %v", err)
			}

			if recovered.VCPUs != val {
				t.Errorf("VCPUs not preserved")
			}
		})
	}
}

// TestManager_RaceStartStop tests race between start and stop
func TestManager_RaceStartStop(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	iterations := 1000

	// Concurrent starts and stops
	for i := 0; i < iterations; i++ {
		wg.Add(2)

		go func() {
			defer wg.Done()
			manager.SetInstance("workspace1", &Instance{
				ID:     "inst_123",
				Status: StatusRunning,
			})
		}()

		go func() {
			defer wg.Done()
			manager.RemoveInstance("workspace1")
		}()
	}

	wg.Wait()
	// Should not panic or deadlock
}

// TestManager_RaceReadWrite tests race between reads and writes
func TestManager_RaceReadWrite(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Pre-populate
	for i := 0; i < 10; i++ {
		wsID := fmt.Sprintf("ws_%d", i)
		manager.SetInstance(wsID, &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	var wg sync.WaitGroup
	var reads, writes int64

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Readers
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					_ = manager.IsRunning("ws_5")
					_ = manager.ListInstances()
					_ = manager.GetInstanceByID("inst_5")
					atomic.AddInt64(&reads, 1)
				}
			}
		}()
	}

	// Writers
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					wsID := fmt.Sprintf("ws_%d", id)
					manager.SetInstance(wsID, &Instance{
						ID:     fmt.Sprintf("inst_%d", id),
						Status: StatusRunning,
					})
					atomic.AddInt64(&writes, 1)
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("Completed %d reads and %d writes", reads, writes)
}

// TestManager_RaceListModify tests race between ListInstances and modifications
func TestManager_RaceListModify(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Modifier
	wg.Add(1)
	go func() {
		defer wg.Done()
		i := 0
		for {
			select {
			case <-ctx.Done():
				return
			default:
				wsID := fmt.Sprintf("ws_%d", i%100)
				if i%2 == 0 {
					manager.SetInstance(wsID, &Instance{
						ID:     fmt.Sprintf("inst_%d", i),
						Status: StatusRunning,
					})
				} else {
					manager.RemoveInstance(wsID)
				}
				i++
			}
		}
	}()

	// Listers
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					instances := manager.ListInstances()
					// Just iterate to ensure no race
					for _, inst := range instances {
						_ = inst.ID
					}
				}
			}
		}()
	}

	wg.Wait()
}

// TestUTF8EdgeCases tests UTF-8 edge cases
func TestUTF8EdgeCases(t *testing.T) {
	utf8Cases := []string{
		"\xef\xbb\xbf", // BOM
		"\xc0\x80",     // Overlong null
		"\xed\xa0\x80", // Surrogate half
		"\xf4\x90\x80\x80", // Beyond Unicode
		"Hello\x00World", // Embedded null
		"Test\xffInvalid", // Invalid byte
		"\u0000",       // Unicode null
		"\u200b",       // Zero-width space
		"\u200d",       // Zero-width joiner
		"\ufeff",       // BOM character
		"\ufffd",       // Replacement character
		"👨‍👩‍👧‍👦",       // Family emoji (complex)
		"🏳️‍🌈",       // Rainbow flag (complex)
		strings.Repeat("🎉", 1000), // Many emojis
	}

	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	for i, utf8Case := range utf8Cases {
		t.Run(fmt.Sprintf("utf8_case_%d", i), func(t *testing.T) {
			wsID := "ws_" + utf8Case
			manager.SetInstance(wsID, &Instance{
				ID:     "inst_" + utf8Case,
				Status: StatusRunning,
				Metadata: map[string]string{
					"utf8_key": utf8Case,
				},
			})

			// Should be retrievable
			found := manager.GetInstanceByID("inst_" + utf8Case)
			if found == nil {
				// Some invalid UTF-8 might cause issues, document behavior
				t.Logf("Could not retrieve instance with UTF-8 case %d", i)
			}

			manager.RemoveInstance(wsID)
		})
	}
}

// TestEmptyStringsEverywhere tests empty strings in all fields
func TestEmptyStringsEverywhere(t *testing.T) {
	inst := Instance{
		ID:         "",
		SnapshotID: "",
		Status:     "",
		BaseURL:    "",
		CDPURL:     "",
		VNCURL:     "",
		CodeURL:    "",
		AppURL:     "",
		Metadata:   map[string]string{"": ""},
	}

	data, err := json.Marshal(inst)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var recovered Instance
	if err := json.Unmarshal(data, &recovered); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if recovered.ID != "" {
		t.Error("empty ID not preserved")
	}
	if recovered.Metadata[""] != "" {
		t.Error("empty metadata key/value not preserved")
	}
}

// TestWhitespaceOnlyStrings tests whitespace-only strings
func TestWhitespaceOnlyStrings(t *testing.T) {
	whitespaceStrings := []string{
		" ",
		"  ",
		"\t",
		"\n",
		"\r\n",
		" \t\n\r ",
		strings.Repeat(" ", 100),
		strings.Repeat("\t", 100),
	}

	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	for i, ws := range whitespaceStrings {
		t.Run(fmt.Sprintf("whitespace_%d", i), func(t *testing.T) {
			manager.SetInstance(ws, &Instance{
				ID:     ws,
				Status: StatusRunning,
			})

			if !manager.IsRunning(ws) {
				t.Error("whitespace workspace should be running")
			}

			manager.RemoveInstance(ws)
		})
	}
}

// TestConcurrentGetInstanceByID tests concurrent GetInstanceByID calls
func TestConcurrentGetInstanceByID(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Add many instances
	for i := 0; i < 100; i++ {
		manager.SetInstance(fmt.Sprintf("ws_%d", i), &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	var wg sync.WaitGroup
	found := int64(0)
	notFound := int64(0)

	// Concurrent lookups
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				instID := fmt.Sprintf("inst_%d", (idx+j)%150) // Some will exist, some won't
				if manager.GetInstanceByID(instID) != nil {
					atomic.AddInt64(&found, 1)
				} else {
					atomic.AddInt64(&notFound, 1)
				}
			}
		}(i)
	}

	wg.Wait()
	t.Logf("Found: %d, Not Found: %d", found, notFound)
}

// TestManagerConfig_AllFieldsCombinations tests various config combinations
func TestManagerConfig_AllFieldsCombinations(t *testing.T) {
	configs := []ManagerConfig{
		{}, // All zeros
		{APIKey: "key"},
		{BaseSnapshotID: "snap"},
		{DefaultTTL: 3600},
		{DefaultVCPUs: 2},
		{DefaultMemory: 4096},
		{DefaultDisk: 32768},
		{ // All fields
			APIKey:         "morph_test",
			BaseSnapshotID: "snap_base",
			DefaultTTL:     7200,
			DefaultVCPUs:   4,
			DefaultMemory:  8192,
			DefaultDisk:    65536,
		},
		{ // All max values
			APIKey:         strings.Repeat("a", 1000),
			BaseSnapshotID: strings.Repeat("b", 1000),
			DefaultTTL:     math.MaxInt,
			DefaultVCPUs:   math.MaxInt,
			DefaultMemory:  math.MaxInt,
			DefaultDisk:    math.MaxInt,
		},
	}

	for i, config := range configs {
		t.Run(fmt.Sprintf("config_%d", i), func(t *testing.T) {
			// Just verify struct is valid
			_ = config.APIKey
			_ = config.BaseSnapshotID
			_ = config.DefaultTTL
		})
	}
}

// TestExecResult_MaxValues tests ExecResult with max values
func TestExecResult_MaxValues(t *testing.T) {
	result := ExecResult{
		Stdout:   strings.Repeat("a", 10*1024*1024), // 10MB
		Stderr:   strings.Repeat("b", 10*1024*1024), // 10MB
		ExitCode: math.MaxInt,
	}

	if len(result.Stdout) != 10*1024*1024 {
		t.Error("stdout size mismatch")
	}
	if result.ExitCode != math.MaxInt {
		t.Error("exit code mismatch")
	}
}

// TestAPIError_VeryLongFields tests APIError with very long fields
func TestAPIError_VeryLongFields(t *testing.T) {
	longString := strings.Repeat("x", 1*1024*1024) // 1MB

	apiErr := &APIError{
		Code:    longString,
		Message: longString,
		Details: longString,
	}

	errStr := apiErr.Error()
	if len(errStr) < 2*1024*1024 {
		t.Error("error string should be very long")
	}
}

// TestWrapError_VeryDeepChain tests very deep error chains
func TestWrapError_VeryDeepChain(t *testing.T) {
	var err error = ErrNotFound

	// Create 1000 level deep chain
	for i := 0; i < 1000; i++ {
		err = WrapError(err, fmt.Sprintf("level_%d", i))
	}

	// Should still be able to find original error
	if err == nil {
		t.Fatal("error should not be nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "resource not found") {
		t.Error("should contain original error message")
	}
	if !strings.Contains(errStr, "level_999") {
		t.Error("should contain last level context")
	}
}

// TestInstance_AllStatusTransitions tests all possible status transitions
func TestInstance_AllStatusTransitions(t *testing.T) {
	allStatuses := []InstanceStatus{
		StatusPending,
		StatusStarting,
		StatusRunning,
		StatusStopping,
		StatusStopped,
		StatusError,
	}

	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	inst := &Instance{
		ID:     "inst_123",
		Status: StatusPending,
	}
	manager.SetInstance("workspace1", inst)

	// Test all transitions
	for _, fromStatus := range allStatuses {
		for _, toStatus := range allStatuses {
			inst.Status = fromStatus
			wasRunning := manager.IsRunning("workspace1")

			inst.Status = toStatus
			isRunning := manager.IsRunning("workspace1")

			// Only StatusRunning should return true
			if toStatus == StatusRunning && !isRunning {
				t.Errorf("transitioning to Running should make IsRunning true")
			}
			if toStatus != StatusRunning && isRunning {
				t.Errorf("transitioning to %s should make IsRunning false", toStatus)
			}

			_ = wasRunning // Suppress unused warning
		}
	}
}

// TestManager_NilOperations tests operations on nil-ish states
func TestManager_NilOperations(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Operations on non-existent workspace
	ctx := context.Background()

	_, err := manager.GetInstance(ctx, "nonexistent")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	err = manager.StopInstance(ctx, "nonexistent")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	_, err = manager.Exec(ctx, "nonexistent", "echo hello")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	_, err = manager.SaveSnapshot(ctx, "nonexistent", "snap")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	_, err = manager.RefreshInstance(ctx, "nonexistent")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// TestJSON_SpecialNumbers tests JSON with special numbers
func TestJSON_SpecialNumbers(t *testing.T) {
	// JSON doesn't support Inf/NaN for floats, but our structs use int
	// Test boundary int values
	inst := Instance{
		ID:         "inst_123",
		TTLSeconds: math.MaxInt,
	}

	data, err := json.Marshal(inst)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var recovered Instance
	if err := json.Unmarshal(data, &recovered); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if recovered.TTLSeconds != math.MaxInt {
		t.Errorf("MaxInt not preserved: got %d", recovered.TTLSeconds)
	}
}

// TestJSON_NullValues tests JSON null handling
func TestJSON_NullValues(t *testing.T) {
	jsonStr := `{
		"id": null,
		"snapshot_id": null,
		"status": null,
		"base_url": null,
		"metadata": null,
		"ttl_seconds": 0
	}`

	var inst Instance
	if err := json.Unmarshal([]byte(jsonStr), &inst); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if inst.ID != "" {
		t.Error("null should become empty string")
	}
	if inst.Metadata != nil {
		t.Error("null should become nil map")
	}
}

// TestManager_ConcurrentSameWorkspace tests concurrent operations on same workspace
func TestManager_ConcurrentSameWorkspace(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	var wg sync.WaitGroup
	iterations := 10000

	for i := 0; i < iterations; i++ {
		wg.Add(4)

		go func() {
			defer wg.Done()
			manager.SetInstance("workspace1", &Instance{
				ID:     "inst_new",
				Status: StatusRunning,
			})
		}()

		go func() {
			defer wg.Done()
			_ = manager.IsRunning("workspace1")
		}()

		go func() {
			defer wg.Done()
			_ = manager.GetInstanceByID("inst_new")
		}()

		go func() {
			defer wg.Done()
			manager.RemoveInstance("workspace1")
		}()
	}

	wg.Wait()
	// Should not panic or deadlock
}

// BenchmarkManager_HighContention benchmarks under high contention
func BenchmarkManager_HighContention(b *testing.B) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_123",
		Status: StatusRunning,
	})

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			manager.SetInstance("workspace1", &Instance{
				ID:     "inst_123",
				Status: StatusRunning,
			})
			_ = manager.IsRunning("workspace1")
		}
	})
}
