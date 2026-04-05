// internal/cli/orchestrate_local_show.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var (
	showLocalLogs   bool
	showLocalEvents bool
)

type localRunDetail struct {
	OrchestrationID string       `json:"orchestrationId"`
	RunDir          string       `json:"runDir"`
	Agent           string       `json:"agent"`
	Status          string       `json:"status"`
	Prompt          string       `json:"prompt"`
	Workspace       string       `json:"workspace"`
	Timeout         string       `json:"timeout,omitempty"`
	StartedAt       string       `json:"startedAt,omitempty"`
	CompletedAt     string       `json:"completedAt,omitempty"`
	DurationMs      int64        `json:"durationMs,omitempty"`
	Events          []LocalEvent `json:"events,omitempty"`
	Result          *string      `json:"result,omitempty"`
	Error           *string      `json:"error,omitempty"`
	Stdout          string       `json:"stdout,omitempty"`
	Stderr          string       `json:"stderr,omitempty"`
}

var orchestrateShowLocalCmd = &cobra.Command{
	Use:   "show-local <run-id>",
	Short: "Show run control summary for a local run",
	Long: `Display run control summary for a specific local orchestration run.

Shows the same operator-facing information as the cloud dashboard:
lifecycle status, continuation mode, events, and logs.

The run-id can be:
- The full orchestration ID (e.g., local_abc123)
- A path to the run directory
- A partial ID that uniquely matches one run

Examples:
  devsh orchestrate show-local local_abc123
  devsh orchestrate show-local local_abc123 --logs
  devsh orchestrate show-local local_abc123 --events
  devsh orchestrate show-local ~/.devsh/orchestrations/local_abc123`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		runID := args[0]

		runDir, err := resolveLocalRunDir(runID)
		if err != nil {
			return err
		}

		detail, err := loadLocalRunDetail(runDir, showLocalLogs, showLocalEvents)
		if err != nil {
			return err
		}

		if flagJSON {
			jsonOutput, _ := json.MarshalIndent(detail, "", "  ")
			fmt.Println(string(jsonOutput))
			return nil
		}

		fmt.Printf("Run: %s\n", detail.OrchestrationID)
		fmt.Printf("Status: %s\n", detail.Status)
		fmt.Printf("Agent: %s\n", detail.Agent)
		fmt.Printf("Workspace: %s\n", detail.Workspace)
		if detail.StartedAt != "" {
			fmt.Printf("Started: %s\n", detail.StartedAt)
		}
		if detail.CompletedAt != "" {
			fmt.Printf("Completed: %s\n", detail.CompletedAt)
		}
		if detail.DurationMs > 0 {
			fmt.Printf("Duration: %s\n", formatDuration(detail.DurationMs))
		}
		if detail.Timeout != "" {
			fmt.Printf("Timeout: %s\n", detail.Timeout)
		}
		fmt.Printf("\nPrompt:\n%s\n", detail.Prompt)

		if detail.Result != nil {
			fmt.Printf("\nResult:\n%s\n", *detail.Result)
		}
		if detail.Error != nil {
			fmt.Printf("\nError:\n%s\n", *detail.Error)
		}

		if showLocalEvents && len(detail.Events) > 0 {
			fmt.Printf("\nEvents (%d):\n", len(detail.Events))
			for _, e := range detail.Events {
				fmt.Printf("  [%s] %s: %s\n", e.Timestamp, e.Type, e.Message)
			}
		}

		if showLocalLogs {
			fmt.Println("\n--- stdout.log ---")
			if stdout, err := os.ReadFile(filepath.Join(runDir, "stdout.log")); err == nil {
				if len(stdout) > 0 {
					fmt.Println(string(stdout))
				} else {
					fmt.Println("(empty)")
				}
			} else {
				fmt.Println("(not available)")
			}

			fmt.Println("\n--- stderr.log ---")
			if stderr, err := os.ReadFile(filepath.Join(runDir, "stderr.log")); err == nil {
				if len(stderr) > 0 {
					fmt.Println(string(stderr))
				} else {
					fmt.Println("(empty)")
				}
			} else {
				fmt.Println("(not available)")
			}
		}

		fmt.Printf("\nRun directory: %s\n", runDir)
		fmt.Printf("Open dashboard: devsh orchestrate view %s --live\n", runDir)

		return nil
	},
}

