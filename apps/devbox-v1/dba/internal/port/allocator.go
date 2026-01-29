// internal/port/allocator.go
package port

import (
	"database/sql"
	"fmt"
	"sync"

	"github.com/dba-cli/dba/internal/config"
	"github.com/dba-cli/dba/internal/db"
)

// Port range constants
const (
	MinPort = 1024  // Minimum allocatable port (below are privileged)
	MaxPort = 65535 // Maximum valid port number
)

// ValidatePort checks if a port number is in valid range
func ValidatePort(port int) error {
	if port < MinPort || port > MaxPort {
		return fmt.Errorf("port %d is outside valid range %d-%d", port, MinPort, MaxPort)
	}
	return nil
}

// ValidatePortRange checks if a port range is valid
func ValidatePortRange(start, end int) error {
	if err := ValidatePort(start); err != nil {
		return fmt.Errorf("invalid start port: %w", err)
	}
	if err := ValidatePort(end); err != nil {
		return fmt.Errorf("invalid end port: %w", err)
	}
	if start > end {
		return fmt.Errorf("start port %d is greater than end port %d", start, end)
	}
	return nil
}

// Allocator manages port allocation
type Allocator struct {
	db     *sql.DB
	config config.PortConfig
	mu     sync.Mutex
}

// NewAllocator creates a new port allocator
func NewAllocator(cfg config.PortConfig) (*Allocator, error) {
	// Validate port range configuration
	if err := ValidatePortRange(cfg.RangeStart, cfg.RangeEnd); err != nil {
		return nil, fmt.Errorf("invalid port configuration: %w", err)
	}

	// Validate block size
	if cfg.BlockSize <= 0 {
		return nil, fmt.Errorf("invalid block size: %d (must be positive)", cfg.BlockSize)
	}

	database, err := db.Get()
	if err != nil {
		return nil, err
	}

	return &Allocator{
		db:     database,
		config: cfg,
	}, nil
}

// NewAllocatorWithDB creates a new port allocator with a specific database
// This is useful for testing
func NewAllocatorWithDB(database *sql.DB, cfg config.PortConfig) *Allocator {
	return &Allocator{
		db:     database,
		config: cfg,
	}
}

// AllocateForWorkspace allocates all ports for a new workspace
func (a *Allocator) AllocateForWorkspace(workspaceID string, portNames []string) (map[string]int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Find next available base port
	basePort, err := a.findNextBasePort()
	if err != nil {
		return nil, fmt.Errorf("failed to allocate base port: %w", err)
	}

	// Register base port
	_, err = a.db.Exec(`
		INSERT INTO workspace_base_ports (workspace_id, base_port)
		VALUES (?, ?)
	`, workspaceID, basePort)
	if err != nil {
		return nil, fmt.Errorf("failed to register base port: %w", err)
	}

	// Allocate each named port
	ports := make(map[string]int)
	for _, name := range portNames {
		port, err := a.allocateNamedPort(workspaceID, name, basePort)
		if err != nil {
			// Rollback
			a.releaseForWorkspaceInternal(workspaceID)
			return nil, fmt.Errorf("failed to allocate port %s: %w", name, err)
		}
		ports[name] = port
	}

	return ports, nil
}

