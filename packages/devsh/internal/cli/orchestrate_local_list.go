// internal/cli/orchestrate_local_list.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/spf13/cobra"
)

var (
	listLocalLimit  int
	listLocalStatus string
)

// LocalRunSummary represents a summary of a local run for listing
type LocalRunSummary struct {
	OrchestrationID string `json:"orchestrationId"`
	Agent           string `json:"agent"`
	Status          string `json:"status"`
	StartedAt       string `json:"startedAt"`
	CompletedAt     string `json:"completedAt,omitempty"`
	DurationMs      int64  `json:"durationMs,omitempty"`
	RunDir          string `json:"runDir"`
	Prompt          string `json:"prompt,omitempty"`
}

var orchestrateListLocalCmd = &cobra.Command{
	Use:   "list-local",
	Short: "List local orchestration runs",
	Long: `List local orchestration runs stored in ~/.devsh/orchestrations/.

Shows runs created with 'devsh orchestrate run-local --persist'.

Examples:
  devsh orchestrate list-local
  devsh orchestrate list-local --limit 5
  devsh orchestrate list-local --status failed
  devsh orchestrate list-local --json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseDir := getLocalRunsDir()

		// Check if directory exists
		if _, err := os.Stat(baseDir); os.IsNotExist(err) {
			if flagJSON {
				fmt.Println("[]")
			} else {
				fmt.Printf("No local runs found in %s\n", baseDir)
			}
			return nil
		}

		// Read all run directories
		entries, err := os.ReadDir(baseDir)
		if err != nil {
			return fmt.Errorf("failed to read runs directory: %w", err)
		}

		var runs []LocalRunSummary

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}

			runDir := filepath.Join(baseDir, entry.Name())
			summary, err := loadRunSummary(runDir)
			if err != nil {
				continue // Skip invalid run directories
			}

			// Filter by status if specified
			if listLocalStatus != "" && listLocalStatus != "all" && summary.Status != listLocalStatus {
				continue
			}

			runs = append(runs, *summary)
		}

		// Sort by start time (newest first)
		sort.Slice(runs, func(i, j int) bool {
			return runs[i].StartedAt > runs[j].StartedAt
		})

		// Apply limit
		if listLocalLimit > 0 && len(runs) > listLocalLimit {
			runs = runs[:listLocalLimit]
		}

		// Output
		if flagJSON {
			output, _ := json.MarshalIndent(runs, "", "  ")
			fmt.Println(string(output))
		} else {
			if len(runs) == 0 {
				fmt.Printf("No local runs found in %s\n", baseDir)
				return nil
			}

			fmt.Printf("Local Runs (%d total)\n", len(runs))
			fmt.Println("---")
			for _, run := range runs {
				statusIcon := getLocalStatusIcon(run.Status)
				duration := ""
				if run.DurationMs > 0 {
					duration = fmt.Sprintf(" (%s)", formatDuration(run.DurationMs))
				}
				prompt := run.Prompt
				if len(prompt) > 50 {
					prompt = prompt[:47] + "..."
				}
				fmt.Printf("%s %s [%s]%s\n", statusIcon, run.OrchestrationID, run.Agent, duration)
				fmt.Printf("   %s\n", prompt)
				fmt.Printf("   Started: %s\n", formatTimeAgo(run.StartedAt))
			}
			fmt.Printf("\nView with: devsh orchestrate view ~/.devsh/orchestrations/<run-id>/bundle.json\n")
		}

		return nil
	},
}

func loadRunSummary(runDir string) (*LocalRunSummary, error) {
	// Try to load state.json first (has completion info)
	statePath := filepath.Join(runDir, "state.json")
	if data, err := os.ReadFile(statePath); err == nil {
		var state LocalState
		if err := json.Unmarshal(data, &state); err == nil {
			return &LocalRunSummary{
				OrchestrationID: state.OrchestrationID,
				Agent:           state.Agent,
				Status:          state.Status,
				StartedAt:       state.StartedAt,
				CompletedAt:     state.CompletedAt,
				DurationMs:      state.DurationMs,
				RunDir:          runDir,
				Prompt:          state.Prompt,
			}, nil
		}
	}

	// Fall back to config.json (for in-progress runs)
	configPath := filepath.Join(runDir, "config.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	var config LocalRunConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &LocalRunSummary{
		OrchestrationID: config.OrchestrationID,
		Agent:           config.Agent,
		Status:          "running", // No state.json means still running or crashed
		StartedAt:       config.CreatedAt,
		RunDir:          runDir,
		Prompt:          config.Prompt,
	}, nil
}

func getLocalStatusIcon(status string) string {
	switch status {
	case "completed":
		return "[OK]"
	case "failed":
		return "[FAIL]"
	case "running":
		return "[RUN]"
	default:
		return "[?]"
	}
}

func formatTimeAgo(timestamp string) string {
	t, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		return timestamp
	}

	diff := time.Since(t)
	if diff < time.Minute {
		return "just now"
	}
	if diff < time.Hour {
		return fmt.Sprintf("%dm ago", int(diff.Minutes()))
	}
	if diff < 24*time.Hour {
		return fmt.Sprintf("%dh ago", int(diff.Hours()))
	}
	return fmt.Sprintf("%dd ago", int(diff.Hours()/24))
}

func init() {
	orchestrateListLocalCmd.Flags().IntVar(&listLocalLimit, "limit", 10, "Maximum number of runs to show")
	orchestrateListLocalCmd.Flags().StringVar(&listLocalStatus, "status", "", "Filter by status (completed, failed, running)")
	orchestrateCmd.AddCommand(orchestrateListLocalCmd)
}
