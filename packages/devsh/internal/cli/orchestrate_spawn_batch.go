// internal/cli/orchestrate_spawn_batch.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/cost"
	"github.com/karlorz/devsh/internal/plan"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var (
	spawnBatchSync      bool
	spawnBatchParallel  int
	spawnBatchTimeout   string
	spawnBatchDryRun    bool
	spawnBatchUseEnvJwt bool
	spawnBatchCompact   bool
	// Template flags
	spawnBatchTemplate string
	spawnBatchPrompt   string
	spawnBatchPrompts  string
	spawnBatchFiles    string
	spawnBatchRepo     string
	spawnBatchBranch   string
	spawnBatchAgent    string
	// Cost estimation flags
	spawnBatchEstimate   bool
	spawnBatchComplexity string
)

var orchestrateSpawnBatchCmd = &cobra.Command{
	Use:   "spawn-batch [file|-|json]",
	Short: "Spawn multiple agents with dependency management",
	Long: `Spawn multiple agents from a YAML/JSON batch specification or template.

Tasks are executed in topological order based on their dependencies.
Tasks without dependencies or with satisfied dependencies run in parallel.

Input formats:
  - YAML file:  devsh orchestrate spawn-batch tasks.yaml
  - JSON file:  devsh orchestrate spawn-batch tasks.json
  - Stdin:      cat tasks.yaml | devsh orchestrate spawn-batch -
  - Inline JSON: devsh orchestrate spawn-batch '[{"id":"t1","prompt":"task","agent":"claude/haiku-4.5"}]'
  - Template:   devsh orchestrate spawn-batch --template pipeline --prompt "Add auth"

Templates:
  fan-out   - Spawn multiple agents for files/prompts in parallel
  pipeline  - Sequential stages: design -> implement -> test -> review
  review    - One agent implements, another reviews
  parallel  - Run independent tasks in parallel

YAML/JSON schema:
  tasks:
    - id: design          # Unique task ID
      prompt: "..."       # Task prompt
      agent: claude/opus-4.7
    - id: implement
      prompt: "..."
      agent: codex/gpt-5.4-xhigh
      depends_on: [design]  # Wait for 'design' to complete
  defaults:
    repo: owner/repo      # Applied to all tasks
    branch: main

Examples:
  devsh orchestrate spawn-batch tasks.yaml
  devsh orchestrate spawn-batch tasks.yaml --sync
  devsh orchestrate spawn-batch --template pipeline --prompt "Add user auth" --repo owner/repo
  devsh orchestrate spawn-batch --template fan-out --files "a.ts,b.ts,c.ts" --prompt "Fix bugs"
  devsh orchestrate spawn-batch --template review --prompt "Refactor auth" --repo owner/repo
  devsh orchestrate spawn-batch --template parallel --prompts "Task A,Task B,Task C"`,
	Args: cobra.MaximumNArgs(1),
	RunE: runSpawnBatch,
}

