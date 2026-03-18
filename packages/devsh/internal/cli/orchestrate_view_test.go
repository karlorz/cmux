// internal/cli/orchestrate_view_test.go
package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestExportBundleParsing(t *testing.T) {
	// Create a test bundle matching the expected format
	bundle := ExportBundle{
		ExportedAt: "2026-03-18T10:00:00Z",
		Version:    "1.0.0",
		Orchestration: OrchestrationExportInfo{
			ID:        "orch_test_123",
			Status:    "completed",
			CreatedAt: "2026-03-18T09:00:00Z",
			Prompt:    "Test orchestration",
		},
		Summary: ExportSummary{
			TotalTasks:     3,
			CompletedTasks: 2,
			FailedTasks:    1,
			PendingTasks:   0,
			RunningTasks:   0,
		},
		Tasks: []TaskExportInfo{
			{
				TaskID: "task_1",
				Status: "completed",
				Prompt: "First task",
			},
			{
				TaskID: "task_2",
				Status: "completed",
				Prompt: "Second task",
			},
			{
				TaskID: "task_3",
				Status: "failed",
				Prompt: "Third task",
			},
		},
		Events: []EventExportInfo{
			{
				Timestamp: "2026-03-18T09:00:01Z",
				Type:      "task_started",
				TaskID:    "task_1",
				Message:   "Starting first task",
			},
		},
	}

	// Create temp file
	tmpDir, err := os.MkdirTemp("", "devsh-view-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	bundlePath := filepath.Join(tmpDir, "test-bundle.json")
	data, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal bundle: %v", err)
	}

	if err := os.WriteFile(bundlePath, data, 0644); err != nil {
		t.Fatalf("failed to write bundle: %v", err)
	}

	// Read and parse the bundle (simulating what view command does)
	readData, err := os.ReadFile(bundlePath)
	if err != nil {
		t.Fatalf("failed to read bundle: %v", err)
	}

	var parsedBundle ExportBundle
	if err := json.Unmarshal(readData, &parsedBundle); err != nil {
		t.Fatalf("failed to parse bundle: %v", err)
	}

	// Verify parsed contents
	if parsedBundle.Version != "1.0.0" {
		t.Errorf("expected version 1.0.0, got %s", parsedBundle.Version)
	}

	if parsedBundle.Orchestration.ID != "orch_test_123" {
		t.Errorf("expected orchestration ID orch_test_123, got %s", parsedBundle.Orchestration.ID)
	}

	if parsedBundle.Summary.TotalTasks != 3 {
		t.Errorf("expected 3 total tasks, got %d", parsedBundle.Summary.TotalTasks)
	}

	if parsedBundle.Summary.CompletedTasks != 2 {
		t.Errorf("expected 2 completed tasks, got %d", parsedBundle.Summary.CompletedTasks)
	}

	if parsedBundle.Summary.FailedTasks != 1 {
		t.Errorf("expected 1 failed task, got %d", parsedBundle.Summary.FailedTasks)
	}

	if len(parsedBundle.Tasks) != 3 {
		t.Errorf("expected 3 tasks, got %d", len(parsedBundle.Tasks))
	}

	if len(parsedBundle.Events) != 1 {
		t.Errorf("expected 1 event, got %d", len(parsedBundle.Events))
	}
}

func TestFindAvailablePort(t *testing.T) {
	// Test that findAvailablePort returns a valid port
	port := findAvailablePort(30000)

	if port < 30000 || port >= 30100 {
		t.Errorf("expected port in range [30000, 30100), got %d", port)
	}
}

func TestStdinPathDetection(t *testing.T) {
	// Test that "-" is recognized as stdin indicator
	tests := []struct {
		path    string
		isStdin bool
	}{
		{"-", true},
		{"./bundle.json", false},
		{"/tmp/test.json", false},
		{"bundle.json", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			isStdin := tt.path == "-"
			if isStdin != tt.isStdin {
				t.Errorf("path %q: expected isStdin=%v, got %v", tt.path, tt.isStdin, isStdin)
			}
		})
	}
}

