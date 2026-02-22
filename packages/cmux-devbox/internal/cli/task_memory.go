// internal/cli/task_memory.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/cmux-cli/cmux-devbox/internal/auth"
	"github.com/cmux-cli/cmux-devbox/internal/vm"
	"github.com/spf13/cobra"
)

var (
	flagMemoryType string
)

var taskMemoryCmd = &cobra.Command{
	Use:   "memory <task-run-id>",
	Short: "View memory snapshots for a task run",
	Long: `View agent memory snapshots (knowledge, daily logs, tasks, mailbox) for a task run.

Memory files are synced when an agent completes and include:
  - knowledge: Accumulated knowledge and learnings
  - daily: Daily activity logs
  - tasks: Task tracking and progress
  - mailbox: Communication messages

Examples:
  cmux task memory mn7xyz123abc...
  cmux task memory mn7xyz123abc... --type knowledge
  cmux task memory mn7xyz123abc... --type daily
  cmux task memory mn7xyz123abc... --json`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		taskRunID := args[0]

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

		result, err := client.GetTaskRunMemory(ctx, taskRunID, flagMemoryType)
		if err != nil {
			return fmt.Errorf("failed to get memory: %w", err)
		}

		if flagJSON {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
			return nil
		}

		if len(result.Memory) == 0 {
			fmt.Println("No memory synced for this task run.")
			fmt.Println()
			fmt.Println("Memory is synced when an agent completes. If the task is still running,")
			fmt.Println("memory will be available after the agent finishes.")
			return nil
		}

		// Group by memory type for display
		byType := make(map[string][]vm.MemorySnapshot)
		for _, snap := range result.Memory {
			byType[snap.MemoryType] = append(byType[snap.MemoryType], snap)
		}

		// Display order
		typeOrder := []string{"knowledge", "daily", "tasks", "mailbox"}
		typeLabels := map[string]string{
			"knowledge": "Knowledge",
			"daily":     "Daily Logs",
			"tasks":     "Tasks",
			"mailbox":   "Mailbox",
		}

		for _, memType := range typeOrder {
			snapshots, ok := byType[memType]
			if !ok || len(snapshots) == 0 {
				continue
			}

			fmt.Printf("=== %s ===\n", typeLabels[memType])
			for _, snap := range snapshots {
				// Show metadata
				if snap.AgentName != "" {
					fmt.Printf("Agent: %s\n", snap.AgentName)
				}
				if snap.Date != "" {
					fmt.Printf("Date: %s\n", snap.Date)
				}
				if snap.CreatedAt > 0 {
					fmt.Printf("Synced: %s\n", time.Unix(snap.CreatedAt/1000, 0).Format(time.RFC3339))
				}
				if snap.Truncated {
					fmt.Println("(Content truncated)")
				}
				fmt.Println()

				// Print content with indentation for readability
				content := strings.TrimSpace(snap.Content)
				if memType == "tasks" || memType == "mailbox" {
					// Try to pretty-print JSON content
					var jsonObj interface{}
					if err := json.Unmarshal([]byte(content), &jsonObj); err == nil {
						prettyJSON, _ := json.MarshalIndent(jsonObj, "", "  ")
						content = string(prettyJSON)
					}
				}
				fmt.Println(content)
				fmt.Println()
			}
		}

		return nil
	},
}

func init() {
	taskCmd.AddCommand(taskMemoryCmd)
	taskMemoryCmd.Flags().StringVarP(&flagMemoryType, "type", "t", "", "Filter by memory type (knowledge, daily, tasks, mailbox)")
}
