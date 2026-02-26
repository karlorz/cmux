// internal/cli/orchestrate_status.go
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

var orchestrateStatusCmd = &cobra.Command{
	Use:   "status <orch-task-id>",
	Short: "Get orchestration task status",
	Long: `Get the status and details of a specific orchestration task,
including linked task run information when available.

Examples:
  devsh orchestrate status k97xcv2...
  devsh orchestrate status <orch-task-id> --json`,
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

		if flagJSON {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
			return nil
		}

		task := result.Task
		fmt.Println("Orchestration Task")
		fmt.Println("==================")
		fmt.Printf("  ID:       %s\n", task.ID)
		fmt.Printf("  Status:   %s\n", task.Status)
		fmt.Printf("  Priority: %d\n", task.Priority)
		fmt.Printf("  Prompt:   %s\n", task.Prompt)

		if task.AssignedAgentName != nil {
			fmt.Printf("  Agent:    %s\n", *task.AssignedAgentName)
		}
		if task.TaskID != nil {
			fmt.Printf("  Task ID:  %s\n", *task.TaskID)
		}
		if task.TaskRunID != nil {
			fmt.Printf("  Run ID:   %s\n", *task.TaskRunID)
		}
		if task.ErrorMessage != nil {
			fmt.Printf("  Error:    %s\n", *task.ErrorMessage)
		}
		if task.Result != nil {
			fmt.Printf("  Result:   %s\n", *task.Result)
		}
		fmt.Printf("  Created:  %s\n", time.Unix(task.CreatedAt/1000, 0).Format(time.RFC3339))
		if task.StartedAt != nil {
			fmt.Printf("  Started:  %s\n", time.Unix(*task.StartedAt/1000, 0).Format(time.RFC3339))
		}
		if task.CompletedAt != nil {
			fmt.Printf("  Finished: %s\n", time.Unix(*task.CompletedAt/1000, 0).Format(time.RFC3339))
		}

		if result.TaskRun != nil {
			fmt.Println()
			fmt.Println("Linked Task Run")
			fmt.Println("---------------")
			fmt.Printf("  ID:     %s\n", result.TaskRun.ID)
			fmt.Printf("  Agent:  %s\n", result.TaskRun.Agent)
			fmt.Printf("  Status: %s\n", result.TaskRun.Status)
			if result.TaskRun.VSCodeURL != "" {
				fmt.Printf("  VSCode: %s\n", result.TaskRun.VSCodeURL)
			}
			if result.TaskRun.PullRequestURL != "" {
				fmt.Printf("  PR:     %s\n", result.TaskRun.PullRequestURL)
			}
		}

		return nil
	},
}

func init() {
	orchestrateCmd.AddCommand(orchestrateStatusCmd)
}
