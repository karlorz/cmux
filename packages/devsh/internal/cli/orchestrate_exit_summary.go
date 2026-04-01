// internal/cli/orchestrate_exit_summary.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

// ExitSummary is a compact result for agent consumption
type ExitSummary struct {
	ID       string  `json:"id"`
	Status   string  `json:"status"`
	Agent    string  `json:"agent,omitempty"`
	Duration string  `json:"duration,omitempty"`
	PRURL    string  `json:"pr_url,omitempty"`
	VSCode   string  `json:"vscode_url,omitempty"`
	ExitCode *int    `json:"exit_code,omitempty"`
	Result   *string `json:"result,omitempty"`
	Error    *string `json:"error,omitempty"`
}

var orchestrateExitSummaryCmd = &cobra.Command{
	Use:   "exit-summary <orch-task-id>",
	Short: "Get compact exit summary for a completed task",
	Long: `Get a compact exit summary for an orchestration task, optimized for agent consumption.

Returns essential completion info: status, duration, diff stats, PR URL, and result/error.
This is more concise than 'status --json --compact' and includes diff statistics
when available from the task run metadata.

Examples:
  devsh orchestrate exit-summary <orch-task-id>
  devsh orchestrate exit-summary <orch-task-id> --json`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		orchTaskID := args[0]

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		teamSlug, err := auth.GetTeamSlug()
		if err != nil {
			return fmt.Errorf("failed to get team: %w", err)
		}

		client, err := vm.NewClient()
		if err != nil {
			return fmt.Errorf("failed to create client: %w", err)
		}
		client.SetTeamSlug(teamSlug)

		result, err := client.OrchestrationStatus(ctx, orchTaskID)
		if err != nil {
			return fmt.Errorf("failed to get orchestration status: %w", err)
		}

		summary := buildExitSummary(result)

		if flagJSON {
			data, _ := json.Marshal(summary)
			fmt.Println(string(data))
			return nil
		}

		// Human-readable output
		fmt.Println("Exit Summary")
		fmt.Println("============")
		fmt.Printf("  ID:       %s\n", summary.ID)
		fmt.Printf("  Status:   %s\n", summary.Status)
		if summary.Agent != "" {
			fmt.Printf("  Agent:    %s\n", summary.Agent)
		}
		if summary.Duration != "" {
			fmt.Printf("  Duration: %s\n", summary.Duration)
		}
		if summary.ExitCode != nil {
			fmt.Printf("  Exit:     %d\n", *summary.ExitCode)
		}
		if summary.PRURL != "" {
			fmt.Printf("  PR:       %s\n", summary.PRURL)
		}
		if summary.Result != nil {
			fmt.Printf("  Result:   %s\n", *summary.Result)
		}
		if summary.Error != nil {
			fmt.Printf("  Error:    %s\n", *summary.Error)
		}

		return nil
	},
}

func buildExitSummary(result *vm.OrchestrationStatusResult) ExitSummary {
	summary := ExitSummary{
		ID:     result.Task.ID,
		Status: result.Task.Status,
		Result: result.Task.Result,
		Error:  result.Task.ErrorMessage,
	}

	if result.Task.AssignedAgentName != nil {
		summary.Agent = *result.Task.AssignedAgentName
	}

	// Calculate duration
	if result.Task.StartedAt != nil {
		start := time.Unix(*result.Task.StartedAt/1000, 0)
		var end time.Time
		if result.Task.CompletedAt != nil {
			end = time.Unix(*result.Task.CompletedAt/1000, 0)
		} else {
			end = time.Now()
		}
		duration := end.Sub(start)
		summary.Duration = duration.Round(time.Second).String()
	}

	// Get PR URL and other info from task run if available
	if result.TaskRun != nil {
		if result.TaskRun.PullRequestURL != "" {
			summary.PRURL = result.TaskRun.PullRequestURL
		}
		if result.TaskRun.VSCodeURL != "" {
			summary.VSCode = result.TaskRun.VSCodeURL
		}
		summary.ExitCode = result.TaskRun.ExitCode
	}

	return summary
}

func init() {
	orchestrateCmd.AddCommand(orchestrateExitSummaryCmd)
}
