// internal/cli/orchestrate_replay.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/spf13/cobra"
)

var (
	replayFilter   string
	replayDryRun   bool
	replayWorkspace string
)

// ReplayResult tracks the result of replaying tasks
type ReplayResult struct {
	OriginalOrchestrationID string             `json:"originalOrchestrationId"`
	ReplayedAt              string             `json:"replayedAt"`
	TasksReplayed           int                `json:"tasksReplayed"`
	TasksSucceeded          int                `json:"tasksSucceeded"`
	TasksFailed             int                `json:"tasksFailed"`
	TasksSkipped            int                `json:"tasksSkipped"`
	Results                 []ReplayTaskResult `json:"results"`
}

type ReplayTaskResult struct {
	TaskID         string  `json:"taskId"`
	OriginalStatus string  `json:"originalStatus"`
	ReplayStatus   string  `json:"replayStatus"`
	Agent          string  `json:"agent,omitempty"`
	Error          *string `json:"error,omitempty"`
	DurationMs     int64   `json:"durationMs,omitempty"`
}

var orchestrateReplayCmd = &cobra.Command{
	Use:   "replay <bundle.json>",
	Short: "Replay tasks from an exported orchestration bundle",
	Long: `Re-run tasks from a previously exported orchestration bundle.

This command reads an export bundle (from 'devsh orchestrate export' or
'devsh orchestrate run-local --export') and replays the tasks locally.

Use cases:
- Debug a failed orchestration by re-running specific tasks
- Test prompt modifications before re-running in production
- Reproduce issues in a local environment

Filters:
  --filter=all       Replay all tasks (default)
  --filter=failed    Only replay tasks that failed originally
  --filter=pending   Only replay tasks that were pending
  --filter=completed Only replay tasks that completed (for verification)

Examples:
  devsh orchestrate replay ./debug-bundle.json
  devsh orchestrate replay ./debug-bundle.json --filter=failed
  devsh orchestrate replay ./debug-bundle.json --dry-run
  devsh orchestrate replay ./debug-bundle.json --workspace ./test-repo
  cat bundle.json | devsh orchestrate replay -`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		bundlePath := args[0]

		// Load the bundle
		bundle, err := loadReplayBundle(bundlePath)
		if err != nil {
			return fmt.Errorf("failed to load bundle: %w", err)
		}

		// Filter tasks based on flag
		tasksToReplay := filterTasksForReplay(bundle.Tasks, replayFilter)

		if len(tasksToReplay) == 0 {
			if !flagJSON {
				fmt.Printf("No tasks match filter '%s'\n", replayFilter)
			}
			return nil
		}

		// Resolve workspace
		workspace := replayWorkspace
		if workspace == "" {
			workspace, _ = os.Getwd()
		}

		// Initialize result
		result := &ReplayResult{
			OriginalOrchestrationID: bundle.Orchestration.ID,
			ReplayedAt:              time.Now().UTC().Format(time.RFC3339),
			Results:                 []ReplayTaskResult{},
		}

		if !flagJSON {
			fmt.Printf("Replay: %s\n", bundle.Orchestration.ID)
			fmt.Printf("Tasks to replay: %d (filter: %s)\n", len(tasksToReplay), replayFilter)
			fmt.Printf("Workspace: %s\n", workspace)
			fmt.Println()
		}

		// Dry-run mode
		if replayDryRun {
			fmt.Println("[DRY RUN] Would replay:")
			for i, task := range tasksToReplay {
				agent := "unknown"
				if task.AgentName != nil {
					agent = *task.AgentName
				}
				fmt.Printf("  %d. [%s] %s (was: %s)\n", i+1, task.TaskID, agent, task.Status)
				fmt.Printf("     Prompt: %s\n", truncateString(task.Prompt, 60))
			}
			return nil
		}

		// Parse timeout
		timeout, err := time.ParseDuration(localTimeout)
		if err != nil {
			timeout = 30 * time.Minute
		}

		// Replay each task
		for _, task := range tasksToReplay {
			taskResult := ReplayTaskResult{
				TaskID:         task.TaskID,
				OriginalStatus: task.Status,
			}

			// Get agent name
			agent := "claude/haiku-4.5" // default
			if task.AgentName != nil && *task.AgentName != "" {
				agent = *task.AgentName
			}
			taskResult.Agent = agent

			if !flagJSON {
				fmt.Printf("\n--- Replaying: %s ---\n", task.TaskID)
				fmt.Printf("Agent: %s\n", agent)
				fmt.Printf("Original status: %s\n", task.Status)
				fmt.Printf("Prompt: %s\n", truncateString(task.Prompt, 80))
				fmt.Println()
			}

			// Create task state
			startTime := time.Now()
			state := &LocalState{
				OrchestrationID: fmt.Sprintf("replay_%s_%s", bundle.Orchestration.ID, task.TaskID),
				StartedAt:       startTime.UTC().Format(time.RFC3339),
				Status:          "running",
				Agent:           agent,
				Prompt:          task.Prompt,
				Workspace:       workspace,
				Events:          []LocalEvent{},
			}

			// Create context with timeout
			ctx, cancel := context.WithTimeout(context.Background(), timeout)

			// Store original localAgent for the runner
			originalAgent := localAgent
			localAgent = agent

			// Run the task
			var runErr error
			if localTUI {
				runErr = runLocalWithTUI(ctx, state, task.Prompt, workspace)
			} else {
				runErr = runAgentNonTUI(ctx, state, task.Prompt, workspace)
			}

			localAgent = originalAgent
			cancel()

			// Record result
			taskResult.DurationMs = time.Since(startTime).Milliseconds()

			if runErr != nil {
				taskResult.ReplayStatus = "failed"
				errStr := runErr.Error()
				taskResult.Error = &errStr
				result.TasksFailed++

				if !flagJSON {
					fmt.Printf("\n[FAIL] %s: %v\n", task.TaskID, runErr)
				}
			} else {
				taskResult.ReplayStatus = "completed"
				result.TasksSucceeded++

				if !flagJSON {
					fmt.Printf("\n[DONE] %s completed in %s\n", task.TaskID, formatDuration(taskResult.DurationMs))
				}
			}

			result.TasksReplayed++
			result.Results = append(result.Results, taskResult)
		}

		// Print summary
		if flagJSON {
			output, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(output))
		} else {
			fmt.Printf("\n=== Replay Summary ===\n")
			fmt.Printf("Tasks replayed: %d\n", result.TasksReplayed)
			fmt.Printf("Succeeded: %d\n", result.TasksSucceeded)
			fmt.Printf("Failed: %d\n", result.TasksFailed)
		}

		if result.TasksFailed > 0 {
			return fmt.Errorf("replay completed with %d failures", result.TasksFailed)
		}
		return nil
	},
}