func loadLocalRunDetail(runDir string, includeLogs bool, includeEvents bool) (*localRunDetail, error) {
	statePath := filepath.Join(runDir, "state.json")
	if stateData, err := os.ReadFile(statePath); err == nil {
		var state LocalState
		if err := json.Unmarshal(stateData, &state); err != nil {
			return nil, fmt.Errorf("invalid state.json: %w", err)
		}

		detail := &localRunDetail{
			OrchestrationID: state.OrchestrationID,
			RunDir:          runDir,
			Agent:           state.Agent,
			Status:          state.Status,
			Prompt:          state.Prompt,
			Workspace:       state.Workspace,
			StartedAt:       state.StartedAt,
			CompletedAt:     state.CompletedAt,
			DurationMs:      state.DurationMs,
			Result:          state.Result,
			Error:           state.Error,
		}
		if includeEvents {
			if len(state.Events) > 0 {
				detail.Events = state.Events
			} else {
				detail.Events = loadLocalRunEvents(runDir)
			}
		}
		if includeLogs {
			detail.Stdout = loadLocalRunLog(runDir, "stdout.log")
			detail.Stderr = loadLocalRunLog(runDir, "stderr.log")
		}
		return detail, nil
	}

	configPath := filepath.Join(runDir, "config.json")
	configData, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("could not load run state or config: %w", err)
	}

	var config LocalRunConfig
	if err := json.Unmarshal(configData, &config); err != nil {
		return nil, fmt.Errorf("invalid config.json: %w", err)
	}

	detail := &localRunDetail{
		OrchestrationID: config.OrchestrationID,
		RunDir:          runDir,
		Agent:           config.Agent,
		Status:          "running",
		Prompt:          config.Prompt,
		Workspace:       config.Workspace,
		Timeout:         config.Timeout,
		StartedAt:       config.CreatedAt,
	}
	if includeEvents {
		detail.Events = loadLocalRunEvents(runDir)
	}
	if includeLogs {
		detail.Stdout = loadLocalRunLog(runDir, "stdout.log")
		detail.Stderr = loadLocalRunLog(runDir, "stderr.log")
	}
	return detail, nil
}

func loadLocalRunEvents(runDir string) []LocalEvent {
	data, err := os.ReadFile(filepath.Join(runDir, "events.jsonl"))
	if err != nil {
		return nil
	}

	var events []LocalEvent
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		var event LocalEvent
		if err := json.Unmarshal([]byte(line), &event); err == nil {
			events = append(events, event)
		}
	}

	return events
}

func loadLocalRunLog(runDir, fileName string) string {
	data, err := os.ReadFile(filepath.Join(runDir, fileName))
	if err != nil {
		return ""
	}
	return string(data)
}

// resolveLocalRunDir resolves a run ID or path to the run directory
func resolveLocalRunDir(runID string) (string, error) {
	// If it's an absolute path or starts with ~, treat as direct path
	if filepath.IsAbs(runID) || strings.HasPrefix(runID, "~") {
		expandedPath := runID
		if strings.HasPrefix(runID, "~") {
			home, _ := os.UserHomeDir()
			expandedPath = filepath.Join(home, runID[1:])
		}
		if _, err := os.Stat(expandedPath); err == nil {
			return expandedPath, nil
		}
		return "", fmt.Errorf("run directory not found: %s", expandedPath)
	}

	// Check if it's a relative path that exists
	if _, err := os.Stat(runID); err == nil {
		return runID, nil
	}

	// Look in the standard location
	baseDir := getLocalRunsDir()

	// Try exact match first
	exactPath := filepath.Join(baseDir, runID)
	if _, err := os.Stat(exactPath); err == nil {
		return exactPath, nil
	}

	// Try partial match
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return "", fmt.Errorf("could not find run: %s", runID)
	}

	var matches []string
	for _, entry := range entries {
		if entry.IsDir() && strings.Contains(entry.Name(), runID) {
			matches = append(matches, filepath.Join(baseDir, entry.Name()))
		}
	}

	if len(matches) == 0 {
		return "", fmt.Errorf("no run found matching: %s", runID)
	}
	if len(matches) > 1 {
		return "", fmt.Errorf("multiple runs match '%s': %v", runID, matches)
	}

	return matches[0], nil
}

func init() {
	orchestrateShowLocalCmd.Flags().BoolVar(&showLocalLogs, "logs", false, "Include stdout/stderr logs")
	orchestrateShowLocalCmd.Flags().BoolVar(&showLocalEvents, "events", false, "Include event timeline")
	orchestrateCmd.AddCommand(orchestrateShowLocalCmd)
}
