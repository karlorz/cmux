// internal/cli/orchestrate_selftest_test.go
package cli

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCheckWorkspaceExists(t *testing.T) {
	// Test with existing directory
	tmpDir := t.TempDir()
	result := checkWorkspaceExists(tmpDir)
	if result.Status != "pass" {
		t.Errorf("Expected pass for existing directory, got %s: %s", result.Status, result.Message)
	}

	// Test with non-existing directory
	result = checkWorkspaceExists("/non/existent/path/12345")
	if result.Status != "fail" {
		t.Errorf("Expected fail for non-existing directory, got %s", result.Status)
	}
}

func TestCheckIsGitRepo(t *testing.T) {
	tmpDir := t.TempDir()

	// Test without .git directory
	result := checkIsGitRepo(tmpDir)
	if result.Status != "warn" {
		t.Errorf("Expected warn for non-git directory, got %s", result.Status)
	}

	// Test with .git directory
	gitDir := filepath.Join(tmpDir, ".git")
	if err := os.Mkdir(gitDir, 0755); err != nil {
		t.Fatal(err)
	}
	result = checkIsGitRepo(tmpDir)
	if result.Status != "pass" {
		t.Errorf("Expected pass for git directory, got %s", result.Status)
	}
}

func TestCheckAgentInstructions(t *testing.T) {
	tmpDir := t.TempDir()

	// Test without instruction files
	result := checkAgentInstructions(tmpDir)
	if result.Status != "warn" {
		t.Errorf("Expected warn for missing instruction files, got %s", result.Status)
	}

	// Test with CLAUDE.md
	claudeMd := filepath.Join(tmpDir, "CLAUDE.md")
	if err := os.WriteFile(claudeMd, []byte("# Instructions"), 0644); err != nil {
		t.Fatal(err)
	}
	result = checkAgentInstructions(tmpDir)
	if result.Status != "pass" {
		t.Errorf("Expected pass with CLAUDE.md, got %s", result.Status)
	}
}

func TestGetAgentCLIName(t *testing.T) {
	tests := []struct {
		agent    string
		expected string
	}{
		{"claude", "claude"},
		{"codex", "codex"},
		{"gemini", "gemini"},
		{"opencode", "opencode"},
		{"amp", "amp"},
		{"unknown", "unknown"},
	}

	for _, tt := range tests {
		result := getAgentCLIName(tt.agent)
		if result != tt.expected {
			t.Errorf("getAgentCLIName(%s) = %s, expected %s", tt.agent, result, tt.expected)
		}
	}
}

func TestGetAgentEnvVars(t *testing.T) {
	tests := []struct {
		agent       string
		expectedLen int
	}{
		{"claude", 2},
		{"codex", 2},
		{"gemini", 2},
		{"opencode", 2},
		{"amp", 2},
		{"unknown", 0},
	}

	for _, tt := range tests {
		result := getAgentEnvVars(tt.agent)
		if len(result) != tt.expectedLen {
			t.Errorf("getAgentEnvVars(%s) has %d vars, expected %d", tt.agent, len(result), tt.expectedLen)
		}
	}
}

func TestCheckAgentCredentials(t *testing.T) {
	// Save and restore env
	origKey := os.Getenv("ANTHROPIC_API_KEY")
	defer os.Setenv("ANTHROPIC_API_KEY", origKey)

	// Test without credentials
	os.Unsetenv("ANTHROPIC_API_KEY")
	os.Unsetenv("CLAUDE_CODE_OAUTH_TOKEN")
	result := checkAgentCredentials("claude")
	if result.Status != "fail" {
		t.Errorf("Expected fail without credentials, got %s", result.Status)
	}

	// Test with credentials
	os.Setenv("ANTHROPIC_API_KEY", "test-key")
	result = checkAgentCredentials("claude")
	if result.Status != "pass" {
		t.Errorf("Expected pass with credentials, got %s: %s", result.Status, result.Message)
	}
}
