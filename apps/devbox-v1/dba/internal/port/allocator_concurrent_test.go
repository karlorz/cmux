// internal/port/allocator_concurrent_test.go
package port

import (
	"database/sql"
	"fmt"
	"sync"
	"testing"

	_ "github.com/mattn/go-sqlite3"

	"github.com/dba-cli/dba/internal/config"
	"github.com/dba-cli/dba/internal/db"
)

func TestConcurrentPortAllocation(t *testing.T) {
	// Use shared memory database for concurrent access
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

	// Pre-create workspaces for concurrent allocation
	numWorkspaces := 10
	for i := 0; i < numWorkspaces; i++ {
		wsID := fmt.Sprintf("ws_concurrent_%d", i)
		_, err := database.Exec(`
			INSERT INTO workspaces (id, name, path, template, base_port, status)
			VALUES (?, ?, ?, 'node', 0, 'ready')
		`, wsID, fmt.Sprintf("Concurrent Test %d", i), fmt.Sprintf("/tmp/concurrent_%d", i))
		if err != nil {
			t.Fatalf("Failed to create workspace %s: %v", wsID, err)
		}
	}

	// Concurrent allocation
	var wg sync.WaitGroup
	errors := make(chan error, numWorkspaces)
	results := make(chan map[string]int, numWorkspaces)

	for i := 0; i < numWorkspaces; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			wsID := fmt.Sprintf("ws_concurrent_%d", idx)
			ports, err := allocator.AllocateForWorkspace(wsID, []string{"PORT", "API_PORT"})
			if err != nil {
				errors <- fmt.Errorf("workspace %s: %w", wsID, err)
				return
			}
			results <- ports
		}(i)
	}

	wg.Wait()
	close(errors)
	close(results)

	// Check for errors
	for err := range errors {
		t.Errorf("Allocation error: %v", err)
	}

	// Collect all allocated ports and check for uniqueness
	allPorts := make(map[int]bool)
	allBasePorts := make(map[int]bool)

	for ports := range results {
		basePort := ports["PORT"]
		if allBasePorts[basePort] {
			t.Errorf("Duplicate base port allocated: %d", basePort)
		}
		allBasePorts[basePort] = true

		for _, port := range ports {
			if allPorts[port] {
				t.Errorf("Duplicate port allocated: %d", port)
			}
			allPorts[port] = true
		}
	}

	// Verify we allocated the expected number of unique base ports
	if len(allBasePorts) != numWorkspaces {
		t.Errorf("Expected %d unique base ports, got %d", numWorkspaces, len(allBasePorts))
	}
}

func TestConcurrentPortAllocationAndRelease(t *testing.T) {
	// Use file-based database for this test to avoid SQLite memory DB limitations
	database, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	// Enable foreign keys explicitly
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

	// Run multiple cycles of allocate/release
	cycles := 5
	workspacesPerCycle := 5

	for cycle := 0; cycle < cycles; cycle++ {
		var wg sync.WaitGroup

		// Create and allocate
		for i := 0; i < workspacesPerCycle; i++ {
			wsID := fmt.Sprintf("ws_cycle_%d_%d", cycle, i)
			_, err := database.Exec(`
				INSERT INTO workspaces (id, name, path, template, base_port, status)
				VALUES (?, ?, ?, 'node', 0, 'ready')
			`, wsID, fmt.Sprintf("Cycle %d Test %d", cycle, i), fmt.Sprintf("/tmp/cycle_%d_%d", cycle, i))
			if err != nil {
				t.Fatalf("Failed to create workspace: %v", err)
			}

			wg.Add(1)
			go func(id string) {
				defer wg.Done()
				_, err := allocator.AllocateForWorkspace(id, []string{"PORT"})
				if err != nil {
					t.Errorf("Allocation failed for %s: %v", id, err)
				}
			}(wsID)
		}
		wg.Wait()

		// Verify allocations
		var count int
		database.QueryRow(`SELECT COUNT(*) FROM port_allocations`).Scan(&count)
		expectedCount := (cycle + 1) * workspacesPerCycle
		if count != expectedCount {
			t.Errorf("Cycle %d: expected %d allocations, got %d", cycle, expectedCount, count)
		}
	}

	// Now release all
	for cycle := 0; cycle < cycles; cycle++ {
		for i := 0; i < workspacesPerCycle; i++ {
			wsID := fmt.Sprintf("ws_cycle_%d_%d", cycle, i)
			if err := allocator.ReleaseForWorkspace(wsID); err != nil {
				t.Errorf("Release failed for %s: %v", wsID, err)
			}
		}
	}

	// Verify all released
	var count int
	database.QueryRow(`SELECT COUNT(*) FROM port_allocations`).Scan(&count)
	if count != 0 {
		t.Errorf("Expected 0 allocations after release, got %d", count)
	}
}

func TestConcurrentAdditionalPortAllocation(t *testing.T) {
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

	// Create workspace
	wsID := "ws_additional_test"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Additional Test', '/tmp/additional', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// Initial allocation
	_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT"})
	if err != nil {
		t.Fatalf("Initial allocation failed: %v", err)
	}

	// Concurrent additional allocations
	numAdditional := 20
	var wg sync.WaitGroup
	ports := make(chan int, numAdditional)
	errors := make(chan error, numAdditional)

	for i := 0; i < numAdditional; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			portName := fmt.Sprintf("CUSTOM_%d", idx)
			port, err := allocator.AllocateAdditional(wsID, portName)
			if err != nil {
				errors <- err
				return
			}
			ports <- port
		}(i)
	}

	wg.Wait()
	close(ports)
	close(errors)

	// Check for errors
	for err := range errors {
		t.Errorf("Additional allocation error: %v", err)
	}

	// Check for unique ports
	allocatedPorts := make(map[int]bool)
	for port := range ports {
		if allocatedPorts[port] {
			t.Errorf("Duplicate port allocated: %d", port)
		}
		allocatedPorts[port] = true
	}

	// Verify count
	if len(allocatedPorts) != numAdditional {
		t.Errorf("Expected %d unique ports, got %d", numAdditional, len(allocatedPorts))
	}
}

func TestRaceConditionOnSameWorkspace(t *testing.T) {
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

	// Create workspace
	wsID := "ws_race_test"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Race Test', '/tmp/race', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// Try to allocate the same workspace from multiple goroutines
	// Only one should succeed
	numAttempts := 10
	var wg sync.WaitGroup
	successCount := 0
	var mu sync.Mutex

	for i := 0; i < numAttempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := allocator.AllocateForWorkspace(wsID, []string{"PORT"})
			if err == nil {
				mu.Lock()
				successCount++
				mu.Unlock()
			}
		}()
	}

	wg.Wait()

	// Only one allocation should succeed (others fail due to duplicate base port)
	if successCount != 1 {
		t.Errorf("Expected exactly 1 successful allocation, got %d", successCount)
	}
}
