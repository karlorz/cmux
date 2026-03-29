// internal/cli/task_resume.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var taskResumeCmd = &cobra.Command{
	Use:   "resume <task-run-id>",
	Short: "Inspect run-control summary for a task run",
	Long: `Inspect the shared run-control summary for a task run.

This command reads the shared run-control contract for a task run and
shows whether the next lane is approval resolution, provider-session
continuation, checkpoint restore, or append-only follow-up.

Examples:
  # Get run-control info for a task run
  devsh task resume <task-run-id>

  # Attach to the sandbox and continue interactively if supported
  devsh task attach <task-run-id>
  # Then in the terminal: codex resume <thread-id>
  # Or for a non-interactive follow-up inside the sandbox: codex exec resume <thread-id> "<prompt>"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		taskRunID := args[0]

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

		runControl, err := client.GetRunControlSummary(ctx, taskRunID)
		if err != nil {
			return fmt.Errorf("failed to get run-control summary: %w", err)
		}

		// Get task run info for sandbox-aware hints
		taskRun, err := client.GetTaskRunWithPty(ctx, taskRunID)
		if err != nil {
			return fmt.Errorf("failed to get task run: %w", err)
		}

		if flagJSON {
			data, _ := json.MarshalIndent(runControl, "", "  ")
			fmt.Println(string(data))
			return nil
		}

		printTaskResumeSummary(runControl, taskRun)
		return nil
	},
}

func printTaskResumeSummary(runControl *vm.RunControlSummary, taskRun *vm.TaskRun) {
	fmt.Printf("Task Run: %s\n", runControl.TaskRunID)
	fmt.Printf("  Task: %s\n", runControl.TaskID)
	if runControl.AgentName != nil && *runControl.AgentName != "" {
		fmt.Printf("  Agent: %s\n", *runControl.AgentName)
	} else {
		fmt.Printf("  Agent: %s\n", taskRun.AgentName)
	}
	fmt.Printf("  Provider: %s\n", runControl.Provider)
	fmt.Printf("  Run Status: %s\n", runControl.RunStatus)
	fmt.Printf("  Lifecycle: %s\n", runControl.Lifecycle.Status)
	fmt.Printf("  Interruption: %s\n", runControl.Lifecycle.InterruptionStatus)

	if taskRun.SandboxID != "" {
		fmt.Printf("  Sandbox: %s\n", taskRun.SandboxID)
	}

	if taskRun.AutopilotStatus != "" {
		fmt.Printf("  Autopilot Status: %s\n", taskRun.AutopilotStatus)
	}

	fmt.Println()
	if len(runControl.Actions.AvailableActions) == 0 {
		fmt.Println("Available actions: none")
	} else {
		fmt.Printf("Available actions: %s\n", formatRunControlActionList(runControl.Actions.AvailableActions))
	}
	fmt.Printf("Continuation mode: %s\n", runControl.Continuation.Mode)
	if primaryLane := primaryRunControlLane(runControl); primaryLane != "" {
		fmt.Printf("Primary lane: %s\n", primaryLane)
	}
	if runControl.Approvals.PendingCount > 0 {
		fmt.Printf("Pending approvals: %d\n", runControl.Approvals.PendingCount)
	}
	if runControl.Lifecycle.Reason != nil && *runControl.Lifecycle.Reason != "" {
		fmt.Printf("Reason: %s\n", *runControl.Lifecycle.Reason)
	}

	fmt.Println()
	fmt.Println("Next steps")
	fmt.Println("----------")

	if runControl.Actions.CanResolveApproval {
		fmt.Println("Resolve approval before any continuation lane can proceed.")
		return
	}

	if runControl.Actions.CanResumeCheckpoint && runControl.Continuation.CheckpointRef != nil {
		fmt.Println("Resume checkpoint is available.")
		fmt.Printf("  Checkpoint ref: %s\n", *runControl.Continuation.CheckpointRef)
		return
	}

	if runControl.Actions.CanContinueSession {
		if runControl.Continuation.ProviderThreadID != nil && *runControl.Continuation.ProviderThreadID != "" {
			threadID := *runControl.Continuation.ProviderThreadID

			fmt.Println("Continue session is available.")
			fmt.Printf("  Thread ID: %s\n", threadID)
			fmt.Println()
			fmt.Println("Option 1: Attach to the running sandbox terminal")
			fmt.Printf("  devsh task attach %s\n", taskRun.ID)
			fmt.Printf("  Then run: %s\n", formatCodexInteractiveResumeCommand(threadID))
			fmt.Println()
			fmt.Println("Option 2: Execute resume command in sandbox")
			if taskRun.SandboxID != "" {
				fmt.Printf(
					"  devsh exec %s '%s'\n",
					taskRun.SandboxID,
					formatCodexNonInteractiveResumeCommand(threadID, "\"<prompt>\""),
				)
			}
			fmt.Println()
			fmt.Println("Option 3: Use the resume script in the sandbox")
			if taskRun.SandboxID != "" {
				fmt.Printf("  devsh exec %s '/root/lifecycle/codex-resume.sh'\n", taskRun.SandboxID)
			}
			return
		}

		if runControl.Continuation.ProviderSessionID != nil && *runControl.Continuation.ProviderSessionID != "" {
			fmt.Println("Continue session is available.")
			fmt.Printf("  Session ID: %s\n", *runControl.Continuation.ProviderSessionID)
			fmt.Println()
			fmt.Println("Attach to the sandbox terminal and continue the same provider session.")
			fmt.Printf("  devsh task attach %s\n", taskRun.ID)
			return
		}
	}

	if runControl.Actions.CanAppendInstruction {
		fmt.Println("Append instruction is the available fallback lane.")
		fmt.Println("No live provider session or checkpoint restore is currently advertised.")
		if taskRun.Status == "running" {
			fmt.Printf("  devsh task attach %s\n", taskRun.ID)
		}
		return
	}

	fmt.Println("No continuation lane is currently available for this task run.")
}

func formatStringList(items []string) string {
	return strings.Join(items, ", ")
}

func formatRunControlActionList(actions []string) string {
	labels := make([]string, 0, len(actions))
	for _, action := range actions {
		labels = append(labels, formatRunControlActionLabel(action))
	}
	return strings.Join(labels, ", ")
}

func formatRunControlActionLabel(action string) string {
	labels := map[string]string{
		"resolve_approval":   "Resolve approval",
		"continue_session":   "Continue session",
		"resume_checkpoint":  "Resume checkpoint",
		"append_instruction": "Append instruction",
	}

	if label, ok := labels[action]; ok {
		return label
	}

	return strings.ReplaceAll(action, "_", " ")
}

func primaryRunControlLane(runControl *vm.RunControlSummary) string {
	if runControl.Actions.CanResolveApproval {
		return "Resolve approval"
	}
	switch runControl.Continuation.Mode {
	case "session_continuation":
		return "Continue session"
	case "checkpoint_restore":
		return "Resume checkpoint"
	case "append_instruction":
		return "Append instruction"
	default:
		return ""
	}
}

func init() {
	taskCmd.AddCommand(taskResumeCmd)
}
