// internal/morph/manager.go
package morph

import (
	"context"
	"strings"
	"sync"
	"time"
)

// Manager handles Morph VM lifecycle operations
type Manager struct {
	config ManagerConfig
	api    *APIClient
	mu     sync.Mutex

	// Cache of running instances by workspace ID
	instances map[string]*Instance
}

// NewManager creates a new Morph VM manager
func NewManager(config ManagerConfig) (*Manager, error) {
	api, err := NewAPIClient(APIClientConfig{
		APIKey: config.APIKey,
	})
	if err != nil {
		return nil, WrapError(err, "failed to initialize API client")
	}

	return &Manager{
		config:    config,
		api:       api,
		instances: make(map[string]*Instance),
	}, nil
}

// StartInstance starts a new VM instance from a snapshot
func (m *Manager) StartInstance(ctx context.Context, workspaceID string, snapshotID string) (*Instance, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if already running
	if inst, ok := m.instances[workspaceID]; ok && inst.Status == StatusRunning {
		return inst, ErrAlreadyRunning
	}

	// Use base snapshot if none specified
	if snapshotID == "" {
		snapshotID = m.config.BaseSnapshotID
	}

	ttl := m.config.DefaultTTL
	if ttl == 0 {
		ttl = 3600 // 1 hour default
	}

	// Start instance via API
	apiInst, err := m.api.StartInstance(ctx, StartInstanceRequest{
		SnapshotID: snapshotID,
		TTLSeconds: ttl,
		VCPUs:      m.config.DefaultVCPUs,
		Memory:     m.config.DefaultMemory,
	})
	if err != nil {
		return nil, WrapError(err, "failed to start instance")
	}

	// Wait for instance to be ready
	apiInst, err = m.api.WaitForInstance(ctx, apiInst.ID, 2*time.Minute)
	if err != nil {
		return nil, WrapError(err, "instance failed to become ready")
	}

	// Start services on the instance
	_, _ = m.api.ExecCommand(ctx, apiInst.ID, "systemctl start vncserver xfce-session chrome-cdp novnc code-server nginx || true")

	// Get base URL - try multiple sources
	var baseURL string

	// 1. Check if instance already has HTTP refs (from snapshot)
	if apiInst.Refs != nil && apiInst.Refs.HTTP != "" {
		baseURL = apiInst.Refs.HTTP
	}

	// 2. Check networking http_services
	if baseURL == "" && apiInst.Networking != nil {
		for _, url := range apiInst.Networking.HTTPServices {
			if url != "" {
				baseURL = url
				break
			}
		}
	}

	// 3. Try to expose HTTP service if we don't have a URL yet
	if baseURL == "" {
		httpSvc, exposeErr := m.api.ExposeHTTPService(ctx, apiInst.ID, "web", 80)
		if exposeErr == nil && httpSvc != nil && httpSvc.URL != "" {
			baseURL = httpSvc.URL
		}
	}

	// 4. Re-fetch instance to get updated refs after exposing service
	if baseURL == "" {
		refreshedInst, refreshErr := m.api.GetInstance(ctx, apiInst.ID)
		if refreshErr == nil && refreshedInst != nil {
			if refreshedInst.Refs != nil && refreshedInst.Refs.HTTP != "" {
				baseURL = refreshedInst.Refs.HTTP
			}
		}
	}

	// 5. Poll for URL if still not available (services may take time to start)
	if baseURL == "" {
		pollTimeout := 60 * time.Second
		pollInterval := 2 * time.Second
		deadline := time.Now().Add(pollTimeout)

		for time.Now().Before(deadline) {
			time.Sleep(pollInterval)

			refreshedInst, refreshErr := m.api.GetInstance(ctx, apiInst.ID)
			if refreshErr == nil && refreshedInst != nil {
				if refreshedInst.Refs != nil && refreshedInst.Refs.HTTP != "" {
					baseURL = refreshedInst.Refs.HTTP
					break
				}
				if refreshedInst.Networking != nil {
					for _, url := range refreshedInst.Networking.HTTPServices {
						if url != "" {
							baseURL = url
							break
						}
					}
					if baseURL != "" {
						break
					}
				}
			}

			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			default:
			}
		}
	}

	instance := &Instance{
		ID:         apiInst.ID,
		SnapshotID: snapshotID,
		Status:     StatusRunning,
		BaseURL:    baseURL,
		TTLSeconds: ttl,
		CreatedAt:  time.Now(),
	}

	// Derive URLs from base URL
	if baseURL != "" {
		// Normalize base URL - remove trailing slash
		baseURL = strings.TrimSuffix(baseURL, "/")
		instance.CodeURL = baseURL + "/code/"
		instance.VNCURL = baseURL + "/vnc/vnc.html"
		instance.AppURL = baseURL + "/vnc/app/"
		// CDP requires WebSocket protocol
		cdpURL := strings.Replace(baseURL, "https://", "wss://", 1)
		cdpURL = strings.Replace(cdpURL, "http://", "ws://", 1)
		instance.CDPURL = cdpURL + "/cdp/"
	}

	m.instances[workspaceID] = instance
	return instance, nil
}

