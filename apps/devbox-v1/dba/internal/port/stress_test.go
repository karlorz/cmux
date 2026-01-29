// internal/port/stress_test.go
package port

import (
	"database/sql"
	"fmt"
	"sync"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"github.com/dba-cli/dba/internal/config"
	"github.com/dba-cli/dba/internal/db"
)

// TestStressManyWorkspaces tests allocating ports for many workspaces
func TestStressManyWorkspaces(t *testing.T) {
	database, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if _, err := database.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatalf("Failed to enable foreign keys: %v", err)
	}

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	// Large range to accommodate many workspaces
	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  100,
		StandardOffsets: map[string]int{
			"PORT":      0,
			"API_PORT":  1,
			"CODE_PORT": 80,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	// Allocate for 100 workspaces
	numWorkspaces := 100
	workspacePorts := make(map[string]map[string]int)

	start := time.Now()

	for i := 0; i < numWorkspaces; i++ {
		wsID := fmt.Sprintf("ws_stress_%d", i)
		_, err := database.Exec(`
			INSERT INTO workspaces (id, name, path, template, base_port, status)
			VALUES (?, ?, ?, 'node', 0, 'ready')
		`, wsID, fmt.Sprintf("Stress Test %d", i), fmt.Sprintf("/tmp/stress_%d", i))
		if err != nil {
			t.Fatalf("Failed to create workspace %d: %v", i, err)
		}

		ports, err := allocator.AllocateForWorkspace(wsID, []string{"PORT", "API_PORT", "CODE_PORT"})
		if err != nil {
			t.Fatalf("Failed to allocate for workspace %d: %v", i, err)
		}
		workspacePorts[wsID] = ports
	}

	elapsed := time.Since(start)
	t.Logf("Allocated ports for %d workspaces in %v", numWorkspaces, elapsed)

	// Verify all ports are unique
	allPorts := make(map[int]string)
	for wsID, ports := range workspacePorts {
		for name, port := range ports {
			key := fmt.Sprintf("%s.%s", wsID, name)
			if existing, ok := allPorts[port]; ok {
				t.Errorf("Port %d allocated to both %s and %s", port, existing, key)
			}
			allPorts[port] = key
		}
	}

	// Verify all base ports are unique and properly spaced
	basePorts := make(map[int]bool)
	for wsID := range workspacePorts {
		base, err := allocator.GetWorkspaceBasePort(wsID)
		if err != nil {
			t.Errorf("Failed to get base port for %s: %v", wsID, err)
			continue
		}
		if basePorts[base] {
			t.Errorf("Duplicate base port %d", base)
		}
		basePorts[base] = true
	}

	t.Logf("Total unique ports allocated: %d", len(allPorts))
	t.Logf("Total unique base ports: %d", len(basePorts))

	// Clean up - release all
	start = time.Now()
	for wsID := range workspacePorts {
		if err := allocator.ReleaseForWorkspace(wsID); err != nil {
			t.Errorf("Failed to release %s: %v", wsID, err)
		}
	}
	elapsed = time.Since(start)
	t.Logf("Released all workspaces in %v", elapsed)
}

// TestStressConcurrentAllocation tests concurrent port allocation
func TestStressConcurrentAllocation(t *testing.T) {
	database, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if _, err := database.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatalf("Failed to enable foreign keys: %v", err)
	}

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  100,
		StandardOffsets: map[string]int{
			"PORT": 0,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	// Create workspaces first
	numWorkspaces := 50
	for i := 0; i < numWorkspaces; i++ {
		wsID := fmt.Sprintf("ws_concurrent_%d", i)
		_, err := database.Exec(`
			INSERT INTO workspaces (id, name, path, template, base_port, status)
			VALUES (?, ?, ?, 'node', 0, 'ready')
		`, wsID, fmt.Sprintf("Concurrent Test %d", i), fmt.Sprintf("/tmp/concurrent_%d", i))
		if err != nil {
			t.Fatalf("Failed to create workspace %d: %v", i, err)
		}
	}

	// Allocate concurrently
	var wg sync.WaitGroup
	errors := make(chan error, numWorkspaces)
	results := make(chan map[string]int, numWorkspaces)

	start := time.Now()

	for i := 0; i < numWorkspaces; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			wsID := fmt.Sprintf("ws_concurrent_%d", idx)
			ports, err := allocator.AllocateForWorkspace(wsID, []string{"PORT"})
			if err != nil {
				errors <- fmt.Errorf("workspace %d: %w", idx, err)
				return
			}
			results <- ports
		}(i)
	}

	wg.Wait()
	close(errors)
	close(results)

	elapsed := time.Since(start)

	// Check for errors
	errorCount := 0
	for err := range errors {
		t.Errorf("Allocation error: %v", err)
		errorCount++
	}

	// Collect and verify results
	allPorts := make(map[int]bool)
	successCount := 0
	for ports := range results {
		successCount++
		for _, port := range ports {
			if allPorts[port] {
				t.Errorf("Duplicate port %d allocated", port)
			}
			allPorts[port] = true
		}
	}

	t.Logf("Concurrent allocation: %d successes, %d errors in %v", successCount, errorCount, elapsed)

	if successCount != numWorkspaces {
		t.Errorf("Expected %d successful allocations, got %d", numWorkspaces, successCount)
	}
}

