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
	taskCreateRepo      string
	taskCreateBranch    string
	taskCreateAgents    []string
	taskCreateNoSandbox bool
)

var taskCreateCmd = &cobra.Command{
	Use:   "create <prompt>",
	Short: "Create a new task and start agents",
	Long: `Create a new task with a prompt and start sandbox(es) to run the agent(s).
This is equivalent to creating a task in the web app dashboard.

By default, if agents are specified, sandboxes will be provisioned and agents started.
Use --no-sandbox to create the task without starting sandboxes.

Examples:
  cmux task create "Add unit tests for auth module"
  cmux task create --repo owner/repo "Implement dark mode"
  cmux task create --repo owner/repo --agent claude-code "Fix the login bug"
  cmux task create --repo owner/repo --agent claude-code --agent opencode/gpt-4o "Add tests"
  cmux task create --repo owner/repo --agent claude-code --no-sandbox "Just create task"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		prompt := args[0]

		if strings.TrimSpace(prompt) == "" {
			return fmt.Errorf("prompt cannot be empty")
		}

		// Use longer timeout for sandbox provisioning
		timeout := 60 * time.Second
		if len(taskCreateAgents) > 0 && !taskCreateNoSandbox {
			timeout = 5 * time.Minute // Sandbox provisioning can take a while
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

		opts := vm.CreateTaskOptions{
			Prompt:     prompt,
			Repository: taskCreateRepo,
			BaseBranch: taskCreateBranch,
			Agents:     taskCreateAgents,
		}

		// Create task and task runs (with JWTs)
		result, err := client.CreateTask(ctx, opts)
		if err != nil {
			return fmt.Errorf("failed to create task: %w", err)
		}

		// Build repo URL if repository specified
		var repoURL string
		if taskCreateRepo != "" {
			repoURL = fmt.Sprintf("https://github.com/%s", taskCreateRepo)
		}

		// Start sandboxes for each task run if agents specified and not --no-sandbox
		type sandboxInfo struct {
			TaskRunID  string `json:"taskRunId"`
			AgentName  string `json:"agentName"`
			InstanceID string `json:"instanceId,omitempty"`
			VSCodeURL  string `json:"vscodeUrl,omitempty"`
			Status     string `json:"status"`
			Error      string `json:"error,omitempty"`
		}
		var sandboxes []sandboxInfo

		if len(result.TaskRuns) > 0 && !taskCreateNoSandbox {
			if !flagJSON {
				fmt.Printf("Task created: %s\n", result.TaskID)
				fmt.Printf("Starting %d sandbox(es)...\n", len(result.TaskRuns))
			}

			for _, run := range result.TaskRuns {
				info := sandboxInfo{
					TaskRunID: run.TaskRunID,
					AgentName: run.AgentName,
					Status:    "starting",
				}

				if !flagJSON {
					fmt.Printf("  Starting sandbox for %s...\n", run.AgentName)
				}

				sandboxResult, err := client.StartSandbox(ctx, vm.StartSandboxOptions{
					TaskRunID:       run.TaskRunID,
					TaskRunJWT:      run.JWT,
					AgentName:       run.AgentName,
					Prompt:          prompt,
					ProjectFullName: taskCreateRepo,
					RepoURL:         repoURL,
					Branch:          taskCreateBranch,
					TTLSeconds:      3600,
				})

				if err != nil {
					info.Status = "failed"
					info.Error = err.Error()
					if !flagJSON {
						fmt.Printf("    Failed: %s\n", err)
					}
				} else {
					info.Status = "running"
					info.InstanceID = sandboxResult.InstanceID
					info.VSCodeURL = sandboxResult.VSCodeURL
					if !flagJSON {
						fmt.Printf("    Started: %s\n", sandboxResult.InstanceID)
						if sandboxResult.VSCodeURL != "" {
							fmt.Printf("    VSCode: %s\n", sandboxResult.VSCodeURL)
						}
					}
				}

				sandboxes = append(sandboxes, info)
			}
		}

		if flagJSON {
			output := map[string]interface{}{
				"taskId": result.TaskID,
				"status": result.Status,
			}
			if len(sandboxes) > 0 {
				output["sandboxes"] = sandboxes
			} else if len(result.TaskRuns) > 0 {
				// No sandboxes started (--no-sandbox mode)
				output["taskRuns"] = result.TaskRuns
			}
			data, _ := json.MarshalIndent(output, "", "  ")
			fmt.Println(string(data))
			return nil
		}

		if len(sandboxes) == 0 {
			fmt.Println("Task created successfully")
			fmt.Printf("  Task ID: %s\n", result.TaskID)
			if len(result.TaskRuns) > 0 {
				fmt.Println("  Task Runs:")
				for _, run := range result.TaskRuns {
					fmt.Printf("    - %s (%s)\n", run.TaskRunID, run.AgentName)
				}
				fmt.Println("  Note: Use web app to start sandboxes, or re-run without --no-sandbox")
			}
		} else {
			fmt.Println("\nTask created and sandboxes started")
			fmt.Printf("  Task ID: %s\n", result.TaskID)
		}

		return nil
	},
}

func init() {
	taskCreateCmd.Flags().StringVar(&taskCreateRepo, "repo", "", "Repository (owner/name)")
	taskCreateCmd.Flags().StringVar(&taskCreateBranch, "branch", "main", "Base branch")
	taskCreateCmd.Flags().StringArrayVar(&taskCreateAgents, "agent", nil, "Agent(s) to run (can specify multiple)")
	taskCreateCmd.Flags().BoolVar(&taskCreateNoSandbox, "no-sandbox", false, "Create task without starting sandboxes")
	taskCmd.AddCommand(taskCreateCmd)
}
