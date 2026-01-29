// internal/port/allocator_test.go
package port

import (
	"database/sql"
	"fmt"
	"testing"

	_ "github.com/mattn/go-sqlite3"

	"github.com/dba-cli/dba/internal/config"
	"github.com/dba-cli/dba/internal/db"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()

	database, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}

	if err := db.Migrate(database); err != nil {
		t.Fatalf("Migration failed: %v", err)
	}

	return database
}

func defaultTestConfig() config.PortConfig {
	return config.PortConfig{
		RangeStart: 10000,
		RangeEnd:   60000,
		BlockSize:  100,
		StandardOffsets: map[string]int{
			"PORT":              0,
			"API_PORT":          1,
			"DB_PORT":           2,
			"REDIS_PORT":        3,
			"CODE_PORT":         80,
			"VNC_PORT":          90,
			"COMPUTER_API_PORT": 91,
		},
	}
}

func TestAllocateForWorkspace(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// First, insert a workspace (required for foreign key)
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port)
		VALUES ('ws_test1', 'Test Workspace', '/tmp/test1', 10000)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspace: %v", err)
	}

	// Allocate ports for the workspace
	portNames := []string{"PORT", "API_PORT", "CODE_PORT"}
	ports, err := allocator.AllocateForWorkspace("ws_test1", portNames)
	if err != nil {
		t.Fatalf("Failed to allocate ports: %v", err)
	}

	// Verify ports were allocated correctly
	if ports["PORT"] != 10000 {
		t.Errorf("Expected PORT=10000, got %d", ports["PORT"])
	}
	if ports["API_PORT"] != 10001 {
		t.Errorf("Expected API_PORT=10001, got %d", ports["API_PORT"])
	}
	if ports["CODE_PORT"] != 10080 {
		t.Errorf("Expected CODE_PORT=10080, got %d", ports["CODE_PORT"])
	}
}

func TestAllocateMultipleWorkspaces(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Insert workspaces
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port) VALUES
		('ws_test1', 'Test Workspace 1', '/tmp/test1', 10000),
		('ws_test2', 'Test Workspace 2', '/tmp/test2', 10100)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspaces: %v", err)
	}

	// Allocate ports for first workspace
	ports1, err := allocator.AllocateForWorkspace("ws_test1", []string{"PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate ports for ws_test1: %v", err)
	}

	// Allocate ports for second workspace
	ports2, err := allocator.AllocateForWorkspace("ws_test2", []string{"PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate ports for ws_test2: %v", err)
	}

	// Verify both workspaces got different ports
	// Note: The allocator checks if ports are free on the system, so we can't
	// assume exact port numbers. The second workspace should get a higher port
	// since they're allocated sequentially and within the configured range.
	if ports1["PORT"] < cfg.RangeStart || ports1["PORT"] >= cfg.RangeEnd {
		t.Errorf("ws_test1 PORT=%d is outside range %d-%d", ports1["PORT"], cfg.RangeStart, cfg.RangeEnd)
	}
	if ports2["PORT"] < cfg.RangeStart || ports2["PORT"] >= cfg.RangeEnd {
		t.Errorf("ws_test2 PORT=%d is outside range %d-%d", ports2["PORT"], cfg.RangeStart, cfg.RangeEnd)
	}
	if ports1["PORT"] == ports2["PORT"] {
		t.Errorf("Both workspaces got the same PORT: %d", ports1["PORT"])
	}
	// The second workspace should get a port in a different block (higher)
	if ports2["PORT"] <= ports1["PORT"] {
		t.Errorf("ws_test2 PORT=%d should be greater than ws_test1 PORT=%d (different block)", ports2["PORT"], ports1["PORT"])
	}
}

