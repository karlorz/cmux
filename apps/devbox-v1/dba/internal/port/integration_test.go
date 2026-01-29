// internal/port/integration_test.go
package port

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"

	"github.com/dba-cli/dba/internal/config"
	"github.com/dba-cli/dba/internal/db"
)

// TestFullWorkspaceLifecycle tests the complete port allocation lifecycle
func TestFullWorkspaceLifecycle(t *testing.T) {
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

	// STEP 1: Create workspace
	wsID := "ws_lifecycle_test"
	_, err = database.Exec(`
		INSERT INTO workspaces (id, name, path, template, base_port, status)
		VALUES (?, 'Lifecycle Test', '/tmp/lifecycle', 'node', 0, 'ready')
	`, wsID)
	if err != nil {
		t.Fatalf("Failed to create workspace: %v", err)
	}
	t.Log("Step 1: Workspace created")

	// STEP 2: Allocate initial ports
	initialPorts := []string{"PORT", "API_PORT", "DB_PORT", "CODE_PORT", "VNC_PORT"}
	ports, err := allocator.AllocateForWorkspace(wsID, initialPorts)
	if err != nil {
		t.Fatalf("Failed to allocate initial ports: %v", err)
	}
	t.Logf("Step 2: Allocated ports: %v", ports)

	// Verify all ports are allocated
	if len(ports) != len(initialPorts) {
		t.Errorf("Expected %d ports, got %d", len(initialPorts), len(ports))
	}

	// Verify port offsets are correct
	basePort := ports["PORT"]
	if ports["API_PORT"] != basePort+1 {
		t.Errorf("API_PORT offset incorrect: expected %d, got %d", basePort+1, ports["API_PORT"])
	}
	if ports["CODE_PORT"] != basePort+80 {
		t.Errorf("CODE_PORT offset incorrect: expected %d, got %d", basePort+80, ports["CODE_PORT"])
	}

	// STEP 3: Get workspace base port
	storedBase, err := allocator.GetWorkspaceBasePort(wsID)
	if err != nil {
		t.Fatalf("Failed to get base port: %v", err)
	}
	if storedBase != basePort {
		t.Errorf("Base port mismatch: expected %d, got %d", basePort, storedBase)
	}
	t.Logf("Step 3: Base port verified: %d", storedBase)

	// STEP 4: Allocate additional port
	customPort, err := allocator.AllocateAdditional(wsID, "CUSTOM_SERVICE")
	if err != nil {
		t.Fatalf("Failed to allocate additional port: %v", err)
	}
	t.Logf("Step 4: Additional port allocated: CUSTOM_SERVICE=%d", customPort)

	// STEP 5: List all ports
	allPorts, err := allocator.GetWorkspacePorts(wsID)
	if err != nil {
		t.Fatalf("Failed to get all ports: %v", err)
	}
	if len(allPorts) != 6 {
		t.Errorf("Expected 6 ports, got %d", len(allPorts))
	}
	t.Logf("Step 5: All ports: %v", allPorts)

	// STEP 6: Free a port
	err = allocator.Free(wsID, "CUSTOM_SERVICE")
	if err != nil {
		t.Fatalf("Failed to free port: %v", err)
	}
	t.Log("Step 6: CUSTOM_SERVICE port freed")

	// Verify port is freed
	allPorts, _ = allocator.GetWorkspacePorts(wsID)
	if _, exists := allPorts["CUSTOM_SERVICE"]; exists {
		t.Error("CUSTOM_SERVICE should have been freed")
	}
	if len(allPorts) != 5 {
		t.Errorf("Expected 5 ports after free, got %d", len(allPorts))
	}

	// STEP 7: Release all ports
	err = allocator.ReleaseForWorkspace(wsID)
	if err != nil {
		t.Fatalf("Failed to release workspace: %v", err)
	}
	t.Log("Step 7: All ports released")

	// Verify all ports are released
	allPorts, _ = allocator.GetWorkspacePorts(wsID)
	if len(allPorts) != 0 {
		t.Errorf("Expected 0 ports after release, got %d", len(allPorts))
	}

	// STEP 8: Verify base port is also released
	_, err = allocator.GetWorkspaceBasePort(wsID)
	if err == nil {
		t.Error("Base port should have been released")
	}
	t.Log("Step 8: Lifecycle complete - all resources released")
}

