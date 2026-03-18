// internal/cli/orchestrate_export.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var (
	orchestrateExportOutput     string
	orchestrateExportUseEnvJwt  bool
	orchestrateExportIncludeLogs bool
)

// ExportBundle represents the complete task case file export
type ExportBundle struct {
	ExportedAt    string                      `json:"exportedAt"`
	Version       string                      `json:"version"`
	Orchestration OrchestrationExportInfo     `json:"orchestration"`
	Tasks         []TaskExportInfo            `json:"tasks"`
	Events        []EventExportInfo           `json:"events,omitempty"`
	Logs          *ExportLogs                 `json:"logs,omitempty"`
	Summary       ExportSummary               `json:"summary"`
}

// ExportLogs contains stdout/stderr logs when --include-logs is used
type ExportLogs struct {
	Stdout string `json:"stdout,omitempty"`
	Stderr string `json:"stderr,omitempty"`
}

type OrchestrationExportInfo struct {
	ID        string  `json:"id"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"createdAt"`
	Prompt    string  `json:"prompt,omitempty"`
}

type TaskExportInfo struct {
	TaskID       string  `json:"taskId"`
	Status       string  `json:"status"`
	AgentName    *string `json:"agentName,omitempty"`
	Prompt       string  `json:"prompt"`
	Result       *string `json:"result,omitempty"`
	ErrorMessage *string `json:"errorMessage,omitempty"`
	TaskRunID    *string `json:"taskRunId,omitempty"`
}

type EventExportInfo struct {
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	TaskID    string `json:"taskId,omitempty"`
	Message   string `json:"message"`
}

type ExportSummary struct {
	TotalTasks     int `json:"totalTasks"`
	CompletedTasks int `json:"completedTasks"`
	FailedTasks    int `json:"failedTasks"`
	PendingTasks   int `json:"pendingTasks"`
	RunningTasks   int `json:"runningTasks"`
}

var orchestrateExportCmd = &cobra.Command{
	Use:   "export <orchestration-id>",
	Short: "Export orchestration as a debug bundle (case file)",
	Long: `Export a complete orchestration run as a self-contained debug bundle.

Inspired by TaskCaptain's task case file pattern, this creates a JSON bundle
containing all information needed to understand and debug an orchestration:

- Orchestration metadata and status
- All task specs with prompts
- Task results or error messages
- Event timeline (if available)
- Summary statistics

The export can be saved to a file or printed to stdout.

Examples:
  devsh orchestrate export <orchestration-id>
  devsh orchestrate export <orchestration-id> -o ./debug-bundle.json
  devsh orchestrate export <orchestration-id> --use-env-jwt`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		orchestrationID := args[0]

		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// Get JWT from environment if --use-env-jwt flag is set
		var taskRunJwt string
		if orchestrateExportUseEnvJwt {
			taskRunJwt = os.Getenv("CMUX_TASK_RUN_JWT")
			if taskRunJwt == "" {
				return fmt.Errorf("--use-env-jwt flag set but CMUX_TASK_RUN_JWT environment variable is not set")
			}
		}

		client, err := vm.NewClient()
		if err != nil {
			return fmt.Errorf("failed to create client: %w", err)
		}

		// Only set team slug if not using JWT auth
		if taskRunJwt == "" {
			teamSlug, err := auth.GetTeamSlug()
			if err != nil {
				return fmt.Errorf("failed to get team: %w", err)
			}
			client.SetTeamSlug(teamSlug)
		}

		// Fetch orchestration results
		results, err := client.OrchestrationResults(ctx, orchestrationID, taskRunJwt)
		if err != nil {
			return fmt.Errorf("failed to get orchestration results: %w", err)
		}

		// Build the export bundle
		bundle := buildExportBundle(orchestrationID, results)

		// Marshal to JSON
		data, err := json.MarshalIndent(bundle, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal export bundle: %w", err)
		}

		// Output to file or stdout
		if orchestrateExportOutput != "" {
			// Ensure directory exists
			dir := filepath.Dir(orchestrateExportOutput)
			if dir != "." && dir != "" {
				if err := os.MkdirAll(dir, 0755); err != nil {
					return fmt.Errorf("failed to create output directory: %w", err)
				}
			}

			if err := os.WriteFile(orchestrateExportOutput, data, 0644); err != nil {
				return fmt.Errorf("failed to write export file: %w", err)
			}

			fmt.Printf("Export bundle saved to: %s\n", orchestrateExportOutput)
			fmt.Printf("  Total tasks: %d\n", bundle.Summary.TotalTasks)
			fmt.Printf("  Completed: %d, Failed: %d, Running: %d, Pending: %d\n",
				bundle.Summary.CompletedTasks,
				bundle.Summary.FailedTasks,
				bundle.Summary.RunningTasks,
				bundle.Summary.PendingTasks)
		} else {
			fmt.Println(string(data))
		}

		return nil
	},
}

func buildExportBundle(orchestrationID string, results *vm.OrchestrationResultsResult) ExportBundle {
	now := time.Now().UTC().Format(time.RFC3339)

	bundle := ExportBundle{
		ExportedAt: now,
		Version:    "1.0.0",
		Orchestration: OrchestrationExportInfo{
			ID:     orchestrationID,
			Status: results.Status,
		},
		Tasks:   make([]TaskExportInfo, 0, len(results.Results)),
		Summary: ExportSummary{TotalTasks: results.TotalTasks},
	}

	// Process each task
	for _, task := range results.Results {
		taskInfo := TaskExportInfo{
			TaskID:       task.TaskID,
			Status:       task.Status,
			AgentName:    task.AgentName,
			Prompt:       task.Prompt,
			Result:       task.Result,
			ErrorMessage: task.ErrorMessage,
			TaskRunID:    task.TaskRunID,
		}

		bundle.Tasks = append(bundle.Tasks, taskInfo)

		// Update summary counts
		switch task.Status {
		case "completed":
			bundle.Summary.CompletedTasks++
		case "failed":
			bundle.Summary.FailedTasks++
		case "running", "assigned":
			bundle.Summary.RunningTasks++
		case "pending":
			bundle.Summary.PendingTasks++
		}
	}

	return bundle
}

func init() {
	orchestrateExportCmd.Flags().StringVarP(&orchestrateExportOutput, "output", "o", "", "Output file path (prints to stdout if not specified)")
	orchestrateExportCmd.Flags().BoolVar(&orchestrateExportUseEnvJwt, "use-env-jwt", false, "Use CMUX_TASK_RUN_JWT from environment for authentication")
	orchestrateExportCmd.Flags().BoolVar(&orchestrateExportIncludeLogs, "include-logs", false, "Include agent logs in export (if available)")
	orchestrateCmd.AddCommand(orchestrateExportCmd)
}
