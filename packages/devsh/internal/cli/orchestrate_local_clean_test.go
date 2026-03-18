// internal/cli/orchestrate_local_clean_test.go
package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFormatAge(t *testing.T) {
	tests := []struct {
		name     string
		hours    int
		expected string
	}{
		{"hours", 5, "5h"},
		{"one day", 24, "1d"},
		{"three days", 72, "3d"},
		{"week", 168, "7d"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pastTime := time.Now().Add(-time.Duration(tt.hours) * time.Hour)
			result := formatAge(pastTime)
			if result != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, result)
			}
		})
	}
}

func TestCleanCandidateStruct(t *testing.T) {
	c := cleanCandidate{
		runDir:  "/tmp/test",
		orchID:  "local_123",
		reason:  "older than 7 days",
		status:  "completed",
		startAt: time.Now().AddDate(0, 0, -10),
	}

	if c.orchID != "local_123" {
		t.Errorf("expected orchID local_123, got %s", c.orchID)
	}
	if c.status != "completed" {
		t.Errorf("expected status completed, got %s", c.status)
	}
}

func TestCleanLocalWithTestRuns(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	localRunDir = tmpDir
	defer func() { localRunDir = "" }()

	// Create old run (10 days ago)
	oldRunDir := filepath.Join(tmpDir, "local_old_123")
	os.MkdirAll(oldRunDir, 0755)
	oldState := &LocalState{
		OrchestrationID: "local_old_123",
		Status:          "completed",
		Agent:           "claude/haiku-4.5",
		Prompt:          "Old task",
		Workspace:       "/tmp",
		StartedAt:       time.Now().AddDate(0, 0, -10).UTC().Format(time.RFC3339),
	}
	oldStateData, _ := json.MarshalIndent(oldState, "", "  ")
	os.WriteFile(filepath.Join(oldRunDir, "state.json"), oldStateData, 0644)

	// Create recent run (1 day ago)
	newRunDir := filepath.Join(tmpDir, "local_new_456")
	os.MkdirAll(newRunDir, 0755)
	newState := &LocalState{
		OrchestrationID: "local_new_456",
		Status:          "completed",
		Agent:           "codex/gpt-5.1-codex-mini",
		Prompt:          "New task",
		Workspace:       "/tmp",
		StartedAt:       time.Now().AddDate(0, 0, -1).UTC().Format(time.RFC3339),
	}
	newStateData, _ := json.MarshalIndent(newState, "", "  ")
	os.WriteFile(filepath.Join(newRunDir, "state.json"), newStateData, 0644)

	// Verify both exist
	entries, _ := os.ReadDir(tmpDir)
	if len(entries) != 2 {
		t.Fatalf("expected 2 run directories, got %d", len(entries))
	}

	// Load summaries to verify they parse correctly
	oldSummary, err := loadRunSummary(oldRunDir)
	if err != nil {
		t.Fatalf("failed to load old run summary: %v", err)
	}
	if oldSummary.OrchestrationID != "local_old_123" {
		t.Errorf("expected old run ID local_old_123, got %s", oldSummary.OrchestrationID)
	}

	newSummary, err := loadRunSummary(newRunDir)
	if err != nil {
		t.Fatalf("failed to load new run summary: %v", err)
	}
	if newSummary.OrchestrationID != "local_new_456" {
		t.Errorf("expected new run ID local_new_456, got %s", newSummary.OrchestrationID)
	}
}

func TestCleanLocalStatusFilter(t *testing.T) {
	tmpDir := t.TempDir()
	localRunDir = tmpDir
	defer func() { localRunDir = "" }()

	// Create failed run
	failedRunDir := filepath.Join(tmpDir, "local_failed")
	os.MkdirAll(failedRunDir, 0755)
	failedState := &LocalState{
		OrchestrationID: "local_failed",
		Status:          "failed",
		Agent:           "claude/haiku-4.5",
		Prompt:          "Failed task",
		Workspace:       "/tmp",
		StartedAt:       time.Now().UTC().Format(time.RFC3339),
	}
	failedStateData, _ := json.MarshalIndent(failedState, "", "  ")
	os.WriteFile(filepath.Join(failedRunDir, "state.json"), failedStateData, 0644)

	// Create completed run
	completedRunDir := filepath.Join(tmpDir, "local_completed")
	os.MkdirAll(completedRunDir, 0755)
	completedState := &LocalState{
		OrchestrationID: "local_completed",
		Status:          "completed",
		Agent:           "codex/gpt-5.1-codex-mini",
		Prompt:          "Completed task",
		Workspace:       "/tmp",
		StartedAt:       time.Now().UTC().Format(time.RFC3339),
	}
	completedStateData, _ := json.MarshalIndent(completedState, "", "  ")
	os.WriteFile(filepath.Join(completedRunDir, "state.json"), completedStateData, 0644)

	// Verify both exist and have correct statuses
	failedSummary, _ := loadRunSummary(failedRunDir)
	if failedSummary.Status != "failed" {
		t.Errorf("expected failed status, got %s", failedSummary.Status)
	}

	completedSummary, _ := loadRunSummary(completedRunDir)
	if completedSummary.Status != "completed" {
		t.Errorf("expected completed status, got %s", completedSummary.Status)
	}
}
