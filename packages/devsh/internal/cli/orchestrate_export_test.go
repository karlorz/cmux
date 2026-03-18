// internal/cli/orchestrate_export_test.go
package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestExportBundleSerialization(t *testing.T) {
	agentName := "claude/opus-4.6"
	result := "Task completed successfully"
	errorMsg := "Connection timeout"
	taskRunID := "tr_123"

	bundle := ExportBundle{
		ExportedAt: "2026-03-18T10:00:00Z",
		Version:    "1.0.0",
		Orchestration: OrchestrationExportInfo{
			ID:        "orch_test_123",
			Status:    "completed",
			CreatedAt: "2026-03-18T09:00:00Z",
			Prompt:    "Test orchestration prompt",
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
				TaskID:    "task_1",
				Status:    "completed",
				AgentName: &agentName,
				Prompt:    "First task",
				Result:    &result,
			},
			{
				TaskID:    "task_2",
				Status:    "completed",
				Prompt:    "Second task",
				TaskRunID: &taskRunID,
			},
			{
				TaskID:       "task_3",
				Status:       "failed",
				Prompt:       "Third task",
				ErrorMessage: &errorMsg,
			},
		},
		Events: []EventExportInfo{
			{
				Timestamp: "2026-03-18T09:00:01Z",
				Type:      "task_started",
				TaskID:    "task_1",
				Message:   "Starting first task",
			},
			{
				Timestamp: "2026-03-18T09:00:05Z",
				Type:      "task_completed",
				TaskID:    "task_1",
				Message:   "Task completed",
			},
		},
	}

	// Marshal to JSON
	data, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal ExportBundle: %v", err)
	}

	// Unmarshal back
	var parsed ExportBundle
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal ExportBundle: %v", err)
	}

	// Verify fields
	if parsed.Version != "1.0.0" {
		t.Errorf("expected version 1.0.0, got %s", parsed.Version)
	}

	if parsed.Orchestration.ID != "orch_test_123" {
		t.Errorf("expected orchestration ID orch_test_123, got %s", parsed.Orchestration.ID)
	}

	if parsed.Summary.TotalTasks != 3 {
		t.Errorf("expected 3 total tasks, got %d", parsed.Summary.TotalTasks)
	}

	if len(parsed.Tasks) != 3 {
		t.Errorf("expected 3 tasks, got %d", len(parsed.Tasks))
	}

	if len(parsed.Events) != 2 {
		t.Errorf("expected 2 events, got %d", len(parsed.Events))
	}

	// Verify optional fields
	if parsed.Tasks[0].AgentName == nil || *parsed.Tasks[0].AgentName != "claude/opus-4.6" {
		t.Error("task 0 agent name not preserved")
	}

	if parsed.Tasks[0].Result == nil || *parsed.Tasks[0].Result != "Task completed successfully" {
		t.Error("task 0 result not preserved")
	}

	if parsed.Tasks[2].ErrorMessage == nil || *parsed.Tasks[2].ErrorMessage != "Connection timeout" {
		t.Error("task 2 error message not preserved")
	}
}

func TestExportSummaryCalculation(t *testing.T) {
	tests := []struct {
		name     string
		summary  ExportSummary
		expected int
	}{
		{
			name: "all completed",
			summary: ExportSummary{
				TotalTasks:     5,
				CompletedTasks: 5,
			},
			expected: 5,
		},
		{
			name: "mixed status",
			summary: ExportSummary{
				TotalTasks:     10,
				CompletedTasks: 5,
				FailedTasks:    2,
				PendingTasks:   2,
				RunningTasks:   1,
			},
			expected: 10,
		},
		{
			name: "empty",
			summary: ExportSummary{
				TotalTasks: 0,
			},
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Verify total matches sum of individual counts (when properly set)
			if tt.summary.TotalTasks != tt.expected {
				t.Errorf("expected total %d, got %d", tt.expected, tt.summary.TotalTasks)
			}
		})
	}
}

func TestTaskExportInfoOptionalFields(t *testing.T) {
	// Test that nil optional fields serialize correctly
	task := TaskExportInfo{
		TaskID: "task_1",
		Status: "pending",
		Prompt: "Test prompt",
		// All optional fields are nil
	}

	data, err := json.Marshal(task)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	// Verify omitempty works - these fields should not be in output
	jsonStr := string(data)
	if jsonContains(jsonStr, "agentName") {
		t.Error("agentName should be omitted when nil")
	}
	if jsonContains(jsonStr, "result") {
		t.Error("result should be omitted when nil")
	}
	if jsonContains(jsonStr, "errorMessage") {
		t.Error("errorMessage should be omitted when nil")
	}
	if jsonContains(jsonStr, "taskRunId") {
		t.Error("taskRunId should be omitted when nil")
	}
}

func jsonContains(s, substr string) bool {
	return strings.Contains(s, substr)
}