// StopInstance stops a running VM instance
func (m *Manager) StopInstance(ctx context.Context, workspaceID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.instances[workspaceID]
	if !ok {
		return ErrNotFound
	}

	if inst.Status != StatusRunning {
		return ErrNotRunning
	}

	if err := m.api.StopInstance(ctx, inst.ID); err != nil {
		return WrapError(err, "failed to stop instance")
	}

	inst.Status = StatusStopped
	inst.CDPPort = 0 // Clear CDP port
	return nil
}

// GetInstance returns instance info for a workspace
func (m *Manager) GetInstance(ctx context.Context, workspaceID string) (*Instance, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.instances[workspaceID]
	if !ok {
		return nil, ErrNotFound
	}

	return inst, nil
}

// Exec runs a command on an instance
func (m *Manager) Exec(ctx context.Context, workspaceID string, command string) (*ExecResult, error) {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return nil, ErrNotFound
	}

	if inst.Status != StatusRunning {
		return nil, ErrNotRunning
	}

	result, err := m.api.ExecCommand(ctx, inst.ID, command)
	if err != nil {
		return nil, WrapError(err, "failed to execute command")
	}

	return &ExecResult{
		Stdout:   result.Stdout,
		Stderr:   result.Stderr,
		ExitCode: result.ExitCode,
	}, nil
}

// SaveSnapshot saves the current instance state as a snapshot
func (m *Manager) SaveSnapshot(ctx context.Context, workspaceID string, name string) (*Snapshot, error) {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return nil, ErrNotFound
	}

	if inst.Status != StatusRunning {
		return nil, ErrNotRunning
	}

	apiSnap, err := m.api.SnapshotInstance(ctx, inst.ID, name)
	if err != nil {
		return nil, WrapError(err, "failed to save snapshot")
	}

	return &Snapshot{
		ID:     apiSnap.ID,
		Digest: name,
	}, nil
}

// ListSnapshots returns all available snapshots
func (m *Manager) ListSnapshots(ctx context.Context) ([]*Snapshot, error) {
	apiSnapshots, err := m.api.ListSnapshots(ctx)
	if err != nil {
		return nil, WrapError(err, "failed to list snapshots")
	}

	snapshots := make([]*Snapshot, len(apiSnapshots))
	for i, s := range apiSnapshots {
		snapshots[i] = &Snapshot{
			ID:     s.ID,
			Digest: s.Digest,
		}
	}

	return snapshots, nil
}

// IsRunning checks if a workspace has a running instance
func (m *Manager) IsRunning(workspaceID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	inst, ok := m.instances[workspaceID]
	return ok && inst != nil && inst.Status == StatusRunning
}

// GetInstanceByID returns an instance by its Morph instance ID (not workspace ID)
func (m *Manager) GetInstanceByID(instanceID string) *Instance {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, inst := range m.instances {
		if inst != nil && inst.ID == instanceID {
			return inst
		}
	}
	return nil
}

// ListInstances returns all known instances
func (m *Manager) ListInstances() []*Instance {
	m.mu.Lock()
	defer m.mu.Unlock()

	instances := make([]*Instance, 0, len(m.instances))
	for _, inst := range m.instances {
		instances = append(instances, inst)
	}
	return instances
}

// RefreshInstance refreshes the status of an instance from the Morph API
func (m *Manager) RefreshInstance(ctx context.Context, workspaceID string) (*Instance, error) {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return nil, ErrNotFound
	}

	apiInst, err := m.api.GetInstance(ctx, inst.ID)
	if err != nil {
		// Instance no longer exists
		m.mu.Lock()
		delete(m.instances, workspaceID)
		m.mu.Unlock()
		return nil, ErrNotFound
	}

	m.mu.Lock()
	inst.Status = InstanceStatus(apiInst.Status)
	m.mu.Unlock()

	return inst, nil
}

// RemoveInstance removes an instance from the cache (doesn't stop it)
func (m *Manager) RemoveInstance(workspaceID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.instances, workspaceID)
}

