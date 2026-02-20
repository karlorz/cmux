// internal/cli/task.go
package cli

import (
	"github.com/spf13/cobra"
)

var taskCmd = &cobra.Command{
	Use:   "task",
	Short: "Manage tasks",
	Long: `Manage tasks (same as web app dashboard).

Tasks represent prompts sent to AI agents. Each task can have
multiple runs with different agents working on it.

Examples:
  cmux task list                      # List all active tasks
  cmux task list --archived           # List archived tasks
  cmux task create --repo owner/repo --agent claude-code "Add tests"
  cmux task status <task-id>          # Get task details
  cmux task stop <task-id>            # Stop/archive a task`,
}

func init() {
	rootCmd.AddCommand(taskCmd)
}
