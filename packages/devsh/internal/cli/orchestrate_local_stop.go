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

type localStopResult struct {
	RunID   string `json:"runId"`
	RunDir  string `json:"runDir"`
	PID     int    `json:"pid"`
	Signal  string `json:"signal"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

func buildLocalStopInfo(result *localStopResult) *LocalStopInfo {
	if result == nil {
		return nil
	}

	return &LocalStopInfo{
		PID:     result.PID,
		Signal:  result.Signal,
		Status:  result.Status,
		Message: result.Message,
	}
}

func stopLocalRun(runID string, force bool) (*localStopResult, error) {
	runDir, err := resolveLocalRunDir(runID)
	if err != nil {
		return nil, err
	}

	pidPath := filepath.Join(runDir, "pid.txt")
	pidData, err := os.ReadFile(pidPath)
	if err != nil {
		statePath := filepath.Join(runDir, "state.json")
		if stateData, stateErr := os.ReadFile(statePath); stateErr == nil {
			var state LocalState
			if json.Unmarshal(stateData, &state) == nil {
				if state.Status == "completed" || state.Status == "failed" {
					return nil, fmt.Errorf("run %s is already %s", runID, state.Status)
				}
			}
		}
		return nil, fmt.Errorf("no pid.txt found - run may not be active or was not started with --persist")
	}

	pid, err := strconv.Atoi(string(pidData))
	if err != nil {
		return nil, fmt.Errorf("invalid pid in pid.txt: %w", err)
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return nil, fmt.Errorf("failed to find process %d: %w", pid, err)
	}

	if err := process.Signal(syscall.Signal(0)); err != nil {
		os.Remove(pidPath)
		return nil, fmt.Errorf("process %d is not running (pid file was stale)", pid)
	}

	var sig syscall.Signal
	var sigName string
	if force {
		sig = syscall.SIGKILL
		sigName = "SIGKILL"
	} else {
		sig = syscall.SIGTERM
		sigName = "SIGTERM"
	}

	if err := process.Signal(sig); err != nil {
		return nil, fmt.Errorf("failed to send %s to process %d: %w", sigName, pid, err)
	}

	os.Remove(pidPath)

	result := &localStopResult{
		RunID:   runID,
		RunDir:  runDir,
		PID:     pid,
		Signal:  sigName,
		Status:  "stopped",
		Message: fmt.Sprintf("Sent %s to process %d", sigName, pid),
	}

	if sessionInfo, err := loadSessionInfo(runDir); err == nil {
		sessionInfo.Stop = buildLocalStopInfo(result)
		if saveErr := saveSessionInfo(runDir, sessionInfo); saveErr != nil {
			return nil, fmt.Errorf("failed to persist stop metadata: %w", saveErr)
		}
	}

	return result, nil
}

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

		result, err := stopLocalRun(runID, stopLocalForce)
		if err != nil {
			return err
		}

		if flagJSON {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
			return nil
		}

		fmt.Println(result.Message)
		fmt.Printf("Run directory: %s\n", result.RunDir)
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