// findNextBasePort finds the next available base port block
func (a *Allocator) findNextBasePort() (int, error) {
	// Get all allocated base ports
	rows, err := a.db.Query(`
		SELECT base_port FROM workspace_base_ports ORDER BY base_port
	`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	allocated := make(map[int]bool)
	for rows.Next() {
		var port int
		if err := rows.Scan(&port); err != nil {
			return 0, err
		}
		allocated[port] = true
	}

	if err := rows.Err(); err != nil {
		return 0, err
	}

	// Find first free block
	for base := a.config.RangeStart; base < a.config.RangeEnd; base += a.config.BlockSize {
		if !allocated[base] {
			// Verify the key ports in this block are actually free
			if a.isBlockFree(base) {
				return base, nil
			}
		}
	}

	return 0, fmt.Errorf("no free port blocks available in range %d-%d",
		a.config.RangeStart, a.config.RangeEnd)
}

// isBlockFree checks if the key ports in a block are free on the system
func (a *Allocator) isBlockFree(base int) bool {
	// Check main port, code port, and vnc port
	portsToCheck := []int{base}

	// Add standard offsets if they exist
	if offset, ok := a.config.StandardOffsets["PORT"]; ok {
		portsToCheck = append(portsToCheck, base+offset)
	}
	if offset, ok := a.config.StandardOffsets["CODE_PORT"]; ok {
		portsToCheck = append(portsToCheck, base+offset)
	}
	if offset, ok := a.config.StandardOffsets["VNC_PORT"]; ok {
		portsToCheck = append(portsToCheck, base+offset)
	}

	// Remove duplicates
	seen := make(map[int]bool)
	for _, port := range portsToCheck {
		if seen[port] {
			continue
		}
		seen[port] = true
		if !IsPortFree(port) {
			return false
		}
	}

	return true
}

// allocateNamedPort allocates a specific named port
func (a *Allocator) allocateNamedPort(workspaceID, name string, basePort int) (int, error) {
	// Get offset for this port name
	offset, ok := a.config.StandardOffsets[name]
	if !ok {
		// Custom port, find next available offset
		offset = a.nextCustomOffset(workspaceID, basePort)
	}

	port := basePort + offset

	// Verify port is free
	if !IsPortFree(port) {
		// Try to find nearby free port
		var err error
		port, err = a.findFreePortNear(port, basePort)
		if err != nil {
			return 0, err
		}
	}

	// Insert allocation
	_, err := a.db.Exec(`
		INSERT INTO port_allocations (workspace_id, port_name, port_number)
		VALUES (?, ?, ?)
	`, workspaceID, name, port)
	if err != nil {
		return 0, err
	}

	return port, nil
}

// nextCustomOffset finds the next available offset for custom port names
func (a *Allocator) nextCustomOffset(workspaceID string, basePort int) int {
	// Start at offset 10 for custom ports
	for offset := 10; offset < a.config.BlockSize; offset++ {
		port := basePort + offset

		// Check if this offset is already used
		var count int
		a.db.QueryRow(`
			SELECT COUNT(*) FROM port_allocations
			WHERE workspace_id = ? AND port_number = ?
		`, workspaceID, port).Scan(&count)

		if count == 0 && IsPortFree(port) {
			return offset
		}
	}

	return 10 // Fallback, will likely fail
}

// findFreePortNear finds a free port near the preferred port
func (a *Allocator) findFreePortNear(preferred, basePort int) (int, error) {
	// Try ports within the workspace block
	maxPort := basePort + a.config.BlockSize

	for port := preferred + 1; port < maxPort; port++ {
		if IsPortFree(port) && !a.isPortAllocated(port) {
			return port, nil
		}
	}

	return 0, fmt.Errorf("no free port available near %d", preferred)
}

// isPortAllocated checks if a port is in the database
func (a *Allocator) isPortAllocated(port int) bool {
	var count int
	a.db.QueryRow(`SELECT COUNT(*) FROM port_allocations WHERE port_number = ?`, port).Scan(&count)
	return count > 0
}

// AllocateAdditional allocates an additional port for an existing workspace
func (a *Allocator) AllocateAdditional(workspaceID, name string) (int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Get workspace base port
	var basePort int
	err := a.db.QueryRow(`
		SELECT base_port FROM workspace_base_ports WHERE workspace_id = ?
	`, workspaceID).Scan(&basePort)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, fmt.Errorf("workspace not found: %s", workspaceID)
		}
		return 0, fmt.Errorf("failed to get base port: %w", err)
	}

	return a.allocateNamedPort(workspaceID, name, basePort)
}

// Free releases a specific port
func (a *Allocator) Free(workspaceID, name string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	result, err := a.db.Exec(`
		DELETE FROM port_allocations
		WHERE workspace_id = ? AND port_name = ?
	`, workspaceID, name)
	if err != nil {
		return err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("port %s not found for workspace %s", name, workspaceID)
	}

	return nil
}

// ReleaseForWorkspace releases all ports for a workspace
func (a *Allocator) ReleaseForWorkspace(workspaceID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.releaseForWorkspaceInternal(workspaceID)
}

// releaseForWorkspaceInternal releases ports without locking (internal use)
func (a *Allocator) releaseForWorkspaceInternal(workspaceID string) error {
	_, err := a.db.Exec(`
		DELETE FROM port_allocations WHERE workspace_id = ?
	`, workspaceID)
	if err != nil {
		return err
	}

	_, err = a.db.Exec(`
		DELETE FROM workspace_base_ports WHERE workspace_id = ?
	`, workspaceID)

	return err
}

// GetWorkspacePorts returns all ports for a workspace
func (a *Allocator) GetWorkspacePorts(workspaceID string) (map[string]int, error) {
	rows, err := a.db.Query(`
		SELECT port_name, port_number FROM port_allocations WHERE workspace_id = ?
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ports := make(map[string]int)
	for rows.Next() {
		var name string
		var port int
		if err := rows.Scan(&name, &port); err != nil {
			return nil, err
		}
		ports[name] = port
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return ports, nil
}

// GetWorkspaceBasePort returns the base port for a workspace
func (a *Allocator) GetWorkspaceBasePort(workspaceID string) (int, error) {
	var basePort int
	err := a.db.QueryRow(`
		SELECT base_port FROM workspace_base_ports WHERE workspace_id = ?
	`, workspaceID).Scan(&basePort)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, fmt.Errorf("workspace not found: %s", workspaceID)
		}
		return 0, err
	}
	return basePort, nil
}

// ListAllAllocations returns all port allocations
func (a *Allocator) ListAllAllocations() ([]PortAllocation, error) {
	rows, err := a.db.Query(`
		SELECT pa.workspace_id, pa.port_name, pa.port_number, wbp.base_port
		FROM port_allocations pa
		JOIN workspace_base_ports wbp ON pa.workspace_id = wbp.workspace_id
		ORDER BY pa.workspace_id, pa.port_number
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var allocations []PortAllocation
	for rows.Next() {
		var alloc PortAllocation
		if err := rows.Scan(&alloc.WorkspaceID, &alloc.Name, &alloc.Port, &alloc.BasePort); err != nil {
			return nil, err
		}
		allocations = append(allocations, alloc)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return allocations, nil
}

// PortAllocation represents a single port allocation
type PortAllocation struct {
	WorkspaceID string `json:"workspace_id"`
	Name        string `json:"name"`
	Port        int    `json:"port"`
	BasePort    int    `json:"base_port"`
}