func loadReplayBundle(path string) (*ExportBundle, error) {
	var data []byte
	var err error

	if path == "-" {
		// Read from stdin
		data, err = io.ReadAll(os.Stdin)
		if err != nil {
			return nil, fmt.Errorf("failed to read from stdin: %w", err)
		}
	} else {
		// Read from file
		data, err = os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("failed to read file: %w", err)
		}
	}

	var bundle ExportBundle
	if err := json.Unmarshal(data, &bundle); err != nil {
		return nil, fmt.Errorf("failed to parse bundle: %w", err)
	}

	return &bundle, nil
}

func filterTasksForReplay(tasks []TaskExportInfo, filter string) []TaskExportInfo {
	if filter == "" || filter == "all" {
		return tasks
	}

	var filtered []TaskExportInfo
	for _, task := range tasks {
		switch filter {
		case "failed":
			if task.Status == "failed" {
				filtered = append(filtered, task)
			}
		case "pending":
			if task.Status == "pending" {
				filtered = append(filtered, task)
			}
		case "completed":
			if task.Status == "completed" {
				filtered = append(filtered, task)
			}
		case "running":
			if task.Status == "running" {
				filtered = append(filtered, task)
			}
		}
	}
	return filtered
}

func init() {
	orchestrateReplayCmd.Flags().StringVar(&replayFilter, "filter", "all", "Filter tasks to replay: all, failed, pending, completed")
	orchestrateReplayCmd.Flags().BoolVar(&replayDryRun, "dry-run", false, "Show what would be replayed without running")
	orchestrateReplayCmd.Flags().StringVar(&replayWorkspace, "workspace", "", "Workspace directory for replay (default: current directory)")
	orchestrateReplayCmd.Flags().BoolVar(&localTUI, "tui", false, "Show live terminal UI for each task")
	orchestrateCmd.AddCommand(orchestrateReplayCmd)
}