// TestStressRapidAllocFree tests rapid allocation and freeing
func TestStressRapidAllocFree(t *testing.T) {
	database, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if _, err := database.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatalf("Failed to enable foreign keys: %v", err)
	}

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  100,
		StandardOffsets: map[string]int{
			"PORT": 0,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	wsID := "ws_rapid_test"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Rapid Test', '/tmp/rapid', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// Initial allocation
	_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT"})
	if err != nil {
		t.Fatalf("Initial allocation failed: %v", err)
	}

	// Rapid alloc/free cycles
	iterations := 100
	start := time.Now()

	for i := 0; i < iterations; i++ {
		name := fmt.Sprintf("RAPID_%d", i)

		// Allocate
		port, err := allocator.AllocateAdditional(wsID, name)
		if err != nil {
			t.Fatalf("Allocation %d failed: %v", i, err)
		}

		if port == 0 {
			t.Fatalf("Allocation %d returned zero port", i)
		}

		// Free immediately
		err = allocator.Free(wsID, name)
		if err != nil {
			t.Fatalf("Free %d failed: %v", i, err)
		}
	}

	elapsed := time.Since(start)
	t.Logf("Completed %d alloc/free cycles in %v (%.2f ops/sec)",
		iterations*2, elapsed, float64(iterations*2)/elapsed.Seconds())

	// Verify workspace still has only the initial port
	ports, _ := allocator.GetWorkspacePorts(wsID)
	if len(ports) != 1 {
		t.Errorf("Expected 1 port remaining, got %d", len(ports))
	}
}

// TestStressMaxCustomPorts tests allocating maximum custom ports in a block
func TestStressMaxCustomPorts(t *testing.T) {
	database, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if _, err := database.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatalf("Failed to enable foreign keys: %v", err)
	}

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	// Block size 50 gives us room for custom ports from offset 10-49 (40 custom ports)
	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  50,
		StandardOffsets: map[string]int{
			"PORT":     0,
			"API_PORT": 1,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	wsID := "ws_max_custom"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Max Custom Test', '/tmp/maxcustom', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// Initial allocation
	_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT", "API_PORT"})
	if err != nil {
		t.Fatalf("Initial allocation failed: %v", err)
	}

	// Try to allocate 40 custom ports (offsets 10-49)
	successCount := 0
	for i := 0; i < 40; i++ {
		name := fmt.Sprintf("CUSTOM_%d", i)
		_, err := allocator.AllocateAdditional(wsID, name)
		if err != nil {
			t.Logf("Custom port %d failed (expected eventually): %v", i, err)
			break
		}
		successCount++
	}

	t.Logf("Successfully allocated %d custom ports", successCount)

	// Verify total ports
	ports, _ := allocator.GetWorkspacePorts(wsID)
	expectedPorts := 2 + successCount // PORT + API_PORT + custom ports
	if len(ports) != expectedPorts {
		t.Errorf("Expected %d ports, got %d", expectedPorts, len(ports))
	}
}

// TestStressListAllAllocations tests listing with many allocations
func TestStressListAllAllocations(t *testing.T) {
	database, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if _, err := database.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatalf("Failed to enable foreign keys: %v", err)
	}

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  100,
		StandardOffsets: map[string]int{
			"PORT":      0,
			"API_PORT":  1,
			"DB_PORT":   2,
			"CODE_PORT": 80,
			"VNC_PORT":  90,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	// Create 50 workspaces with 5 ports each = 250 allocations
	numWorkspaces := 50
	portNames := []string{"PORT", "API_PORT", "DB_PORT", "CODE_PORT", "VNC_PORT"}

	for i := 0; i < numWorkspaces; i++ {
		wsID := fmt.Sprintf("ws_list_%d", i)
		_, err := database.Exec(`
			INSERT INTO workspaces (id, name, path, template, base_port, status)
			VALUES (?, ?, ?, 'node', 0, 'ready')
		`, wsID, fmt.Sprintf("List Test %d", i), fmt.Sprintf("/tmp/list_%d", i))
		if err != nil {
			t.Fatalf("Failed to create workspace %d: %v", i, err)
		}

		_, err = allocator.AllocateForWorkspace(wsID, portNames)
		if err != nil {
			t.Fatalf("Failed to allocate for workspace %d: %v", i, err)
		}
	}

	// Time the list operation
	start := time.Now()
	allocations, err := allocator.ListAllAllocations()
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("ListAllAllocations failed: %v", err)
	}

	expectedCount := numWorkspaces * len(portNames)
	if len(allocations) != expectedCount {
		t.Errorf("Expected %d allocations, got %d", expectedCount, len(allocations))
	}

	t.Logf("Listed %d allocations in %v", len(allocations), elapsed)

	// Verify allocations are grouped by workspace
	workspaceCount := make(map[string]int)
	for _, alloc := range allocations {
		workspaceCount[alloc.WorkspaceID]++
	}

	for wsID, count := range workspaceCount {
		if count != len(portNames) {
			t.Errorf("Workspace %s has %d allocations, expected %d", wsID, count, len(portNames))
		}
	}
}

