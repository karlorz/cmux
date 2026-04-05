// internal/cli/orchestrate_checkpoint.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var orchestrateCheckpointTaskID string
var orchestrateCheckpointLocalRun string
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
  devsh orchestrate checkpoint --task-id task_abc123 --label "before-refactor"
  devsh orchestrate checkpoint --local-run local_www_abc123 --label "before-refactor"`,
	RunE: runOrchestrateCheckpoint,
}

func runOrchestrateCheckpoint(cmd *cobra.Command, args []string) error {
	if orchestrateCheckpointTaskID == "" && orchestrateCheckpointLocalRun == "" {
		return fmt.Errorf("--task-id or --local-run flag is required")
	}
	if orchestrateCheckpointTaskID != "" && orchestrateCheckpointLocalRun != "" {
		return fmt.Errorf("--task-id and --local-run cannot be used together")
	}
	if orchestrateCheckpointLocalRun != "" {
		return runOrchestrateLocalCheckpoint(orchestrateCheckpointLocalRun, orchestrateCheckpointLabel)
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

func runOrchestrateLocalCheckpoint(runID, label string) error {
	runDir, err := resolveLocalRunDir(runID)
	if err != nil {
		return err
	}

	sessionInfo, err := loadSessionInfo(runDir)
	if err != nil {
		return fmt.Errorf("failed to load local session info: %w", err)
	}

	generation := sessionInfo.CheckpointGeneration + 1
	checkpointRef := fmt.Sprintf("cp_local_%s_%d", filepath.Base(runDir), generation)
	now := time.Now().UTC()
	sessionInfo.CheckpointRef = checkpointRef
	sessionInfo.CheckpointGeneration = generation
	sessionInfo.CheckpointLabel = label
	sessionInfo.CheckpointCreatedAt = now.UnixMilli()

	if err := saveSessionInfo(runDir, sessionInfo); err != nil {
		return fmt.Errorf("failed to persist local checkpoint: %w", err)
	}

	if flagJSON {
		data, _ := json.MarshalIndent(map[string]any{
			"runId":                runID,
			"runDir":               runDir,
			"checkpointRef":        checkpointRef,
			"checkpointGeneration": generation,
			"label":                label,
			"createdAt":            now.Format(time.RFC3339),
		}, "", "  ")
		fmt.Println(string(data))
		return nil
	}

	fmt.Println("Local Checkpoint Created")
	fmt.Println("========================")
	fmt.Printf("  Run ID:                %s\n", runID)
	fmt.Printf("  Run Directory:         %s\n", runDir)
	fmt.Printf("  Checkpoint Ref:        %s\n", checkpointRef)
	fmt.Printf("  Checkpoint Generation: %d\n", generation)
	if label != "" {
		fmt.Printf("  Label:                 %s\n", label)
	}
	fmt.Printf("  Created At:            %s\n", now.Format(time.RFC3339))
	return nil
}

func init() {
	orchestrateCheckpointCmd.Flags().StringVar(&orchestrateCheckpointTaskID, "task-id", "", "Task ID to checkpoint")
	orchestrateCheckpointCmd.Flags().StringVar(&orchestrateCheckpointLocalRun, "local-run", "", "Local run ID to checkpoint")
	orchestrateCheckpointCmd.Flags().StringVar(&orchestrateCheckpointLabel, "label", "", "Optional label for the checkpoint")
	orchestrateCmd.AddCommand(orchestrateCheckpointCmd)
}