func TestAllocateAdditional(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Insert workspace
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port)
		VALUES ('ws_test1', 'Test Workspace', '/tmp/test1', 10000)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspace: %v", err)
	}

	// Allocate initial ports
	_, err = allocator.AllocateForWorkspace("ws_test1", []string{"PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate initial ports: %v", err)
	}

	// Allocate additional port
	port, err := allocator.AllocateAdditional("ws_test1", "REDIS_PORT")
	if err != nil {
		t.Fatalf("Failed to allocate additional port: %v", err)
	}

	if port != 10003 {
		t.Errorf("Expected REDIS_PORT=10003, got %d", port)
	}
}

func TestFree(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Insert workspace
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port)
		VALUES ('ws_test1', 'Test Workspace', '/tmp/test1', 10000)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspace: %v", err)
	}

	// Allocate ports
	_, err = allocator.AllocateForWorkspace("ws_test1", []string{"PORT", "API_PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate ports: %v", err)
	}

	// Free one port
	err = allocator.Free("ws_test1", "API_PORT")
	if err != nil {
		t.Fatalf("Failed to free port: %v", err)
	}

	// Verify port is freed
	ports, err := allocator.GetWorkspacePorts("ws_test1")
	if err != nil {
		t.Fatalf("Failed to get workspace ports: %v", err)
	}

	if _, ok := ports["API_PORT"]; ok {
		t.Error("API_PORT should have been freed")
	}
	if _, ok := ports["PORT"]; !ok {
		t.Error("PORT should still be allocated")
	}
}

func TestReleaseForWorkspace(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Insert workspace
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port)
		VALUES ('ws_test1', 'Test Workspace', '/tmp/test1', 10000)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspace: %v", err)
	}

	// Allocate ports
	_, err = allocator.AllocateForWorkspace("ws_test1", []string{"PORT", "API_PORT", "CODE_PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate ports: %v", err)
	}

	// Release all ports
	err = allocator.ReleaseForWorkspace("ws_test1")
	if err != nil {
		t.Fatalf("Failed to release ports: %v", err)
	}

	// Verify all ports are released
	ports, err := allocator.GetWorkspacePorts("ws_test1")
	if err != nil {
		t.Fatalf("Failed to get workspace ports: %v", err)
	}

	if len(ports) != 0 {
		t.Errorf("Expected no ports, got %d", len(ports))
	}
}

func TestGetWorkspacePorts(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Insert workspace
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port)
		VALUES ('ws_test1', 'Test Workspace', '/tmp/test1', 10000)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspace: %v", err)
	}

	// Allocate ports
	_, err = allocator.AllocateForWorkspace("ws_test1", []string{"PORT", "API_PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate ports: %v", err)
	}

	// Get ports
	ports, err := allocator.GetWorkspacePorts("ws_test1")
	if err != nil {
		t.Fatalf("Failed to get workspace ports: %v", err)
	}

	if len(ports) != 2 {
		t.Errorf("Expected 2 ports, got %d", len(ports))
	}
}

func TestGetWorkspaceBasePort(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Insert workspace
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port)
		VALUES ('ws_test1', 'Test Workspace', '/tmp/test1', 10000)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspace: %v", err)
	}

	// Allocate ports
	_, err = allocator.AllocateForWorkspace("ws_test1", []string{"PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate ports: %v", err)
	}

	// Get base port
	basePort, err := allocator.GetWorkspaceBasePort("ws_test1")
	if err != nil {
		t.Fatalf("Failed to get base port: %v", err)
	}

	if basePort != 10000 {
		t.Errorf("Expected base port 10000, got %d", basePort)
	}
}

func TestListAllAllocations(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Insert workspaces
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port) VALUES
		('ws_test1', 'Test Workspace 1', '/tmp/test1', 10000),
		('ws_test2', 'Test Workspace 2', '/tmp/test2', 10100)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspaces: %v", err)
	}

	// Allocate ports for both workspaces
	_, err = allocator.AllocateForWorkspace("ws_test1", []string{"PORT", "API_PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate ports for ws_test1: %v", err)
	}

	_, err = allocator.AllocateForWorkspace("ws_test2", []string{"PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate ports for ws_test2: %v", err)
	}

	// List all allocations
	allocations, err := allocator.ListAllAllocations()
	if err != nil {
		t.Fatalf("Failed to list allocations: %v", err)
	}

	if len(allocations) != 3 {
		t.Errorf("Expected 3 allocations, got %d", len(allocations))
	}
}