func init() {
	orchestrateCmd.AddCommand(orchestrateSpawnBatchCmd)

	orchestrateSpawnBatchCmd.Flags().BoolVar(&spawnBatchSync, "sync", false, "Wait for all tasks to complete")
	orchestrateSpawnBatchCmd.Flags().IntVar(&spawnBatchParallel, "parallel", 0, "Max parallel spawns per batch (0 = unlimited)")
	orchestrateSpawnBatchCmd.Flags().StringVar(&spawnBatchTimeout, "timeout", "30m", "Timeout for --sync mode")
	orchestrateSpawnBatchCmd.Flags().BoolVar(&spawnBatchDryRun, "dry-run", false, "Show execution plan without spawning")
	orchestrateSpawnBatchCmd.Flags().BoolVar(&spawnBatchUseEnvJwt, "use-env-jwt", false, "Use CMUX_TASK_RUN_JWT for auth")
	orchestrateSpawnBatchCmd.Flags().BoolVar(&spawnBatchCompact, "compact", false, "Compact output")

	// Template flags
	orchestrateSpawnBatchCmd.Flags().StringVar(&spawnBatchTemplate, "template", "", "Use built-in template (fan-out, pipeline, review, parallel)")
	orchestrateSpawnBatchCmd.Flags().StringVar(&spawnBatchPrompt, "prompt", "", "Primary prompt for template")
	orchestrateSpawnBatchCmd.Flags().StringVar(&spawnBatchPrompts, "prompts", "", "Comma-separated prompts for parallel/fan-out templates")
	orchestrateSpawnBatchCmd.Flags().StringVar(&spawnBatchFiles, "files", "", "Comma-separated files for fan-out template")
	orchestrateSpawnBatchCmd.Flags().StringVar(&spawnBatchRepo, "repo", "", "Repository for template (owner/repo)")
	orchestrateSpawnBatchCmd.Flags().StringVar(&spawnBatchBranch, "branch", "", "Branch for template")
	orchestrateSpawnBatchCmd.Flags().StringVar(&spawnBatchAgent, "agent", "", "Override default agent for template")

	// Cost estimation flags
	orchestrateSpawnBatchCmd.Flags().BoolVar(&spawnBatchEstimate, "estimate", false, "Show cost estimate without spawning")
	orchestrateSpawnBatchCmd.Flags().StringVar(&spawnBatchComplexity, "complexity", "medium", "Task complexity for cost estimation: simple, medium, or complex")
}

// SpawnBatchResult contains results from a batch spawn operation.
type SpawnBatchResult struct {
	Tasks   []SpawnBatchTaskResult `json:"tasks"`
	Batches int                    `json:"batches"`
	Total   int                    `json:"total"`
	Success int                    `json:"success"`
	Failed  int                    `json:"failed"`
}

// SpawnBatchTaskResult contains result for a single task in the batch.
type SpawnBatchTaskResult struct {
	ID                  string `json:"id"`
	OrchestrationTaskID string `json:"orchestrationTaskId,omitempty"`
	TaskID              string `json:"taskId,omitempty"`
	Status              string `json:"status"`
	Error               string `json:"error,omitempty"`
}

