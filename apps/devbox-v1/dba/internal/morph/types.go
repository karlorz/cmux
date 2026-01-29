// internal/morph/types.go
package morph

import "time"

// Instance represents a running Morph VM instance
type Instance struct {
	ID         string            `json:"id"`
	SnapshotID string            `json:"snapshot_id"`
	Status     InstanceStatus    `json:"status"`
	BaseURL    string            `json:"base_url"` // Exposed HTTP URL
	CDPURL     string            `json:"cdp_url"`  // CDP WebSocket URL (HTTP proxy)
	VNCURL     string            `json:"vnc_url"`  // noVNC URL
	CodeURL    string            `json:"code_url"` // code-server URL
	AppURL     string            `json:"app_url"`  // App URL
	CDPPort    int               `json:"cdp_port"` // Local port for CDP (via SSH tunnel)
	CreatedAt  time.Time         `json:"created_at"`
	TTLSeconds int               `json:"ttl_seconds"`
	Metadata   map[string]string `json:"metadata"`
}

// InstanceStatus represents the state of an instance
type InstanceStatus string

const (
	StatusPending  InstanceStatus = "pending"
	StatusStarting InstanceStatus = "starting"
	StatusRunning  InstanceStatus = "running"
	StatusStopping InstanceStatus = "stopping"
	StatusStopped  InstanceStatus = "stopped"
	StatusError    InstanceStatus = "error"
)

// Snapshot represents a saved VM state
type Snapshot struct {
	ID        string            `json:"id"`
	Digest    string            `json:"digest"` // Human-readable name
	ImageID   string            `json:"image_id"`
	VCPUs     int               `json:"vcpus"`
	Memory    int               `json:"memory"`    // MB
	DiskSize  int               `json:"disk_size"` // MB
	CreatedAt time.Time         `json:"created_at"`
	Metadata  map[string]string `json:"metadata"`
}

// ExecResult represents command execution output
type ExecResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

// ManagerConfig holds configuration for MorphVMManager
type ManagerConfig struct {
	APIKey         string
	BaseSnapshotID string
	DefaultTTL     int // seconds
	DefaultVCPUs   int
	DefaultMemory  int // MB
	DefaultDisk    int // MB
}

// ActivePort represents a port that is listening on the VM
type ActivePort struct {
	Port      int    `json:"port"`       // Port number
	Protocol  string `json:"protocol"`   // "tcp" or "udp"
	Process   string `json:"process"`    // Process name (if available)
	PID       int    `json:"pid"`        // Process ID (if available)
	Container string `json:"container"`  // Docker container name (if from Docker)
	Service   string `json:"service"`    // Service description (e.g., "vite", "postgres")
	LocalPort int    `json:"local_port"` // Local forwarded port (if forwarded)
}

// PortDiscoveryResult contains the result of port discovery
type PortDiscoveryResult struct {
	Ports       []ActivePort `json:"ports"`
	DockerPorts []ActivePort `json:"docker_ports"`
}
