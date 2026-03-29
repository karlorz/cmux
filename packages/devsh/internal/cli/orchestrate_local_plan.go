// internal/cli/orchestrate_local_plan.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	planFile     string
	planParallel bool
)

// PlanFile represents a YAML plan file for sequential task execution
type PlanFile struct {
	Name        string     `yaml:"name" json:"name"`
	Description string     `yaml:"description,omitempty" json:"description,omitempty"`
	Workspace   string     `yaml:"workspace,omitempty" json:"workspace,omitempty"`
	Timeout     string     `yaml:"timeout,omitempty" json:"timeout,omitempty"`
	Tasks       []PlanTask `yaml:"tasks" json:"tasks"`
}

// PlanTask represents a single task in the plan
type PlanTask struct {
	ID        string   `yaml:"id" json:"id"`
	Agent     string   `yaml:"agent" json:"agent"`
	Prompt    string   `yaml:"prompt" json:"prompt"`
	Workspace string   `yaml:"workspace,omitempty" json:"workspace,omitempty"`
	Timeout   string   `yaml:"timeout,omitempty" json:"timeout,omitempty"`
	DependsOn []string `yaml:"depends_on,omitempty" json:"dependsOn,omitempty"`
}

// PlanState represents the execution state of a plan
type PlanState struct {
	PlanName      string       `json:"planName"`
	StartedAt     string       `json:"startedAt"`
	CompletedAt   string       `json:"completedAt,omitempty"`
	DurationMs    int64        `json:"durationMs,omitempty"`
	Status        string       `json:"status"`
	TasksTotal    int          `json:"tasksTotal"`
	TasksComplete int          `json:"tasksComplete"`
	TasksFailed   int          `json:"tasksFailed"`
	TaskStates    []LocalState `json:"taskStates"`
	Events        []LocalEvent `json:"events"`
}

func (p *PlanState) addEvent(eventType, message string) {
	ts := time.Now().UTC().Format(time.RFC3339)
	p.Events = append(p.Events, LocalEvent{
		Timestamp: ts,
		Type:      eventType,
		Message:   message,
	})
	if flagVerbose && !flagJSON {
		fmt.Printf("[%s] %s: %s\n", ts, eventType, message)
	}
}