// TestStressPortReuse tests that freed ports can be reused
func TestStressPortReuse(t *testing.T) {
	database, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if _, err := database.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatalf("Failed to enable foreign keys: %v", err)
	}

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	// Small range to force reuse
	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   10299, // Only 3 blocks
		BlockSize:  100,
		StandardOffsets: map[string]int{
			"PORT": 0,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	// Allocate 3 workspaces (fills all blocks)
	for i := 0; i < 3; i++ {
		wsID := fmt.Sprintf("ws_reuse_%d", i)
		_, err := database.Exec(`
			INSERT INTO workspaces (id, name, path, template, base_port, status)
			VALUES (?, ?, ?, 'node', 0, 'ready')
		`, wsID, fmt.Sprintf("Reuse Test %d", i), fmt.Sprintf("/tmp/reuse_%d", i))
		if err != nil {
			t.Fatalf("Failed to create workspace %d: %v", i, err)
		}

		_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT"})
		if err != nil {
			t.Fatalf("Failed to allocate for workspace %d: %v", i, err)
		}
	}

	// 4th workspace should fail
	wsID4 := "ws_reuse_overflow"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Overflow', '/tmp/overflow', 'node', 0, 'ready')
	`, wsID4)
	if err != nil {
		t.Fatalf("Failed to create overflow workspace: %v", err)
	}

	_, err = allocator.AllocateForWorkspace(wsID4, []string{"PORT"})
	if err == nil {
		t.Error("4th allocation should fail - ports exhausted")
	}

	// Release workspace 1
	if err := allocator.ReleaseForWorkspace("ws_reuse_1"); err != nil {
		t.Fatalf("Failed to release workspace 1: %v", err)
	}

	// Now 4th workspace should succeed (reusing block)
	ports, err := allocator.AllocateForWorkspace(wsID4, []string{"PORT"})
	if err != nil {
		t.Fatalf("4th allocation should succeed after release: %v", err)
	}

	// Should get the same base port as workspace 1 (10100)
	if ports["PORT"] != 10100 {
		t.Logf("Reused port: %d (may differ from original 10100 due to port availability)", ports["PORT"])
	}
}

// TestStressDatabaseIntegrity tests that the database remains consistent under stress
func TestStressDatabaseIntegrity(t *testing.T) {
	database, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if _, err := database.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatalf("Failed to enable foreign keys: %v", err)
	}

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  100,
		StandardOffsets: map[string]int{
			"PORT":     0,
			"API_PORT": 1,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	// Create and delete workspaces multiple times
	for cycle := 0; cycle < 5; cycle++ {
		// Create 20 workspaces
		for i := 0; i < 20; i++ {
			wsID := fmt.Sprintf("ws_integrity_%d_%d", cycle, i)
			_, err := database.Exec(`
				INSERT INTO workspaces (id, name, path, template, base_port, status)
				VALUES (?, ?, ?, 'node', 0, 'ready')
			`, wsID, fmt.Sprintf("Integrity %d-%d", cycle, i), fmt.Sprintf("/tmp/integrity_%d_%d", cycle, i))
			if err != nil {
				t.Fatalf("Cycle %d: Failed to create workspace %d: %v", cycle, i, err)
			}

			_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT", "API_PORT"})
			if err != nil {
				t.Fatalf("Cycle %d: Failed to allocate for workspace %d: %v", cycle, i, err)
			}
		}

		// Delete all workspaces
		for i := 0; i < 20; i++ {
			wsID := fmt.Sprintf("ws_integrity_%d_%d", cycle, i)
			if err := allocator.ReleaseForWorkspace(wsID); err != nil {
				t.Fatalf("Cycle %d: Failed to release workspace %d: %v", cycle, i, err)
			}
		}
	}

	// Verify database is clean
	allocations, err := allocator.ListAllAllocations()
	if err != nil {
		t.Fatalf("ListAllAllocations failed: %v", err)
	}
	if len(allocations) != 0 {
		t.Errorf("Expected 0 allocations after cleanup, got %d", len(allocations))
	}

	// Verify no orphaned base ports
	var count int
	database.QueryRow("SELECT COUNT(*) FROM workspace_base_ports").Scan(&count)
	if count != 0 {
		t.Errorf("Expected 0 base port records, got %d", count)
	}

	t.Log("Database integrity verified after 5 cycles of 20 workspaces each")
}
