// internal/cli/orchestrate_spawn.go
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

var orchestrateSpawnAgent string
var orchestrateSpawnRepo string
var orchestrateSpawnBranch string
var orchestrateSpawnPRTitle string
var orchestrateSpawnDependsOn []string
var orchestrateSpawnPriority int

var orchestrateSpawnCmd = &cobra.Command{
	Use:   "spawn <prompt>",
	Short: "Spawn an agent with orchestration tracking",
	Long: `Spawn an agent with full orchestration tracking including circuit breaker
health monitoring and Convex persistence.

Creates a tasks record, taskRuns record, and orchestrationTasks record,
then spawns the agent using the standard spawn flow.

Examples:
  cmux orchestrate spawn --agent claude/haiku-4.5 --repo owner/repo "Add tests"
  cmux orchestrate spawn --agent codex/gpt-5.1-codex-mini "Fix the bug"
  cmux orchestrate spawn --agent claude/opus-4.5 --repo owner/repo --pr-title "Fix: auth bug" "Fix auth"
  cmux orchestrate spawn --agent claude/haiku-4.5 --depends-on <task-id> "Task B depends on A"
  cmux orchestrate spawn --agent claude/haiku-4.5 --priority 1 "High priority task"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		prompt := args[0]

		if orchestrateSpawnAgent == "" {
			return fmt.Errorf("--agent flag is required")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
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

		result, err := client.OrchestrationSpawn(ctx, vm.OrchestrationSpawnOptions{
			Prompt:      prompt,
			Agent:       orchestrateSpawnAgent,
			Repo:        orchestrateSpawnRepo,
			Branch:      orchestrateSpawnBranch,
			PRTitle:     orchestrateSpawnPRTitle,
			DependsOn:   orchestrateSpawnDependsOn,
			Priority:    orchestrateSpawnPriority,
			IsCloudMode: true,
		})
		if err != nil {
			return fmt.Errorf("failed to spawn agent: %w", err)
		}

		if flagJSON {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
			return nil
		}

		fmt.Println("Agent Spawned")
		fmt.Println("=============")
		fmt.Printf("  Orchestration ID: %s\n", result.OrchestrationTaskID)
		fmt.Printf("  Task ID:          %s\n", result.TaskID)
		fmt.Printf("  Task Run ID:      %s\n", result.TaskRunID)
		fmt.Printf("  Agent:            %s\n", result.AgentName)
		fmt.Printf("  Status:           %s\n", result.Status)
		if result.VSCodeURL != "" {
			fmt.Printf("  VSCode:           %s\n", result.VSCodeURL)
		}

		return nil
	},
}

func init() {
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnAgent, "agent", "", "Agent to spawn (required)")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnRepo, "repo", "", "Repository (owner/repo format)")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnBranch, "branch", "", "Base branch")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnPRTitle, "pr-title", "", "Pull request title")
	orchestrateSpawnCmd.Flags().StringSliceVar(&orchestrateSpawnDependsOn, "depends-on", nil, "Orchestration task IDs this task depends on (can be specified multiple times)")
	orchestrateSpawnCmd.Flags().IntVar(&orchestrateSpawnPriority, "priority", 5, "Task priority (0=highest, 10=lowest, default 5)")
	orchestrateCmd.AddCommand(orchestrateSpawnCmd)
}
