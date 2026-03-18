// internal/cli/orchestrate_local_stop.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"syscall"

	"github.com/spf13/cobra"
)

var (
	stopLocalForce bool
)

var orchestrateStopLocalCmd = &cobra.Command{
	Use:   "stop-local <run-id>",
	Short: "Stop a running local orchestration task",
	Long: `Stop a running local orchestration task by sending a termination signal.

This command works with runs that have a pid.txt file in their run directory.
The pid.txt file is created when running with --persist.

By default, sends SIGTERM to allow graceful shutdown. Use --force to send SIGKILL.

Examples:
  devsh orchestrate stop-local local_abc123
  devsh orchestrate stop-local local_abc123 --force
  devsh orchestrate stop-local ~/.devsh/orchestrations/local_abc123`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		runID := args[0]

		// Resolve run directory
		runDir, err := resolveLocalRunDir(runID)
		if err != nil {
			return err
		}

		// Check for pid.txt
		pidPath := filepath.Join(runDir, "pid.txt")
		pidData, err := os.ReadFile(pidPath)
		if err != nil {
			// Check if run is already completed
			statePath := filepath.Join(runDir, "state.json")
			if stateData, stateErr := os.ReadFile(statePath); stateErr == nil {
				var state LocalState
				if json.Unmarshal(stateData, &state) == nil {
					if state.Status == "completed" || state.Status == "failed" {
						return fmt.Errorf("run %s is already %s", runID, state.Status)
					}
				}
			}
			return fmt.Errorf("no pid.txt found - run may not be active or was not started with --persist")
		}

		pid, err := strconv.Atoi(string(pidData))
		if err != nil {
			return fmt.Errorf("invalid pid in pid.txt: %w", err)
		}

		// Check if process exists
		process, err := os.FindProcess(pid)
		if err != nil {
			return fmt.Errorf("failed to find process %d: %w", pid, err)
		}

		// Check if process is actually running by sending signal 0
		if err := process.Signal(syscall.Signal(0)); err != nil {
			// Process doesn't exist, clean up pid file
			os.Remove(pidPath)
			return fmt.Errorf("process %d is not running (pid file was stale)", pid)
		}

		// Send appropriate signal
		var sig syscall.Signal
		var sigName string
		if stopLocalForce {
			sig = syscall.SIGKILL
			sigName = "SIGKILL"
		} else {
			sig = syscall.SIGTERM
			sigName = "SIGTERM"
		}

		if err := process.Signal(sig); err != nil {
			return fmt.Errorf("failed to send %s to process %d: %w", sigName, pid, err)
		}

		fmt.Printf("Sent %s to process %d\n", sigName, pid)
		fmt.Printf("Run directory: %s\n", runDir)

		// Clean up pid file
		os.Remove(pidPath)

		return nil
	},
}

// writePidFile writes the current process PID to a file in the run directory
func writePidFile(runDir string) error {
	pidPath := filepath.Join(runDir, "pid.txt")
	pid := os.Getpid()
	return os.WriteFile(pidPath, []byte(strconv.Itoa(pid)), 0644)
}

// removePidFile removes the PID file from the run directory
func removePidFile(runDir string) {
	pidPath := filepath.Join(runDir, "pid.txt")
	os.Remove(pidPath)
}

func init() {
	orchestrateStopLocalCmd.Flags().BoolVar(&stopLocalForce, "force", false, "Send SIGKILL instead of SIGTERM")
	orchestrateCmd.AddCommand(orchestrateStopLocalCmd)
}
