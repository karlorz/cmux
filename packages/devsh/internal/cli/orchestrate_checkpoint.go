// internal/cli/orchestrate_checkpoint.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var orchestrateCheckpointTaskID string
var orchestrateCheckpointLabel string

var orchestrateCheckpointCmd = &cobra.Command{
	Use:   "checkpoint",
	Short: "Create a checkpoint of task state",
	Long: `Create a named checkpoint of the current task state for later resume.

Checkpoints capture the current agent session state, allowing you to:
- Resume from a known good state after failures
- Create savepoints before risky operations
- Enable multi-stage workflows with recovery points

Examples:
  devsh orchestrate checkpoint --task-id task_abc123
  devsh orchestrate checkpoint --task-id task_abc123 --label "before-refactor"`,
	RunE: runOrchestrateCheckpoint,
}

func runOrchestrateCheckpoint(cmd *cobra.Command, args []string) error {
	if orchestrateCheckpointTaskID == "" {
		return fmt.Errorf("--task-id flag is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
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

	result, err := client.CreateCheckpoint(ctx, vm.CreateCheckpointOptions{
		TaskID: orchestrateCheckpointTaskID,
		Label:  orchestrateCheckpointLabel,
	})
	if err != nil {
		return fmt.Errorf("failed to create checkpoint: %w", err)
	}

	if flagJSON {
		data, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(data))
		return nil
	}

	fmt.Println("Checkpoint Created")
	fmt.Println("==================")
	fmt.Printf("  Task ID:               %s\n", result.TaskID)
	fmt.Printf("  Checkpoint Ref:        %s\n", result.CheckpointRef)
	fmt.Printf("  Checkpoint Generation: %d\n", result.CheckpointGeneration)
	if result.Label != "" {
		fmt.Printf("  Label:                 %s\n", result.Label)
	}
	fmt.Printf("  Created At:            %s\n", result.CreatedAt)

	return nil
}

func init() {
	orchestrateCheckpointCmd.Flags().StringVar(&orchestrateCheckpointTaskID, "task-id", "", "Task ID to checkpoint (required)")
	orchestrateCheckpointCmd.Flags().StringVar(&orchestrateCheckpointLabel, "label", "", "Optional label for the checkpoint")
	orchestrateCmd.AddCommand(orchestrateCheckpointCmd)
}