var orchestratePlanCmd = &cobra.Command{
	Use:   "run-plan <plan.yaml>",
	Short: "Run multiple tasks from a YAML plan file",
	Long: `Execute multiple agent tasks sequentially from a YAML plan file.

The plan file defines tasks with optional dependencies. Tasks run in order,
respecting dependencies (a task waits for its dependencies to complete).

Plan file format:
  name: my-orchestration
  description: Optional description
  workspace: /path/to/repo  # Default workspace for all tasks
  timeout: 1h               # Default timeout for all tasks
  tasks:
    - id: task1
      agent: claude/haiku-4.5
      prompt: "First task"
    - id: task2
      agent: codex/gpt-5.1-codex-mini
      prompt: "Second task"
      depends_on: [task1]   # Wait for task1 to complete
    - id: task3
      agent: claude/opus-4.5
      prompt: "Third task"
      workspace: /other/repo  # Override workspace
      timeout: 2h             # Override timeout

Parallel Execution (--parallel):
  By default, tasks run sequentially. With --parallel, tasks without
  dependencies run concurrently, and tasks wait only for their explicit
  dependencies to complete before starting.

Examples:
  devsh orchestrate run-plan tasks.yaml
  devsh orchestrate run-plan tasks.yaml --parallel
  devsh orchestrate run-plan tasks.yaml --export results.json
  devsh orchestrate run-plan tasks.yaml --dry-run
  devsh orchestrate run-plan tasks.yaml --verbose`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		planPath := args[0]

		// Read and parse plan file
		plan, err := loadPlanFile(planPath)
		if err != nil {
			return fmt.Errorf("failed to load plan file: %w", err)
		}

		// Validate plan
		if err := validatePlan(plan); err != nil {
			return fmt.Errorf("invalid plan: %w", err)
		}

		// Resolve default workspace
		defaultWorkspace := plan.Workspace
		if defaultWorkspace == "" {
			defaultWorkspace, _ = os.Getwd()
		}
		defaultWorkspace, _ = filepath.Abs(defaultWorkspace)

		// Resolve default timeout
		defaultTimeout := plan.Timeout
		if defaultTimeout == "" {
			defaultTimeout = "30m"
		}

		// Initialize plan state
		startTime := time.Now()
		planState := &PlanState{
			PlanName:   plan.Name,
			StartedAt:  startTime.UTC().Format(time.RFC3339),
			Status:     "running",
			TasksTotal: len(plan.Tasks),
			TaskStates: []LocalState{},
			Events:     []LocalEvent{},
		}

		planState.addEvent("plan_started", fmt.Sprintf("Starting plan '%s' with %d tasks", plan.Name, len(plan.Tasks)))

		if !flagJSON {
			fmt.Printf("Plan: %s\n", plan.Name)
			if plan.Description != "" {
				fmt.Printf("Description: %s\n", plan.Description)
			}
			fmt.Printf("Tasks: %d\n", len(plan.Tasks))
			fmt.Printf("Default Workspace: %s\n", defaultWorkspace)
			fmt.Printf("Default Timeout: %s\n", defaultTimeout)
			fmt.Println()
		}

		// Dry-run mode
		if localDryRun {
			fmt.Println("[DRY RUN] Would execute:")
			for i, task := range plan.Tasks {
				ws := task.Workspace
				if ws == "" {
					ws = defaultWorkspace
				}
				to := task.Timeout
				if to == "" {
					to = defaultTimeout
				}
				fmt.Printf("  %d. [%s] %s\n", i+1, task.ID, task.Agent)
				fmt.Printf("     Prompt: %s\n", truncateString(task.Prompt, 60))
				fmt.Printf("     Workspace: %s\n", ws)
				fmt.Printf("     Timeout: %s\n", to)
				if len(task.DependsOn) > 0 {
					fmt.Printf("     Depends on: %v\n", task.DependsOn)
				}
			}
			return nil
		}

		// Execute tasks - parallel or sequential mode
		if planParallel {
			return runPlanParallel(plan, planState, defaultWorkspace, defaultTimeout, startTime)
		}

		// Sequential execution: Build dependency graph
		completed := make(map[string]bool)
		failed := make(map[string]bool)

		// Execute tasks in order, respecting dependencies
		for _, task := range plan.Tasks {
			// Check dependencies
			for _, dep := range task.DependsOn {
				if failed[dep] {
					planState.addEvent("task_skipped", fmt.Sprintf("Skipping task '%s' - dependency '%s' failed", task.ID, dep))
					if !flagJSON {
						fmt.Printf("\n[SKIP] Task %s - dependency %s failed\n", task.ID, dep)
					}
					failed[task.ID] = true
					planState.TasksFailed++
					continue
				}
				if !completed[dep] {
					planState.addEvent("task_error", fmt.Sprintf("Task '%s' depends on '%s' which hasn't completed", task.ID, dep))
					failed[task.ID] = true
					planState.TasksFailed++
					continue
				}
			}

			if failed[task.ID] {
				continue
			}

			// Resolve task workspace and timeout
			taskWorkspace := task.Workspace
			if taskWorkspace == "" {
				taskWorkspace = defaultWorkspace
			}
			taskWorkspace, _ = filepath.Abs(taskWorkspace)

			taskTimeout := task.Timeout
			if taskTimeout == "" {
				taskTimeout = defaultTimeout
			}

			timeout, err := time.ParseDuration(taskTimeout)
			if err != nil {
				planState.addEvent("task_error", fmt.Sprintf("Invalid timeout for task '%s': %v", task.ID, err))
				failed[task.ID] = true
				planState.TasksFailed++
				continue
			}

			// Create task state
			taskStartTime := time.Now()
			taskState := &LocalState{
				OrchestrationID: fmt.Sprintf("%s_%s", plan.Name, task.ID),
				StartedAt:       taskStartTime.UTC().Format(time.RFC3339),
				Status:          "running",
				Agent:           task.Agent,
				Prompt:          task.Prompt,
				Workspace:       taskWorkspace,
				Events:          []LocalEvent{},
			}

			planState.addEvent("task_started", fmt.Sprintf("Starting task '%s' with agent %s", task.ID, task.Agent))

			if !flagJSON {
				fmt.Printf("\n--- Task: %s ---\n", task.ID)
				fmt.Printf("Agent: %s\n", task.Agent)
				fmt.Printf("Workspace: %s\n", taskWorkspace)
				fmt.Printf("Prompt: %s\n", truncateString(task.Prompt, 80))
				fmt.Println()
			}

			// Create context with timeout
			ctx, cancel := context.WithTimeout(context.Background(), timeout)

			// Run the task
			var runErr error
			// Store original localAgent for the runner
			originalAgent := localAgent
			localAgent = task.Agent

			if localTUI {
				runErr = runLocalWithTUI(ctx, taskState, task.Prompt, taskWorkspace)
			} else {
				runErr = runAgentNonTUI(ctx, taskState, task.Prompt, taskWorkspace)
			}

			localAgent = originalAgent
			cancel()

			// Update task state
			taskEndTime := time.Now()
			taskState.CompletedAt = taskEndTime.UTC().Format(time.RFC3339)
			taskState.DurationMs = taskEndTime.Sub(taskStartTime).Milliseconds()

			if runErr != nil {
				taskState.Status = "failed"
				errStr := runErr.Error()
				taskState.Error = &errStr
				taskState.addEvent("task_failed", runErr.Error())
				planState.addEvent("task_failed", fmt.Sprintf("Task '%s' failed: %v", task.ID, runErr))
				failed[task.ID] = true
				planState.TasksFailed++

				if !flagJSON {
					fmt.Printf("\n[FAIL] Task %s failed: %v\n", task.ID, runErr)
				}
			} else {
				taskState.Status = "completed"
				result := "Task completed successfully"
				taskState.Result = &result
				taskState.addEvent("task_completed", "Task finished successfully")
				planState.addEvent("task_completed", fmt.Sprintf("Task '%s' completed in %s", task.ID, formatDuration(taskState.DurationMs)))
				completed[task.ID] = true
				planState.TasksComplete++

				if !flagJSON {
					fmt.Printf("\n[DONE] Task %s completed in %s\n", task.ID, formatDuration(taskState.DurationMs))
				}
			}

			planState.TaskStates = append(planState.TaskStates, *taskState)
		}

		// Finalize plan state
		endTime := time.Now()
		planState.CompletedAt = endTime.UTC().Format(time.RFC3339)
		planState.DurationMs = endTime.Sub(startTime).Milliseconds()

		if planState.TasksFailed > 0 {
			planState.Status = "failed"
			planState.addEvent("plan_failed", fmt.Sprintf("Plan completed with %d failures", planState.TasksFailed))
		} else {
			planState.Status = "completed"
			planState.addEvent("plan_completed", fmt.Sprintf("Plan completed successfully in %s", formatDuration(planState.DurationMs)))
		}

		// Export if requested
		if localExport != "" {
			if err := exportPlanState(planState, localExport); err != nil {
				if !flagJSON {
					fmt.Printf("Warning: failed to export state: %v\n", err)
				}
			} else if !flagJSON {
				fmt.Printf("\nExported to: %s\n", localExport)
			}
		}

		// Print summary
		if flagJSON {
			output, _ := json.MarshalIndent(planState, "", "  ")
			fmt.Println(string(output))
		} else {
			fmt.Printf("\n=== Plan Summary ===\n")
			fmt.Printf("Status: %s\n", planState.Status)
			fmt.Printf("Duration: %s\n", formatDuration(planState.DurationMs))
			fmt.Printf("Tasks: %d/%d completed, %d failed\n",
				planState.TasksComplete, planState.TasksTotal, planState.TasksFailed)
		}

		if planState.TasksFailed > 0 {
			return fmt.Errorf("plan failed with %d task failures", planState.TasksFailed)
		}
		return nil
	},
}

