// Package socketio provides a socket.io client for real-time communication
package socketio

import (
	"encoding/json"
	"testing"
)

func TestStartTaskDataJSON(t *testing.T) {
	data := StartTaskData{
		TaskID:          "task-123",
		TaskDescription: "Test task",
		ProjectFullName: "owner/repo",
		RepoURL:         "https://github.com/owner/repo",
		Branch:          "main",
		TaskRunIDs:      []string{"run-1", "run-2"},
		SelectedAgents:  []string{"claude/haiku-4.5"},
		IsCloudMode:     true,
		EnvironmentID:   "env-123",
		Theme:           "dark",
	}

	// Marshal
	jsonData, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("failed to marshal StartTaskData: %v", err)
	}

	// Unmarshal
	var decoded StartTaskData
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal StartTaskData: %v", err)
	}

	// Verify fields
	if decoded.TaskID != "task-123" {
		t.Errorf("expected TaskID 'task-123', got '%s'", decoded.TaskID)
	}
	if decoded.TaskDescription != "Test task" {
		t.Errorf("expected TaskDescription 'Test task', got '%s'", decoded.TaskDescription)
	}
	if decoded.ProjectFullName != "owner/repo" {
		t.Errorf("expected ProjectFullName 'owner/repo', got '%s'", decoded.ProjectFullName)
	}
	if decoded.RepoURL != "https://github.com/owner/repo" {
		t.Errorf("expected RepoURL, got '%s'", decoded.RepoURL)
	}
	if decoded.Branch != "main" {
		t.Errorf("expected Branch 'main', got '%s'", decoded.Branch)
	}
	if len(decoded.TaskRunIDs) != 2 {
		t.Errorf("expected 2 TaskRunIDs, got %d", len(decoded.TaskRunIDs))
	}
	if len(decoded.SelectedAgents) != 1 {
		t.Errorf("expected 1 SelectedAgent, got %d", len(decoded.SelectedAgents))
	}
	if !decoded.IsCloudMode {
		t.Error("expected IsCloudMode true")
	}
	if decoded.EnvironmentID != "env-123" {
		t.Errorf("expected EnvironmentID 'env-123', got '%s'", decoded.EnvironmentID)
	}
	if decoded.Theme != "dark" {
		t.Errorf("expected Theme 'dark', got '%s'", decoded.Theme)
	}
}

func TestStartTaskDataOmitEmpty(t *testing.T) {
	// Minimal data with only required fields
	data := StartTaskData{
		TaskID:          "task-456",
		TaskDescription: "Minimal task",
		ProjectFullName: "test/repo",
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	jsonStr := string(jsonData)

	// Should not contain omitempty fields when empty
	if contains(jsonStr, "repoUrl") {
		t.Error("empty RepoURL should be omitted")
	}
	if contains(jsonStr, "branch") {
		t.Error("empty Branch should be omitted")
	}
	if contains(jsonStr, "environmentId") {
		t.Error("empty EnvironmentID should be omitted")
	}
	if contains(jsonStr, "theme") {
		t.Error("empty Theme should be omitted")
	}
}

func TestTaskStartedResultJSON(t *testing.T) {
	result := TaskStartedResult{
		TaskID:       "task-789",
		WorktreePath: "/path/to/worktree",
		TerminalID:   "term-123",
	}

	jsonData, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal TaskStartedResult: %v", err)
	}

	var decoded TaskStartedResult
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal TaskStartedResult: %v", err)
	}

	if decoded.TaskID != "task-789" {
		t.Errorf("expected TaskID 'task-789', got '%s'", decoded.TaskID)
	}
	if decoded.WorktreePath != "/path/to/worktree" {
		t.Errorf("expected WorktreePath '/path/to/worktree', got '%s'", decoded.WorktreePath)
	}
	if decoded.TerminalID != "term-123" {
		t.Errorf("expected TerminalID 'term-123', got '%s'", decoded.TerminalID)
	}
}

func TestTaskStartedResultWithError(t *testing.T) {
	result := TaskStartedResult{
		TaskID: "task-error",
		Error:  "something went wrong",
	}

	jsonData, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var decoded TaskStartedResult
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if decoded.Error != "something went wrong" {
		t.Errorf("expected Error 'something went wrong', got '%s'", decoded.Error)
	}
}

func TestClientStruct(t *testing.T) {
	// Test that Client struct can be instantiated
	// Note: NewClient requires auth which we can't easily mock
	c := &Client{
		serverURL: "http://localhost:9776",
		authToken: "test-token",
		connected: false,
		msgID:     0,
	}

	if c.serverURL != "http://localhost:9776" {
		t.Errorf("expected serverURL 'http://localhost:9776', got '%s'", c.serverURL)
	}
	if c.authToken != "test-token" {
		t.Errorf("expected authToken 'test-token', got '%s'", c.authToken)
	}
	if c.connected {
		t.Error("expected connected false")
	}
	if c.msgID != 0 {
		t.Errorf("expected msgID 0, got %d", c.msgID)
	}
}

// Helper function
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