func runSpawnBatch(cmd *cobra.Command, args []string) error {
	var spec *plan.BatchSpec
	var err error

	// Handle template mode vs file mode
	if spawnBatchTemplate != "" {
		spec, err = generateFromTemplate()
		if err != nil {
			return fmt.Errorf("failed to generate from template: %w", err)
		}
	} else {
		if len(args) == 0 {
			return fmt.Errorf("provide a batch file or use --template")
		}
		spec, err = parseBatchInput(args[0])
		if err != nil {
			return fmt.Errorf("failed to parse batch spec: %w", err)
		}
	}

	// Get topological batches
	batches, err := plan.TopologicalBatches(spec.Tasks)
	if err != nil {
		return fmt.Errorf("failed to resolve dependencies: %w", err)
	}

	// Dry run: just show the execution plan
	if spawnBatchDryRun {
		return showExecutionPlan(spec, batches)
	}

	// Cost estimate: show estimated costs without spawning
	if spawnBatchEstimate {
		return showCostEstimate(spec, spawnBatchComplexity)
	}

	// Get auth
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
	if spawnBatchUseEnvJwt {
		taskRunJwt = os.Getenv("CMUX_TASK_RUN_JWT")
		if taskRunJwt == "" {
			return fmt.Errorf("--use-env-jwt flag set but CMUX_TASK_RUN_JWT environment variable is not set")
		}
	}

	// Track orchestration task IDs for dependency resolution
	orchTaskIDs := make(map[string]string) // task ID -> orchestration task ID

	result := SpawnBatchResult{
		Batches: len(batches),
		Total:   len(spec.Tasks),
	}

	// Execute batches
	for batchNum, batch := range batches {
		if !flagJSON && !spawnBatchCompact {
			fmt.Printf("Batch %d/%d (%d tasks)\n", batchNum+1, len(batches), len(batch))
		}

		// Spawn all tasks in this batch
		for _, task := range batch {
			taskResult := SpawnBatchTaskResult{
				ID: task.ID,
			}

			// Resolve depends_on to orchestration task IDs
			var dependsOn []string
			for _, depID := range task.DependsOn {
				if orchTaskID, ok := orchTaskIDs[depID]; ok {
					dependsOn = append(dependsOn, orchTaskID)
				}
			}

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			spawnResult, err := client.OrchestrationSpawn(ctx, vm.OrchestrationSpawnOptions{
				Prompt:      task.Prompt,
				Agent:       task.Agent,
				Repo:        task.Repo,
				Branch:      task.Branch,
				DependsOn:   dependsOn,
				Priority:    task.Priority,
				IsCloudMode: true,
				TaskRunJwt:  taskRunJwt,
			})
			cancel()

			if err != nil {
				taskResult.Status = "spawn_failed"
				taskResult.Error = err.Error()
				result.Failed++
			} else {
				taskResult.OrchestrationTaskID = spawnResult.OrchestrationTaskID
				taskResult.TaskID = spawnResult.TaskID
				taskResult.Status = "spawned"
				orchTaskIDs[task.ID] = spawnResult.OrchestrationTaskID
				result.Success++

				if !flagJSON && !spawnBatchCompact {
					fmt.Printf("  %s: %s\n", task.ID, spawnResult.OrchestrationTaskID)
				}
			}

			result.Tasks = append(result.Tasks, taskResult)
		}

		// If --sync, wait for this batch to complete before next
		if spawnBatchSync && batchNum < len(batches)-1 {
			if !flagJSON && !spawnBatchCompact {
				fmt.Printf("  Waiting for batch %d to complete...\n", batchNum+1)
			}
			if err := waitForBatch(client, batch, orchTaskIDs, spawnBatchTimeout); err != nil {
				return fmt.Errorf("batch %d failed: %w", batchNum+1, err)
			}
		}
	}

	// Final wait if --sync
	if spawnBatchSync {
		if !flagJSON && !spawnBatchCompact {
			fmt.Println("Waiting for all tasks to complete...")
		}
		if err := waitForAllTasks(client, spec.Tasks, orchTaskIDs, spawnBatchTimeout); err != nil {
			return fmt.Errorf("wait failed: %w", err)
		}
	}

	// Output result
	if flagJSON {
		enc := json.NewEncoder(os.Stdout)
		if !spawnBatchCompact {
			enc.SetIndent("", "  ")
		}
		return enc.Encode(result)
	}

	fmt.Printf("\nSpawned %d/%d tasks in %d batches\n", result.Success, result.Total, result.Batches)
	if result.Failed > 0 {
		fmt.Printf("Failed: %d\n", result.Failed)
	}

	return nil
}

func generateFromTemplate() (*plan.BatchSpec, error) {
	templateName, err := plan.ValidateTemplateName(spawnBatchTemplate)
	if err != nil {
		return nil, err
	}

	// Parse comma-separated values
	var prompts, files []string
	if spawnBatchPrompts != "" {
		prompts = strings.Split(spawnBatchPrompts, ",")
		for i := range prompts {
			prompts[i] = strings.TrimSpace(prompts[i])
		}
	}
	if spawnBatchFiles != "" {
		files = strings.Split(spawnBatchFiles, ",")
		for i := range files {
			files[i] = strings.TrimSpace(files[i])
		}
	}

	return plan.GenerateFromTemplate(plan.TemplateParams{
		Template: templateName,
		Prompt:   spawnBatchPrompt,
		Prompts:  prompts,
		Files:    files,
		Repo:     spawnBatchRepo,
		Branch:   spawnBatchBranch,
		Agent:    spawnBatchAgent,
	})
}

func parseBatchInput(input string) (*plan.BatchSpec, error) {
	var data []byte
	var err error

	if input == "-" {
		// Read from stdin
		data, err = io.ReadAll(os.Stdin)
		if err != nil {
			return nil, fmt.Errorf("failed to read stdin: %w", err)
		}
	} else if strings.HasPrefix(input, "[") || strings.HasPrefix(input, "{") {
		// Inline JSON
		data = []byte(input)
		// Wrap array in tasks field if needed
		if strings.HasPrefix(input, "[") {
			data = []byte(fmt.Sprintf(`{"tasks":%s}`, input))
		}
	} else {
		// File path
		return plan.ParseBatchFile(input)
	}

	return plan.ParseBatch(data)
}

