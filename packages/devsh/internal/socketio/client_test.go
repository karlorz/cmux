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

func TestClientIsConnected(t *testing.T) {
	c := &Client{
		serverURL: "http://localhost:9776",
		authToken: "test-token",
		connected: false,
	}

	if c.IsConnected() {
		t.Error("expected IsConnected() false for new client")
	}

	// Simulate connected state
	c.connected = true
	if !c.IsConnected() {
		t.Error("expected IsConnected() true after setting connected")
	}
}

func TestClientCloseNilConn(t *testing.T) {
	c := &Client{
		serverURL: "http://localhost:9776",
		authToken: "test-token",
		connected: false,
		conn:      nil,
	}

	// Close with nil connection should not error
	if err := c.Close(); err != nil {
		t.Errorf("expected no error closing nil connection, got: %v", err)
	}
}

func TestStartTaskDataRequiredFields(t *testing.T) {
	// Test that required fields are present
	data := StartTaskData{
		TaskID:          "task-required",
		TaskDescription: "Required fields test",
		ProjectFullName: "test/repo",
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	jsonStr := string(jsonData)

	// Required fields must be present
	if !contains(jsonStr, "taskId") {
		t.Error("taskId should be present")
	}
	if !contains(jsonStr, "taskDescription") {
		t.Error("taskDescription should be present")
	}
	if !contains(jsonStr, "projectFullName") {
		t.Error("projectFullName should be present")
	}
}

func TestStartTaskDataBooleanField(t *testing.T) {
	// Test IsCloudMode boolean serialization
	dataTrue := StartTaskData{
		TaskID:          "task-bool",
		TaskDescription: "Boolean test",
		ProjectFullName: "test/repo",
		IsCloudMode:     true,
	}

	dataFalse := StartTaskData{
		TaskID:          "task-bool",
		TaskDescription: "Boolean test",
		ProjectFullName: "test/repo",
		IsCloudMode:     false,
	}

	jsonTrue, _ := json.Marshal(dataTrue)
	jsonFalse, _ := json.Marshal(dataFalse)

	if !contains(string(jsonTrue), `"isCloudMode":true`) {
		t.Error("expected isCloudMode:true in JSON")
	}
	if !contains(string(jsonFalse), `"isCloudMode":false`) {
		t.Error("expected isCloudMode:false in JSON")
	}
}

func TestStartTaskDataSliceFields(t *testing.T) {
	data := StartTaskData{
		TaskID:          "task-slice",
		TaskDescription: "Slice test",
		ProjectFullName: "test/repo",
		TaskRunIDs:      []string{"run-1", "run-2", "run-3"},
		SelectedAgents:  []string{"claude/opus-4.5", "codex/gpt-5.1"},
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var decoded StartTaskData
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if len(decoded.TaskRunIDs) != 3 {
		t.Errorf("expected 3 TaskRunIDs, got %d", len(decoded.TaskRunIDs))
	}
	if len(decoded.SelectedAgents) != 2 {
		t.Errorf("expected 2 SelectedAgents, got %d", len(decoded.SelectedAgents))
	}
	if decoded.TaskRunIDs[2] != "run-3" {
		t.Errorf("expected TaskRunIDs[2]='run-3', got '%s'", decoded.TaskRunIDs[2])
	}
}

func TestTaskStartedResultOmitEmpty(t *testing.T) {
	// Minimal result with only TaskID
	result := TaskStartedResult{
		TaskID: "task-minimal",
	}

	jsonData, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	jsonStr := string(jsonData)

	// Optional fields should be omitted when empty
	if contains(jsonStr, "worktreePath") {
		t.Error("empty worktreePath should be omitted")
	}
	if contains(jsonStr, "terminalId") {
		t.Error("empty terminalId should be omitted")
	}
	if contains(jsonStr, "error") {
		t.Error("empty error should be omitted")
	}
}

func TestClientMsgIDIncrement(t *testing.T) {
	c := &Client{
		serverURL: "http://localhost:9776",
		authToken: "test-token",
		msgID:     0,
	}

	if c.msgID != 0 {
		t.Errorf("expected initial msgID 0, got %d", c.msgID)
	}

	// Simulate increment (what EmitStartTask does)
	c.msgID++
	if c.msgID != 1 {
		t.Errorf("expected msgID 1 after increment, got %d", c.msgID)
	}

	c.msgID++
	if c.msgID != 2 {
		t.Errorf("expected msgID 2 after second increment, got %d", c.msgID)
	}
}
