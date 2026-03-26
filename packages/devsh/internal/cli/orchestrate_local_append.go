// internal/cli/orchestrate_local_append.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
)

var orchestrateAppendLocalCmd = &cobra.Command{
	Use:   "append-local <run-id> <message>",
	Short: "Append an instruction to a running local task (alias for inject-local --mode passive)",
	Long: `Append an instruction to a running local orchestration task using passive injection.

This writes to the append.txt file in the run directory, which the running
task can poll for new instructions. The message is appended with a timestamp.

Note: This is the passive injection mode. For active injection that uses
session continuation (when supported by the agent CLI), use 'inject-local'
instead, which auto-detects the best injection mode.

See also: devsh orchestrate inject-local --help

Examples:
  devsh orchestrate append-local local_abc123 "Also add tests for the new function"
  devsh orchestrate append-local local_abc123 "Focus on error handling"
  devsh orchestrate append-local ~/.devsh/orchestrations/local_abc123 "Prioritize security"`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		runID := args[0]
		message := args[1]

		// Resolve run directory
		runDir, err := resolveLocalRunDir(runID)
		if err != nil {
			return err
		}

		// Check if run is active (has pid.txt)
		pidPath := filepath.Join(runDir, "pid.txt")
		if _, err := os.Stat(pidPath); os.IsNotExist(err) {
			// Check state to give better error message
			statePath := filepath.Join(runDir, "state.json")
			if stateData, stateErr := os.ReadFile(statePath); stateErr == nil {
				var state LocalState
				if json.Unmarshal(stateData, &state) == nil {
					if state.Status == "completed" || state.Status == "failed" {
						return fmt.Errorf("run %s is already %s - cannot append to finished task", runID, state.Status)
					}
				}
			}
			return fmt.Errorf("run %s has no pid.txt - task may not be running or was not started with --persist", runID)
		}

		// Append to instructions file
		appendPath := filepath.Join(runDir, "append.txt")
		timestamp := time.Now().UTC().Format(time.RFC3339)
		entry := fmt.Sprintf("[%s] %s\n", timestamp, message)

		f, err := os.OpenFile(appendPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return fmt.Errorf("failed to open append file: %w", err)
		}
		defer f.Close()

		if _, err := f.WriteString(entry); err != nil {
			return fmt.Errorf("failed to write instruction: %w", err)
		}

		// Log event to events.jsonl
		eventsPath := filepath.Join(runDir, "events.jsonl")
		event := LocalEvent{
			Timestamp: timestamp,
			Type:      "instruction_appended",
			Message:   message,
		}
		if eventData, err := json.Marshal(event); err == nil {
			if ef, err := os.OpenFile(eventsPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
				ef.WriteString(string(eventData) + "\n")
				ef.Close()
			}
		}

		fmt.Printf("Appended instruction to run %s\n", runID)
		fmt.Printf("Message: %s\n", message)
		fmt.Printf("File: %s\n", appendPath)
		fmt.Println()
		fmt.Println("Note: The running agent must check append.txt for new instructions.")
		fmt.Println("This is currently a passive mechanism - agents can poll this file for updates.")

		return nil
	},
}

// readAppendedInstructions reads any pending instructions from append.txt
// and clears the file after reading. Returns empty slice if no instructions.
func readAppendedInstructions(runDir string) ([]string, error) {
	appendPath := filepath.Join(runDir, "append.txt")

	data, err := os.ReadFile(appendPath)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if len(data) == 0 {
		return nil, nil
	}

	// Parse instructions (one per line)
	var instructions []string
	for _, line := range splitLines(string(data)) {
		if line != "" {
			instructions = append(instructions, line)
		}
	}

	// Clear the file after reading
	if err := os.WriteFile(appendPath, []byte{}, 0644); err != nil {
		return instructions, fmt.Errorf("failed to clear append file: %w", err)
	}

	return instructions, nil
}


func init() {
	orchestrateCmd.AddCommand(orchestrateAppendLocalCmd)
}
