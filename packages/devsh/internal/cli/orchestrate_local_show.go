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

var orchestrateShowLocalCmd = &cobra.Command{
	Use:   "show-local <run-id>",
	Short: "Show details of a local orchestration run",
	Long: `Display detailed information about a specific local orchestration run.

Shows configuration, state, events, and optionally logs from a run
created with 'devsh orchestrate run-local --persist'.

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

		// Resolve run directory
		runDir, err := resolveLocalRunDir(runID)
		if err != nil {
			return err
		}

		// Load state
		statePath := filepath.Join(runDir, "state.json")
		stateData, err := os.ReadFile(statePath)
		if err != nil {
			// Try config.json for in-progress runs
			configPath := filepath.Join(runDir, "config.json")
			configData, configErr := os.ReadFile(configPath)
			if configErr != nil {
				return fmt.Errorf("could not load run state or config: %w", err)
			}

			var config LocalRunConfig
			if err := json.Unmarshal(configData, &config); err != nil {
				return fmt.Errorf("invalid config.json: %w", err)
			}

			if flagJSON {
				output, _ := json.MarshalIndent(config, "", "  ")
				fmt.Println(string(output))
			} else {
				fmt.Printf("Run: %s (in progress or crashed)\n", config.OrchestrationID)
				fmt.Printf("Agent: %s\n", config.Agent)
				fmt.Printf("Workspace: %s\n", config.Workspace)
				fmt.Printf("Started: %s\n", config.CreatedAt)
				fmt.Printf("Timeout: %s\n", config.Timeout)
				fmt.Printf("Prompt: %s\n", config.Prompt)
				fmt.Printf("\nRun directory: %s\n", runDir)
			}
			return nil
		}

		var state LocalState
		if err := json.Unmarshal(stateData, &state); err != nil {
			return fmt.Errorf("invalid state.json: %w", err)
		}

		if flagJSON {
			// Include logs if requested
			output := map[string]any{
				"state":  state,
				"runDir": runDir,
			}
			if showLocalLogs {
				if stdout, err := os.ReadFile(filepath.Join(runDir, "stdout.log")); err == nil {
					output["stdout"] = string(stdout)
				}
				if stderr, err := os.ReadFile(filepath.Join(runDir, "stderr.log")); err == nil {
					output["stderr"] = string(stderr)
				}
			}
			jsonOutput, _ := json.MarshalIndent(output, "", "  ")
			fmt.Println(string(jsonOutput))
			return nil
		}

		// Text output
		fmt.Printf("Run: %s\n", state.OrchestrationID)
		fmt.Printf("Status: %s\n", state.Status)
		fmt.Printf("Agent: %s\n", state.Agent)
		fmt.Printf("Workspace: %s\n", state.Workspace)
		fmt.Printf("Started: %s\n", state.StartedAt)
		if state.CompletedAt != "" {
			fmt.Printf("Completed: %s\n", state.CompletedAt)
		}
		if state.DurationMs > 0 {
			fmt.Printf("Duration: %s\n", formatDuration(state.DurationMs))
		}
		fmt.Printf("\nPrompt:\n%s\n", state.Prompt)

		if state.Result != nil {
			fmt.Printf("\nResult:\n%s\n", *state.Result)
		}
		if state.Error != nil {
			fmt.Printf("\nError:\n%s\n", *state.Error)
		}

		// Show events if requested
		if showLocalEvents && len(state.Events) > 0 {
			fmt.Printf("\nEvents (%d):\n", len(state.Events))
			for _, e := range state.Events {
				fmt.Printf("  [%s] %s: %s\n", e.Timestamp, e.Type, e.Message)
			}
		}

		// Show logs if requested
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
		fmt.Printf("View in browser: devsh orchestrate view %s --watch\n", runDir)

		return nil
	},
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
