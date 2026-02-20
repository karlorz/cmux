// internal/cli/task_list.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/cmux-cli/cmux-devbox/internal/auth"
	"github.com/cmux-cli/cmux-devbox/internal/vm"
	"github.com/spf13/cobra"
)

var taskListArchived bool

var taskListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tasks",
	Long: `List all tasks for your team. Shows the same tasks as the web app dashboard.

Examples:
  cmux task list               # List active tasks
  cmux task list --archived    # List archived tasks
  cmux task list --json        # Output as JSON`,
	Aliases: []string{"ls"},
	RunE: func(cmd *cobra.Command, args []string) error {
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

		result, err := client.ListTasks(ctx, taskListArchived)
		if err != nil {
			return fmt.Errorf("failed to list tasks: %w", err)
		}

		if flagJSON {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
			return nil
		}

		if len(result.Tasks) == 0 {
			if taskListArchived {
				fmt.Println("No archived tasks found.")
			} else {
				fmt.Println("No active tasks found. Create one with 'cmux task create'")
			}
			return nil
		}

		fmt.Printf("%-30s %-12s %-15s %s\n", "TASK ID", "STATUS", "AGENT", "PROMPT")
		fmt.Println("------------------------------", "------------", "---------------", "--------------------")

		for _, task := range result.Tasks {
			prompt := task.Prompt
			if len(prompt) > 40 {
				prompt = prompt[:37] + "..."
			}

			agent := task.Agent
			if agent == "" {
				agent = "-"
			}
			if len(agent) > 15 {
				agent = agent[:12] + "..."
			}

			status := task.Status
			if task.IsArchived {
				status = "archived"
			} else if task.IsCompleted {
				status = "completed"
			}

			fmt.Printf("%-30s %-12s %-15s %s\n", task.ID, status, agent, prompt)
		}

		return nil
	},
}

func init() {
	taskListCmd.Flags().BoolVar(&taskListArchived, "archived", false, "List archived tasks instead of active tasks")
	taskCmd.AddCommand(taskListCmd)
}
