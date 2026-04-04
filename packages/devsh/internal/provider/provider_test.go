package provider

import (
	"os"
	"testing"
)

func TestConstants(t *testing.T) {
	if Morph != "morph" {
		t.Errorf("expected Morph='morph', got '%s'", Morph)
	}
	if PveLxc != "pve-lxc" {
		t.Errorf("expected PveLxc='pve-lxc', got '%s'", PveLxc)
	}
}

func TestHasPveEnv(t *testing.T) {
	// Save original values
	origURL := os.Getenv("PVE_API_URL")
	origToken := os.Getenv("PVE_API_TOKEN")
	defer func() {
		if origURL != "" {
			os.Setenv("PVE_API_URL", origURL)
		} else {
			os.Unsetenv("PVE_API_URL")
		}
		if origToken != "" {
			os.Setenv("PVE_API_TOKEN", origToken)
		} else {
			os.Unsetenv("PVE_API_TOKEN")
		}
	}()

	// Test with both set
	os.Setenv("PVE_API_URL", "http://test")
	os.Setenv("PVE_API_TOKEN", "test-token")
	if !HasPveEnv() {
		t.Error("expected HasPveEnv() true when both vars set")
	}

	// Test with only URL
	os.Unsetenv("PVE_API_TOKEN")
	if HasPveEnv() {
		t.Error("expected HasPveEnv() false when only URL set")
	}

	// Test with only token
	os.Unsetenv("PVE_API_URL")
	os.Setenv("PVE_API_TOKEN", "test-token")
	if HasPveEnv() {
		t.Error("expected HasPveEnv() false when only token set")
	}

	// Test with neither
	os.Unsetenv("PVE_API_TOKEN")
	if HasPveEnv() {
		t.Error("expected HasPveEnv() false when neither set")
	}
}

func TestDetectFromEnv(t *testing.T) {
	origURL := os.Getenv("PVE_API_URL")
	origToken := os.Getenv("PVE_API_TOKEN")
	origE2BAPIKey := os.Getenv("E2B_API_KEY")
	defer func() {
		if origURL != "" {
			os.Setenv("PVE_API_URL", origURL)
		} else {
			os.Unsetenv("PVE_API_URL")
		}
		if origToken != "" {
			os.Setenv("PVE_API_TOKEN", origToken)
		} else {
			os.Unsetenv("PVE_API_TOKEN")
		}
		if origE2BAPIKey != "" {
			os.Setenv("E2B_API_KEY", origE2BAPIKey)
		} else {
			os.Unsetenv("E2B_API_KEY")
		}
	}()

	// With PVE env
	os.Setenv("PVE_API_URL", "http://test")
	os.Setenv("PVE_API_TOKEN", "test-token")
	os.Unsetenv("E2B_API_KEY")
	if p := DetectFromEnv(); p != PveLxc {
		t.Errorf("expected pve-lxc with PVE env, got '%s'", p)
	}

	// Without PVE env
	os.Unsetenv("PVE_API_URL")
	os.Unsetenv("PVE_API_TOKEN")
	os.Unsetenv("E2B_API_KEY")
	if p := DetectFromEnv(); p != Morph {
		t.Errorf("expected morph without PVE env, got '%s'", p)
	}
}

func TestNormalizeProvider(t *testing.T) {
	tests := []struct {
		input    string
		expected string
		hasErr   bool
	}{
		{"", "", false},
		{"morph", "morph", false},
		{"MORPH", "morph", false},
		{"  morph  ", "morph", false},
		{"pve-lxc", "pve-lxc", false},
		{"PVE-LXC", "pve-lxc", false},
		{"pve_lxc", "pve-lxc", false},
		{"PVE_LXC", "pve-lxc", false},
		{"invalid", "", true},
		{"docker", "", true},
	}

	for _, tt := range tests {
		result, err := NormalizeProvider(tt.input)
		if tt.hasErr {
			if err == nil {
				t.Errorf("NormalizeProvider(%q): expected error, got nil", tt.input)
			}
		} else {
			if err != nil {
				t.Errorf("NormalizeProvider(%q): unexpected error: %v", tt.input, err)
			}
			if result != tt.expected {
				t.Errorf("NormalizeProvider(%q): expected '%s', got '%s'", tt.input, tt.expected, result)
			}
		}
	}
}

func TestIsPveLxcInstanceID(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"pvelxc-abc123", true},
		{"PVELXC-ABC123", true},
		{"cmux-123", true},
		{"cmux-9999", true},
		{"123", true},
		{"9999", true},
		{"cmux_abc123", false},
		{"manaflow_abc123", false},
		{"morphvm_abc", false},
		{"random-id", false},
		{"", false},
	}

	for _, tt := range tests {
		result := IsPveLxcInstanceID(tt.input)
		if result != tt.expected {
			t.Errorf("IsPveLxcInstanceID(%q): expected %v, got %v", tt.input, tt.expected, result)
		}
	}
}

func TestIsMorphInstanceID(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"cmux_abc123", true},
		{"manaflow_xyz789", true},
		{"CMUX_ABC123", true},
		{"cmux-123", false},
		{"pvelxc-abc", false},
		{"123", false},
		{"random", false},
		{"", false},
	}

	for _, tt := range tests {
		result := IsMorphInstanceID(tt.input)
		if result != tt.expected {
			t.Errorf("IsMorphInstanceID(%q): expected %v, got %v", tt.input, tt.expected, result)
		}
	}
}

func TestProviderForInstanceID(t *testing.T) {
	origURL := os.Getenv("PVE_API_URL")
	origToken := os.Getenv("PVE_API_TOKEN")
	origE2BAPIKey := os.Getenv("E2B_API_KEY")
	defer func() {
		if origURL != "" {
			os.Setenv("PVE_API_URL", origURL)
		} else {
			os.Unsetenv("PVE_API_URL")
		}
		if origToken != "" {
			os.Setenv("PVE_API_TOKEN", origToken)
		} else {
			os.Unsetenv("PVE_API_TOKEN")
		}
		if origE2BAPIKey != "" {
			os.Setenv("E2B_API_KEY", origE2BAPIKey)
		} else {
			os.Unsetenv("E2B_API_KEY")
		}
	}()

	// Clear provider env for consistent fallback
	os.Unsetenv("PVE_API_URL")
	os.Unsetenv("PVE_API_TOKEN")
	os.Unsetenv("E2B_API_KEY")

	tests := []struct {
		input    string
		expected string
	}{
		{"pvelxc-abc123", PveLxc},
		{"cmux-123", PveLxc},
		{"123", PveLxc},
		{"cmux_abc123", Morph},
		{"manaflow_xyz", Morph},
		{"unknown-format", Morph}, // Fallback to env detection (morph without PVE env)
	}

	for _, tt := range tests {
		result := ProviderForInstanceID(tt.input)
		if result != tt.expected {
			t.Errorf("ProviderForInstanceID(%q): expected '%s', got '%s'", tt.input, tt.expected, result)
		}
	}
}
