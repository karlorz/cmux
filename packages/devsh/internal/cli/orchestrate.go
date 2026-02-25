// internal/cli/orchestrate.go
package cli

import (
	"github.com/spf13/cobra"
)

var orchestrateCmd = &cobra.Command{
	Use:   "orchestrate",
	Short: "Multi-agent orchestration commands",
	Long: `Manage multi-agent orchestration with circuit breaker resilience.

Commands to spawn, monitor, and cancel orchestrated agent tasks with
automatic health tracking and dependency management.

Examples:
  cmux orchestrate spawn --agent claude/haiku-4.5 --repo owner/repo "Fix the bug"
  cmux orchestrate list
  cmux orchestrate list --status running
  cmux orchestrate status <orch-task-id>
  cmux orchestrate wait <orch-task-id> --timeout 10m
  cmux orchestrate cancel <orch-task-id>`,
}

func init() {
	rootCmd.AddCommand(orchestrateCmd)
}