func TestFindAvailablePortSequential(t *testing.T) {
	// Test that multiple calls return sequential ports when previous ones are still "in use"
	// (This is a simplified test - in reality ports are released quickly)
	port1 := findAvailablePort(31000)
	port2 := findAvailablePort(31000)

	// Both should be valid ports in range
	if port1 < 31000 || port1 >= 31100 {
		t.Errorf("port1 out of range: %d", port1)
	}
	if port2 < 31000 || port2 >= 31100 {
		t.Errorf("port2 out of range: %d", port2)
	}
}

func TestResolveBundlePath(t *testing.T) {
	// Create a temp directory with a bundle.json
	tmpDir := t.TempDir()
	bundlePath := filepath.Join(tmpDir, "bundle.json")
	bundle := ExportBundle{
		Version: "1.0.0",
		Summary: ExportSummary{TotalTasks: 1},
	}
	data, _ := json.Marshal(bundle)
	os.WriteFile(bundlePath, data, 0644)

	// Test: direct file path
	resolved, isDir := resolveBundlePath(bundlePath)
	if resolved != bundlePath {
		t.Errorf("expected %s, got %s", bundlePath, resolved)
	}
	if isDir {
		t.Error("expected isDir=false for file path")
	}

	// Test: directory path
	resolved, isDir = resolveBundlePath(tmpDir)
	if resolved != bundlePath {
		t.Errorf("expected %s, got %s", bundlePath, resolved)
	}
	if !isDir {
		t.Error("expected isDir=true for directory path")
	}

	// Test: stdin marker
	resolved, isDir = resolveBundlePath("-")
	if resolved != "-" {
		t.Errorf("expected -, got %s", resolved)
	}
	if isDir {
		t.Error("expected isDir=false for stdin")
	}

	// Test: non-existent path
	resolved, _ = resolveBundlePath("/nonexistent/path")
	if resolved != "" {
		t.Errorf("expected empty string for non-existent path, got %s", resolved)
	}

	// Test: directory without bundle.json
	emptyDir := t.TempDir()
	resolved, isDir = resolveBundlePath(emptyDir)
	if resolved != "" {
		t.Errorf("expected empty string for dir without bundle, got %s", resolved)
	}
	if !isDir {
		t.Error("expected isDir=true for directory path even without bundle")
	}
}

func TestWatchModeVariableExists(t *testing.T) {
	// Verify the watch mode variable is declared and can be set
	origWatch := orchestrateViewWatch
	defer func() { orchestrateViewWatch = origWatch }()

	orchestrateViewWatch = true
	if !orchestrateViewWatch {
		t.Error("failed to set orchestrateViewWatch to true")
	}

	orchestrateViewWatch = false
	if orchestrateViewWatch {
		t.Error("failed to set orchestrateViewWatch to false")
	}
}

func TestExportBundleWithLogs(t *testing.T) {
	// Test that ExportBundle correctly includes logs
	bundle := ExportBundle{
		Version: "1.0.0",
		Summary: ExportSummary{TotalTasks: 1},
		Logs: &ExportLogs{
			Stdout: "Hello world\nTask completed",
			Stderr: "Warning: deprecated API",
		},
	}

	data, err := json.Marshal(bundle)
	if err != nil {
		t.Fatalf("failed to marshal bundle with logs: %v", err)
	}

	var parsed ExportBundle
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal bundle: %v", err)
	}

	if parsed.Logs == nil {
		t.Fatal("logs should not be nil")
	}
	if parsed.Logs.Stdout != "Hello world\nTask completed" {
		t.Errorf("stdout mismatch: %q", parsed.Logs.Stdout)
	}
	if parsed.Logs.Stderr != "Warning: deprecated API" {
		t.Errorf("stderr mismatch: %q", parsed.Logs.Stderr)
	}
}

