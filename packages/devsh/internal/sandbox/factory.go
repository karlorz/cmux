// Package sandbox provides a factory for creating sandbox providers.
package sandbox

import (
	"fmt"

	"github.com/karlorz/devsh/internal/e2b"
	"github.com/karlorz/devsh/internal/provider"
	"github.com/karlorz/devsh/internal/pvelxc"
	"github.com/karlorz/devsh/internal/vm"
)

// NewProvider creates a SandboxProvider for the given provider name.
// If name is empty, auto-detects from environment variables.
// Returns an error if the provider is unknown or cannot be initialized.
func NewProvider(name string) (provider.SandboxProvider, error) {
	// Normalize and validate provider name
	normalized, err := provider.NormalizeProvider(name)
	if err != nil {
		return nil, err
	}

	// Auto-detect if not specified
	if normalized == "" {
		normalized = provider.DetectFromEnv()
	}

	switch normalized {
	case provider.PveLxc:
		return pvelxc.NewProvider()
	case provider.Morph:
		return vm.NewProvider()
	case provider.E2B:
		return e2b.NewProvider()
	default:
		return nil, fmt.Errorf("unknown provider: %s", normalized)
	}
}

// NewProviderForInstance creates a SandboxProvider based on an instance ID.
// Infers the provider from the instance ID format, falling back to env detection.
func NewProviderForInstance(instanceID string) (provider.SandboxProvider, error) {
	providerName := provider.ProviderForInstanceID(instanceID)
	return NewProvider(providerName)
}

// MustNewProvider creates a SandboxProvider or panics on error.
// Use only in initialization code where failure is fatal.
func MustNewProvider(name string) provider.SandboxProvider {
	p, err := NewProvider(name)
	if err != nil {
		panic(fmt.Sprintf("failed to create provider %q: %v", name, err))
	}
	return p
}
