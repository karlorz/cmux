// internal/cli/orchestrate_spawn.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/cost"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var orchestrateSpawnAgent string
var orchestrateSpawnRepo string
var orchestrateSpawnBranch string
var orchestrateSpawnPRTitle string
var orchestrateSpawnDependsOn []string
var orchestrateSpawnPriority int
var orchestrateSpawnUseEnvJwt bool
var orchestrateSpawnCloudWorkspace bool
var orchestrateSpawnSupervisorProfile string
var orchestrateSpawnVariant string
var orchestrateSpawnEffort string
var orchestrateSpawnSync bool
var orchestrateSpawnSyncTimeout string
var orchestrateSpawnCompact bool
var orchestrateSpawnRetry int
var orchestrateSpawnRetryBackoff string
var orchestrateSpawnRetryInjectContext bool
var orchestrateSpawnEstimate bool
var orchestrateSpawnComplexity string

var orchestrateSpawnCmd = &cobra.Command{
	Use:   "spawn <prompt>",
	Short: "Spawn an agent with orchestration tracking",
	Long: `Spawn an agent with full orchestration tracking including circuit breaker
health monitoring and Convex persistence.

Creates a tasks record, taskRuns record, and orchestrationTasks record,
then spawns the agent using the standard spawn flow.

Supports two authentication methods:
1. Standard CLI auth (default) - Uses your logged-in credentials
2. JWT auth (--use-env-jwt) - Uses CMUX_TASK_RUN_JWT from environment
   This allows agents to spawn sub-agents using their task-run JWT.

Use --cloud-workspace to spawn as an orchestration head agent that can
coordinate multiple sub-agents. Head agents receive special instructions
and the CMUX_IS_ORCHESTRATION_HEAD=1 environment variable.

Examples:
  devsh orchestrate spawn --agent claude/haiku-4.5 --repo owner/repo "Add tests"
  devsh orchestrate spawn --agent codex/gpt-5.4 --variant xhigh "Fix the bug"
  devsh orchestrate spawn --agent claude/opus-4.5 --repo owner/repo --pr-title "Fix: auth bug" "Fix auth"
  devsh orchestrate spawn --agent claude/haiku-4.5 --depends-on <orch-task-id> "Task B depends on A"
  devsh orchestrate spawn --agent claude/haiku-4.5 --priority 1 "High priority task"
  devsh orchestrate spawn --agent claude/haiku-4.5 --use-env-jwt "Sub-task from head agent"
  devsh orchestrate spawn --cloud-workspace --agent claude/opus-4.6 --effort max "Coordinate feature implementation"
  devsh orchestrate spawn --supervisor-profile <profile-id> --agent claude/opus-4.6 "Supervised task"
  devsh orchestrate spawn --sync --timeout 10m --agent claude/haiku-4.5 "Quick task with wait"
  devsh orchestrate spawn --retry 3 --agent claude/haiku-4.5 "Task with auto-retry"
  devsh orchestrate spawn --retry 3 --retry-backoff exponential --agent claude/haiku-4.5 "Retry with backoff"
  devsh orchestrate spawn --retry 3 --retry-inject-context --agent claude/haiku-4.5 "Retry with failure context"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		prompt := args[0]

		if orchestrateSpawnAgent == "" {
			return fmt.Errorf("--agent flag is required")
		}

		// Handle --estimate flag
		if orchestrateSpawnEstimate {
			estimate := cost.EstimateCost(orchestrateSpawnAgent, orchestrateSpawnComplexity)
			if flagJSON {
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(estimate)
			}
			fmt.Println(cost.FormatCostEstimate(estimate))
			return nil
		}

		// Retry requires --sync
		if orchestrateSpawnRetry > 0 && !orchestrateSpawnSync {
			return fmt.Errorf("--retry requires --sync flag to track task completion")
		}

		selectedVariant, err := resolveVariantFlagValue(
			orchestrateSpawnVariant,
			orchestrateSpawnEffort,
		)
		if err != nil {
			return err
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

		// Get JWT from environment if --use-env-jwt flag is set
		var taskRunJwt string
		if orchestrateSpawnUseEnvJwt {
			taskRunJwt = os.Getenv("CMUX_TASK_RUN_JWT")
			if taskRunJwt == "" {
				return fmt.Errorf("--use-env-jwt flag set but CMUX_TASK_RUN_JWT environment variable is not set")
			}
		}

		// Retry loop
		maxAttempts := 1
		if orchestrateSpawnRetry > 0 {
			maxAttempts = orchestrateSpawnRetry + 1 // retry count is additional attempts
		}

		var lastError error
		var lastErrorMsg string

		for attempt := 1; attempt <= maxAttempts; attempt++ {
			currentPrompt := prompt

			// Inject context from previous failure if enabled
			if attempt > 1 && orchestrateSpawnRetryInjectContext && lastErrorMsg != "" {
				currentPrompt = fmt.Sprintf("%s\n\n[RETRY CONTEXT: Previous attempt failed with: %s. Please adjust your approach accordingly.]",
					prompt, lastErrorMsg)
				if !flagJSON {
					fmt.Printf("Retry %d/%d: Injecting failure context into prompt\n", attempt, maxAttempts)
				}
			} else if attempt > 1 && !flagJSON {
				fmt.Printf("Retry %d/%d\n", attempt, maxAttempts)
			}

			// Apply backoff delay before retry
			if attempt > 1 {
				delay := calculateRetryDelay(attempt-1, orchestrateSpawnRetryBackoff)
				if !flagJSON {
					fmt.Printf("  Waiting %s before retry...\n", delay)
				}
				time.Sleep(delay)
			}

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)

			result, err := client.OrchestrationSpawn(ctx, vm.OrchestrationSpawnOptions{
				Prompt:              currentPrompt,
				Agent:               orchestrateSpawnAgent,
				SelectedVariant:     selectedVariant,
				Repo:                orchestrateSpawnRepo,
				Branch:              orchestrateSpawnBranch,
				PRTitle:             orchestrateSpawnPRTitle,
				DependsOn:           orchestrateSpawnDependsOn,
				Priority:            orchestrateSpawnPriority,
				IsCloudMode:         true,
				TaskRunJwt:          taskRunJwt,
				IsCloudWorkspace:    orchestrateSpawnCloudWorkspace,
				IsOrchestrationHead: orchestrateSpawnCloudWorkspace,
				SupervisorProfileID: orchestrateSpawnSupervisorProfile,
			})
			cancel()

			if err != nil {
				lastError = fmt.Errorf("failed to spawn agent: %w", err)
				lastErrorMsg = err.Error()
				if attempt < maxAttempts {
					continue
				}
				return lastError
			}

			// Handle non-sync mode (fire and forget)
			if !orchestrateSpawnSync {
				return outputSpawnResult(result)
			}

			// Sync mode: wait and check result
			finalResult, err := waitForSpawnCompletion(client, result.OrchestrationTaskID)
			if err != nil {
				lastError = err
				lastErrorMsg = err.Error()
				if attempt < maxAttempts {
					continue
				}
				return err
			}

			// Check if task failed
			if finalResult.Task.Status == "failed" || finalResult.Task.Status == "cancelled" {
				if finalResult.Task.ErrorMessage != nil {
					lastErrorMsg = *finalResult.Task.ErrorMessage
				} else {
					lastErrorMsg = finalResult.Task.Status
				}
				lastError = fmt.Errorf("task %s", finalResult.Task.Status)

				if attempt < maxAttempts {
					continue
				}
				// Output final failed result
				outputSyncResult(finalResult)
				return lastError
			}

			// Success!
			outputSyncResult(finalResult)
			return nil
		}

		return lastError
	},
}

// calculateRetryDelay returns the delay duration before a retry attempt.
func calculateRetryDelay(attempt int, backoffType string) time.Duration {
	baseDelay := 30 * time.Second

	switch backoffType {
	case "exponential":
		// 30s, 60s, 120s, 240s, ...
		multiplier := 1 << (attempt - 1) // 2^(attempt-1)
		return baseDelay * time.Duration(multiplier)
	case "linear":
		// 30s, 60s, 90s, 120s, ...
		return baseDelay * time.Duration(attempt)
	default: // constant
		return baseDelay
	}
}

// waitForSpawnCompletion waits for a spawned task to reach a terminal state.
func waitForSpawnCompletion(client *vm.Client, orchTaskID string) (*vm.OrchestrationStatusResult, error) {
	syncTimeout, err := time.ParseDuration(orchestrateSpawnSyncTimeout)
	if err != nil {
		return nil, fmt.Errorf("invalid sync timeout duration: %w", err)
	}

	if !flagJSON {
		fmt.Printf("Spawned task %s, waiting for completion (timeout: %s)...\n", orchTaskID, syncTimeout)
	}

	waitCtx, waitCancel := context.WithTimeout(context.Background(), syncTimeout)
	defer waitCancel()

	config := DefaultPollConfig(5 * time.Second)
	var finalResult *vm.OrchestrationStatusResult

	err = PollUntil(
		waitCtx,
		config,
		func(ctx context.Context) (interface{}, error) {
			return client.OrchestrationStatus(ctx, orchTaskID)
		},
		func(pollResult interface{}, lastValue string) (bool, string, error) {
			r := pollResult.(*vm.OrchestrationStatusResult)
			status := r.Task.Status
			if !flagJSON && status != lastValue {
				fmt.Printf("  Status: %s\n", status)
			}
			finalResult = r
			switch status {
			case "completed", "failed", "cancelled":
				return true, status, nil
			}
			return false, status, nil
		},
		func(pollResult interface{}, isInitial bool) {},
	)

	if err != nil {
		if waitCtx.Err() != nil {
			return nil, fmt.Errorf("timeout waiting for task to complete")
		}
		return nil, err
	}

	if finalResult == nil {
		return nil, fmt.Errorf("no result received")
	}

	return finalResult, nil
}

// outputSpawnResult outputs the spawn result (non-sync mode).
func outputSpawnResult(result *vm.OrchestrationSpawnResult) error {
	if flagJSON {
		data, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(data))
		return nil
	}

	fmt.Println("Agent Spawned")
	fmt.Println("=============")
	fmt.Printf("  %-22s %s\n", "Orchestration Task ID:", result.OrchestrationTaskID)
	fmt.Printf("  %-22s %s\n", "Task ID:", result.TaskID)
	fmt.Printf("  %-22s %s\n", "Task Run ID:", result.TaskRunID)
	fmt.Printf("  %-22s %s\n", "Agent:", result.AgentName)
	fmt.Printf("  %-22s %s\n", "Status:", result.Status)
	if result.Status == "spawning" {
		fmt.Println("  Sandbox is being provisioned in the background.")
		fmt.Println("  Use 'devsh task status' to check progress.")
	}
	if result.VSCodeURL != "" {
		fmt.Printf("  %-22s %s\n", "VSCode:", result.VSCodeURL)
	}
	return nil
}

// outputSyncResult outputs the sync mode result.
func outputSyncResult(finalResult *vm.OrchestrationStatusResult) {
	if flagJSON {
		if orchestrateSpawnCompact {
			compact := toCompactStatus(finalResult)
			data, _ := json.Marshal(compact)
			fmt.Println(string(data))
		} else {
			data, _ := json.MarshalIndent(finalResult, "", "  ")
			fmt.Println(string(data))
		}
	} else {
		fmt.Printf("\nTask finished with status: %s\n", finalResult.Task.Status)
		if finalResult.Task.ErrorMessage != nil {
			fmt.Printf("Error: %s\n", *finalResult.Task.ErrorMessage)
		}
		if finalResult.Task.Result != nil {
			fmt.Printf("Result: %s\n", *finalResult.Task.Result)
		}
		if finalResult.TaskRun != nil && finalResult.TaskRun.PullRequestURL != "" {
			fmt.Printf("PR: %s\n", finalResult.TaskRun.PullRequestURL)
		}
	}
}

func init() {
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnAgent, "agent", "", "Agent to spawn (required)")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnRepo, "repo", "", "Repository (owner/repo format)")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnBranch, "branch", "", "Base branch")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnPRTitle, "pr-title", "", "Pull request title")
	orchestrateSpawnCmd.Flags().StringSliceVar(&orchestrateSpawnDependsOn, "depends-on", nil, "Orchestration task IDs this task depends on (can be specified multiple times)")
	orchestrateSpawnCmd.Flags().IntVar(&orchestrateSpawnPriority, "priority", 5, "Task priority (0=highest, 10=lowest, default 5)")
	orchestrateSpawnCmd.Flags().BoolVar(&orchestrateSpawnUseEnvJwt, "use-env-jwt", false, "Use CMUX_TASK_RUN_JWT from environment for authentication (allows agents to spawn sub-agents)")
	orchestrateSpawnCmd.Flags().BoolVar(&orchestrateSpawnCloudWorkspace, "cloud-workspace", false, "Spawn as an orchestration head agent (cloud workspace for coordinating sub-agents)")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnSupervisorProfile, "supervisor-profile", "", "Supervisor profile ID to use for head agent behavior (Convex doc ID)")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnVariant, "variant", "", "Effort variant to use for the selected model")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnEffort, "effort", "", "Alias for --variant")
	orchestrateSpawnCmd.Flags().BoolVar(&orchestrateSpawnSync, "sync", false, "Wait for task completion after spawning (combines spawn + wait)")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnSyncTimeout, "timeout", "10m", "Timeout for --sync mode (default: 10m)")
	orchestrateSpawnCmd.Flags().BoolVar(&orchestrateSpawnCompact, "compact", false, "Output compact JSON with essential fields only (use with --json --sync)")
	orchestrateSpawnCmd.Flags().IntVar(&orchestrateSpawnRetry, "retry", 0, "Number of retry attempts on failure (requires --sync)")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnRetryBackoff, "retry-backoff", "constant", "Retry backoff strategy: constant, linear, or exponential")
	orchestrateSpawnCmd.Flags().BoolVar(&orchestrateSpawnRetryInjectContext, "retry-inject-context", false, "Inject failure reason into retry prompt")
	orchestrateSpawnCmd.Flags().BoolVar(&orchestrateSpawnEstimate, "estimate", false, "Show cost estimate without spawning")
	orchestrateSpawnCmd.Flags().StringVar(&orchestrateSpawnComplexity, "complexity", "medium", "Task complexity for cost estimation: simple, medium, or complex")
	orchestrateCmd.AddCommand(orchestrateSpawnCmd)
}
