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

	state := LocalState{
		OrchestrationID: "local_test123",
		StartedAt:       "2026-03-18T10:00:00Z",
		CompletedAt:     "2026-03-18T10:05:00Z",
		DurationMs:      300000,
		Status:          "completed",
		Agent:           "claude/haiku-4.5",
		Prompt:          "Test prompt",
		Workspace:       "/test/workspace",
		Events: []LocalEvent{{
			Timestamp: "2026-03-18T10:00:01Z",
			Type:      "task_started",
			Message:   "started",
		}},
	}
	stateData, _ := json.MarshalIndent(state, "", "  ")
	os.WriteFile(filepath.Join(runDir, "state.json"), stateData, 0644)
	config := LocalRunConfig{
		OrchestrationID: "local_test123",
		Agent:           "claude/haiku-4.5",
		SelectedVariant: "max",
		Prompt:          "Test prompt",
		Workspace:       "/test/workspace",
		Timeout:         "45m",
		Model:           "claude-opus-4-6",
		CreatedAt:       "2026-03-18T10:00:00Z",
		DevshVersion:    "1.2.3",
		GitBranch:       "feat/local-runs",
		GitCommit:       "abc123def456",
	}
	configData, _ := json.MarshalIndent(config, "", "  ")
	os.WriteFile(filepath.Join(runDir, "config.json"), configData, 0644)
	session := LocalSessionInfo{
		Agent:                "claude/haiku-4.5",
		SessionID:            "session_123",
		Workspace:            "/test/workspace",
		InjectionMode:        "active",
		LastInjectionAt:      "2026-03-18T10:03:00Z",
		InjectionCount:       2,
		CheckpointRef:        "cp_local_test123_1",
		CheckpointGeneration: 1,
		CheckpointLabel:      "before-refactor",
		CheckpointCreatedAt:  1710757380000,
	}
	sessionData, _ := json.MarshalIndent(session, "", "  ")
	os.WriteFile(filepath.Join(runDir, "session.json"), sessionData, 0644)
	os.WriteFile(filepath.Join(runDir, "stdout.log"), []byte("stdout content"), 0644)
	os.WriteFile(filepath.Join(runDir, "stderr.log"), []byte("stderr content"), 0644)

	resolved, err := resolveLocalRunDir(runDir)
	if err != nil {
		t.Errorf("absolute path resolution failed: %v", err)
	}
	if resolved != runDir {
		t.Errorf("expected %s, got %s", runDir, resolved)
	}

	detail, err := loadLocalRunDetail(runDir, true, true)
	if err != nil {
		t.Fatalf("loadLocalRunDetail failed: %v", err)
	}
	if detail.Status != "completed" {
		t.Fatalf("expected completed status, got %s", detail.Status)
	}
	if detail.Stdout != "stdout content" {
		t.Fatalf("expected stdout content, got %q", detail.Stdout)
	}
	if detail.Timeout != "45m" {
		t.Fatalf("expected timeout from config, got %q", detail.Timeout)
	}
	if detail.SelectedVariant != "max" {
		t.Fatalf("expected selected variant, got %q", detail.SelectedVariant)
	}
	if detail.Model != "claude-opus-4-6" {
		t.Fatalf("expected model, got %q", detail.Model)
	}
	if detail.GitBranch != "feat/local-runs" {
		t.Fatalf("expected git branch, got %q", detail.GitBranch)
	}
	if detail.GitCommit != "abc123def456" {
		t.Fatalf("expected git commit, got %q", detail.GitCommit)
	}
	if detail.DevshVersion != "1.2.3" {
		t.Fatalf("expected devsh version, got %q", detail.DevshVersion)
	}
	if detail.SessionID != "session_123" {
		t.Fatalf("expected session id, got %q", detail.SessionID)
	}
	if detail.InjectionMode != "active" {
		t.Fatalf("expected injection mode, got %q", detail.InjectionMode)
	}
	if detail.LastInjectionAt != "2026-03-18T10:03:00Z" {
		t.Fatalf("expected last injection timestamp, got %q", detail.LastInjectionAt)
	}
	if detail.InjectionCount != 2 {
		t.Fatalf("expected injection count 2, got %d", detail.InjectionCount)
	}
	if detail.CheckpointRef != "cp_local_test123_1" {
		t.Fatalf("expected checkpoint ref, got %q", detail.CheckpointRef)
	}
	if detail.CheckpointGeneration != 1 {
		t.Fatalf("expected checkpoint generation 1, got %d", detail.CheckpointGeneration)
	}
	if detail.CheckpointLabel != "before-refactor" {
		t.Fatalf("expected checkpoint label, got %q", detail.CheckpointLabel)
	}
	if detail.CheckpointCreatedAt != 1710757380000 {
		t.Fatalf("expected checkpoint created at, got %d", detail.CheckpointCreatedAt)
	}
	if len(detail.Events) != 1 || detail.Events[0].Type != "task_started" {
		t.Fatalf("expected event timeline from state, got %+v", detail.Events)
	}
}