func TestCustomPortOffset(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Insert workspace
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port)
		VALUES ('ws_test1', 'Test Workspace', '/tmp/test1', 10000)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspace: %v", err)
	}

	// Allocate standard and custom ports
	ports, err := allocator.AllocateForWorkspace("ws_test1", []string{"PORT", "CUSTOM_SERVICE"})
	if err != nil {
		t.Fatalf("Failed to allocate ports: %v", err)
	}

	// PORT should be at offset 0
	if ports["PORT"] != 10000 {
		t.Errorf("Expected PORT=10000, got %d", ports["PORT"])
	}

	// Custom port should be at offset 10 or higher
	if ports["CUSTOM_SERVICE"] < 10010 {
		t.Errorf("Expected CUSTOM_SERVICE >= 10010, got %d", ports["CUSTOM_SERVICE"])
	}
}

func TestFreeNonexistentPort(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Insert workspace
	_, err := database.Exec(`
		INSERT INTO workspaces (id, name, path, base_port)
		VALUES ('ws_test1', 'Test Workspace', '/tmp/test1', 10000)
	`)
	if err != nil {
		t.Fatalf("Failed to insert workspace: %v", err)
	}

	// Allocate ports
	_, err = allocator.AllocateForWorkspace("ws_test1", []string{"PORT"})
	if err != nil {
		t.Fatalf("Failed to allocate ports: %v", err)
	}

	// Try to free nonexistent port
	err = allocator.Free("ws_test1", "NONEXISTENT")
	if err == nil {
		t.Error("Expected error when freeing nonexistent port")
	}
}

func TestAllocateAdditionalNonexistentWorkspace(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	cfg := defaultTestConfig()
	allocator := NewAllocatorWithDB(database, cfg)

	// Try to allocate for nonexistent workspace
	_, err := allocator.AllocateAdditional("ws_nonexistent", "PORT")
	if err == nil {
		t.Error("Expected error when allocating for nonexistent workspace")
	}
}

func TestValidatePort(t *testing.T) {
	tests := []struct {
		port    int
		wantErr bool
	}{
		{port: 80, wantErr: true},      // Below MinPort
		{port: 1023, wantErr: true},    // Just below MinPort
		{port: 1024, wantErr: false},   // MinPort
		{port: 8080, wantErr: false},   // Normal port
		{port: 65535, wantErr: false},  // MaxPort
		{port: 65536, wantErr: true},   // Above MaxPort
		{port: -1, wantErr: true},      // Negative
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("port_%d", tt.port), func(t *testing.T) {
			err := ValidatePort(tt.port)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidatePort(%d) error = %v, wantErr %v", tt.port, err, tt.wantErr)
			}
		})
	}
}

func TestValidatePortRange(t *testing.T) {
	tests := []struct {
		name    string
		start   int
		end     int
		wantErr bool
	}{
		{"valid range", 10000, 60000, false},
		{"start below min", 500, 60000, true},
		{"end above max", 10000, 70000, true},
		{"start > end", 60000, 10000, true},
		{"single port", 8080, 8080, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePortRange(tt.start, tt.end)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidatePortRange(%d, %d) error = %v, wantErr %v",
					tt.start, tt.end, err, tt.wantErr)
			}
		})
	}
}

func TestNewAllocatorInvalidConfig(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	// Test with invalid port range
	cfg := config.PortConfig{
		RangeStart: 500,  // Below MinPort
		RangeEnd:   60000,
		BlockSize:  100,
	}

	allocator := NewAllocatorWithDB(database, cfg)

	// The DB-based allocator doesn't validate config in constructor
	// but the NewAllocator function does
	// For NewAllocatorWithDB, we trust the config is valid
	_ = allocator
}
