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

var orchestrateStatusWatch bool
var orchestrateStatusInterval int
var orchestrateStatusCompact bool

// CompactStatusResult is a minimal JSON output for agent consumption
type CompactStatusResult struct {
	ID       string  `json:"id"`
	Status   string  `json:"status"`
	Agent    string  `json:"agent,omitempty"`
	Duration string  `json:"duration,omitempty"`
	Result   *string `json:"result,omitempty"`
	Error    *string `json:"error,omitempty"`
	PRURL    string  `json:"pr_url,omitempty"`
}

var orchestrateStatusCmd = &cobra.Command{
	Use:   "status <orch-task-id>",
	Short: "Get orchestration task status",
	Long: `Get the status and details of a specific orchestration task,
including linked task run information when available.

Use --watch to continuously monitor status changes until the task
reaches a terminal state (completed, failed, or cancelled).

Examples:
  devsh orchestrate status k97xcv2...
  devsh orchestrate status <orch-task-id> --json
  devsh orchestrate status <orch-task-id> --watch
  devsh orchestrate status <orch-task-id> --watch --interval 5`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		orchTaskID := args[0]

		teamSlug, err := auth.GetTeamSlug()
		if err != nil {
			return fmt.Errorf("failed to get team: %w", err)
		}

		client, err := vm.NewClient()
		if err != nil {
			return fmt.Errorf("failed to create client: %w", err)
		}
		client.SetTeamSlug(teamSlug)

		// If watch mode, enter continuous polling loop
		if orchestrateStatusWatch {
			return watchOrchestrationStatus(client, orchTaskID)
		}

		// Single status check
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		result, err := client.OrchestrationStatus(ctx, orchTaskID)
		if err != nil {
			return fmt.Errorf("failed to get orchestration status: %w", err)
		}

		if flagJSON {
			if orchestrateStatusCompact {
				compact := toCompactStatus(result)
				data, _ := json.Marshal(compact)
				fmt.Println(string(data))
			} else {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			}
			return nil
		}

		printOrchestrationStatus(result)
		return nil
	},
}

// watchOrchestrationStatus continuously polls for status changes until terminal state
func watchOrchestrationStatus(client *vm.Client, orchTaskID string) error {
	interval := time.Duration(orchestrateStatusInterval) * time.Second
	config := WatchPollConfig(interval, fmt.Sprintf("Watching orchestration task: %s", orchTaskID))

	return PollUntil(
		context.Background(),
		config,
		// fetch
		func(ctx context.Context) (interface{}, error) {
			fetchCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			return client.OrchestrationStatus(fetchCtx, orchTaskID)
		},
		// shouldStop
		func(result interface{}, lastValue string) (bool, string, error) {
			r := result.(*vm.OrchestrationStatusResult)
			status := r.Task.Status
			if isTerminalStatus(status) {
				return true, status, nil
			}
			return false, status, nil
		},
		// display
		func(result interface{}, isInitial bool) {
			r := result.(*vm.OrchestrationStatusResult)
			printOrchestrationStatus(r)
			if isTerminalStatus(r.Task.Status) {
				fmt.Printf("\nTask reached terminal state: %s\n", r.Task.Status)
			}
		},
	)
}

// isTerminalStatus checks if the status is a terminal state
func isTerminalStatus(status string) bool {
	return status == "completed" || status == "failed" || status == "cancelled"
}

// printOrchestrationStatus prints the orchestration status in human-readable format
func printOrchestrationStatus(result *vm.OrchestrationStatusResult) {
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
}

// toCompactStatus converts a full status result to a minimal compact form
func toCompactStatus(result *vm.OrchestrationStatusResult) CompactStatusResult {
	compact := CompactStatusResult{
		ID:     result.Task.ID,
		Status: result.Task.Status,
		Result: result.Task.Result,
		Error:  result.Task.ErrorMessage,
	}

	if result.Task.AssignedAgentName != nil {
		compact.Agent = *result.Task.AssignedAgentName
	}

	// Calculate duration if we have both start and end times
	if result.Task.StartedAt != nil {
		start := time.Unix(*result.Task.StartedAt/1000, 0)
		var end time.Time
		if result.Task.CompletedAt != nil {
			end = time.Unix(*result.Task.CompletedAt/1000, 0)
		} else {
			end = time.Now()
		}
		duration := end.Sub(start)
		compact.Duration = duration.Round(time.Second).String()
	}

	if result.TaskRun != nil && result.TaskRun.PullRequestURL != "" {
		compact.PRURL = result.TaskRun.PullRequestURL
	}

	return compact
}

func init() {
	orchestrateStatusCmd.Flags().BoolVarP(&orchestrateStatusWatch, "watch", "w", false, "Continuously poll for status changes until terminal state")
	orchestrateStatusCmd.Flags().IntVar(&orchestrateStatusInterval, "interval", 3, "Polling interval in seconds (default: 3)")
	orchestrateStatusCmd.Flags().BoolVar(&orchestrateStatusCompact, "compact", false, "Output compact JSON with essential fields only (use with --json)")
	orchestrateCmd.AddCommand(orchestrateStatusCmd)
}
