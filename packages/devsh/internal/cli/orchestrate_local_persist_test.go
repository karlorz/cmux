// internal/cli/orchestrate_local_persist_test.go
package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGetLocalRunsDir(t *testing.T) {
	// Test with custom run dir
	localRunDir = "/custom/path"
	defer func() { localRunDir = "" }()

	result := getLocalRunsDir()
	if result != "/custom/path" {
		t.Errorf("expected /custom/path, got %s", result)
	}

	// Test default path
	localRunDir = ""
	result = getLocalRunsDir()
	if result == "" {
		t.Error("expected non-empty default path")
	}
}

func TestCreateRunDirectory(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	localRunDir = tmpDir
	defer func() { localRunDir = "" }()

	config := &LocalRunConfig{
		OrchestrationID: "test_123",
		Agent:           "claude/haiku-4.5",
		Prompt:          "Test prompt",
		Workspace:       "/tmp/workspace",
		Timeout:         "30m",
		Model:           "",
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
		DevshVersion:    "0.1.22-test",
	}

	runDir, err := createRunDirectory("test_123", config)
	if err != nil {
		t.Fatalf("failed to create run directory: %v", err)
	}

	// Check directory exists
	if _, err := os.Stat(runDir); os.IsNotExist(err) {
		t.Errorf("run directory was not created: %s", runDir)
	}

	// Check config.json exists and is valid
	configPath := filepath.Join(runDir, "config.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("failed to read config.json: %v", err)
	}

	var loadedConfig LocalRunConfig
	if err := json.Unmarshal(data, &loadedConfig); err != nil {
		t.Fatalf("failed to parse config.json: %v", err)
	}

	if loadedConfig.OrchestrationID != "test_123" {
		t.Errorf("expected orchestrationId test_123, got %s", loadedConfig.OrchestrationID)
	}
	if loadedConfig.Agent != "claude/haiku-4.5" {
		t.Errorf("expected agent claude/haiku-4.5, got %s", loadedConfig.Agent)
	}

	// Check events.jsonl exists
	eventsPath := filepath.Join(runDir, "events.jsonl")
	if _, err := os.Stat(eventsPath); os.IsNotExist(err) {
		t.Error("events.jsonl was not created")
	}
}

func TestAppendEventToFile(t *testing.T) {
	tmpDir := t.TempDir()

	// Create events.jsonl
	eventsPath := filepath.Join(tmpDir, "events.jsonl")
	f, _ := os.Create(eventsPath)
	f.Close()

	event := LocalEvent{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Type:      "test_event",
		Message:   "Test message",
	}

	appendEventToFile(tmpDir, event)

	// Read and verify
	data, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatalf("failed to read events file: %v", err)
	}

	var loadedEvent LocalEvent
	if err := json.Unmarshal(data[:len(data)-1], &loadedEvent); err != nil { // -1 for newline
		t.Fatalf("failed to parse event: %v", err)
	}

	if loadedEvent.Type != "test_event" {
		t.Errorf("expected event type test_event, got %s", loadedEvent.Type)
	}
}

func TestUpdateStateFile(t *testing.T) {
	tmpDir := t.TempDir()

	state := &LocalState{
		OrchestrationID: "test_456",
		Status:          "completed",
		Agent:           "codex/gpt-5.1-codex-mini",
		Prompt:          "Test prompt",
		Workspace:       "/tmp/workspace",
		StartedAt:       time.Now().UTC().Format(time.RFC3339),
		CompletedAt:     time.Now().UTC().Format(time.RFC3339),
		DurationMs:      1234,
		Events:          []LocalEvent{},
		RunDir:          tmpDir,
	}

	if err := updateStateFile(tmpDir, state); err != nil {
		t.Fatalf("failed to update state file: %v", err)
	}

	// Read and verify
	statePath := filepath.Join(tmpDir, "state.json")
	data, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("failed to read state file: %v", err)
	}

	var loadedState LocalState
	if err := json.Unmarshal(data, &loadedState); err != nil {
		t.Fatalf("failed to parse state: %v", err)
	}

	if loadedState.Status != "completed" {
		t.Errorf("expected status completed, got %s", loadedState.Status)
	}
	if loadedState.DurationMs != 1234 {
		t.Errorf("expected durationMs 1234, got %d", loadedState.DurationMs)
	}
}