func showExecutionPlan(spec *plan.BatchSpec, batches [][]plan.BatchTask) error {
	if flagJSON {
		output := struct {
			Batches [][]plan.BatchTask `json:"batches"`
			Total   int                `json:"total"`
		}{
			Batches: batches,
			Total:   len(spec.Tasks),
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(output)
	}

	fmt.Printf("Execution Plan (%d tasks in %d batches)\n\n", len(spec.Tasks), len(batches))

	for i, batch := range batches {
		fmt.Printf("Batch %d:\n", i+1)
		for _, task := range batch {
			deps := ""
			if len(task.DependsOn) > 0 {
				deps = fmt.Sprintf(" (after: %s)", strings.Join(task.DependsOn, ", "))
			}
			fmt.Printf("  - %s [%s]%s\n", task.ID, task.Agent, deps)
			if len(task.Prompt) > 60 {
				fmt.Printf("    %s...\n", task.Prompt[:57])
			} else {
				fmt.Printf("    %s\n", task.Prompt)
			}
		}
		fmt.Println()
	}

	return nil
}

func waitForBatch(client *vm.Client, batch []plan.BatchTask, orchTaskIDs map[string]string, timeout string) error {
	timeoutDur, err := time.ParseDuration(timeout)
	if err != nil {
		return fmt.Errorf("invalid timeout: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeoutDur)
	defer cancel()

	for _, task := range batch {
		orchTaskID, ok := orchTaskIDs[task.ID]
		if !ok {
			continue // Task failed to spawn
		}

		config := DefaultPollConfig(5 * time.Second)
		err := PollUntil(
			ctx,
			config,
			func(ctx context.Context) (interface{}, error) {
				return client.OrchestrationStatus(ctx, orchTaskID)
			},
			func(pollResult interface{}, lastValue string) (bool, string, error) {
				r := pollResult.(*vm.OrchestrationStatusResult)
				status := r.Task.Status
				switch status {
				case "completed", "failed", "cancelled":
					return true, status, nil
				default:
					return false, status, nil
				}
			},
			func(result interface{}, isInitial bool) {
				// Silent display - batch mode doesn't need per-task output
			},
		)
		if err != nil {
			return fmt.Errorf("task %s: %w", task.ID, err)
		}
	}

	return nil
}

func waitForAllTasks(client *vm.Client, tasks []plan.BatchTask, orchTaskIDs map[string]string, timeout string) error {
	timeoutDur, err := time.ParseDuration(timeout)
	if err != nil {
		return fmt.Errorf("invalid timeout: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeoutDur)
	defer cancel()

	for _, task := range tasks {
		orchTaskID, ok := orchTaskIDs[task.ID]
		if !ok {
			continue // Task failed to spawn
		}

		config := DefaultPollConfig(5 * time.Second)
		err := PollUntil(
			ctx,
			config,
			func(ctx context.Context) (interface{}, error) {
				return client.OrchestrationStatus(ctx, orchTaskID)
			},
			func(pollResult interface{}, lastValue string) (bool, string, error) {
				r := pollResult.(*vm.OrchestrationStatusResult)
				status := r.Task.Status
				switch status {
				case "completed", "failed", "cancelled":
					return true, status, nil
				default:
					return false, status, nil
				}
			},
			func(result interface{}, isInitial bool) {
				// Silent display - batch mode doesn't need per-task output
			},
		)
		if err != nil {
			return fmt.Errorf("task %s: %w", task.ID, err)
		}
	}

	return nil
}

func showCostEstimate(spec *plan.BatchSpec, complexity string) error {
	// Collect all agents from tasks
	var agents []string
	for _, task := range spec.Tasks {
		agents = append(agents, task.Agent)
	}

	estimate := cost.EstimateBatchCost(agents, complexity)

	if flagJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(estimate)
	}

	fmt.Println(cost.FormatBatchCostEstimate(estimate))
	return nil
}
