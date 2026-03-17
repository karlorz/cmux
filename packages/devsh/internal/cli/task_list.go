// internal/cli/task_list.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var (
	taskListArchived bool
	taskListWatch    bool
	taskListInterval int
)

var taskListCmd = &cobra.Command{
	Use:   "list",
	Short: "List tasks",
	Long: `List all tasks for your team. Shows the same tasks as the web app dashboard.

Examples:
  devsh task list                    # List active tasks
  devsh task list --archived         # List archived tasks
  devsh task list --json             # Output as JSON
  devsh task list --watch            # Watch mode with live updates
  devsh task list --watch --interval 5  # Watch with 5-second interval`,
	Aliases: []string{"ls"},
	RunE: func(cmd *cobra.Command, args []string) error {
		if taskListWatch {
			return runTaskListWatch()
		}
		return runTaskListOnce()
	},
}

func runTaskListOnce() error {
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

	printTaskList(result)
	return nil
}

func runTaskListWatch() error {
	// Set up signal handling for graceful exit
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	teamSlug, err := auth.GetTeamSlug()
	if err != nil {
		return fmt.Errorf("failed to get team: %w", err)
	}

	client, err := vm.NewClient()
	if err != nil {
		return fmt.Errorf("failed to create client: %w", err)
	}
	client.SetTeamSlug(teamSlug)

	interval := time.Duration(taskListInterval) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Initial fetch
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	result, err := client.ListTasks(ctx, taskListArchived)
	cancel()
	if err != nil {
		return fmt.Errorf("failed to list tasks: %w", err)
	}

	// Clear screen and print
	fmt.Print("\033[H\033[2J")
	fmt.Printf("Task List (watching, interval: %ds, Ctrl+C to stop)\n", taskListInterval)
	fmt.Printf("Updated: %s\n\n", time.Now().Format("15:04:05"))
	printTaskList(result)

	for {
		select {
		case <-sigChan:
			fmt.Println("\nStopped watching.")
			return nil
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			result, err := client.ListTasks(ctx, taskListArchived)
			cancel()
			if err != nil {
				fmt.Printf("\nError: %v\n", err)
				continue
			}

			// Clear screen and print
			fmt.Print("\033[H\033[2J")
			fmt.Printf("Task List (watching, interval: %ds, Ctrl+C to stop)\n", taskListInterval)
			fmt.Printf("Updated: %s\n\n", time.Now().Format("15:04:05"))
			printTaskList(result)
		}
	}
}

func printTaskList(result *vm.ListTasksResult) {
	if len(result.Tasks) == 0 {
		if taskListArchived {
			fmt.Println("No archived tasks found.")
		} else {
			fmt.Println("No active tasks found. Create one with 'devsh task create'")
		}
		return
	}

	fmt.Printf("%-30s %-12s %-15s %-8s %-50s %s\n", "TASK ID", "STATUS", "AGENT", "PR", "PR URL", "PROMPT")
	fmt.Println("------------------------------", "------------", "---------------", "--------", "--------------------------------------------------", "--------------------")

	for _, task := range result.Tasks {
		prompt := task.Prompt
		if len(prompt) > 30 {
			prompt = prompt[:27] + "..."
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
		} else if status == "failed" {
			// Keep "failed" status - don't override with "completed"
		} else if task.IsCompleted {
			status = "completed"
		}
		// Append exit code to status if available
		if task.ExitCode != nil {
			status = fmt.Sprintf("%s (exit %d)", status, *task.ExitCode)
		}

		// PR status from mergeStatus field
		prStatus := "-"
		switch task.MergeStatus {
		case "pr_draft":
			prStatus = "draft"
		case "pr_open":
			prStatus = "open"
		case "pr_approved":
			prStatus = "approved"
		case "pr_changes_requested":
			prStatus = "changes"
		case "pr_merged":
			prStatus = "merged"
		case "pr_closed":
			prStatus = "closed"
		}

		// PR URL (truncate if too long)
		prURL := "-"
		if task.PullRequestURL != "" {
			prURL = task.PullRequestURL
			if len(prURL) > 50 {
				prURL = prURL[:47] + "..."
			}
		}

		fmt.Printf("%-30s %-12s %-15s %-8s %-50s %s\n", task.ID, status, agent, prStatus, prURL, prompt)
	}
}

func init() {
	taskListCmd.Flags().BoolVar(&taskListArchived, "archived", false, "List archived tasks instead of active tasks")
	taskListCmd.Flags().BoolVarP(&taskListWatch, "watch", "w", false, "Watch mode with live updates")
	taskListCmd.Flags().IntVar(&taskListInterval, "interval", 10, "Refresh interval in seconds (for --watch mode)")
	taskCmd.AddCommand(taskListCmd)
}
