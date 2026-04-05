// internal/cli/orchestrate_local_stop_test.go
package cli

import (
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

	pidPath := filepath.Join(tmpDir, "pid.txt")
	data, err := os.ReadFile(pidPath)
	if err != nil {
		t.Fatalf("failed to read pid.txt: %v", err)
	}

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

	pidPath := filepath.Join(tmpDir, "pid.txt")
	os.WriteFile(pidPath, []byte("12345"), 0644)

	if _, err := os.Stat(pidPath); os.IsNotExist(err) {
		t.Fatal("pid.txt should exist before removal")
	}

	removePidFile(tmpDir)

	if _, err := os.Stat(pidPath); !os.IsNotExist(err) {
		t.Error("pid.txt should be removed")
	}
}

func TestRemovePidFileNonexistent(t *testing.T) {
	tmpDir := t.TempDir()
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
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_completed")
	os.MkdirAll(runDir, 0755)

	stateJSON := `{"orchestrationId":"local_completed","status":"completed"}`
	os.WriteFile(filepath.Join(runDir, "state.json"), []byte(stateJSON), 0644)

	origRunDir := localRunDir
	localRunDir = tmpDir
	defer func() { localRunDir = origRunDir }()

	_, err := stopLocalRun("local_completed", false)
	if err == nil {
		t.Fatal("expected completed run to fail")
	}
	if err.Error() != "run local_completed is already completed" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStopLocalStalePid(t *testing.T) {
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_stale")
	os.MkdirAll(runDir, 0755)
	os.WriteFile(filepath.Join(runDir, "pid.txt"), []byte("999999"), 0644)

	origRunDir := localRunDir
	localRunDir = tmpDir
	defer func() { localRunDir = origRunDir }()

	_, err := stopLocalRun("local_stale", false)
	if err == nil {
		t.Fatal("expected stale pid to fail")
	}
	if _, statErr := os.Stat(filepath.Join(runDir, "pid.txt")); !os.IsNotExist(statErr) {
		t.Fatal("expected stale pid file to be removed")
	}
}
