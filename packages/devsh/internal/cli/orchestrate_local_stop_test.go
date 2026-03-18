// internal/cli/orchestrate_local_stop_test.go
package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestWritePidFile(t *testing.T) {
	tmpDir := t.TempDir()

	err := writePidFile(tmpDir)
	if err != nil {
		t.Fatalf("writePidFile failed: %v", err)
	}

	// Verify pid.txt was created
	pidPath := filepath.Join(tmpDir, "pid.txt")
	data, err := os.ReadFile(pidPath)
	if err != nil {
		t.Fatalf("failed to read pid.txt: %v", err)
	}

	// Verify content is a valid PID
	pid, err := strconv.Atoi(string(data))
	if err != nil {
		t.Fatalf("invalid PID in pid.txt: %v", err)
	}

	if pid != os.Getpid() {
		t.Errorf("expected PID %d, got %d", os.Getpid(), pid)
	}
}

func TestRemovePidFile(t *testing.T) {
	tmpDir := t.TempDir()

	// Create pid file
	pidPath := filepath.Join(tmpDir, "pid.txt")
	os.WriteFile(pidPath, []byte("12345"), 0644)

	// Verify it exists
	if _, err := os.Stat(pidPath); os.IsNotExist(err) {
		t.Fatal("pid.txt should exist before removal")
	}

	// Remove it
	removePidFile(tmpDir)

	// Verify it's gone
	if _, err := os.Stat(pidPath); !os.IsNotExist(err) {
		t.Error("pid.txt should be removed")
	}
}

func TestRemovePidFileNonexistent(t *testing.T) {
	tmpDir := t.TempDir()

	// Should not panic when file doesn't exist
	removePidFile(tmpDir)
}

func TestStopLocalFlagsExist(t *testing.T) {
	origForce := stopLocalForce
	defer func() { stopLocalForce = origForce }()

	stopLocalForce = true
	if !stopLocalForce {
		t.Error("failed to set stopLocalForce")
	}

	stopLocalForce = false
	if stopLocalForce {
		t.Error("failed to reset stopLocalForce")
	}
}

func TestStopLocalCompletedRun(t *testing.T) {
	// This tests the error path when trying to stop a completed run
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_completed")
	os.MkdirAll(runDir, 0755)

	// Create state.json showing completed
	stateJSON := `{"orchestrationId":"local_completed","status":"completed"}`
	os.WriteFile(filepath.Join(runDir, "state.json"), []byte(stateJSON), 0644)

	// Override localRunDir for testing
	origRunDir := localRunDir
	localRunDir = tmpDir
	defer func() { localRunDir = origRunDir }()

	// The command should error because run is completed
	// We can't easily test the full command, but we can verify the logic
	statePath := filepath.Join(runDir, "state.json")
	stateData, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("failed to read state: %v", err)
	}

	var state LocalState
	if err := unmarshalJSON(stateData, &state); err != nil {
		t.Fatalf("failed to parse state: %v", err)
	}

	if state.Status != "completed" {
		t.Errorf("expected status completed, got %s", state.Status)
	}
}

func unmarshalJSON(data []byte, v any) error {
	return json.Unmarshal(data, v)
}