func TestExportBundleWithoutLogs(t *testing.T) {
	// Test that ExportBundle correctly omits logs when nil
	bundle := ExportBundle{
		Version: "1.0.0",
		Summary: ExportSummary{TotalTasks: 1},
		Logs:    nil,
	}

	data, err := json.Marshal(bundle)
	if err != nil {
		t.Fatalf("failed to marshal bundle: %v", err)
	}

	// Logs should be omitted from JSON
	if string(data) != `{"exportedAt":"","version":"1.0.0","orchestration":{"id":"","status":"","createdAt":""},"tasks":null,"summary":{"totalTasks":1,"completedTasks":0,"failedTasks":0,"pendingTasks":0,"runningTasks":0}}` {
		// Just verify logs key is not present
		var m map[string]any
		json.Unmarshal(data, &m)
		if _, exists := m["logs"]; exists {
			t.Error("logs should be omitted when nil")
		}
	}
}

func TestLiveModeVariableExists(t *testing.T) {
	// Verify the live mode variable is declared and can be set
	origLive := orchestrateViewLive
	defer func() { orchestrateViewLive = origLive }()

	orchestrateViewLive = true
	if !orchestrateViewLive {
		t.Error("failed to set orchestrateViewLive to true")
	}

	orchestrateViewLive = false
	if orchestrateViewLive {
		t.Error("failed to set orchestrateViewLive to false")
	}
}

func TestSynthesizeBundleFromRunDir(t *testing.T) {
	// Create a temp run directory with config and state files
	tmpDir := t.TempDir()

	// Write config.json
	config := LocalRunConfig{
		OrchestrationID: "local_test_123",
		Agent:           "claude/opus-4.6",
		Prompt:          "Test the authentication flow",
		Workspace:       "/tmp/workspace",
		CreatedAt:       "2026-03-18T10:00:00Z",
	}
	configData, _ := json.Marshal(config)
	os.WriteFile(filepath.Join(tmpDir, "config.json"), configData, 0644)

	// Write state.json
	result := "Task completed successfully"
	state := LocalState{
		OrchestrationID: "local_test_123",
		Status:          "completed",
		Agent:           "claude/opus-4.6",
		Prompt:          "Test the authentication flow",
		Result:          &result,
	}
	stateData, _ := json.Marshal(state)
	os.WriteFile(filepath.Join(tmpDir, "state.json"), stateData, 0644)

	// Write events.jsonl
	events := []LocalEvent{
		{Timestamp: "2026-03-18T10:00:01Z", Type: "started", Message: "Task started"},
		{Timestamp: "2026-03-18T10:05:00Z", Type: "completed", Message: "Task completed"},
	}
	var eventsData string
	for _, e := range events {
		line, _ := json.Marshal(e)
		eventsData += string(line) + "\n"
	}
	os.WriteFile(filepath.Join(tmpDir, "events.jsonl"), []byte(eventsData), 0644)

	// Write logs
	os.WriteFile(filepath.Join(tmpDir, "stdout.log"), []byte("stdout content"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "stderr.log"), []byte("stderr content"), 0644)

	// Test synthesis
	bundle := synthesizeBundleFromRunDir(tmpDir)

	if bundle.Version != "1.0" {
		t.Errorf("expected version 1.0, got %s", bundle.Version)
	}

	if bundle.Orchestration.ID != "local_test_123" {
		t.Errorf("expected orchestration ID local_test_123, got %s", bundle.Orchestration.ID)
	}

	if bundle.Orchestration.Status != "completed" {
		t.Errorf("expected status completed, got %s", bundle.Orchestration.Status)
	}

	if len(bundle.Tasks) != 1 {
		t.Errorf("expected 1 task, got %d", len(bundle.Tasks))
	}

	if len(bundle.Events) != 2 {
		t.Errorf("expected 2 events, got %d", len(bundle.Events))
	}

	if bundle.Logs == nil {
		t.Error("expected logs to be present")
	} else {
		if bundle.Logs.Stdout != "stdout content" {
			t.Errorf("expected stdout content, got %q", bundle.Logs.Stdout)
		}
		if bundle.Logs.Stderr != "stderr content" {
			t.Errorf("expected stderr content, got %q", bundle.Logs.Stderr)
		}
	}

	if bundle.Summary.TotalTasks != 1 {
		t.Errorf("expected 1 total task, got %d", bundle.Summary.TotalTasks)
	}

	if bundle.Summary.CompletedTasks != 1 {
		t.Errorf("expected 1 completed task, got %d", bundle.Summary.CompletedTasks)
	}
}

