// sandbox_provider.go implements the provider.SandboxProvider interface for PVE-LXC.
package pvelxc

import (
	"context"
	"time"

	"github.com/karlorz/devsh/internal/provider"
)

// Ensure PVELXCProvider implements provider.SandboxProvider at compile time.
var _ provider.SandboxProvider = (*PVELXCProvider)(nil)

// PVELXCProvider wraps pvelxc.Client to implement provider.SandboxProvider.
type PVELXCProvider struct {
	client *Client
}

// NewProvider creates a new PVE-LXC sandbox provider from environment variables.
func NewProvider() (*PVELXCProvider, error) {
	client, err := NewClientFromEnv()
	if err != nil {
		return nil, err
	}
	return &PVELXCProvider{client: client}, nil
}

// NewProviderWithClient creates a new PVE-LXC sandbox provider with an existing client.
func NewProviderWithClient(client *Client) *PVELXCProvider {
	return &PVELXCProvider{client: client}
}

// Name returns the provider identifier.
func (p *PVELXCProvider) Name() string {
	return provider.PveLxc
}

// Create creates a new sandbox instance.
func (p *PVELXCProvider) Create(ctx context.Context, opts provider.CreateOptions) (*provider.Sandbox, error) {
	startOpts := StartOptions{
		SnapshotID: opts.Template,
	}

	instance, err := p.client.StartInstance(ctx, startOpts)
	if err != nil {
		return nil, err
	}

	return instanceToSandbox(instance), nil
}

// Get retrieves a sandbox by ID.
func (p *PVELXCProvider) Get(ctx context.Context, id string) (*provider.Sandbox, error) {
	instance, err := p.client.GetInstance(ctx, id)
	if err != nil {
		return nil, err
	}
	return instanceToSandbox(instance), nil
}

// Delete terminates and removes a sandbox.
func (p *PVELXCProvider) Delete(ctx context.Context, id string) error {
	return p.client.StopInstance(ctx, id)
}

// Exec executes a command in a sandbox.
func (p *PVELXCProvider) Exec(ctx context.Context, id string, command string) (*provider.ExecResult, error) {
	stdout, stderr, exitCode, err := p.client.ExecCommand(ctx, id, command)
	if err != nil {
		return nil, err
	}
	return &provider.ExecResult{
		Stdout:   stdout,
		Stderr:   stderr,
		ExitCode: exitCode,
	}, nil
}

// List returns sandboxes matching the given options.
func (p *PVELXCProvider) List(ctx context.Context, opts provider.ListOptions) ([]provider.Sandbox, error) {
	instances, err := p.client.ListInstances(ctx)
	if err != nil {
		return nil, err
	}

	sandboxes := make([]provider.Sandbox, 0, len(instances))
	for _, inst := range instances {
		// Apply status filter if specified
		if opts.Status != "" && inst.Status != opts.Status {
			continue
		}
		sandboxes = append(sandboxes, *instanceToSandbox(&inst))

		// Apply limit if specified
		if opts.Limit > 0 && len(sandboxes) >= opts.Limit {
			break
		}
	}

	return sandboxes, nil
}

// WaitReady blocks until the sandbox is ready or timeout.
func (p *PVELXCProvider) WaitReady(ctx context.Context, id string, timeout time.Duration) (*provider.Sandbox, error) {
	// For PVE-LXC, instances are typically ready immediately after creation.
	// We poll GetInstance until status is "running" or timeout.
	deadline := time.Now().Add(timeout)
	pollInterval := 2 * time.Second

	for {
		if time.Now().After(deadline) {
			return nil, context.DeadlineExceeded
		}

		instance, err := p.client.GetInstance(ctx, id)
		if err != nil {
			return nil, err
		}

		if instance.Status == "running" {
			return instanceToSandbox(instance), nil
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(pollInterval):
			// Continue polling
		}
	}
}

// instanceToSandbox converts a pvelxc.Instance to provider.Sandbox.
func instanceToSandbox(inst *Instance) *provider.Sandbox {
	return &provider.Sandbox{
		ID:        inst.ID,
		Status:    inst.Status,
		VSCodeURL: inst.VSCodeURL,
		VNCURL:    inst.VNCURL,
		WorkerURL: inst.WorkerURL,
		Provider:  provider.PveLxc,
	}
}
