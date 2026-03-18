// internal/cli/orchestrate_local_show_test.go
package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveLocalRunDir(t *testing.T) {
	// Create temp directory structure
	tmpDir := t.TempDir()
	baseDir := filepath.Join(tmpDir, ".devsh", "orchestrations")
	os.MkdirAll(baseDir, 0755)

	// Create some test run directories
	run1 := filepath.Join(baseDir, "local_abc123")
	run2 := filepath.Join(baseDir, "local_def456")
	os.MkdirAll(run1, 0755)
	os.MkdirAll(run2, 0755)

	// Override getLocalRunsDir for testing
	origRunDir := localRunDir
	localRunDir = baseDir
	defer func() { localRunDir = origRunDir }()

	// Test exact match
	resolved, err := resolveLocalRunDir("local_abc123")
	if err != nil {
		t.Errorf("exact match failed: %v", err)
	}
	if resolved != run1 {
		t.Errorf("expected %s, got %s", run1, resolved)
	}

	// Test partial match
	resolved, err = resolveLocalRunDir("abc")
	if err != nil {
		t.Errorf("partial match failed: %v", err)
	}
	if resolved != run1 {
		t.Errorf("expected %s, got %s", run1, resolved)
	}

	// Test no match
	_, err = resolveLocalRunDir("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent run")
	}

	// Test ambiguous match
	run3 := filepath.Join(baseDir, "local_abc789")
	os.MkdirAll(run3, 0755)
	_, err = resolveLocalRunDir("abc")
	if err == nil {
		t.Error("expected error for ambiguous match")
	}
}

func TestShowLocalWithState(t *testing.T) {
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_test123")
	os.MkdirAll(runDir, 0755)

	// Create state.json
	state := LocalState{
		OrchestrationID: "local_test123",
		StartedAt:       "2026-03-18T10:00:00Z",
		CompletedAt:     "2026-03-18T10:05:00Z",
		DurationMs:      300000,
		Status:          "completed",
		Agent:           "claude/haiku-4.5",
		Prompt:          "Test prompt",
		Workspace:       "/test/workspace",
	}
	stateData, _ := json.MarshalIndent(state, "", "  ")
	os.WriteFile(filepath.Join(runDir, "state.json"), stateData, 0644)

	// Create logs
	os.WriteFile(filepath.Join(runDir, "stdout.log"), []byte("stdout content"), 0644)
	os.WriteFile(filepath.Join(runDir, "stderr.log"), []byte("stderr content"), 0644)

	// Test resolving with absolute path
	resolved, err := resolveLocalRunDir(runDir)
	if err != nil {
		t.Errorf("absolute path resolution failed: %v", err)
	}
	if resolved != runDir {
		t.Errorf("expected %s, got %s", runDir, resolved)
	}
}

func TestShowLocalWithConfigOnly(t *testing.T) {
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_inprogress")
	os.MkdirAll(runDir, 0755)

	// Create only config.json (simulates in-progress run)
	config := LocalRunConfig{
		OrchestrationID: "local_inprogress",
		Agent:           "claude/haiku-4.5",
		Prompt:          "In-progress task",
		Workspace:       "/test/workspace",
		Timeout:         "30m",
		CreatedAt:       "2026-03-18T10:00:00Z",
	}
	configData, _ := json.MarshalIndent(config, "", "  ")
	os.WriteFile(filepath.Join(runDir, "config.json"), configData, 0644)

	// Test resolving with absolute path
	resolved, err := resolveLocalRunDir(runDir)
	if err != nil {
		t.Errorf("absolute path resolution failed: %v", err)
	}
	if resolved != runDir {
		t.Errorf("expected %s, got %s", runDir, resolved)
	}
}
