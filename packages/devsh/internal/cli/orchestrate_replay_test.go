// internal/cli/orchestrate_replay_test.go
package cli

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadReplayBundle(t *testing.T) {
	// Create temp file with valid bundle
	tmpDir, err := os.MkdirTemp("", "devsh-replay-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	bundleContent := `{
  "exportedAt": "2026-03-18T10:00:00Z",
  "version": "1.0.0",
  "orchestration": {
    "id": "test-orch-123",
    "status": "completed",
    "createdAt": "2026-03-18T09:00:00Z",
    "prompt": "Test orchestration"
  },
  "tasks": [
    {
      "taskId": "task1",
      "status": "completed",
      "agentName": "claude/haiku-4.5",
      "prompt": "First task"
    },
    {
      "taskId": "task2",
      "status": "failed",
      "agentName": "codex/gpt-5.1-codex-mini",
      "prompt": "Second task",
      "errorMessage": "timeout"
    }
  ],
  "summary": {
    "totalTasks": 2,
    "completedTasks": 1,
    "failedTasks": 1,
    "pendingTasks": 0,
    "runningTasks": 0
  }
}`

	bundlePath := filepath.Join(tmpDir, "bundle.json")
	if err := os.WriteFile(bundlePath, []byte(bundleContent), 0644); err != nil {
		t.Fatalf("failed to write bundle file: %v", err)
	}

	bundle, err := loadReplayBundle(bundlePath)
	if err != nil {
		t.Fatalf("loadReplayBundle failed: %v", err)
	}

	if bundle.Orchestration.ID != "test-orch-123" {
		t.Errorf("expected orchestration ID 'test-orch-123', got '%s'", bundle.Orchestration.ID)
	}

	if len(bundle.Tasks) != 2 {
		t.Fatalf("expected 2 tasks, got %d", len(bundle.Tasks))
	}

	if bundle.Tasks[0].TaskID != "task1" {
		t.Errorf("expected task1 ID, got '%s'", bundle.Tasks[0].TaskID)
	}

	if bundle.Tasks[1].Status != "failed" {
		t.Errorf("expected task2 status 'failed', got '%s'", bundle.Tasks[1].Status)
	}
}

func TestFilterTasksForReplay(t *testing.T) {
	tasks := []TaskExportInfo{
		{TaskID: "t1", Status: "completed"},
		{TaskID: "t2", Status: "failed"},
		{TaskID: "t3", Status: "pending"},
		{TaskID: "t4", Status: "running"},
		{TaskID: "t5", Status: "completed"},
		{TaskID: "t6", Status: "failed"},
	}

	tests := []struct {
		filter   string
		expected int
		taskIDs  []string
	}{
		{"all", 6, []string{"t1", "t2", "t3", "t4", "t5", "t6"}},
		{"", 6, []string{"t1", "t2", "t3", "t4", "t5", "t6"}},
		{"failed", 2, []string{"t2", "t6"}},
		{"completed", 2, []string{"t1", "t5"}},
		{"pending", 1, []string{"t3"}},
		{"running", 1, []string{"t4"}},
		{"unknown", 0, []string{}},
	}

	for _, tt := range tests {
		t.Run(tt.filter, func(t *testing.T) {
			filtered := filterTasksForReplay(tasks, tt.filter)

			if len(filtered) != tt.expected {
				t.Errorf("filter '%s': expected %d tasks, got %d", tt.filter, tt.expected, len(filtered))
			}

			// Check task IDs match
			for i, expectedID := range tt.taskIDs {
				if i < len(filtered) && filtered[i].TaskID != expectedID {
					t.Errorf("filter '%s': expected task[%d] ID '%s', got '%s'", tt.filter, i, expectedID, filtered[i].TaskID)
				}
			}
		})
	}
}

func TestReplayResultStructure(t *testing.T) {
	result := ReplayResult{
		OriginalOrchestrationID: "orch-123",
		ReplayedAt:              "2026-03-18T10:00:00Z",
		TasksReplayed:           3,
		TasksSucceeded:          2,
		TasksFailed:             1,
		TasksSkipped:            0,
		Results: []ReplayTaskResult{
			{
				TaskID:         "task1",
				OriginalStatus: "failed",
				ReplayStatus:   "completed",
				Agent:          "claude/haiku-4.5",
				DurationMs:     5000,
			},
		},
	}

	if result.OriginalOrchestrationID != "orch-123" {
		t.Errorf("expected orchestration ID 'orch-123', got '%s'", result.OriginalOrchestrationID)
	}

	if result.TasksReplayed != 3 {
		t.Errorf("expected 3 tasks replayed, got %d", result.TasksReplayed)
	}

	if len(result.Results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(result.Results))
	}

	if result.Results[0].ReplayStatus != "completed" {
		t.Errorf("expected replay status 'completed', got '%s'", result.Results[0].ReplayStatus)
	}
}

func TestLoadReplayBundleInvalid(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "devsh-replay-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Test invalid JSON
	invalidPath := filepath.Join(tmpDir, "invalid.json")
	if err := os.WriteFile(invalidPath, []byte("not valid json"), 0644); err != nil {
		t.Fatalf("failed to write invalid file: %v", err)
	}

	_, err = loadReplayBundle(invalidPath)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}

	// Test non-existent file
	_, err = loadReplayBundle("/nonexistent/path.json")
	if err == nil {
		t.Error("expected error for non-existent file")
	}
}