// runPlanParallel executes tasks in parallel, respecting dependencies
func runPlanParallel(plan *PlanFile, planState *PlanState, defaultWorkspace, defaultTimeout string, startTime time.Time) error {
	var mu sync.Mutex
	completed := make(map[string]bool)
	failed := make(map[string]bool)
	taskStates := make(map[string]*LocalState)
	taskDone := make(map[string]chan struct{})

	// Initialize done channels for each task
	for _, task := range plan.Tasks {
		taskDone[task.ID] = make(chan struct{})
	}

	var wg sync.WaitGroup
	errChan := make(chan error, len(plan.Tasks))

	// Launch all tasks as goroutines
	for _, task := range plan.Tasks {
		wg.Add(1)
		go func(task PlanTask) {
			defer wg.Done()
			defer close(taskDone[task.ID])

			// Wait for dependencies
			for _, dep := range task.DependsOn {
				<-taskDone[dep]
				mu.Lock()
				depFailed := failed[dep]
				mu.Unlock()
				if depFailed {
					mu.Lock()
					failed[task.ID] = true
					planState.TasksFailed++
					planState.addEvent("task_skipped", fmt.Sprintf("Skipping task '%s' - dependency '%s' failed", task.ID, dep))
					mu.Unlock()
					if !flagJSON {
						fmt.Printf("\n[SKIP] Task %s - dependency %s failed\n", task.ID, dep)
					}
					return
				}
			}

			// Resolve task workspace and timeout
			taskWorkspace := task.Workspace
			if taskWorkspace == "" {
				taskWorkspace = defaultWorkspace
			}
			taskWorkspace, _ = filepath.Abs(taskWorkspace)

			taskTimeout := task.Timeout
			if taskTimeout == "" {
				taskTimeout = defaultTimeout
			}

			timeout, err := time.ParseDuration(taskTimeout)
			if err != nil {
				mu.Lock()
				planState.addEvent("task_error", fmt.Sprintf("Invalid timeout for task '%s': %v", task.ID, err))
				failed[task.ID] = true
				planState.TasksFailed++
				mu.Unlock()
				return
			}

			// Create task state
			taskStartTime := time.Now()
			taskState := &LocalState{
				OrchestrationID: fmt.Sprintf("%s_%s", plan.Name, task.ID),
				StartedAt:       taskStartTime.UTC().Format(time.RFC3339),
				Status:          "running",
				Agent:           task.Agent,
				Prompt:          task.Prompt,
				Workspace:       taskWorkspace,
				Events:          []LocalEvent{},
			}

			mu.Lock()
			taskStates[task.ID] = taskState
			planState.addEvent("task_started", fmt.Sprintf("Starting task '%s' with agent %s", task.ID, task.Agent))
			mu.Unlock()

			if !flagJSON {
				fmt.Printf("\n--- Task: %s (parallel) ---\n", task.ID)
				fmt.Printf("Agent: %s\n", task.Agent)
				fmt.Printf("Workspace: %s\n", taskWorkspace)
				fmt.Printf("Prompt: %s\n", truncateString(task.Prompt, 80))
				fmt.Println()
			}

			// Create context with timeout
			ctx, cancel := context.WithTimeout(context.Background(), timeout)
			defer cancel()

			// Run the task using a copy of agent config
			runErr := runAgentForTask(ctx, taskState, task.Agent, task.Prompt, taskWorkspace)

			// Update task state
			taskEndTime := time.Now()
			taskState.CompletedAt = taskEndTime.UTC().Format(time.RFC3339)
			taskState.DurationMs = taskEndTime.Sub(taskStartTime).Milliseconds()

			mu.Lock()
			if runErr != nil {
				taskState.Status = "failed"
				errStr := runErr.Error()
				taskState.Error = &errStr
				taskState.addEvent("task_failed", runErr.Error())
				planState.addEvent("task_failed", fmt.Sprintf("Task '%s' failed: %v", task.ID, runErr))
				failed[task.ID] = true
				planState.TasksFailed++

				if !flagJSON {
					fmt.Printf("\n[FAIL] Task %s failed: %v\n", task.ID, runErr)
				}
			} else {
				taskState.Status = "completed"
				result := "Task completed successfully"
				taskState.Result = &result
				taskState.addEvent("task_completed", "Task finished successfully")
				planState.addEvent("task_completed", fmt.Sprintf("Task '%s' completed in %s", task.ID, formatDuration(taskState.DurationMs)))
				completed[task.ID] = true
				planState.TasksComplete++

				if !flagJSON {
					fmt.Printf("\n[DONE] Task %s completed in %s\n", task.ID, formatDuration(taskState.DurationMs))
				}
			}
			mu.Unlock()
		}(task)
	}

	// Wait for all tasks to complete
	wg.Wait()
	close(errChan)

	// Collect task states in order
	for _, task := range plan.Tasks {
		if ts, ok := taskStates[task.ID]; ok {
			planState.TaskStates = append(planState.TaskStates, *ts)
		}
	}

	// Finalize plan state
	endTime := time.Now()
	planState.CompletedAt = endTime.UTC().Format(time.RFC3339)
	planState.DurationMs = endTime.Sub(startTime).Milliseconds()

	if planState.TasksFailed > 0 {
		planState.Status = "failed"
		planState.addEvent("plan_failed", fmt.Sprintf("Plan completed with %d failures", planState.TasksFailed))
	} else {
		planState.Status = "completed"
		planState.addEvent("plan_completed", fmt.Sprintf("Plan completed successfully in %s", formatDuration(planState.DurationMs)))
	}

	// Export if requested
	if localExport != "" {
		if err := exportPlanState(planState, localExport); err != nil {
			if !flagJSON {
				fmt.Printf("Warning: failed to export state: %v\n", err)
			}
		} else if !flagJSON {
			fmt.Printf("\nExported to: %s\n", localExport)
		}
	}

	// Print summary
	if flagJSON {
		output, _ := json.MarshalIndent(planState, "", "  ")
		fmt.Println(string(output))
	} else {
		fmt.Printf("\n=== Plan Summary (Parallel Mode) ===\n")
		fmt.Printf("Status: %s\n", planState.Status)
		fmt.Printf("Duration: %s\n", formatDuration(planState.DurationMs))
		fmt.Printf("Tasks: %d/%d completed, %d failed\n",
			planState.TasksComplete, planState.TasksTotal, planState.TasksFailed)
	}

	if planState.TasksFailed > 0 {
		return fmt.Errorf("plan failed with %d task failures", planState.TasksFailed)
	}
	return nil
}

