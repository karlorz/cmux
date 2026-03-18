// internal/cli/orchestrate_local_plan_test.go
package cli

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadPlanFile(t *testing.T) {
	// Create temp file with valid plan
	tmpDir, err := os.MkdirTemp("", "devsh-plan-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	planContent := `name: test-plan
description: A test plan
workspace: /test/workspace
timeout: 1h
tasks:
  - id: task1
    agent: claude/haiku-4.5
    prompt: "First task"
  - id: task2
    agent: codex/gpt-5.1-codex-mini
    prompt: "Second task"
    depends_on: [task1]
`

	planPath := filepath.Join(tmpDir, "plan.yaml")
	if err := os.WriteFile(planPath, []byte(planContent), 0644); err != nil {
		t.Fatalf("failed to write plan file: %v", err)
	}

	plan, err := loadPlanFile(planPath)
	if err != nil {
		t.Fatalf("loadPlanFile failed: %v", err)
	}

	if plan.Name != "test-plan" {
		t.Errorf("expected name 'test-plan', got '%s'", plan.Name)
	}

	if plan.Description != "A test plan" {
		t.Errorf("expected description 'A test plan', got '%s'", plan.Description)
	}

	if plan.Workspace != "/test/workspace" {
		t.Errorf("expected workspace '/test/workspace', got '%s'", plan.Workspace)
	}

	if plan.Timeout != "1h" {
		t.Errorf("expected timeout '1h', got '%s'", plan.Timeout)
	}

	if len(plan.Tasks) != 2 {
		t.Fatalf("expected 2 tasks, got %d", len(plan.Tasks))
	}

	if plan.Tasks[0].ID != "task1" {
		t.Errorf("expected task1 ID, got '%s'", plan.Tasks[0].ID)
	}

	if plan.Tasks[1].ID != "task2" {
		t.Errorf("expected task2 ID, got '%s'", plan.Tasks[1].ID)
	}

	if len(plan.Tasks[1].DependsOn) != 1 || plan.Tasks[1].DependsOn[0] != "task1" {
		t.Errorf("expected task2 to depend on task1, got %v", plan.Tasks[1].DependsOn)
	}
}

func TestValidatePlan(t *testing.T) {
	tests := []struct {
		name    string
		plan    *PlanFile
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid plan",
			plan: &PlanFile{
				Name: "test",
				Tasks: []PlanTask{
					{ID: "task1", Agent: "claude/haiku-4.5", Prompt: "test"},
				},
			},
			wantErr: false,
		},
		{
			name:    "missing name",
			plan:    &PlanFile{Tasks: []PlanTask{{ID: "t1", Agent: "a", Prompt: "p"}}},
			wantErr: true,
			errMsg:  "plan name is required",
		},
		{
			name:    "no tasks",
			plan:    &PlanFile{Name: "test", Tasks: []PlanTask{}},
			wantErr: true,
			errMsg:  "plan must have at least one task",
		},
		{
			name: "missing task ID",
			plan: &PlanFile{
				Name:  "test",
				Tasks: []PlanTask{{Agent: "a", Prompt: "p"}},
			},
			wantErr: true,
			errMsg:  "task ID is required",
		},
		{
			name: "duplicate task ID",
			plan: &PlanFile{
				Name: "test",
				Tasks: []PlanTask{
					{ID: "t1", Agent: "a", Prompt: "p"},
					{ID: "t1", Agent: "a", Prompt: "p"},
				},
			},
			wantErr: true,
			errMsg:  "duplicate task ID: t1",
		},
		{
			name: "missing agent",
			plan: &PlanFile{
				Name:  "test",
				Tasks: []PlanTask{{ID: "t1", Prompt: "p"}},
			},
			wantErr: true,
			errMsg:  "task 't1' must have an agent",
		},
		{
			name: "missing prompt",
			plan: &PlanFile{
				Name:  "test",
				Tasks: []PlanTask{{ID: "t1", Agent: "a"}},
			},
			wantErr: true,
			errMsg:  "task 't1' must have a prompt",
		},
		{
			name: "unknown dependency",
			plan: &PlanFile{
				Name: "test",
				Tasks: []PlanTask{
					{ID: "t1", Agent: "a", Prompt: "p", DependsOn: []string{"unknown"}},
				},
			},
			wantErr: true,
			errMsg:  "task 't1' depends on unknown task 'unknown'",
		},
		{
			name: "valid forward dependency",
			plan: &PlanFile{
				Name: "test",
				Tasks: []PlanTask{
					{ID: "t1", Agent: "a", Prompt: "p"},
					{ID: "t2", Agent: "a", Prompt: "p", DependsOn: []string{"t1"}},
				},
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePlan(tt.plan)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error, got nil")
				} else if err.Error() != tt.errMsg {
					t.Errorf("expected error '%s', got '%s'", tt.errMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			}
		})
	}
}

func TestTruncateString(t *testing.T) {
	tests := []struct {
		input    string
		maxLen   int
		expected string
	}{
		{"short", 10, "short"},
		{"exactly10c", 10, "exactly10c"},
		{"this is a longer string", 10, "this is..."},
		{"", 10, ""},
		{"abc", 3, "abc"},
		{"abcd", 3, "..."},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := truncateString(tt.input, tt.maxLen)
			if result != tt.expected {
				t.Errorf("truncateString(%q, %d) = %q, want %q", tt.input, tt.maxLen, result, tt.expected)
			}
		})
	}
}

func TestPlanStateAddEvent(t *testing.T) {
	state := &PlanState{
		PlanName: "test-plan",
		Events:   []LocalEvent{},
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
}

func TestExportPlanState(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "devsh-plan-export-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	state := &PlanState{
		PlanName:      "test-plan",
		StartedAt:     "2026-03-18T10:00:00Z",
		CompletedAt:   "2026-03-18T10:05:00Z",
		DurationMs:    300000,
		Status:        "completed",
		TasksTotal:    2,
		TasksComplete: 2,
		TasksFailed:   0,
		TaskStates: []LocalState{
			{
				OrchestrationID: "test-plan_task1",
				Status:          "completed",
				Agent:           "claude/haiku-4.5",
				Prompt:          "First task",
			},
			{
				OrchestrationID: "test-plan_task2",
				Status:          "completed",
				Agent:           "codex/gpt-5.1-codex-mini",
				Prompt:          "Second task",
			},
		},
		Events: []LocalEvent{
			{Timestamp: "2026-03-18T10:00:00Z", Type: "plan_started", Message: "Starting"},
			{Timestamp: "2026-03-18T10:05:00Z", Type: "plan_completed", Message: "Done"},
		},
	}

	outputPath := filepath.Join(tmpDir, "export.json")
	err = exportPlanState(state, outputPath)
	if err != nil {
		t.Fatalf("exportPlanState failed: %v", err)
	}

	// Verify file was created
	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		t.Fatal("export file was not created")
	}

	// Read and verify content
	data, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("failed to read export file: %v", err)
	}

	// Basic content checks
	content := string(data)
	if len(content) == 0 {
		t.Error("export file is empty")
	}
}

func TestPlanParallelFlagExists(t *testing.T) {
	// Verify the planParallel flag variable is declared
	origParallel := planParallel
	defer func() { planParallel = origParallel }()

	planParallel = true
	if !planParallel {
		t.Error("failed to set planParallel to true")
	}

	planParallel = false
	if planParallel {
		t.Error("failed to set planParallel to false")
	}
}

func TestRunAgentForTaskUnsupported(t *testing.T) {
	// Test that unsupported agents return an error
	state := &LocalState{Events: []LocalEvent{}}
	err := runAgentForTask(nil, state, "unknown/agent", "test", "/tmp")
	if err == nil {
		t.Error("expected error for unsupported agent")
	}
	if err.Error() != "unsupported agent: unknown/agent" {
		t.Errorf("unexpected error: %v", err)
	}
}