func TestLoadRunSummary(t *testing.T) {
	tmpDir := t.TempDir()

	// Create state.json
	state := &LocalState{
		OrchestrationID: "test_789",
		Status:          "failed",
		Agent:           "gemini/gemini-2.5-pro",
		Prompt:          "Failed task prompt",
		Workspace:       "/tmp/workspace",
		StartedAt:       "2026-03-18T10:00:00Z",
		CompletedAt:     "2026-03-18T10:05:00Z",
		DurationMs:      300000,
		Events:          []LocalEvent{},
	}

	stateData, _ := json.MarshalIndent(state, "", "  ")
	os.WriteFile(filepath.Join(tmpDir, "state.json"), stateData, 0644)

	summary, err := loadRunSummary(tmpDir)
	if err != nil {
		t.Fatalf("failed to load run summary: %v", err)
	}

	if summary.OrchestrationID != "test_789" {
		t.Errorf("expected orchestrationId test_789, got %s", summary.OrchestrationID)
	}
	if summary.Status != "failed" {
		t.Errorf("expected status failed, got %s", summary.Status)
	}
	if summary.Agent != "gemini/gemini-2.5-pro" {
		t.Errorf("expected agent gemini/gemini-2.5-pro, got %s", summary.Agent)
	}
}

func TestLoadRunSummaryFromConfig(t *testing.T) {
	tmpDir := t.TempDir()

	// Create only config.json (simulates in-progress run)
	config := &LocalRunConfig{
		OrchestrationID: "test_inprogress",
		Agent:           "amp/amp-1",
		Prompt:          "In progress task",
		Workspace:       "/tmp/workspace",
		Timeout:         "1h",
		CreatedAt:       "2026-03-18T10:00:00Z",
		DevshVersion:    "0.1.22",
	}

	configData, _ := json.MarshalIndent(config, "", "  ")
	os.WriteFile(filepath.Join(tmpDir, "config.json"), configData, 0644)

	summary, err := loadRunSummary(tmpDir)
	if err != nil {
		t.Fatalf("failed to load run summary: %v", err)
	}

	if summary.OrchestrationID != "test_inprogress" {
		t.Errorf("expected orchestrationId test_inprogress, got %s", summary.OrchestrationID)
	}
	// Without state.json, should default to running
	if summary.Status != "running" {
		t.Errorf("expected status running for in-progress task, got %s", summary.Status)
	}
}

func TestLocalRunConfigSerialization(t *testing.T) {
	config := &LocalRunConfig{
		OrchestrationID: "local_12345",
		Agent:           "claude/opus-4.6",
		Prompt:          "Test prompt with special chars: <>&\"'",
		Workspace:       "/path/to/workspace",
		Timeout:         "2h",
		Model:           "claude-opus-4-6-20250514",
		CreatedAt:       "2026-03-18T12:00:00Z",
		DevshVersion:    "0.1.22",
		ClaudeOptions: &LocalClaudeCLIOptions{
			PluginDirs:      []string{"./plugin-dev"},
			Settings:        "./settings.local.json",
			SettingSources:  "project,local",
			MCPConfigs:      []string{"./mcp.json"},
			AllowedTools:    "Read,Write",
			DisallowedTools: "Bash",
		},
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal config: %v", err)
	}

	var loaded LocalRunConfig
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("failed to unmarshal config: %v", err)
	}

	if loaded.Model != "claude-opus-4-6-20250514" {
		t.Errorf("expected model override to be preserved, got %s", loaded.Model)
	}
	if loaded.DevshVersion != "0.1.22" {
		t.Errorf("expected devsh version to be preserved, got %s", loaded.DevshVersion)
	}
	if loaded.ClaudeOptions == nil {
		t.Fatal("expected Claude options to be preserved")
	}
	if len(loaded.ClaudeOptions.PluginDirs) != 1 || loaded.ClaudeOptions.PluginDirs[0] != "./plugin-dev" {
		t.Fatalf("unexpected PluginDirs: %#v", loaded.ClaudeOptions.PluginDirs)
	}
	if loaded.ClaudeOptions.AllowedTools != "Read,Write" {
		t.Fatalf("unexpected AllowedTools: %q", loaded.ClaudeOptions.AllowedTools)
	}
}

func TestFormatTimeAgo(t *testing.T) {
	tests := []struct {
		name     string
		offset   time.Duration
		contains string
	}{
		{"just now", 30 * time.Second, "just now"},
		{"minutes ago", 5 * time.Minute, "m ago"},
		{"hours ago", 3 * time.Hour, "h ago"},
		{"days ago", 48 * time.Hour, "d ago"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			timestamp := time.Now().Add(-tt.offset).UTC().Format(time.RFC3339)
			result := formatTimeAgo(timestamp)
			if result == timestamp {
				// Invalid timestamp returned as-is
				t.Errorf("expected formatted time, got raw timestamp")
			}
		})
	}
}
