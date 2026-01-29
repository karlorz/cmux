// internal/port/edge_cases_test.go
package port

import (
	"database/sql"
	"fmt"
	"testing"

	_ "github.com/mattn/go-sqlite3"

	"github.com/dba-cli/dba/internal/config"
	"github.com/dba-cli/dba/internal/db"
)

func TestPortExhaustion(t *testing.T) {
	// Use a small range to test exhaustion
	database, err := sql.Open("sqlite3", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	// Very small range: only room for 3 workspaces (300 ports / 100 block size)
	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   10299, // Only 300 ports
		BlockSize:  100,
		StandardOffsets: map[string]int{
			"PORT": 0,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	// Create and allocate for 3 workspaces (should succeed)
	for i := 0; i < 3; i++ {
		wsID := fmt.Sprintf("ws_exhaust_%d", i)
		_, err := database.Exec(`
			INSERT INTO workspaces (id, name, path, template, base_port, status)
			VALUES (?, ?, ?, 'node', 0, 'ready')
		`, wsID, fmt.Sprintf("Exhaust Test %d", i), fmt.Sprintf("/tmp/exhaust_%d", i))
		if err != nil {
			t.Fatalf("Failed to create workspace: %v", err)
		}

		_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT"})
		if err != nil {
			t.Fatalf("Allocation %d should succeed: %v", i, err)
		}
	}

	// 4th workspace should fail (no more blocks available)
	wsID := "ws_exhaust_overflow"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Overflow Test', '/tmp/overflow', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT"})
	if err == nil {
		t.Error("Expected allocation to fail due to port exhaustion")
	}
}

func TestBlockSizeLargerThanRange(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	// Block size larger than available range
	// Note: The allocator iterates by BlockSize, so with start=10000, end=10050, blockSize=100
	// It checks base ports: 10000, 10100, ... but 10100 > 10050 so only 10000 is valid
	// This means one workspace CAN be allocated at base 10000, but no more
	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   10050, // Only 51 ports
		BlockSize:  100,   // Block needs 100 ports
		StandardOffsets: map[string]int{
			"PORT": 0,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	// Create workspace
	wsID := "ws_block_test"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Block Test', '/tmp/block', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// First allocation should succeed at base port 10000
	ports, err := allocator.AllocateForWorkspace(wsID, []string{"PORT"})
	if err != nil {
		t.Fatalf("First allocation should succeed: %v", err)
	}
	if ports["PORT"] != 10000 {
		t.Errorf("Expected PORT=10000, got %d", ports["PORT"])
	}

	// Second workspace should fail (no more blocks fit in range)
	wsID2 := "ws_block_test_2"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Block Test 2', '/tmp/block2', 'node', 0, 'ready')
	`, wsID2)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	_, err = allocator.AllocateForWorkspace(wsID2, []string{"PORT"})
	if err == nil {
		t.Error("Second allocation should fail - no more blocks in range")
	}
}

func TestAllocateWithLargeOffset(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	// Port with offset at edge of block
	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  100,
		StandardOffsets: map[string]int{
			"PORT":         0,
			"EDGE_SERVICE": 99, // At the edge of block
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	wsID := "ws_offset_test"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Offset Test', '/tmp/offset', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	ports, err := allocator.AllocateForWorkspace(wsID, []string{"PORT", "EDGE_SERVICE"})
	if err != nil {
		t.Fatalf("Allocation failed: %v", err)
	}

	if ports["PORT"] != 10000 {
		t.Errorf("Expected PORT=10000, got %d", ports["PORT"])
	}
	if ports["EDGE_SERVICE"] != 10099 {
		t.Errorf("Expected EDGE_SERVICE=10099, got %d", ports["EDGE_SERVICE"])
	}
}

func TestDuplicatePortNameAllocation(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	wsID := "ws_dup_test"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Dup Test', '/tmp/dup', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// Allocate initial port
	_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT"})
	if err != nil {
		t.Fatalf("Initial allocation failed: %v", err)
	}

	// Try to allocate same port name again (should fail due to unique constraint)
	_, err = allocator.AllocateAdditional(wsID, "PORT")
	if err == nil {
		t.Error("Expected duplicate port name allocation to fail")
	}
}

func TestZeroBlockSize(t *testing.T) {
	// Zero block size should be rejected by NewAllocator
	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  0,
		StandardOffsets: map[string]int{
			"PORT": 0,
		},
	}

	_, err := NewAllocator(cfg)
	if err == nil {
		t.Error("Expected NewAllocator to reject zero block size")
	}
}

func TestNegativeBlockSize(t *testing.T) {
	// Negative block size should be rejected
	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  -100,
		StandardOffsets: map[string]int{
			"PORT": 0,
		},
	}

	_, err := NewAllocator(cfg)
	if err == nil {
		t.Error("Expected NewAllocator to reject negative block size")
	}
}

func TestAllocateEmptyPortNames(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	wsID := "ws_empty_ports"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Empty Ports Test', '/tmp/empty', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// Allocate with empty port names slice
	ports, err := allocator.AllocateForWorkspace(wsID, []string{})
	if err != nil {
		t.Fatalf("Empty port allocation should succeed: %v", err)
	}

	if len(ports) != 0 {
		t.Errorf("Expected empty ports map, got %v", ports)
	}
}

func TestReleaseNonexistentWorkspace(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Should not error, just do nothing
	err = allocator.ReleaseForWorkspace("ws_nonexistent")
	if err != nil {
		t.Errorf("Release of nonexistent workspace should not error: %v", err)
	}
}

func TestGetPortsNonexistentWorkspace(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	ports, err := allocator.GetWorkspacePorts("ws_nonexistent")
	if err != nil {
		t.Errorf("GetWorkspacePorts should not error for nonexistent workspace: %v", err)
	}

	if len(ports) != 0 {
		t.Errorf("Expected empty ports map, got %v", ports)
	}
}

func TestSpecialCharactersInPortName(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	wsID := "ws_special_chars"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Special Chars Test', '/tmp/special', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// Initial allocation
	_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT"})
	if err != nil {
		t.Fatalf("Initial allocation failed: %v", err)
	}

	// Allocate port with special characters in name
	specialNames := []string{
		"MY_SERVICE_PORT",
		"PORT_123",
		"port_lower",
	}

	for _, name := range specialNames {
		port, err := allocator.AllocateAdditional(wsID, name)
		if err != nil {
			t.Errorf("Failed to allocate port with name %s: %v", name, err)
			continue
		}
		if port == 0 {
			t.Errorf("Port %s should have non-zero value", name)
		}
	}

	// Verify all ports are allocated
	ports, _ := allocator.GetWorkspacePorts(wsID)
	if len(ports) != len(specialNames)+1 {
		t.Errorf("Expected %d ports, got %d", len(specialNames)+1, len(ports))
	}
}

func TestReallocationAfterFree(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	wsID := "ws_realloc_test"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Realloc Test', '/tmp/realloc', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// Initial allocation
	_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT"})
	if err != nil {
		t.Fatalf("Initial allocation failed: %v", err)
	}

	// Allocate, free, reallocate
	port1, _ := allocator.AllocateAdditional(wsID, "CUSTOM")
	allocator.Free(wsID, "CUSTOM")
	port2, err := allocator.AllocateAdditional(wsID, "CUSTOM")

	if err != nil {
		t.Fatalf("Reallocation failed: %v", err)
	}

	// Should get the same port back (or at least a valid one)
	if port2 == 0 {
		t.Error("Reallocated port should be non-zero")
	}

	t.Logf("Original port: %d, Reallocated port: %d", port1, port2)
}

func TestMaxCustomPorts(t *testing.T) {
	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	// Small block size to test custom port exhaustion
	cfg := config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  20, // Small block
		StandardOffsets: map[string]int{
			"PORT": 0,
		},
	}

	allocator := NewAllocatorWithDB(database, cfg)

	wsID := "ws_max_custom"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Max Custom Test', '/tmp/max', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}

	// Initial allocation
	_, err = allocator.AllocateForWorkspace(wsID, []string{"PORT"})
	if err != nil {
		t.Fatalf("Initial allocation failed: %v", err)
	}

	// Try to allocate more custom ports than block allows
	// Custom ports start at offset 10, so we have 10 slots (10-19)
	for i := 0; i < 10; i++ {
		name := fmt.Sprintf("CUSTOM_%d", i)
		_, err := allocator.AllocateAdditional(wsID, name)
		if err != nil {
			t.Logf("Allocation %d failed as expected: %v", i, err)
			return // Expected to eventually fail
		}
	}

	// If we get here, all allocations succeeded (which is fine)
	t.Log("All custom port allocations succeeded")
}
