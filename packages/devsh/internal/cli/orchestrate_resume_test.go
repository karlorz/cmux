package cli

import (
	"strings"
	"testing"

	"github.com/karlorz/devsh/internal/vm"
)

func TestPrintProviderSessionCodexInstructions(t *testing.T) {
	threadID := "thread_123"

	output := captureStdout(t, func() {
		printProviderSession(&vm.ProviderSession{
			TaskID:           "task_123",
			OrchestrationID:  "orch_123",
			Provider:         "codex",
			AgentName:        "codex/gpt-5.1-codex",
			Mode:             "worker",
			Status:           "active",
			ProviderThreadID: &threadID,
		})
	})

	if !strings.Contains(output, "Codex interactive: codex resume thread_123") {
		t.Fatalf("expected interactive codex resume instructions, got:\n%s", output)
	}

	if !strings.Contains(output, "Codex non-interactive follow-up: codex exec resume thread_123 '<prompt>'") {
		t.Fatalf("expected non-interactive codex resume instructions, got:\n%s", output)
	}

	if strings.Contains(output, "--thread-id") {
		t.Fatalf("expected legacy --thread-id wording to be absent, got:\n%s", output)
	}
}
