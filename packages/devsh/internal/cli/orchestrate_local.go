// internal/cli/orchestrate_local.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
)

var (
	localAgent     string
	localWorkspace string
	localTimeout   string
	localExport    string
	localTUI       bool
	localDryRun    bool
	localModel     string
)

// LocalState represents the state of a local orchestration run
type LocalState struct {
	OrchestrationID string       `json:"orchestrationId"`
	StartedAt       string       `json:"startedAt"`
	Status          string       `json:"status"`
	Agent           string       `json:"agent"`
	Prompt          string       `json:"prompt"`
	Workspace       string       `json:"workspace"`
	Events          []LocalEvent `json:"events"`
	Result          *string      `json:"result,omitempty"`
	Error           *string      `json:"error,omitempty"`
}

// LocalEvent represents an event in the local orchestration
type LocalEvent struct {
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	Message   string `json:"message"`
}

var orchestrateLocalCmd = &cobra.Command{
	Use:   "run-local <prompt>",
	Short: "Run an orchestration task locally without cloud infrastructure",
	Long: `Run an agent task locally without requiring Convex, sandbox providers, or cloud services.

This is useful for:
- Quick prototyping of orchestration patterns
- Debugging agent behavior offline
- Testing prompts before cloud deployment

The agent runs directly on your machine using its native CLI (claude, codex, etc.).
State is stored in local JSON files for later analysis.

Examples:
  devsh orchestrate run-local --agent claude/haiku-4.5 "Fix the bug in auth.ts"
  devsh orchestrate run-local --agent claude/haiku-4.5 --workspace ./my-repo "Add tests"
  devsh orchestrate run-local --agent claude/haiku-4.5 --export ./debug.json "Refactor"
  devsh orchestrate run-local --agent claude/haiku-4.5 --tui "Interactive task"
  devsh orchestrate run-local --agent claude/haiku-4.5 --dry-run "Check setup"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		prompt := args[0]

		// Resolve workspace
		workspace := localWorkspace
		if workspace == "" {
			var err error
			workspace, err = os.Getwd()
			if err != nil {
				return fmt.Errorf("failed to get current directory: %w", err)
			}
		}

		// Resolve absolute path
		absWorkspace, err := filepath.Abs(workspace)
		if err != nil {
			return fmt.Errorf("failed to resolve workspace path: %w", err)
		}

		// Validate workspace exists
		if _, err := os.Stat(absWorkspace); os.IsNotExist(err) {
			return fmt.Errorf("workspace does not exist: %s", absWorkspace)
		}

		// Generate orchestration ID
		orchID := fmt.Sprintf("local_%d", time.Now().UnixNano())

		// Initialize state
		state := &LocalState{
			OrchestrationID: orchID,
			StartedAt:       time.Now().UTC().Format(time.RFC3339),
			Status:          "running",
			Agent:           localAgent,
			Prompt:          prompt,
			Workspace:       absWorkspace,
			Events:          []LocalEvent{},
		}

		// Add start event
		state.addEvent("task_started", fmt.Sprintf("Starting %s in %s", localAgent, absWorkspace))

		fmt.Printf("Local Orchestration: %s\n", orchID)
		fmt.Printf("Agent: %s\n", localAgent)
		fmt.Printf("Workspace: %s\n", absWorkspace)
		fmt.Printf("Prompt: %s\n", prompt)

		// Dry-run mode: just show what would happen
		if localDryRun {
			fmt.Printf("\n[DRY RUN] Would execute:\n")
			switch localAgent {
			case "claude/haiku-4.5", "claude/sonnet-4.5", "claude/opus-4.5", "claude/opus-4.6":
				if localModel != "" {
					fmt.Printf("  claude -p --dangerously-skip-permissions --model %s \"%s\"\n", localModel, prompt)
				} else {
					fmt.Printf("  claude -p --dangerously-skip-permissions \"%s\"\n", prompt)
				}
			case "codex/gpt-5.1-codex-mini", "codex/gpt-5.4-xhigh":
				fmt.Printf("  codex \"%s\"\n", prompt)
			default:
				fmt.Printf("  (unsupported agent: %s)\n", localAgent)
			}
			fmt.Printf("  Working directory: %s\n", absWorkspace)
			if localExport != "" {
				fmt.Printf("  Export to: %s\n", localExport)
			}
			return nil
		}

		fmt.Println()

		// Run the agent
		var runErr error
		switch localAgent {
		case "claude/haiku-4.5", "claude/sonnet-4.5", "claude/opus-4.5", "claude/opus-4.6":
			runErr = runClaudeLocal(state, prompt, absWorkspace)
		case "codex/gpt-5.1-codex-mini", "codex/gpt-5.4-xhigh":
			runErr = runCodexLocal(state, prompt, absWorkspace)
		default:
			return fmt.Errorf("unsupported local agent: %s (supported: claude/*, codex/*)", localAgent)
		}

		// Update final state
		if runErr != nil {
			state.Status = "failed"
			errStr := runErr.Error()
			state.Error = &errStr
			state.addEvent("task_failed", runErr.Error())
		} else {
			state.Status = "completed"
			result := "Task completed successfully"
			state.Result = &result
			state.addEvent("task_completed", "Agent finished successfully")
		}

		// Export if requested
		if localExport != "" {
			if err := exportLocalState(state, localExport); err != nil {
				fmt.Printf("Warning: failed to export state: %v\n", err)
			} else {
				fmt.Printf("\nExported to: %s\n", localExport)
			}
		}

		// Print summary
		fmt.Printf("\n--- Summary ---\n")
		fmt.Printf("Status: %s\n", state.Status)
		fmt.Printf("Events: %d\n", len(state.Events))
		if state.Error != nil {
			fmt.Printf("Error: %s\n", *state.Error)
		}

		if runErr != nil {
			return runErr
		}
		return nil
	},
}

func (s *LocalState) addEvent(eventType, message string) {
	s.Events = append(s.Events, LocalEvent{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Type:      eventType,
		Message:   message,
	})
}

func runClaudeLocal(state *LocalState, prompt, workspace string) error {
	state.addEvent("agent_invoked", "Spawning claude CLI")

	// Check if claude CLI is available
	claudePath, err := exec.LookPath("claude")
	if err != nil {
		return fmt.Errorf("claude CLI not found in PATH: %w", err)
	}

	// Build command args
	// Use -p (print mode) for non-interactive execution
	// --dangerously-skip-permissions for automated runs (use with caution)
	args := []string{"-p", "--dangerously-skip-permissions"}

	// Add model override if specified
	if localModel != "" {
		args = append(args, "--model", localModel)
		state.addEvent("model_override", fmt.Sprintf("Using model: %s", localModel))
	}

	args = append(args, prompt)

	cmd := exec.Command(claudePath, args...)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	state.addEvent("agent_running", "Claude CLI executing in print mode")

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("claude CLI failed: %w", err)
	}

	return nil
}

func runCodexLocal(state *LocalState, prompt, workspace string) error {
	state.addEvent("agent_invoked", "Spawning codex CLI")

	// Check if codex CLI is available
	codexPath, err := exec.LookPath("codex")
	if err != nil {
		return fmt.Errorf("codex CLI not found in PATH: %w", err)
	}

	cmd := exec.Command(codexPath, prompt)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	state.addEvent("agent_running", "Codex CLI executing")

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("codex CLI failed: %w", err)
	}

	return nil
}

func exportLocalState(state *LocalState, outputPath string) error {
	// Convert to export bundle format for compatibility with view command
	agentName := state.Agent
	bundle := ExportBundle{
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Version:    "1.0.0",
		Orchestration: OrchestrationExportInfo{
			ID:        state.OrchestrationID,
			Status:    state.Status,
			CreatedAt: state.StartedAt,
			Prompt:    state.Prompt,
		},
		Summary: ExportSummary{
			TotalTasks:     1,
			CompletedTasks: 0,
			FailedTasks:    0,
			RunningTasks:   0,
		},
		Tasks: []TaskExportInfo{
			{
				TaskID:    state.OrchestrationID + "_task",
				Prompt:    state.Prompt,
				AgentName: &agentName,
				Status:    state.Status,
			},
		},
		Events: []EventExportInfo{},
	}

	// Update summary based on status
	switch state.Status {
	case "completed":
		bundle.Summary.CompletedTasks = 1
	case "failed":
		bundle.Summary.FailedTasks = 1
	case "running":
		bundle.Summary.RunningTasks = 1
	}

	// Convert events
	for _, e := range state.Events {
		bundle.Events = append(bundle.Events, EventExportInfo{
			Timestamp: e.Timestamp,
			Type:      e.Type,
			Message:   e.Message,
			TaskID:    state.OrchestrationID + "_task",
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
	orchestrateLocalCmd.Flags().StringVar(&localAgent, "agent", "claude/haiku-4.5", "Agent to use (claude/haiku-4.5, claude/opus-4.5, codex/gpt-5.1-codex-mini)")
	orchestrateLocalCmd.Flags().StringVar(&localWorkspace, "workspace", "", "Workspace directory (default: current directory)")
	orchestrateLocalCmd.Flags().StringVar(&localTimeout, "timeout", "30m", "Task timeout")
	orchestrateLocalCmd.Flags().StringVar(&localExport, "export", "", "Export state to JSON file when done")
	orchestrateLocalCmd.Flags().BoolVar(&localTUI, "tui", false, "Show live terminal UI (not yet implemented)")
	orchestrateLocalCmd.Flags().BoolVar(&localDryRun, "dry-run", false, "Show what would be executed without running")
	orchestrateLocalCmd.Flags().StringVar(&localModel, "model", "", "Override model for Claude (e.g., claude-sonnet-4-5-20250514)")
	orchestrateCmd.AddCommand(orchestrateLocalCmd)
}
