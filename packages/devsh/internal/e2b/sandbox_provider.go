// sandbox_provider.go implements the provider.SandboxProvider interface for E2B.
package e2b

import (
	"context"
	"time"

	"github.com/karlorz/devsh/internal/provider"
)

// Ensure E2BProvider implements provider.SandboxProvider at compile time.
var _ provider.SandboxProvider = (*E2BProvider)(nil)

// E2BProvider wraps e2b.Client to implement provider.SandboxProvider.
type E2BProvider struct {
	client *Client
}

// NewProvider creates a new E2B sandbox provider.
func NewProvider() (*E2BProvider, error) {
	client, err := NewClient()
	if err != nil {
		return nil, err
	}
	return &E2BProvider{client: client}, nil
}

// NewProviderWithClient creates a new E2B sandbox provider with an existing client.
func NewProviderWithClient(client *Client) *E2BProvider {
	return &E2BProvider{client: client}
}

// SetTeamSlug sets the team slug for API calls.
func (p *E2BProvider) SetTeamSlug(teamSlug string) {
	p.client.SetTeamSlug(teamSlug)
}

// Name returns the provider identifier.
func (p *E2BProvider) Name() string {
	return provider.E2B
}

// Create creates a new sandbox instance.
func (p *E2BProvider) Create(ctx context.Context, opts provider.CreateOptions) (*provider.Sandbox, error) {
	startOpts := StartOptions{
		TemplateID: opts.Template,
	}

	instance, err := p.client.StartInstance(ctx, startOpts)
	if err != nil {
		return nil, err
	}

	return instanceToSandbox(instance), nil
}

// Get retrieves a sandbox by ID.
func (p *E2BProvider) Get(ctx context.Context, id string) (*provider.Sandbox, error) {
	instance, err := p.client.GetInstance(ctx, id)
	if err != nil {
		return nil, err
	}
	return instanceToSandbox(instance), nil
}

// Delete terminates and removes a sandbox.
func (p *E2BProvider) Delete(ctx context.Context, id string) error {
	return p.client.StopInstance(ctx, id)
}

// Exec executes a command in a sandbox.
func (p *E2BProvider) Exec(ctx context.Context, id string, command string) (*provider.ExecResult, error) {
	// E2B ExecCommand takes a timeout parameter (in seconds)
	const defaultTimeout = 60
	stdout, stderr, exitCode, err := p.client.ExecCommand(ctx, id, command, defaultTimeout)
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
func (p *E2BProvider) List(ctx context.Context, opts provider.ListOptions) ([]provider.Sandbox, error) {
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
func (p *E2BProvider) WaitReady(ctx context.Context, id string, timeout time.Duration) (*provider.Sandbox, error) {
	instance, err := p.client.WaitForReady(ctx, id, timeout)
	if err != nil {
		return nil, err
	}
	return instanceToSandbox(instance), nil
}

// instanceToSandbox converts an e2b.Instance to provider.Sandbox.
func instanceToSandbox(inst *Instance) *provider.Sandbox {
	return &provider.Sandbox{
		ID:        inst.ID,
		Status:    inst.Status,
		VSCodeURL: inst.VSCodeURL,
		VNCURL:    inst.VNCURL,
		WorkerURL: inst.WorkerURL,
		Provider:  provider.E2B,
	}
}