// InstanceURLs holds URL info for an instance
type InstanceURLs struct {
	BaseURL string
	CodeURL string
	VNCURL  string
	AppURL  string
	CDPURL  string
}

// RefreshInstanceURLs fetches the latest URLs for an instance from the API
func (m *Manager) RefreshInstanceURLs(ctx context.Context, instanceID string) (*InstanceURLs, error) {
	apiInst, err := m.api.GetInstance(ctx, instanceID)
	if err != nil {
		return nil, WrapError(err, "failed to get instance")
	}

	urls := &InstanceURLs{}

	// Try to get base URL from refs
	if apiInst.Refs != nil && apiInst.Refs.HTTP != "" {
		urls.BaseURL = apiInst.Refs.HTTP
	}

	// Try networking http_services
	if urls.BaseURL == "" && apiInst.Networking != nil {
		for _, url := range apiInst.Networking.HTTPServices {
			if url != "" {
				urls.BaseURL = url
				break
			}
		}
	}

	// If still no URL, try to expose HTTP service
	if urls.BaseURL == "" {
		httpSvc, exposeErr := m.api.ExposeHTTPService(ctx, instanceID, "web", 80)
		if exposeErr == nil && httpSvc != nil && httpSvc.URL != "" {
			urls.BaseURL = httpSvc.URL
		}
	}

	// Derive service URLs from base URL
	if urls.BaseURL != "" {
		baseURL := strings.TrimSuffix(urls.BaseURL, "/")
		urls.CodeURL = baseURL + "/code/"
		urls.VNCURL = baseURL + "/vnc/vnc.html"
		urls.AppURL = baseURL + "/vnc/app/"
		cdpURL := strings.Replace(baseURL, "https://", "wss://", 1)
		cdpURL = strings.Replace(cdpURL, "http://", "ws://", 1)
		urls.CDPURL = cdpURL + "/cdp/"
	}

	return urls, nil
}

// SetInstance sets an instance in the cache (for restoring state)
func (m *Manager) SetInstance(workspaceID string, inst *Instance) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.instances[workspaceID] = inst
}

// DiscoverPorts discovers listening ports on the VM
func (m *Manager) DiscoverPorts(ctx context.Context, workspaceID string) ([]ActivePort, error) {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return nil, ErrNotFound
	}

	if inst.Status != StatusRunning {
		return nil, ErrNotRunning
	}

	// Run ss to get listening ports
	result, err := m.api.ExecCommand(ctx, inst.ID, "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo ''")
	if err != nil {
		return nil, WrapError(err, "failed to discover ports")
	}

	return parsePortsOutput(result.Stdout), nil
}

// parsePortsOutput parses ss/netstat output into ActivePort list
func parsePortsOutput(output string) []ActivePort {
	var ports []ActivePort
	seen := make(map[int]bool)

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if line == "" || strings.Contains(line, "Local Address") || strings.Contains(line, "Proto") {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) < 4 {
			continue
		}

		// Find local address:port
		var localAddr string
		for _, part := range parts {
			if strings.Contains(part, ":") && containsDigit(part) {
				localAddr = part
				break
			}
		}

		if localAddr == "" {
			continue
		}

		// Extract port number
		var port int
		if strings.Contains(localAddr, "]:") { // IPv6
			idx := strings.LastIndex(localAddr, "]:")
			if idx >= 0 {
				portStr := localAddr[idx+2:]
				port = parsePort(portStr)
			}
		} else {
			idx := strings.LastIndex(localAddr, ":")
			if idx >= 0 {
				portStr := localAddr[idx+1:]
				port = parsePort(portStr)
			}
		}

		if port == 0 || seen[port] {
			continue
		}

		// Skip system ports except 80, 443
		if port < 1024 && port != 80 && port != 443 {
			continue
		}

		seen[port] = true
		ports = append(ports, ActivePort{
			Port:     port,
			Protocol: "tcp",
		})
	}

	return ports
}

func containsDigit(s string) bool {
	for _, r := range s {
		if r >= '0' && r <= '9' {
			return true
		}
	}
	return false
}

func parsePort(s string) int {
	var port int
	for _, r := range s {
		if r >= '0' && r <= '9' {
			port = port*10 + int(r-'0')
		} else {
			break
		}
	}
	return port
}

// DiscoverDockerPorts discovers Docker container port mappings on the VM
func (m *Manager) DiscoverDockerPorts(ctx context.Context, workspaceID string) ([]ActivePort, error) {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return nil, ErrNotFound
	}

	if inst.Status != StatusRunning {
		return nil, ErrNotRunning
	}

	result, err := m.api.ExecCommand(ctx, inst.ID, "which docker 2>/dev/null && docker ps --format '{{.ID}}|{{.Names}}|{{.Ports}}' 2>/dev/null || echo ''")
	if err != nil {
		return nil, WrapError(err, "failed to discover Docker ports")
	}

	return parseDockerPortsOutput(result.Stdout), nil
}

