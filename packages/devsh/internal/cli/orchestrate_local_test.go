// internal/cli/orchestrate_local_test.go
package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLocalStateAddEvent(t *testing.T) {
	state := &LocalState{
		OrchestrationID: "test_123",
		Events:          []LocalEvent{},
	}

	state.addEvent("test_event", "Test message")

	if len(state.Events) != 1 {
		t.Errorf("expected 1 event, got %d", len(state.Events))
	}

	if state.Events[0].Type != "test_event" {
		t.Errorf("expected type 'test_event', got '%s'", state.Events[0].Type)
	}

	if state.Events[0].Message != "Test message" {
		t.Errorf("expected message 'Test message', got '%s'", state.Events[0].Message)
	}

	// Verify timestamp is valid RFC3339
	_, err := time.Parse(time.RFC3339, state.Events[0].Timestamp)
	if err != nil {
		t.Errorf("invalid timestamp format: %v", err)
	}
}

func TestExportLocalState(t *testing.T) {
	// Create temp directory for test
	tmpDir, err := os.MkdirTemp("", "devsh-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	state := &LocalState{
		OrchestrationID: "local_test_456",
		StartedAt:       "2026-03-18T10:00:00Z",
		Status:          "completed",
		Agent:           "claude/haiku-4.5",
		Prompt:          "Test prompt",
		Workspace:       "/test/workspace",
		Events: []LocalEvent{
			{
				Timestamp: "2026-03-18T10:00:01Z",
				Type:      "task_started",
				Message:   "Starting task",
			},
			{
				Timestamp: "2026-03-18T10:00:05Z",
				Type:      "task_completed",
				Message:   "Task finished",
			},
		},
	}

	outputPath := filepath.Join(tmpDir, "test-export.json")
	err = exportLocalState(state, outputPath)
	if err != nil {
		t.Fatalf("exportLocalState failed: %v", err)
	}

	// Read and verify the exported file
	data, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("failed to read exported file: %v", err)
	}

	var bundle ExportBundle
	err = json.Unmarshal(data, &bundle)
	if err != nil {
		t.Fatalf("failed to parse exported JSON: %v", err)
	}

	// Verify bundle contents
	if bundle.Version != "1.0.0" {
		t.Errorf("expected version '1.0.0', got '%s'", bundle.Version)
	}

	if bundle.Orchestration.ID != "local_test_456" {
		t.Errorf("expected orchestration ID 'local_test_456', got '%s'", bundle.Orchestration.ID)
	}

	if bundle.Orchestration.Status != "completed" {
		t.Errorf("expected status 'completed', got '%s'", bundle.Orchestration.Status)
	}

	if bundle.Summary.TotalTasks != 1 {
		t.Errorf("expected 1 total task, got %d", bundle.Summary.TotalTasks)
	}

	if bundle.Summary.CompletedTasks != 1 {
		t.Errorf("expected 1 completed task, got %d", bundle.Summary.CompletedTasks)
	}

	if len(bundle.Tasks) != 1 {
		t.Errorf("expected 1 task, got %d", len(bundle.Tasks))
	}

	if bundle.Tasks[0].Prompt != "Test prompt" {
		t.Errorf("expected prompt 'Test prompt', got '%s'", bundle.Tasks[0].Prompt)
	}

	if *bundle.Tasks[0].AgentName != "claude/haiku-4.5" {
		t.Errorf("expected agent 'claude/haiku-4.5', got '%s'", *bundle.Tasks[0].AgentName)
	}

	if len(bundle.Events) != 2 {
		t.Errorf("expected 2 events, got %d", len(bundle.Events))
	}
}

func TestLocalStateJSONSerialization(t *testing.T) {
	state := &LocalState{
		OrchestrationID: "local_json_test",
		StartedAt:       "2026-03-18T10:00:00Z",
		Status:          "completed",
		Agent:           "claude/haiku-4.5",
		Prompt:          "Test prompt with \"quotes\" and special chars",
		Workspace:       "/test/workspace",
		Events: []LocalEvent{
			{
				Timestamp: "2026-03-18T10:00:01Z",
				Type:      "task_started",
				Message:   "Starting task",
			},
		},
	}

	// Marshal to JSON
	data, err := json.Marshal(state)
	if err != nil {
		t.Fatalf("failed to marshal LocalState: %v", err)
	}

	// Unmarshal back
	var parsed LocalState
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal LocalState: %v", err)
	}

	// Verify fields
	if parsed.OrchestrationID != "local_json_test" {
		t.Errorf("expected orchestrationId 'local_json_test', got '%s'", parsed.OrchestrationID)
	}

	if parsed.Status != "completed" {
		t.Errorf("expected status 'completed', got '%s'", parsed.Status)
	}

	if parsed.Prompt != "Test prompt with \"quotes\" and special chars" {
		t.Errorf("prompt not preserved correctly: %s", parsed.Prompt)
	}

	if len(parsed.Events) != 1 {
		t.Errorf("expected 1 event, got %d", len(parsed.Events))
	}
}

func TestExportLocalStateStatusMapping(t *testing.T) {
	tests := []struct {
		status          string
		expectedCompleted int
		expectedFailed    int
		expectedRunning   int
	}{
		{"completed", 1, 0, 0},
		{"failed", 0, 1, 0},
		{"running", 0, 0, 1},
		{"pending", 0, 0, 0}, // pending maps to nothing
	}

	for _, tt := range tests {
		t.Run(tt.status, func(t *testing.T) {
			tmpDir, err := os.MkdirTemp("", "devsh-test-*")
			if err != nil {
				t.Fatalf("failed to create temp dir: %v", err)
			}
			defer os.RemoveAll(tmpDir)

			state := &LocalState{
				OrchestrationID: "test",
				StartedAt:       "2026-03-18T10:00:00Z",
				Status:          tt.status,
				Agent:           "claude/haiku-4.5",
				Prompt:          "test",
				Workspace:       "/test",
				Events:          []LocalEvent{},
			}

			outputPath := filepath.Join(tmpDir, "export.json")
			err = exportLocalState(state, outputPath)
			if err != nil {
				t.Fatalf("exportLocalState failed: %v", err)
			}

			data, _ := os.ReadFile(outputPath)
			var bundle ExportBundle
			json.Unmarshal(data, &bundle)

			if bundle.Summary.CompletedTasks != tt.expectedCompleted {
				t.Errorf("expected %d completed, got %d", tt.expectedCompleted, bundle.Summary.CompletedTasks)
			}
			if bundle.Summary.FailedTasks != tt.expectedFailed {
				t.Errorf("expected %d failed, got %d", tt.expectedFailed, bundle.Summary.FailedTasks)
			}
			if bundle.Summary.RunningTasks != tt.expectedRunning {
				t.Errorf("expected %d running, got %d", tt.expectedRunning, bundle.Summary.RunningTasks)
			}
		})
	}
}
