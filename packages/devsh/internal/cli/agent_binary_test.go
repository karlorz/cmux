package cli

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func writeExecutable(t *testing.T, dir, name string) string {
	t.Helper()

	path := filepath.Join(dir, name)
	content := "#!/bin/sh\nexit 0\n"
	if runtime.GOOS == "windows" {
		content = "@echo off\r\nexit /b 0\r\n"
	}

	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write executable %s: %v", path, err)
	}
	if runtime.GOOS != "windows" {
		if err := os.Chmod(path, 0o755); err != nil {
			t.Fatalf("chmod executable %s: %v", path, err)
		}
	}

	return path
}

func TestResolveAgentCLIPathUsesClaudeOverride(t *testing.T) {
	tmpDir := t.TempDir()
	claudePath := writeExecutable(t, tmpDir, "claude-custom")

	t.Setenv("DEVSH_CLAUDE_BIN", claudePath)
	t.Setenv("CMUX_CLAUDE_BIN", "")

	resolved, err := resolveAgentCLIPath("claude")
	if err != nil {
		t.Fatalf("resolveAgentCLIPath returned error: %v", err)
	}

	if resolved != claudePath {
		t.Fatalf("resolved path = %q, want %q", resolved, claudePath)
	}
}

func TestResolveAgentCLIPathPrefersDevshOverride(t *testing.T) {
	tmpDir := t.TempDir()
	devshClaude := writeExecutable(t, tmpDir, "claude-devsh")
	cmuxClaude := writeExecutable(t, tmpDir, "claude-cmux")

	t.Setenv("DEVSH_CLAUDE_BIN", devshClaude)
	t.Setenv("CMUX_CLAUDE_BIN", cmuxClaude)

	resolved, err := resolveAgentCLIPath("claude")
	if err != nil {
		t.Fatalf("resolveAgentCLIPath returned error: %v", err)
	}

	if resolved != devshClaude {
		t.Fatalf("resolved path = %q, want %q", resolved, devshClaude)
	}
}

func TestResolveAgentCLIPathErrorsOnInvalidClaudeOverride(t *testing.T) {
	t.Setenv("DEVSH_CLAUDE_BIN", filepath.Join(t.TempDir(), "missing-claude"))
	t.Setenv("CMUX_CLAUDE_BIN", "")

	_, err := resolveAgentCLIPath("claude")
	if err == nil {
		t.Fatal("expected error for invalid override, got nil")
	}
}