// parseDockerPortsOutput parses docker ps output into ActivePort list
func parseDockerPortsOutput(output string) []ActivePort {
	var ports []ActivePort

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if line == "" || !strings.Contains(line, "|") {
			continue
		}

		parts := strings.Split(line, "|")
		if len(parts) < 3 {
			continue
		}

		containerName := parts[1]
		portMappings := parts[2]

		if portMappings == "" {
			continue
		}

		// Parse port mappings like "0.0.0.0:5173->5173/tcp, :::5432->5432/tcp"
		for _, mapping := range strings.Split(portMappings, ", ") {
			if !strings.Contains(mapping, "->") {
				continue
			}

			parts := strings.Split(mapping, "->")
			if len(parts) != 2 {
				continue
			}

			// Get container port/protocol
			rightParts := strings.Split(parts[1], "/")
			containerPort := parsePort(rightParts[0])
			protocol := "tcp"
			if len(rightParts) > 1 {
				protocol = rightParts[1]
			}

			if containerPort == 0 {
				continue
			}

			// Identify service by port
			service := identifyService(containerPort)

			ports = append(ports, ActivePort{
				Port:      containerPort,
				Protocol:  protocol,
				Container: containerName,
				Service:   service,
			})
		}
	}

	return ports
}

func identifyService(port int) string {
	switch port {
	case 5173, 3000:
		return "dev-server"
	case 5432:
		return "postgres"
	case 3306:
		return "mysql"
	case 6379:
		return "redis"
	case 27017:
		return "mongodb"
	case 8080, 80:
		return "http"
	case 443:
		return "https"
	default:
		return ""
	}
}

// DiscoverAllPorts discovers both system ports and Docker ports
func (m *Manager) DiscoverAllPorts(ctx context.Context, workspaceID string) (*PortDiscoveryResult, error) {
	ports, err := m.DiscoverPorts(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	dockerPorts, err := m.DiscoverDockerPorts(ctx, workspaceID)
	if err != nil {
		// Docker might not be available, don't fail completely
		dockerPorts = []ActivePort{}
	}

	return &PortDiscoveryResult{
		Ports:       ports,
		DockerPorts: dockerPorts,
	}, nil
}

// UpdateTTL updates the TTL of an instance
func (m *Manager) UpdateTTL(ctx context.Context, workspaceID string, ttlSeconds int) error {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return ErrNotFound
	}

	if inst.Status != StatusRunning {
		return ErrNotRunning
	}

	if err := m.api.UpdateTTL(ctx, inst.ID, ttlSeconds); err != nil {
		return WrapError(err, "failed to update TTL")
	}

	m.mu.Lock()
	inst.TTLSeconds = ttlSeconds
	m.mu.Unlock()

	return nil
}

// PauseInstance pauses an instance
func (m *Manager) PauseInstance(ctx context.Context, workspaceID string) error {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return ErrNotFound
	}

	if inst.Status != StatusRunning {
		return ErrNotRunning
	}

	if err := m.api.PauseInstance(ctx, inst.ID); err != nil {
		return WrapError(err, "failed to pause instance")
	}

	m.mu.Lock()
	inst.Status = StatusStopped
	m.mu.Unlock()

	return nil
}

// ResumeInstance resumes a paused instance
func (m *Manager) ResumeInstance(ctx context.Context, workspaceID string) error {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return ErrNotFound
	}

	if err := m.api.ResumeInstance(ctx, inst.ID); err != nil {
		return WrapError(err, "failed to resume instance")
	}

	m.mu.Lock()
	inst.Status = StatusRunning
	m.mu.Unlock()

	return nil
}

// RebootInstance reboots an instance
func (m *Manager) RebootInstance(ctx context.Context, workspaceID string) error {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return ErrNotFound
	}

	if inst.Status != StatusRunning {
		return ErrNotRunning
	}

	if err := m.api.RebootInstance(ctx, inst.ID); err != nil {
		return WrapError(err, "failed to reboot instance")
	}

	return nil
}

// GetSSHKey gets the SSH key for an instance
func (m *Manager) GetSSHKey(ctx context.Context, workspaceID string) (string, error) {
	m.mu.Lock()
	inst, ok := m.instances[workspaceID]
	m.mu.Unlock()

	if !ok {
		return "", ErrNotFound
	}

	return m.api.GetSSHKey(ctx, inst.ID)
}
