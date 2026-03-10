// internal/cli/orchestrate_debug.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var (
	debugShowEvents bool
	debugShowDeps   bool
	debugShowHealth bool
)

var orchestrateDebugCmd = &cobra.Command{
	Use:   "debug [orch-task-id]",
	Short: "Debug orchestration task or show system health",
	Long: `Debug a specific orchestration task or show overall system health.

Without a task ID, shows provider health and circuit breaker states.
With a task ID, shows detailed task info including dependency graph.

Flags:
  --events    Stream EVENTS.jsonl from sandbox (requires task ID with sandbox)
  --deps      Show dependency graph for the task
  --health    Show provider circuit breaker states and health metrics

Examples:
  devsh orchestrate debug                    # Show overall health
  devsh orchestrate debug --health           # Same as above
  devsh orchestrate debug <task-id>          # Show task details
  devsh orchestrate debug <task-id> --deps   # Show dependency graph
  devsh orchestrate debug <task-id> --events # Stream events from sandbox`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		if ctx == nil {
			ctx = context.Background()
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

		// If no task ID provided, show health overview
		if len(args) == 0 || debugShowHealth {
			return showHealthOverview(ctx, client)
		}

		orchTaskID := args[0]

		// Show task dependency graph
		if debugShowDeps {
			return showDependencyGraph(ctx, client, orchTaskID)
		}

		// Stream events from sandbox
		if debugShowEvents {
			return streamEvents(ctx, client, orchTaskID)
		}

		// Default: show detailed task info
		return showTaskDetails(ctx, client, orchTaskID)
	},
}

func showHealthOverview(ctx context.Context, client *vm.Client) error {
	metrics, err := client.OrchestrationMetrics(ctx)
	if err != nil {
		return fmt.Errorf("failed to get metrics: %w", err)
	}

	if flagJSON {
		data, _ := json.MarshalIndent(metrics, "", "  ")
		fmt.Println(string(data))
		return nil
	}

	fmt.Println("Orchestration Health Overview")
	fmt.Println("==============================")
	fmt.Printf("Active Orchestrations: %d\n", metrics.ActiveOrchestrations)
	fmt.Println()

	// Tasks by status
	fmt.Println("Tasks by Status:")
	statuses := []string{"pending", "assigned", "running", "completed", "failed", "cancelled"}
	for _, status := range statuses {
		count := metrics.TasksByStatus[status]
		bar := strings.Repeat("|", min(count, 50))
		fmt.Printf("  %-10s %3d %s\n", status, count, bar)
	}
	fmt.Println()

	// Provider health
	fmt.Println("Provider Health:")
	fmt.Println("-----------------")

	// Sort providers for consistent output
	providers := make([]string, 0, len(metrics.ProviderHealth))
	for p := range metrics.ProviderHealth {
		providers = append(providers, p)
	}
	sort.Strings(providers)

	for _, provider := range providers {
		info := metrics.ProviderHealth[provider]
		statusIcon := getStatusIcon(info.Status)
		circuitIcon := getCircuitIcon(info.CircuitState)

		fmt.Printf("  %s %-12s %s Circuit: %-10s\n", statusIcon, provider, circuitIcon, info.CircuitState)
		fmt.Printf("      Latency P50: %6.0fms  P99: %6.0fms\n", info.LatencyP50, info.LatencyP99)
		fmt.Printf("      Success Rate: %5.1f%%  Failures: %d\n", info.SuccessRate*100, info.FailureCount)
	}

	return nil
}