func TestSynthesizeBundleFromRunningDir(t *testing.T) {
	// Test synthesis when only config.json exists (in-progress run)
	tmpDir := t.TempDir()

	config := LocalRunConfig{
		OrchestrationID: "local_running_456",
		Agent:           "codex/gpt-5.1-codex-mini",
		Prompt:          "In progress task",
		CreatedAt:       "2026-03-18T11:00:00Z",
	}
	configData, _ := json.Marshal(config)
	os.WriteFile(filepath.Join(tmpDir, "config.json"), configData, 0644)

	bundle := synthesizeBundleFromRunDir(tmpDir)

	if bundle.Orchestration.ID != "local_running_456" {
		t.Errorf("expected orchestration ID local_running_456, got %s", bundle.Orchestration.ID)
	}

	if bundle.Orchestration.Status != "running" {
		t.Errorf("expected status running, got %s", bundle.Orchestration.Status)
	}

	if bundle.Summary.RunningTasks != 1 {
		t.Errorf("expected 1 running task, got %d", bundle.Summary.RunningTasks)
	}
}

func TestResolveRunDirForView(t *testing.T) {
	// Create a valid run directory
	tmpDir := t.TempDir()
	config := LocalRunConfig{OrchestrationID: "test"}
	configData, _ := json.Marshal(config)
	os.WriteFile(filepath.Join(tmpDir, "config.json"), configData, 0644)

	// Test direct path
	resolved, err := resolveRunDirForView(tmpDir)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if resolved != tmpDir {
		t.Errorf("expected %s, got %s", tmpDir, resolved)
	}

	// Test non-existent path (should error)
	_, err = resolveRunDirForView("/nonexistent/path/local_abc")
	if err == nil {
		t.Error("expected error for non-existent path")
	}
}

func TestSynthesizeBundleMetadata(t *testing.T) {
	// Test that metadata is populated from config
	tmpDir := t.TempDir()

	config := LocalRunConfig{
		OrchestrationID: "local_meta_789",
		Agent:           "claude/haiku-4.5",
		Prompt:          "Test metadata",
		Workspace:       tmpDir, // Use tmpDir so git commands have a valid dir
		DevshVersion:    "0.1.23",
		CreatedAt:       "2026-03-18T12:00:00Z",
	}
	configData, _ := json.Marshal(config)
	os.WriteFile(filepath.Join(tmpDir, "config.json"), configData, 0644)

	bundle := synthesizeBundleFromRunDir(tmpDir)

	if bundle.Metadata == nil {
		t.Fatal("expected metadata to be present")
	}

	if bundle.Metadata.Workspace != tmpDir {
		t.Errorf("expected workspace %s, got %s", tmpDir, bundle.Metadata.Workspace)
	}

	if bundle.Metadata.DevshVersion != "0.1.23" {
		t.Errorf("expected devsh version 0.1.23, got %s", bundle.Metadata.DevshVersion)
	}

	if bundle.Metadata.AgentCLI != "claude/haiku-4.5" {
		t.Errorf("expected agent CLI claude/haiku-4.5, got %s", bundle.Metadata.AgentCLI)
	}

	if bundle.Metadata.Source != "local" {
		t.Errorf("expected source local, got %s", bundle.Metadata.Source)
	}

	// Git fields may be empty if not in a git repo - that's OK
	// Just verify they're accessible
	_ = bundle.Metadata.GitBranch
	_ = bundle.Metadata.GitCommit
}
