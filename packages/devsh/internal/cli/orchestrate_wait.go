// internal/cli/orchestrate_wait.go
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

var orchestrateWaitTimeout string
var orchestrateWaitCompact bool

var orchestrateWaitCmd = &cobra.Command{
	Use:   "wait <orch-task-id>",
	Short: "Wait for orchestration task to complete",
	Long: `Wait for an orchestration task to reach a terminal state (completed, failed, or cancelled).

Polls the task status every 5 seconds until it completes or the timeout is reached.

Examples:
  devsh orchestrate wait k97xcv2...
  devsh orchestrate wait <orch-task-id> --timeout 10m
  devsh orchestrate wait <orch-task-id> --json`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		orchTaskID := args[0]

		timeout, err := time.ParseDuration(orchestrateWaitTimeout)
		if err != nil {
			return fmt.Errorf("invalid timeout duration: %w", err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), timeout)
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

		fmt.Printf("Waiting for orchestration task %s...\n", orchTaskID)

		config := DefaultPollConfig(5 * time.Second)
		var finalResult *vm.OrchestrationStatusResult

		err = PollUntil(
			ctx,
			config,
			// fetch
			func(ctx context.Context) (interface{}, error) {
				return client.OrchestrationStatus(ctx, orchTaskID)
			},
			// shouldStop
			func(result interface{}, lastValue string) (bool, string, error) {
				r := result.(*vm.OrchestrationStatusResult)
				status := r.Task.Status
				if status != lastValue {
					fmt.Printf("  Status: %s\n", status)
				}
				finalResult = r
				switch status {
				case "completed", "failed", "cancelled":
					return true, status, nil
				}
				return false, status, nil
			},
			// display (no-op for wait, status is printed in shouldStop)
			func(result interface{}, isInitial bool) {},
		)

		if err != nil {
			if ctx.Err() != nil {
				return fmt.Errorf("timeout waiting for task to complete")
			}
			return err
		}

		if finalResult == nil {
			return fmt.Errorf("no result received")
		}

		if flagJSON {
			if orchestrateWaitCompact {
				compact := toCompactStatus(finalResult)
				data, _ := json.Marshal(compact)
				fmt.Println(string(data))
			} else {
				data, _ := json.MarshalIndent(finalResult, "", "  ")
				fmt.Println(string(data))
			}
		} else {
			fmt.Printf("\nTask finished with status: %s\n", finalResult.Task.Status)
			if finalResult.Task.ErrorMessage != nil {
				fmt.Printf("Error: %s\n", *finalResult.Task.ErrorMessage)
			}
			if finalResult.Task.Result != nil {
				fmt.Printf("Result: %s\n", *finalResult.Task.Result)
			}
		}

		if finalResult.Task.Status == "failed" || finalResult.Task.Status == "cancelled" {
			return fmt.Errorf("task %s", finalResult.Task.Status)
		}
		return nil
	},
}

func init() {
	orchestrateWaitCmd.Flags().StringVar(&orchestrateWaitTimeout, "timeout", "300s", "Maximum time to wait")
	orchestrateWaitCmd.Flags().BoolVar(&orchestrateWaitCompact, "compact", false, "Output compact JSON with essential fields only (use with --json)")
	orchestrateCmd.AddCommand(orchestrateWaitCmd)
}