func showDependencyGraph(ctx context.Context, client *vm.Client, orchTaskID string) error {
	// Get the task status first
	result, err := client.OrchestrationStatus(ctx, orchTaskID)
	if err != nil {
		return fmt.Errorf("failed to get task: %w", err)
	}

	task := result.Task

	if flagJSON {
		data, _ := json.MarshalIndent(map[string]interface{}{
			"taskId":       task.ID,
			"status":       task.Status,
			"dependencies": task.Dependencies,
		}, "", "  ")
		fmt.Println(string(data))
		return nil
	}

	fmt.Println("Dependency Graph")
	fmt.Println("================")
	fmt.Printf("Task: %s\n", task.ID)
	fmt.Printf("Status: %s\n", task.Status)
	fmt.Println()

	if len(task.Dependencies) == 0 {
		fmt.Println("No dependencies")
	} else {
		fmt.Printf("Blocked by %d task(s):\n", len(task.Dependencies))
		for _, depID := range task.Dependencies {
			// Try to get status of each dependency
			depResult, err := client.OrchestrationStatus(ctx, depID)
			if err != nil {
				fmt.Printf("  [?] %s (status unknown)\n", depID)
			} else {
				icon := getStatusIcon(depResult.Task.Status)
				fmt.Printf("  %s %s (%s)\n", icon, depID, depResult.Task.Status)
			}
		}
	}

	// Also show what this task might be blocking
	listResult, err := client.OrchestrationList(ctx, "")
	if err == nil {
		blocking := []string{}
		for _, t := range listResult.Tasks {
			for _, dep := range t.Dependencies {
				if dep == orchTaskID {
					blocking = append(blocking, t.ID)
					break
				}
			}
		}
		if len(blocking) > 0 {
			fmt.Println()
			fmt.Printf("Blocking %d task(s):\n", len(blocking))
			for _, blockID := range blocking {
				fmt.Printf("  -> %s\n", blockID)
			}
		}
	}

	return nil
}

func streamEvents(ctx context.Context, client *vm.Client, orchTaskID string) error {
	statusCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	result, err := client.OrchestrationStatus(statusCtx, orchTaskID)
	cancel()
	if err != nil {
		return fmt.Errorf("failed to get task: %w", err)
	}

	streamID, hasSessionID := resolveEventStreamID(result)
	if strings.TrimSpace(streamID) == "" {
		return fmt.Errorf("task %s does not expose an event stream identifier", orchTaskID)
	}

	fmt.Printf("Streaming orchestration events for %s\n", streamID)
	fmt.Printf("Source task: %s\n", orchTaskID)
	if result.TaskRun != nil {
		fmt.Printf("Linked task run: %s\n", result.TaskRun.ID)
	}
	if hasSessionID {
		fmt.Println("Mode: orchestration session stream")
	} else {
		fmt.Println("Mode: single-task fallback stream")
		fmt.Println("Results tip: this flow may not have a standalone orchestration session ID; rely on status/debug output unless one is shown elsewhere.")
	}
	fmt.Println("Press Ctrl+C to stop streaming.")
	fmt.Println()

	return client.SubscribeOrchestrationEvents(ctx, streamID, "", func(event vm.OrchestrationEvent) {
		if event.Event == "" {
			return
		}

		line, nextAction, terminalStatus := formatOrchestrationEvent(event, result, hasSessionID)
		if line != "" {
			fmt.Println(line)
		}
		if nextAction != "" {
			fmt.Println(nextAction)
		}
		_ = terminalStatus
	})
}

func resolveEventStreamID(result *vm.OrchestrationStatusResult) (string, bool) {
	if result == nil {
		return "", false
	}
	metadata := result.Task.Metadata
	if metadata != nil {
		if orchestrationID, ok := metadata["orchestrationId"].(string); ok && strings.TrimSpace(orchestrationID) != "" {
			return strings.TrimSpace(orchestrationID), true
		}
	}
	if strings.TrimSpace(result.Task.ID) != "" {
		return strings.TrimSpace(result.Task.ID), false
	}
	return "", false
}

