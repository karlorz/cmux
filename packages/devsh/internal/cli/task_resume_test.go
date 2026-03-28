package cli

import (
	"strings"
	"testing"

	"github.com/karlorz/devsh/internal/vm"
)

func TestPrintTaskResumeSummaryCodexContinuationCommands(t *testing.T) {
	threadID := "thread_123"
	agentName := "codex/gpt-5.1-codex"

	output := captureStdout(t, func() {
		printTaskResumeSummary(
			&vm.RunControlSummary{
				TaskRunID: "run_123",
				TaskID:    "task_123",
				AgentName: &agentName,
				Provider:  "codex",
				RunStatus: "running",
				Lifecycle: vm.RunControlLifecycle{
					Status:             "interrupted",
					InterruptionStatus: "user_input_required",
				},
				Actions: vm.RunControlActions{
					AvailableActions:   []string{"continue_session"},
					CanContinueSession: true,
				},
				Continuation: vm.RunControlContinuation{
					Mode:             "session_continuation",
					ProviderThreadID: &threadID,
				},
			},
			&vm.TaskRun{
				ID:        "run_123",
				AgentName: "codex/gpt-5.1-codex",
				Status:    "running",
				SandboxID: "sandbox_123",
			},
		)
	})

	if !strings.Contains(output, "Continuation mode: session_continuation") {
		t.Fatalf("expected continuation mode, got:\n%s", output)
	}

	if !strings.Contains(output, "Available actions: Continue session") {
		t.Fatalf("expected formatted action label, got:\n%s", output)
	}

	if !strings.Contains(output, "Primary lane: Continue session") {
		t.Fatalf("expected primary lane guidance, got:\n%s", output)
	}

	if !strings.Contains(output, "Then run: codex resume thread_123") {
		t.Fatalf("expected interactive codex resume command, got:\n%s", output)
	}

	if !strings.Contains(output, "devsh exec sandbox_123 'codex exec resume thread_123 \"<prompt>\"'") {
		t.Fatalf("expected non-interactive sandbox follow-up command, got:\n%s", output)
	}

	if strings.Contains(output, "--thread-id") {
		t.Fatalf("expected legacy --thread-id wording to be absent, got:\n%s", output)
	}
}