// TestDevboxIntegration tests devbox.json update functionality
func TestDevboxIntegration(t *testing.T) {
	// Create temp directory for workspace
	tmpDir, err := os.MkdirTemp("", "devbox-integration-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create initial devbox.json
	devboxPath := filepath.Join(tmpDir, "devbox.json")
	initial := map[string]interface{}{
		"$schema":  "https://raw.githubusercontent.com/jetify-com/devbox/main/.schema/devbox.schema.json",
		"packages": []string{"nodejs@20"},
		"env": map[string]interface{}{
			"NODE_ENV": "development",
		},
	}
	data, _ := json.MarshalIndent(initial, "", "  ")
	if err := os.WriteFile(devboxPath, data, 0644); err != nil {
		t.Fatalf("Failed to write devbox.json: %v", err)
	}

	// Simulate workspace port allocation
	ports := map[string]int{
		"PORT":      10000,
		"API_PORT":  10001,
		"CODE_PORT": 10080,
	}

	// Update devbox.json with all ports
	if err := UpdateDevboxEnvMultiple(devboxPath, ports); err != nil {
		t.Fatalf("Failed to update devbox.json: %v", err)
	}

	// Read back and verify
	data, _ = os.ReadFile(devboxPath)
	var result map[string]interface{}
	json.Unmarshal(data, &result)

	env := result["env"].(map[string]interface{})

	// Verify all ports are in env
	for name, port := range ports {
		val, ok := env[name]
		if !ok {
			t.Errorf("Port %s not found in env", name)
			continue
		}
		expected := fmt.Sprintf("%d", port)
		if val != expected {
			t.Errorf("Port %s: expected %s, got %v", name, expected, val)
		}
	}

	// Verify NODE_ENV is preserved
	if env["NODE_ENV"] != "development" {
		t.Error("NODE_ENV should be preserved")
	}

	// Verify schema is preserved
	if result["$schema"] == nil {
		t.Error("$schema should be preserved")
	}

	// Simulate freeing a port
	if err := RemoveDevboxEnv(devboxPath, "API_PORT"); err != nil {
		t.Fatalf("Failed to remove API_PORT: %v", err)
	}

	// Verify API_PORT is removed
	data, _ = os.ReadFile(devboxPath)
	json.Unmarshal(data, &result)
	env = result["env"].(map[string]interface{})

	if _, ok := env["API_PORT"]; ok {
		t.Error("API_PORT should have been removed")
	}
	if env["PORT"] != "10000" {
		t.Error("PORT should still exist")
	}
}

// TestMultipleWorkspacesIsolation tests that workspaces don't interfere with each other
func TestMultipleWorkspacesIsolation(t *testing.T) {
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

	// Create 5 workspaces
	numWorkspaces := 5
	workspacePorts := make(map[string]map[string]int)

	for i := 0; i < numWorkspaces; i++ {
		wsID := fmt.Sprintf("ws_isolation_%d", i)
		_, err := database.Exec(`
			INSERT INTO workspaces (id, name, path, template, base_port, status)
			VALUES (?, ?, ?, 'node', 0, 'ready')
		`, wsID, fmt.Sprintf("Isolation Test %d", i), fmt.Sprintf("/tmp/isolation_%d", i))
		if err != nil {
			t.Fatalf("Failed to create workspace %d: %v", i, err)
		}

		ports, err := allocator.AllocateForWorkspace(wsID, []string{"PORT", "API_PORT"})
		if err != nil {
			t.Fatalf("Failed to allocate ports for workspace %d: %v", i, err)
		}
		workspacePorts[wsID] = ports
	}

	// Verify each workspace has unique ports
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

	// Verify each workspace has its own base port block
	basePorts := make(map[int]string)
	for wsID := range workspacePorts {
		base, _ := allocator.GetWorkspaceBasePort(wsID)
		if existing, ok := basePorts[base]; ok {
			t.Errorf("Base port %d used by both %s and %s", base, existing, wsID)
		}
		basePorts[base] = wsID
	}

	// Release workspace 2 and verify others are unaffected
	wsToRelease := "ws_isolation_2"
	if err := allocator.ReleaseForWorkspace(wsToRelease); err != nil {
		t.Fatalf("Failed to release workspace: %v", err)
	}

	// Check that other workspaces still have their ports
	for wsID := range workspacePorts {
		if wsID == wsToRelease {
			continue
		}
		ports, err := allocator.GetWorkspacePorts(wsID)
		if err != nil {
			t.Errorf("Failed to get ports for %s: %v", wsID, err)
			continue
		}
		if len(ports) != 2 {
			t.Errorf("Workspace %s should still have 2 ports, got %d", wsID, len(ports))
		}
	}

	// Verify released workspace has no ports
	ports, _ := allocator.GetWorkspacePorts(wsToRelease)
	if len(ports) != 0 {
		t.Errorf("Released workspace should have no ports, got %d", len(ports))
	}
}

// TestListAllAllocationsIntegration tests listing all allocations across workspaces
func TestListAllAllocationsIntegration(t *testing.T) {
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

	// Create 3 workspaces with different numbers of ports
	workspaces := []struct {
		id    string
		ports []string
	}{
		{"ws_list_1", []string{"PORT"}},
		{"ws_list_2", []string{"PORT"}},
		{"ws_list_3", []string{"PORT"}},
	}

	for _, ws := range workspaces {
		_, err := database.Exec(`
			INSERT INTO workspaces (id, name, path, template, base_port, status)
			VALUES (?, ?, ?, 'node', 0, 'ready')
		`, ws.id, ws.id, fmt.Sprintf("/tmp/%s", ws.id))
		if err != nil {
			t.Fatalf("Failed to create workspace %s: %v", ws.id, err)
		}

		_, err = allocator.AllocateForWorkspace(ws.id, ws.ports)
		if err != nil {
			t.Fatalf("Failed to allocate for %s: %v", ws.id, err)
		}
	}

	// Add additional ports to workspace 2
	allocator.AllocateAdditional("ws_list_2", "EXTRA_1")
	allocator.AllocateAdditional("ws_list_2", "EXTRA_2")

	// List all allocations
	allocations, err := allocator.ListAllAllocations()
	if err != nil {
		t.Fatalf("Failed to list allocations: %v", err)
	}

	// Count allocations per workspace
	counts := make(map[string]int)
	for _, alloc := range allocations {
		counts[alloc.WorkspaceID]++
	}

	if counts["ws_list_1"] != 1 {
		t.Errorf("ws_list_1 should have 1 allocation, got %d", counts["ws_list_1"])
	}
	if counts["ws_list_2"] != 3 {
		t.Errorf("ws_list_2 should have 3 allocations, got %d", counts["ws_list_2"])
	}
	if counts["ws_list_3"] != 1 {
		t.Errorf("ws_list_3 should have 1 allocation, got %d", counts["ws_list_3"])
	}

	// Verify total allocations
	expectedTotal := 5
	if len(allocations) != expectedTotal {
		t.Errorf("Expected %d total allocations, got %d", expectedTotal, len(allocations))
	}
}