// runAgentForTask runs a specific agent for a task (thread-safe version)
func runAgentForTask(ctx context.Context, state *LocalState, agent, prompt, workspace string) error {
	selection, err := resolveLocalAgentSelection(agent, state.SelectedVariant)
	if err != nil {
		return err
	}

	switch selection.Provider {
	case "claude":
		return runClaudeLocalWithAgent(ctx, state, agent, prompt, workspace)
	case "codex":
		return runCodexLocalWithAgent(ctx, state, agent, prompt, workspace)
	case "gemini":
		return runGeminiLocalWithAgent(ctx, state, agent, prompt, workspace)
	case "opencode":
		return runOpencodeLocalWithAgent(ctx, state, agent, prompt, workspace)
	case "amp":
		return runAmpLocalWithAgent(ctx, state, agent, prompt, workspace)
	default:
		return fmt.Errorf("unsupported agent: %s", agent)
	}
}

func loadPlanFile(path string) (*PlanFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var plan PlanFile
	if err := yaml.Unmarshal(data, &plan); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	return &plan, nil
}

func validatePlan(plan *PlanFile) error {
	if plan.Name == "" {
		return fmt.Errorf("plan name is required")
	}

	if len(plan.Tasks) == 0 {
		return fmt.Errorf("plan must have at least one task")
	}

	// Check for duplicate IDs
	ids := make(map[string]bool)
	for _, task := range plan.Tasks {
		if task.ID == "" {
			return fmt.Errorf("task ID is required")
		}
		if ids[task.ID] {
			return fmt.Errorf("duplicate task ID: %s", task.ID)
		}
		ids[task.ID] = true

		if task.Agent == "" {
			return fmt.Errorf("task '%s' must have an agent", task.ID)
		}
		if task.Prompt == "" {
			return fmt.Errorf("task '%s' must have a prompt", task.ID)
		}

		// Validate dependencies exist
		for _, dep := range task.DependsOn {
			if !ids[dep] {
				// Check if dependency is defined later
				found := false
				for _, t := range plan.Tasks {
					if t.ID == dep {
						found = true
						break
					}
				}
				if !found {
					return fmt.Errorf("task '%s' depends on unknown task '%s'", task.ID, dep)
				}
			}
		}
	}

	return nil
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func exportPlanState(state *PlanState, outputPath string) error {
	// Convert to export bundle format for compatibility with view command
	bundle := ExportBundle{
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Version:    "1.0.0",
		Orchestration: OrchestrationExportInfo{
			ID:        state.PlanName,
			Status:    state.Status,
			CreatedAt: state.StartedAt,
			Prompt:    fmt.Sprintf("Plan: %s (%d tasks)", state.PlanName, state.TasksTotal),
		},
		Summary: ExportSummary{
			TotalTasks:     state.TasksTotal,
			CompletedTasks: state.TasksComplete,
			FailedTasks:    state.TasksFailed,
			RunningTasks:   0,
		},
		Tasks:  []TaskExportInfo{},
		Events: []EventExportInfo{},
	}

	// Convert task states
	for _, ts := range state.TaskStates {
		agentName := ts.Agent
		bundle.Tasks = append(bundle.Tasks, TaskExportInfo{
			TaskID:    ts.OrchestrationID,
			Prompt:    ts.Prompt,
			AgentName: &agentName,
			Status:    ts.Status,
		})
	}

	// Convert events
	for _, e := range state.Events {
		bundle.Events = append(bundle.Events, EventExportInfo{
			Timestamp: e.Timestamp,
			Type:      e.Type,
			Message:   e.Message,
		})
	}

	// Write to file
	data, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal state: %w", err)
	}

	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

func init() {
	orchestratePlanCmd.Flags().StringVar(&localExport, "export", "", "Export results to JSON file when done")
	orchestratePlanCmd.Flags().BoolVar(&localTUI, "tui", false, "Show live terminal UI for each task")
	orchestratePlanCmd.Flags().BoolVar(&localDryRun, "dry-run", false, "Show what would be executed without running")
	orchestratePlanCmd.Flags().BoolVar(&planParallel, "parallel", false, "Execute independent tasks in parallel")
	orchestrateCmd.AddCommand(orchestratePlanCmd)
}
