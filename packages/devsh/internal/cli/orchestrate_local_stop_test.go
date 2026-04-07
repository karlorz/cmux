// internal/cli/orchestrate_local_stop_test.go
package cli

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestStopLocalPersistsStopMetadata(t *testing.T) {
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_stopmeta")
	os.MkdirAll(runDir, 0755)

	sleeper := exec.Command("sh", "-c", "sleep 5")
	if err := sleeper.Start(); err != nil {
		t.Fatalf("failed to start sleeper: %v", err)
	}
	defer func() {
		_ = sleeper.Process.Kill()
		_, _ = sleeper.Process.Wait()
	}()
	os.WriteFile(filepath.Join(runDir, "pid.txt"), []byte(strconv.Itoa(sleeper.Process.Pid)), 0644)

	session := LocalSessionInfo{
		Agent:          "claude/haiku-4.5",
		Workspace:      "/test/workspace",
		InjectionMode:  "active",
		InjectionCount: 1,
	}
	sessionData, _ := json.MarshalIndent(session, "", "  ")
	os.WriteFile(filepath.Join(runDir, "session.json"), sessionData, 0644)

	origRunDir := localRunDir
	localRunDir = tmpDir
	defer func() { localRunDir = origRunDir }()

	result, err := stopLocalRun("local_stopmeta", false)
	if err != nil {
		t.Fatalf("expected stop to succeed: %v", err)
	}
	if result.Status != "stopped" {
		t.Fatalf("expected stopped status, got %q", result.Status)
	}
	if result.PID != sleeper.Process.Pid {
		t.Fatalf("expected stopped pid %d, got %d", sleeper.Process.Pid, result.PID)
	}

	time.Sleep(100 * time.Millisecond)

	updated, err := loadSessionInfo(runDir)
	if err != nil {
		t.Fatalf("expected persisted session info: %v", err)
	}
	if updated.Stop == nil {
		t.Fatal("expected stop metadata to be persisted")
	}
	if updated.Stop.Status != "stopped" {
		t.Fatalf("expected persisted stop status, got %q", updated.Stop.Status)
	}
	if updated.Stop.Signal != "SIGTERM" {
		t.Fatalf("expected persisted stop signal, got %q", updated.Stop.Signal)
	}
	if updated.Stop.PID != sleeper.Process.Pid {
		t.Fatalf("expected persisted stop pid %d, got %d", sleeper.Process.Pid, updated.Stop.PID)
	}
}

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
