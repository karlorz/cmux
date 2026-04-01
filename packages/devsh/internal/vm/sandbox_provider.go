// sandbox_provider.go implements the provider.SandboxProvider interface for Morph.
package vm

import (
	"context"
	"time"

	"github.com/karlorz/devsh/internal/provider"
)

// Ensure MorphProvider implements provider.SandboxProvider at compile time.
var _ provider.SandboxProvider = (*MorphProvider)(nil)

// MorphProvider wraps vm.Client to implement provider.SandboxProvider.
type MorphProvider struct {
	client *Client
}

// NewProvider creates a new Morph sandbox provider.
func NewProvider() (*MorphProvider, error) {
	client, err := NewClient()
	if err != nil {
		return nil, err
	}
	return &MorphProvider{client: client}, nil
}

// NewProviderWithClient creates a new Morph sandbox provider with an existing client.
func NewProviderWithClient(client *Client) *MorphProvider {
	return &MorphProvider{client: client}
}

// SetTeamSlug sets the team slug for API calls.
func (p *MorphProvider) SetTeamSlug(teamSlug string) {
	p.client.SetTeamSlug(teamSlug)
}

// Name returns the provider identifier.
func (p *MorphProvider) Name() string {
	return provider.Morph
}

// Create creates a new sandbox instance.
func (p *MorphProvider) Create(ctx context.Context, opts provider.CreateOptions) (*provider.Sandbox, error) {
	createOpts := CreateOptions{
		SnapshotID: opts.Template,
		// Note: Morph CreateOptions doesn't support Repository/Branch directly.
		// Repository cloning is handled by the sandbox initialization process.
	}
	if opts.Timeout > 0 {
		createOpts.TTLSeconds = int(opts.Timeout.Seconds())
	}

	instance, err := p.client.CreateInstance(ctx, createOpts)
	if err != nil {
		return nil, err
	}

	return instanceToSandbox(instance), nil
}

// Get retrieves a sandbox by ID.
func (p *MorphProvider) Get(ctx context.Context, id string) (*provider.Sandbox, error) {
	instance, err := p.client.GetInstance(ctx, id)
	if err != nil {
		return nil, err
	}
	return instanceToSandbox(instance), nil
}

// Delete terminates and removes a sandbox.
func (p *MorphProvider) Delete(ctx context.Context, id string) error {
	return p.client.StopInstance(ctx, id)
}

// Exec executes a command in a sandbox.
func (p *MorphProvider) Exec(ctx context.Context, id string, command string) (*provider.ExecResult, error) {
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
func (p *MorphProvider) List(ctx context.Context, opts provider.ListOptions) ([]provider.Sandbox, error) {
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
func (p *MorphProvider) WaitReady(ctx context.Context, id string, timeout time.Duration) (*provider.Sandbox, error) {
	instance, err := p.client.WaitForReady(ctx, id, timeout)
	if err != nil {
		return nil, err
	}
	return instanceToSandbox(instance), nil
}

// instanceToSandbox converts a vm.Instance to provider.Sandbox.
func instanceToSandbox(inst *Instance) *provider.Sandbox {
	return &provider.Sandbox{
		ID:        inst.ID,
		Status:    inst.Status,
		VSCodeURL: inst.VSCodeURL,
		VNCURL:    inst.VNCURL,
		WorkerURL: inst.WorkerURL,
		ChromeURL: inst.ChromeURL,
		Provider:  provider.Morph,
	}
}
