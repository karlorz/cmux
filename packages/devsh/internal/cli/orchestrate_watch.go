// internal/cli/orchestrate_watch.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var (
	watchOrchestrationID string
	watchFormat          string
	watchInterval        int
)

var orchestrateWatchCmd = &cobra.Command{
	Use:   "watch [task-id...]",
	Short: "Watch multiple orchestration tasks",
	Long: `Watch multiple orchestration tasks with real-time status updates.

Aggregates status from multiple tasks and displays updates as they occur.
Exits when all tasks reach a terminal state (completed, failed, cancelled).

Examples:
  devsh orchestrate watch task1 task2 task3           # Watch specific tasks
  devsh orchestrate watch --orchestration-id orch_xxx # Watch all tasks in session
  devsh orchestrate watch --format compact task1      # Compact one-line output
  devsh orchestrate watch --interval 10 task1         # Poll every 10 seconds`,
	RunE: runWatch,
}

func init() {
	orchestrateWatchCmd.Flags().StringVar(&watchOrchestrationID, "orchestration-id", "", "Watch all tasks in an orchestration session")
	orchestrateWatchCmd.Flags().StringVar(&watchFormat, "format", "normal", "Output format: normal, compact, or json")
	orchestrateWatchCmd.Flags().IntVar(&watchInterval, "interval", 5, "Polling interval in seconds")
	orchestrateCmd.AddCommand(orchestrateWatchCmd)
}

// WatchStatus tracks the status of a single task.
type WatchStatus struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Agent     string `json:"agent,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
	Error     string `json:"error,omitempty"`
	Result    string `json:"result,omitempty"`
}

// WatchSummary provides an aggregate view of all watched tasks.
type WatchSummary struct {
	Total     int           `json:"total"`
	Completed int           `json:"completed"`
	Failed    int           `json:"failed"`
	Cancelled int           `json:"cancelled"`
	Running   int           `json:"running"`
	Pending   int           `json:"pending"`
	Tasks     []WatchStatus `json:"tasks"`
}

func runWatch(cmd *cobra.Command, args []string) error {
	if watchOrchestrationID == "" && len(args) == 0 {
		return fmt.Errorf("provide task IDs or --orchestration-id")
	}

	teamSlug, err := auth.GetTeamSlug()
	if err != nil {
		return fmt.Errorf("failed to get team: %w", err)
	}

	client, err := vm.NewClient()
	if err != nil {
		return fmt.Errorf("failed to create client: %w", err)
	}
	client.SetTeamSlug(teamSlug)

	// Get task IDs to watch
	taskIDs := args
	if watchOrchestrationID != "" {
		// Fetch all tasks for orchestration session
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		listResult, err := client.OrchestrationList(ctx, "")
		cancel()
		if err != nil {
			return fmt.Errorf("failed to list tasks: %w", err)
		}

		// Filter by orchestration ID (would need server support, for now use all)
		for _, t := range listResult.Tasks {
			taskIDs = append(taskIDs, t.ID)
		}

		if len(taskIDs) == 0 {
			return fmt.Errorf("no tasks found for orchestration %s", watchOrchestrationID)
		}
	}

	interval := time.Duration(watchInterval) * time.Second
	if interval < time.Second {
		interval = 5 * time.Second
	}

	// Track last status for change detection
	lastStatuses := make(map[string]string)

	if watchFormat != "json" {
		fmt.Printf("Watching %d task(s)... (Ctrl+C to stop)\n\n", len(taskIDs))
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		summary := fetchWatchSummary(client, taskIDs)

		// Check for changes and output
		hasChanges := false
		for _, task := range summary.Tasks {
			if lastStatuses[task.ID] != task.Status {
				hasChanges = true
				lastStatuses[task.ID] = task.Status
			}
		}

		if hasChanges || watchFormat == "json" {
			outputWatchSummary(summary, watchFormat)
		}

		// Check if all tasks are done
		if summary.Completed+summary.Failed+summary.Cancelled == summary.Total {
			if watchFormat != "json" {
				fmt.Printf("\nAll tasks finished: %d completed, %d failed, %d cancelled\n",
					summary.Completed, summary.Failed, summary.Cancelled)
			}
			if summary.Failed > 0 {
				return fmt.Errorf("%d task(s) failed", summary.Failed)
			}
			return nil
		}

		<-ticker.C
	}
}

func fetchWatchSummary(client *vm.Client, taskIDs []string) WatchSummary {
	summary := WatchSummary{
		Total: len(taskIDs),
		Tasks: make([]WatchStatus, 0, len(taskIDs)),
	}

	for _, id := range taskIDs {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		result, err := client.OrchestrationStatus(ctx, id)
		cancel()

		status := WatchStatus{ID: id}

		if err != nil {
			status.Status = "error"
			status.Error = err.Error()
		} else {
			status.Status = result.Task.Status
			if result.Task.AssignedAgentName != nil {
				status.Agent = *result.Task.AssignedAgentName
			}
			if result.Task.ErrorMessage != nil {
				status.Error = *result.Task.ErrorMessage
			}
			if result.Task.Result != nil {
				status.Result = *result.Task.Result
			}
		}

		summary.Tasks = append(summary.Tasks, status)

		// Update counts
		switch status.Status {
		case "completed":
			summary.Completed++
		case "failed":
			summary.Failed++
		case "cancelled":
			summary.Cancelled++
		case "running", "assigned":
			summary.Running++
		default:
			summary.Pending++
		}
	}

	// Sort by status (running first, then pending, then terminal)
	sort.Slice(summary.Tasks, func(i, j int) bool {
		order := map[string]int{
			"running": 0, "assigned": 1, "pending": 2, "spawning": 3,
			"completed": 4, "failed": 5, "cancelled": 6, "error": 7,
		}
		return order[summary.Tasks[i].Status] < order[summary.Tasks[j].Status]
	})

	return summary
}

func outputWatchSummary(summary WatchSummary, format string) {
	switch format {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.Encode(summary)

	case "compact":
		// One-line summary
		var parts []string
		for _, task := range summary.Tasks {
			symbol := statusSymbol(task.Status)
			parts = append(parts, fmt.Sprintf("%s%s", symbol, task.ID[:8]))
		}
		fmt.Printf("[%s] %s\n", time.Now().Format("15:04:05"), strings.Join(parts, " "))

	default: // normal
		fmt.Printf("[%s] Tasks: %d total | %d running | %d completed | %d failed\n",
			time.Now().Format("15:04:05"),
			summary.Total, summary.Running, summary.Completed, summary.Failed)

		for _, task := range summary.Tasks {
			symbol := statusSymbol(task.Status)
			line := fmt.Sprintf("  %s %-20s %s", symbol, task.ID, task.Status)
			if task.Agent != "" {
				line += fmt.Sprintf(" [%s]", task.Agent)
			}
			if task.Error != "" && len(task.Error) < 50 {
				line += fmt.Sprintf(" - %s", task.Error)
			}
			fmt.Println(line)
		}
		fmt.Println()
	}
}

func statusSymbol(status string) string {
	switch status {
	case "completed":
		return "[OK]"
	case "failed":
		return "[X]"
	case "cancelled":
		return "[-]"
	case "running", "assigned":
		return "[>]"
	default:
		return "[.]"
	}
}
