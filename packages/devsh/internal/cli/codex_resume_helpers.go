package cli

import "fmt"

func buildCodexResumeArgs(threadID, message string) []string {
	return []string{
		"exec",
		"resume",
		threadID,
		message,
	}
}

func formatCodexInteractiveResumeCommand(threadID string) string {
	return fmt.Sprintf("codex resume %s", threadID)
}

func formatCodexNonInteractiveResumeCommand(threadID, prompt string) string {
	return fmt.Sprintf("codex exec resume %s %s", threadID, prompt)
}