func TestShowLocalWithConfigOnly(t *testing.T) {
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_inprogress")
	os.MkdirAll(runDir, 0755)

	config := LocalRunConfig{
		OrchestrationID: "local_inprogress",
		Agent:           "claude/haiku-4.5",
		SelectedVariant: "high",
		Prompt:          "In-progress task",
		Workspace:       "/test/workspace",
		Timeout:         "30m",
		Model:           "claude-sonnet-4-6",
		CreatedAt:       "2026-03-18T10:00:00Z",
		DevshVersion:    "2.0.0",
		GitBranch:       "main",
		GitCommit:       "fedcba654321",
	}
	configData, _ := json.MarshalIndent(config, "", "  ")
	os.WriteFile(filepath.Join(runDir, "config.json"), configData, 0644)
	session := LocalSessionInfo{
		Agent:                "claude/haiku-4.5",
		SessionID:            "session_running_123",
		Workspace:            "/test/workspace",
		InjectionMode:        "active",
		LastInjectionAt:      "2026-03-18T10:02:00Z",
		InjectionCount:       1,
		CheckpointRef:        "cp_local_inprogress_2",
		CheckpointGeneration: 2,
		CheckpointLabel:      "mid-run",
		CheckpointCreatedAt:  1710757320000,
	}
	sessionData, _ := json.MarshalIndent(session, "", "  ")
	os.WriteFile(filepath.Join(runDir, "session.json"), sessionData, 0644)
	os.WriteFile(filepath.Join(runDir, "stdout.log"), []byte("still running"), 0644)
	eventsPath := filepath.Join(runDir, "events.jsonl")
	os.WriteFile(eventsPath, []byte("{\"timestamp\":\"2026-03-18T10:00:01Z\",\"type\":\"task_started\",\"message\":\"started\"}\n"), 0644)

	resolved, err := resolveLocalRunDir(runDir)
	if err != nil {
		t.Errorf("absolute path resolution failed: %v", err)
	}
	if resolved != runDir {
		t.Errorf("expected %s, got %s", runDir, resolved)
	}

	detail, err := loadLocalRunDetail(runDir, true, true)
	if err != nil {
		t.Fatalf("loadLocalRunDetail failed: %v", err)
	}
	if detail.Status != "running" {
		t.Fatalf("expected running status, got %s", detail.Status)
	}
	if detail.Timeout != "30m" {
		t.Fatalf("expected timeout 30m, got %s", detail.Timeout)
	}
	if detail.SelectedVariant != "high" {
		t.Fatalf("expected selected variant, got %q", detail.SelectedVariant)
	}
	if detail.Model != "claude-sonnet-4-6" {
		t.Fatalf("expected model, got %q", detail.Model)
	}
	if detail.GitBranch != "main" {
		t.Fatalf("expected git branch, got %q", detail.GitBranch)
	}
	if detail.GitCommit != "fedcba654321" {
		t.Fatalf("expected git commit, got %q", detail.GitCommit)
	}
	if detail.DevshVersion != "2.0.0" {
		t.Fatalf("expected devsh version, got %q", detail.DevshVersion)
	}
	if detail.SessionID != "session_running_123" {
		t.Fatalf("expected session id, got %q", detail.SessionID)
	}
	if detail.InjectionMode != "active" {
		t.Fatalf("expected injection mode, got %q", detail.InjectionMode)
	}
	if detail.LastInjectionAt != "2026-03-18T10:02:00Z" {
		t.Fatalf("expected last injection timestamp, got %q", detail.LastInjectionAt)
	}
	if detail.InjectionCount != 1 {
		t.Fatalf("expected injection count 1, got %d", detail.InjectionCount)
	}
	if detail.CheckpointRef != "cp_local_inprogress_2" {
		t.Fatalf("expected checkpoint ref, got %q", detail.CheckpointRef)
	}
	if detail.CheckpointGeneration != 2 {
		t.Fatalf("expected checkpoint generation 2, got %d", detail.CheckpointGeneration)
	}
	if detail.CheckpointLabel != "mid-run" {
		t.Fatalf("expected checkpoint label, got %q", detail.CheckpointLabel)
	}
	if detail.CheckpointCreatedAt != 1710757320000 {
		t.Fatalf("expected checkpoint created at, got %d", detail.CheckpointCreatedAt)
	}
	if detail.Stdout != "still running" {
		t.Fatalf("expected stdout log, got %q", detail.Stdout)
	}
	if len(detail.Events) != 1 || detail.Events[0].Message != "started" {
		t.Fatalf("expected event timeline from events.jsonl, got %+v", detail.Events)
	}
}
