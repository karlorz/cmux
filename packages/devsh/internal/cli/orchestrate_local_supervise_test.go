// internal/cli/orchestrate_local_supervise_test.go
package cli

import (
	"strings"
	"testing"
)

func TestParseSupervisorVerdictApproved(t *testing.T) {
	tests := []struct {
		input    string
		verdict  string
		hasFeed  bool
	}{
		{"APPROVED\nGreat work!", "approved", true},
		{"APPROVED", "approved", false},
		{"approved\nLooks good", "approved", true},
		{"  APPROVED  \n\nNice job", "approved", true},
	}

	for _, tt := range tests {
		verdict, feedback := parseSupervisorVerdict(tt.input)
		if verdict != tt.verdict {
			t.Errorf("input %q: expected verdict %q, got %q", tt.input, tt.verdict, verdict)
		}
		if tt.hasFeed && feedback == "" {
			t.Errorf("input %q: expected feedback but got empty", tt.input)
		}
	}
}

func TestParseSupervisorVerdictRejected(t *testing.T) {
	tests := []struct {
		input    string
		verdict  string
		hasFeed  bool
	}{
		{"REJECTED\nNeeds more tests", "rejected", true},
		{"REJECTED", "rejected", false},
		{"rejected\nFix the bug", "rejected", true},
	}

	for _, tt := range tests {
		verdict, feedback := parseSupervisorVerdict(tt.input)
		if verdict != tt.verdict {
			t.Errorf("input %q: expected verdict %q, got %q", tt.input, tt.verdict, verdict)
		}
		if tt.hasFeed && feedback == "" {
			t.Errorf("input %q: expected feedback but got empty", tt.input)
		}
	}
}

func TestParseSupervisorVerdictContinue(t *testing.T) {
	tests := []struct {
		input    string
		verdict  string
		hasFeed  bool
	}{
		{"CONTINUE\nAlmost there", "continue", true},
		{"CONTINUE", "continue", false},
		{"continue\nAdd error handling", "continue", true},
	}

	for _, tt := range tests {
		verdict, feedback := parseSupervisorVerdict(tt.input)
		if verdict != tt.verdict {
			t.Errorf("input %q: expected verdict %q, got %q", tt.input, tt.verdict, verdict)
		}
		if tt.hasFeed && feedback == "" {
			t.Errorf("input %q: expected feedback but got empty", tt.input)
		}
	}
}

func TestParseSupervisorVerdictDefault(t *testing.T) {
	// When no clear verdict, should default to continue
	input := "The code looks okay but needs some improvements..."
	verdict, feedback := parseSupervisorVerdict(input)

	if verdict != "continue" {
		t.Errorf("expected verdict 'continue' for unclear input, got %q", verdict)
	}
	if feedback == "" {
		t.Error("expected feedback for unclear verdict")
	}
}

func TestTruncateOutput(t *testing.T) {
	tests := []struct {
		input    string
		maxLen   int
		expected int
	}{
		{"short", 100, 5},
		{"hello world", 5, 5 + len("\n... [truncated]")},
		{"", 10, 0},
	}

	for _, tt := range tests {
		result := truncateOutput(tt.input, tt.maxLen)
		if len(result) != tt.expected {
			t.Errorf("truncateOutput(%q, %d): expected len %d, got %d", tt.input, tt.maxLen, tt.expected, len(result))
		}
	}
}

func TestBuildSupervisorPrompt(t *testing.T) {
	prompt := buildSupervisorPrompt("Fix the bug", "I fixed it", 1)

	if prompt == "" {
		t.Error("expected non-empty supervisor prompt")
	}

	// Should contain key elements
	if !strings.Contains(prompt, "Fix the bug") {
		t.Error("prompt should contain original task")
	}
	if !strings.Contains(prompt, "I fixed it") {
		t.Error("prompt should contain executor output")
	}
	if !strings.Contains(prompt, "APPROVED") {
		t.Error("prompt should mention APPROVED verdict option")
	}
	if !strings.Contains(prompt, "REJECTED") {
		t.Error("prompt should mention REJECTED verdict option")
	}
}


func TestSupervisionStateFlagsExist(t *testing.T) {
	origExecutor := superviseExecutor
	origSupervisor := superviseSupervisor
	origMaxRounds := superviseMaxRounds
	defer func() {
		superviseExecutor = origExecutor
		superviseSupervisor = origSupervisor
		superviseMaxRounds = origMaxRounds
	}()

	superviseExecutor = "codex/test"
	if superviseExecutor != "codex/test" {
		t.Error("failed to set superviseExecutor")
	}

	superviseSupervisor = "claude/test"
	if superviseSupervisor != "claude/test" {
		t.Error("failed to set superviseSupervisor")
	}

	superviseMaxRounds = 5
	if superviseMaxRounds != 5 {
		t.Error("failed to set superviseMaxRounds")
	}
}

func TestSupervisionStateAddEvent(t *testing.T) {
	state := &SupervisionState{
		Events: []LocalEvent{},
	}

	state.addSuperviseEvent("test_event", "Test message")

	if len(state.Events) != 1 {
		t.Errorf("expected 1 event, got %d", len(state.Events))
	}

	if state.Events[0].Type != "test_event" {
		t.Errorf("expected event type 'test_event', got %q", state.Events[0].Type)
	}
}
