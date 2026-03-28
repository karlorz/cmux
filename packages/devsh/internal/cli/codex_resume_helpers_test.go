package cli

import "testing"

func TestFormatCodexInteractiveResumeCommand(t *testing.T) {
	got := formatCodexInteractiveResumeCommand("thread-abc456")
	want := "codex resume thread-abc456"

	if got != want {
		t.Fatalf("formatCodexInteractiveResumeCommand() = %q, want %q", got, want)
	}
}

func TestFormatCodexNonInteractiveResumeCommand(t *testing.T) {
	got := formatCodexNonInteractiveResumeCommand("thread-abc456", "\"<prompt>\"")
	want := "codex exec resume thread-abc456 \"<prompt>\""

	if got != want {
		t.Fatalf("formatCodexNonInteractiveResumeCommand() = %q, want %q", got, want)
	}
}
