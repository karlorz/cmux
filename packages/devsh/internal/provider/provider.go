// Package provider defines interfaces and utilities for sandbox providers.
// This allows different sandbox backends (Morph, PVE-LXC, E2B, Modal) to be used interchangeably.
package provider

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"
)

const (
	Morph  = "morph"
	PveLxc = "pve-lxc"
	E2B    = "e2b"
)

var (
	reDigits   = regexp.MustCompile(`^\d+$`)
	reCmuxVmid = regexp.MustCompile(`^cmux-\d+$`)
	reMorphID  = regexp.MustCompile(`^(cmux|manaflow)_[a-z0-9]+$`)
	reE2BID    = regexp.MustCompile(`^sb[a-z0-9]+$`) // E2B sandbox IDs start with "sb"
)

func HasPveEnv() bool {
	return os.Getenv("PVE_API_URL") != "" && os.Getenv("PVE_API_TOKEN") != ""
}

// HasE2BEnv returns true if E2B_API_KEY is configured.
func HasE2BEnv() bool {
	return os.Getenv("E2B_API_KEY") != ""
}

// DetectFromEnv selects a provider based on environment variables.
// Priority: PVE-LXC (cheapest) > E2B > Morph (fallback).
func DetectFromEnv() string {
	if HasPveEnv() {
		return PveLxc
	}
	if HasE2BEnv() {
		return E2B
	}
	return Morph
}

// NormalizeProvider normalizes and validates a provider string.
// Returns "" for empty input (caller may use auto-detection).
func NormalizeProvider(value string) (string, error) {
	v := strings.TrimSpace(strings.ToLower(value))
	v = strings.ReplaceAll(v, "_", "-")
	if v == "" {
		return "", nil
	}
	switch v {
	case Morph:
		return Morph, nil
	case PveLxc:
		return PveLxc, nil
	case E2B:
		return E2B, nil
	default:
		return "", fmt.Errorf("unknown provider %q (expected %q, %q, or %q)", value, Morph, PveLxc, E2B)
	}
}

// IsPveLxcInstanceID returns true if the instance ID looks like a PVE LXC instance.
// Supported formats:
//   - "pvelxc-<suffix>"
//   - "cmux-<vmid>"
//   - "<vmid>" (numeric)
func IsPveLxcInstanceID(id string) bool {
	normalized := strings.ToLower(strings.TrimSpace(id))
	if strings.HasPrefix(normalized, "pvelxc-") {
		return true
	}
	if reCmuxVmid.MatchString(normalized) {
		return true
	}
	if reDigits.MatchString(normalized) {
		return true
	}
	return false
}

// IsMorphInstanceID returns true if the instance ID looks like a Morph-backed cmux instance.
// Expected format: "cmux_<id>".
func IsMorphInstanceID(id string) bool {
	normalized := strings.ToLower(strings.TrimSpace(id))
	return reMorphID.MatchString(normalized)
}

// IsE2BInstanceID returns true if the instance ID looks like an E2B sandbox.
// Expected format: "sb<alphanumeric>" (e.g., "sba1b2c3d4").
func IsE2BInstanceID(id string) bool {
	normalized := strings.ToLower(strings.TrimSpace(id))
	return reE2BID.MatchString(normalized)
}

// ProviderForInstanceID infers provider from an instance ID, falling back to env detection.
func ProviderForInstanceID(instanceID string) string {
	if IsPveLxcInstanceID(instanceID) {
		return PveLxc
	}
	if IsMorphInstanceID(instanceID) {
		return Morph
	}
	if IsE2BInstanceID(instanceID) {
		return E2B
	}
	return DetectFromEnv()
}

// -----------------------------------------------------------------------------
// Sandbox Provider Interface
// -----------------------------------------------------------------------------

// Sandbox represents a running sandbox instance.
type Sandbox struct {
	ID        string `json:"id"`        // Unique sandbox identifier
	Status    string `json:"status"`    // Current status (pending, running, stopped, etc.)
	VSCodeURL string `json:"vscodeUrl"` // VS Code web URL
	VNCURL    string `json:"vncUrl"`    // VNC access URL
	WorkerURL string `json:"workerUrl"` // Worker/API URL
	ChromeURL string `json:"chromeUrl"` // Chrome DevTools URL
	Provider  string `json:"provider"`  // Provider name (morph, pve-lxc, e2b)
}

// CreateOptions contains options for creating a new sandbox.
type CreateOptions struct {
	// Required
	Repository string // GitHub repository (owner/repo)
	Branch     string // Git branch to checkout

	// Optional
	Template    string            // Template/snapshot to use
	Environment map[string]string // Environment variables
	Timeout     time.Duration     // Maximum sandbox lifetime
	Labels      map[string]string // Metadata labels
}

// ExecResult contains the result of executing a command in a sandbox.
type ExecResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
}

// ListOptions contains options for listing sandboxes.
type ListOptions struct {
	Status string            // Filter by status
	Labels map[string]string // Filter by labels
	Limit  int               // Maximum number of results
}

// SandboxProvider defines the interface for sandbox providers.
// Implementations: MorphProvider, PVELXCProvider, E2BProvider
type SandboxProvider interface {
	// Name returns the provider identifier (e.g., "morph", "pve-lxc").
	Name() string

	// Create creates a new sandbox instance.
	Create(ctx context.Context, opts CreateOptions) (*Sandbox, error)

	// Get retrieves a sandbox by ID.
	Get(ctx context.Context, id string) (*Sandbox, error)

	// Delete terminates and removes a sandbox.
	Delete(ctx context.Context, id string) error

	// Exec executes a command in a sandbox.
	Exec(ctx context.Context, id string, command string) (*ExecResult, error)

	// List returns sandboxes matching the given options.
	List(ctx context.Context, opts ListOptions) ([]Sandbox, error)

	// WaitReady blocks until the sandbox is ready or timeout.
	WaitReady(ctx context.Context, id string, timeout time.Duration) (*Sandbox, error)
}

// Health contains health status for a provider.
type Health struct {
	Available  bool   `json:"available"`
	Configured bool   `json:"configured"`
	Slots      int    `json:"slots,omitempty"` // Available capacity
	Error      string `json:"error,omitempty"`
}

// HealthChecker is an optional interface for providers that support health checks.
type HealthChecker interface {
	// Health returns the current health status of the provider.
	Health(ctx context.Context) (*Health, error)
}

// StreamExecer is an optional interface for providers that support streaming command output.
type StreamExecer interface {
	// ExecStream executes a command and streams output to the provided writers.
	ExecStream(ctx context.Context, id string, command string, stdout, stderr func(line string)) error
}
