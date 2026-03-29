// internal/cli/orchestrate_resume.go
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

var orchestrateResumeCmd = &cobra.Command{
	Use:   "resume <task-id>",
	Short: "Inspect run-control summary for a task's latest run",
	Long: `Inspect the shared run-control summary for the latest run in a task.

This command resolves the newest task run for the task, then reads the shared
run-control contract so the output uses the same vocabulary as the UI and API:

  - Resolve approval
  - Continue session
  - Resume checkpoint
  - Append instruction

Provider-specific session details are only shown as supporting information for
the selected continuation lane. The command does not imply checkpoint restore
when only provider-session continuation exists.

Examples:
  devsh orchestrate resume k97xcv2...
  devsh orchestrate resume <task-id> --json`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		taskID := args[0]

		teamSlug, err := auth.GetTeamSlug()
		if err != nil {
			return fmt.Errorf("failed to get team: %w", err)
		}

		client, err := vm.NewClient()
		if err != nil {
			return fmt.Errorf("failed to create client: %w", err)
		}
		client.SetTeamSlug(teamSlug)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		task, err := client.GetTask(ctx, taskID)
		if err != nil {
			return fmt.Errorf("failed to get task: %w", err)
		}

		selectedRun, err := latestTaskRun(task)
		if err != nil {
			return err
		}

		runControl, err := client.GetRunControlSummary(ctx, selectedRun.ID)
		if err != nil {
			return fmt.Errorf("failed to get run-control summary: %w", err)
		}

		if flagJSON {
			data, marshalErr := json.MarshalIndent(runControl, "", "  ")
			if marshalErr != nil {
				return fmt.Errorf("failed to marshal run-control summary: %w", marshalErr)
			}
			fmt.Println(string(data))
			return nil
		}

		taskRun, err := client.GetTaskRunWithPty(ctx, selectedRun.ID)
		if err != nil {
			return fmt.Errorf("failed to get task run: %w", err)
		}

		fmt.Printf("Task: %s\n", task.ID)
		fmt.Printf("Selected run: %s\n", selectedRun.ID)
		fmt.Println()
		printTaskResumeSummary(runControl, taskRun)
		return nil
	},
}

func latestTaskRun(task *vm.TaskDetail) (*vm.TaskRun, error) {
	if len(task.TaskRuns) == 0 {
		return nil, fmt.Errorf("task %s has no runs yet", task.ID)
	}

	best := task.TaskRuns[0]
	for _, candidate := range task.TaskRuns[1:] {
		if candidate.CreatedAt > best.CreatedAt {
			best = candidate
		}
	}

	return &best, nil
}

func init() {
	orchestrateCmd.AddCommand(orchestrateResumeCmd)
}
