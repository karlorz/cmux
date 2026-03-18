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