func formatOrchestrationEvent(event vm.OrchestrationEvent, result *vm.OrchestrationStatusResult, hasSessionID bool) (string, string, string) {
	timestamp := time.Now().Format("15:04:05")
	data := event.Data
	taskID := strings.TrimSpace(getEventString(data, "taskId"))
	status := strings.TrimSpace(getEventString(data, "status"))
	assignedAgent := strings.TrimSpace(getEventString(data, "assignedAgentName"))
	completedCount := getEventInt(data, "completedCount")
	pendingCount := getEventInt(data, "pendingCount")
	failedCount := getEventInt(data, "failedCount")
	runningCount := getEventInt(data, "runningCount")

	switch event.Event {
	case "connected":
		return fmt.Sprintf("[%s] connected stream=%s", timestamp, getEventString(data, "orchestrationId")), "", ""
	case "heartbeat":
		return fmt.Sprintf("[%s] heartbeat running=%d pending=%d completed=%d failed=%d", timestamp, runningCount, pendingCount, completedCount, failedCount), "", ""
	case "task_completed":
		resultSummary := summarizeText(getEventString(data, "result"), 120)
		line := fmt.Sprintf("[%s] task_completed %s status=completed", timestamp, fallbackTaskID(taskID, result))
		if resultSummary != "" {
			line += fmt.Sprintf(" result=%q", resultSummary)
		}
		return line, "", "completed"
	case "task_status":
		line := fmt.Sprintf("[%s] task_status %s status=%s", timestamp, fallbackTaskID(taskID, result), fallbackStatus(status))
		if assignedAgent != "" {
			line += fmt.Sprintf(" agent=%s", assignedAgent)
		}
		errorSummary := summarizeText(getEventString(data, "errorMessage"), 160)
		if errorSummary != "" {
			line += fmt.Sprintf(" error=%q", errorSummary)
			return line, renderFailureGuidance(result, hasSessionID), status
		}
		if isTerminalStatus(status) && status != "completed" {
			return line, renderFailureGuidance(result, hasSessionID), status
		}
		return line, "", status
	default:
		return fmt.Sprintf("[%s] %s %s", timestamp, event.Event, summarizeText(mustMarshalEventData(data), 160)), "", ""
	}
}

func renderFailureGuidance(result *vm.OrchestrationStatusResult, hasSessionID bool) string {
	actions := make([]string, 0, 3)
	if result != nil && result.TaskRun != nil && strings.TrimSpace(result.TaskRun.ID) != "" {
		actions = append(actions, fmt.Sprintf("next: devsh orchestrate message %s \"<guidance>\" --type request", result.TaskRun.ID))
	}
	if result != nil && result.Task.TaskID != nil && strings.TrimSpace(*result.Task.TaskID) != "" {
		actions = append(actions, fmt.Sprintf("retry: devsh task retry %s", strings.TrimSpace(*result.Task.TaskID)))
	}
	if hasSessionID {
		if orchestrationID, ok := resolveFailureResultsID(result); ok {
			actions = append(actions, fmt.Sprintf("results: devsh orchestrate results %s", orchestrationID))
		}
	}
	return strings.Join(actions, " | ")
}

func resolveFailureResultsID(result *vm.OrchestrationStatusResult) (string, bool) {
	if result == nil {
		return "", false
	}
	metadata := result.Task.Metadata
	if metadata == nil {
		return "", false
	}
	orchestrationID, ok := metadata["orchestrationId"].(string)
	if !ok || strings.TrimSpace(orchestrationID) == "" {
		return "", false
	}
	return strings.TrimSpace(orchestrationID), true
}

func fallbackTaskID(taskID string, result *vm.OrchestrationStatusResult) string {
	if strings.TrimSpace(taskID) != "" {
		return strings.TrimSpace(taskID)
	}
	if result != nil {
		return strings.TrimSpace(result.Task.ID)
	}
	return "unknown-task"
}

func fallbackStatus(status string) string {
	if strings.TrimSpace(status) == "" {
		return "unknown"
	}
	return strings.TrimSpace(status)
}

func getEventString(data map[string]any, key string) string {
	if data == nil {
		return ""
	}
	value, ok := data[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	default:
		return fmt.Sprintf("%v", value)
	}
}

func getEventInt(data map[string]any, key string) int {
	if data == nil {
		return 0
	}
	value, ok := data[key]
	if !ok || value == nil {
		return 0
	}
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed)
		}
	}
	return 0
}

