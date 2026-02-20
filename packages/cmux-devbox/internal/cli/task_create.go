// internal/cli/task_create.go
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
	taskCreateRepo   string
	taskCreateBranch string
	taskCreateAgents []string
)

var taskCreateCmd = &cobra.Command{
	Use:   "create <prompt>",
	Short: "Create a new task",
	Long: `Create a new task with a prompt. This creates the same task that would
appear in the web app dashboard.

Optionally specify a repository, base branch, and agents to run.

Examples:
  cmux task create "Add unit tests for auth module"
  cmux task create --repo owner/repo "Implement dark mode"
  cmux task create --repo owner/repo --agent claude-code "Fix the login bug"
  cmux task create --repo owner/repo --agent claude-code --agent opencode/gpt-4o "Add tests"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		prompt := args[0]

		if strings.TrimSpace(prompt) == "" {
			return fmt.Errorf("prompt cannot be empty")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
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

		opts := vm.CreateTaskOptions{
			Prompt:     prompt,
			Repository: taskCreateRepo,
			BaseBranch: taskCreateBranch,
			Agents:     taskCreateAgents,
		}

		result, err := client.CreateTask(ctx, opts)
		if err != nil {
			return fmt.Errorf("failed to create task: %w", err)
		}

		if flagJSON {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
			return nil
		}

		fmt.Println("Task created successfully")
		fmt.Printf("  Task ID: %s\n", result.TaskID)
		if len(result.TaskRunIDs) > 0 {
			fmt.Printf("  Task Run IDs: %s\n", strings.Join(result.TaskRunIDs, ", "))
		}
		fmt.Printf("  Status: %s\n", result.Status)

		return nil
	},
}

func init() {
	taskCreateCmd.Flags().StringVar(&taskCreateRepo, "repo", "", "Repository (owner/name)")
	taskCreateCmd.Flags().StringVar(&taskCreateBranch, "branch", "main", "Base branch")
	taskCreateCmd.Flags().StringArrayVar(&taskCreateAgents, "agent", nil, "Agent(s) to run (can specify multiple)")
	taskCmd.AddCommand(taskCreateCmd)
}
