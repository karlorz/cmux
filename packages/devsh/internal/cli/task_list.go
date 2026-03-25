// internal/cli/task_list.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"strings"
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
	serverIndicator := getServerIndicator()
	header := fmt.Sprintf("Task List [%s] (watching, interval: %ds, Ctrl+C to stop)", serverIndicator, taskListInterval)
	config := WatchPollConfig(interval, header)

	// Create a cancellable context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle signals in a separate goroutine
	go func() {
		<-sigChan
		fmt.Println("\nStopped watching.")
		cancel()
	}()

	return PollUntil(
		ctx,
		config,
		// fetch
		func(ctx context.Context) (interface{}, error) {
			fetchCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			return client.ListTasks(fetchCtx, taskListArchived)
		},
		// shouldStop - never stop unless cancelled
		func(result interface{}, lastValue string) (bool, string, error) {
			r := result.(*vm.ListTasksResult)
			// Use task count as change detection value
			value := fmt.Sprintf("%d", len(r.Tasks))
			return false, value, nil
		},
		// display
		func(result interface{}, isInitial bool) {
			r := result.(*vm.ListTasksResult)
			fmt.Printf("Updated: %s\n\n", time.Now().Format("15:04:05"))
			printTaskList(r)
		},
	)
}

func getServerIndicator() string {
	cfg := auth.GetConfig()
	if cfg.IsDev {
		return "dev"
	}
	// Extract domain from ConvexSiteURL for a short indicator
	if cfg.ConvexSiteURL != "" {
		// Production typically uses cmux-www.karldigi.dev or similar
		if strings.Contains(cfg.ConvexSiteURL, "localhost") {
			return "local"
		}
		if strings.Contains(cfg.ConvexSiteURL, "convex.site") {
			// Convex cloud deployment - extract subdomain
			// e.g., "https://famous-camel-162.convex.site" -> "famous-camel-162"
			parts := strings.Split(cfg.ConvexSiteURL, "//")
			if len(parts) > 1 {
				host := strings.Split(parts[1], ".")[0]
				if len(host) > 15 {
					return host[:12] + "..."
				}
				return host
			}
		}
	}
	return "prod"
}

func printTaskList(result *vm.ListTasksResult) {
	// Print server indicator header
	serverIndicator := getServerIndicator()
	cfg := auth.GetConfig()
	fmt.Printf("Server: %s", serverIndicator)
	if cfg.ConvexSiteURL != "" {
		// Show truncated URL for clarity
		url := cfg.ConvexSiteURL
		if len(url) > 50 {
			url = url[:47] + "..."
		}
		fmt.Printf(" (%s)", url)
	}
	fmt.Println()
	fmt.Println()

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
