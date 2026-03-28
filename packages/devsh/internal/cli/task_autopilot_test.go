package cli

import (
	"context"
	"strings"
	"testing"

	"github.com/karlorz/devsh/internal/vm"
)

func TestHandleAutopilotResumeCodexInstructions(t *testing.T) {
	taskRun := &vm.TaskRun{
		ID:            "run_123",
		AgentName:     "codex/gpt-5.1-codex",
		Status:        "running",
		SandboxID:     "sandbox_123",
		CodexThreadID: "thread_123",
	}

	output := captureStdout(t, func() {
		if err := handleAutopilotResume(context.Background(), nil, taskRun); err != nil {
			t.Fatalf("handleAutopilotResume() error = %v", err)
		}
	})

	if !strings.Contains(output, "codex resume thread_123") {
		t.Fatalf("expected interactive codex resume command, got:\n%s", output)
	}

	if !strings.Contains(output, "devsh exec sandbox_123 'codex exec resume thread_123 \"<prompt>\"'") {
		t.Fatalf("expected non-interactive sandbox follow-up command, got:\n%s", output)
	}

	if strings.Contains(output, "--thread-id") {
		t.Fatalf("expected legacy --thread-id wording to be absent, got:\n%s", output)
	}
}