func summarizeText(value string, limit int) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.Join(strings.Fields(trimmed), " ")
	if len(trimmed) <= limit {
		return trimmed
	}
	if limit <= 3 {
		return trimmed[:limit]
	}
	return trimmed[:limit-3] + "..."
}

func mustMarshalEventData(data map[string]any) string {
	encoded, err := json.Marshal(data)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}

func showTaskDetails(ctx context.Context, client *vm.Client, orchTaskID string) error {
	result, err := client.OrchestrationStatus(ctx, orchTaskID)
	if err != nil {
		return fmt.Errorf("failed to get task: %w", err)
	}

	if flagJSON {
		data, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(data))
		return nil
	}

	task := result.Task

	fmt.Println("Orchestration Task Debug")
	fmt.Println("========================")
	fmt.Printf("ID:       %s\n", task.ID)
	fmt.Printf("Status:   %s %s\n", getStatusIcon(task.Status), task.Status)
	fmt.Printf("Priority: %d\n", task.Priority)
	fmt.Println()

	fmt.Println("Prompt:")
	fmt.Println("-------")
	// Wrap long prompts
	if len(task.Prompt) > 200 {
		fmt.Printf("%s...\n", task.Prompt[:200])
	} else {
		fmt.Println(task.Prompt)
	}
	fmt.Println()

	if task.AssignedAgentName != nil {
		fmt.Printf("Agent:    %s\n", *task.AssignedAgentName)
	}

	fmt.Println()
	fmt.Println("Timeline:")
	fmt.Println("---------")
	fmt.Printf("  Created: %s\n", time.Unix(task.CreatedAt/1000, 0).Format(time.RFC3339))
	if task.StartedAt != nil {
		fmt.Printf("  Started: %s\n", time.Unix(*task.StartedAt/1000, 0).Format(time.RFC3339))
	}
	if task.CompletedAt != nil {
		fmt.Printf("  Ended:   %s\n", time.Unix(*task.CompletedAt/1000, 0).Format(time.RFC3339))
	}

	if task.ErrorMessage != nil {
		fmt.Println()
		fmt.Println("Error:")
		fmt.Println("------")
		fmt.Printf("%s\n", *task.ErrorMessage)
	}

	if task.Result != nil {
		fmt.Println()
		fmt.Println("Result:")
		fmt.Println("-------")
		fmt.Printf("%s\n", *task.Result)
	}

	if result.TaskRun != nil {
		fmt.Println()
		fmt.Println("Task Run:")
		fmt.Println("---------")
		fmt.Printf("  ID:     %s\n", result.TaskRun.ID)
		fmt.Printf("  Agent:  %s\n", result.TaskRun.Agent)
		fmt.Printf("  Status: %s\n", result.TaskRun.Status)
		if result.TaskRun.VSCodeURL != "" {
			fmt.Printf("  VSCode: %s\n", result.TaskRun.VSCodeURL)
		}
	}

	return nil
}

func getStatusIcon(status string) string {
	switch status {
	case "completed", "healthy":
		return "[OK]"
	case "running", "assigned":
		return "[..]"
	case "pending":
		return "[--]"
	case "failed", "unhealthy":
		return "[XX]"
	case "cancelled":
		return "[~~]"
	case "degraded":
		return "[!!]"
	default:
		return "[??]"
	}
}

func getCircuitIcon(state string) string {
	switch state {
	case "closed":
		return "[OK]"
	case "open":
		return "[XX]"
	case "half-open":
		return "[!!]"
	default:
		return "[??]"
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func init() {
	orchestrateDebugCmd.Flags().BoolVar(&debugShowEvents, "events", false, "Stream EVENTS.jsonl from sandbox")
	orchestrateDebugCmd.Flags().BoolVar(&debugShowDeps, "deps", false, "Show dependency graph")
	orchestrateDebugCmd.Flags().BoolVar(&debugShowHealth, "health", false, "Show provider health metrics")
	orchestrateCmd.AddCommand(orchestrateDebugCmd)
}
