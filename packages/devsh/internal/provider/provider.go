package provider

import (
	"fmt"
	"os"
	"regexp"
	"strings"
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
