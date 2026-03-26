// internal/cli/head_agent.go
package cli

import "github.com/spf13/cobra"

var headAgentCmd = &cobra.Command{
	Use:   "head-agent",
	Short: "Head agent commands for GitHub Projects automation",
	Long: `Head agent commands for running autonomous polling loops that monitor
GitHub Projects for new items and auto-dispatch agents for discovered work.

The head agent polls GitHub Projects for items in a configurable status (default: "Backlog")
that don't have linked cmux tasks, then automatically creates tasks and dispatches agents.

Examples:
  devsh head-agent start --project-id PVT_xxx --installation-id 12345 --repo owner/repo
  devsh head-agent poll-once --project-id PVT_xxx --installation-id 12345 --repo owner/repo
  devsh head-agent poll-once --project-id PVT_xxx --installation-id 12345 --repo owner/repo --dry-run`,
}

func init() {
	rootCmd.AddCommand(headAgentCmd)
}
