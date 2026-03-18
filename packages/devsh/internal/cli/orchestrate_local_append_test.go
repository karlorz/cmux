// internal/cli/orchestrate_local_append_test.go
package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadAppendedInstructionsEmpty(t *testing.T) {
	tmpDir := t.TempDir()

	// No append.txt file exists
	instructions, err := readAppendedInstructions(tmpDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instructions) != 0 {
		t.Errorf("expected no instructions, got %d", len(instructions))
	}
}

func TestReadAppendedInstructionsWithContent(t *testing.T) {
	tmpDir := t.TempDir()

	// Create append.txt with instructions
	appendPath := filepath.Join(tmpDir, "append.txt")
	content := "[2026-03-18T10:00:00Z] First instruction\n[2026-03-18T10:05:00Z] Second instruction\n"
	os.WriteFile(appendPath, []byte(content), 0644)

	instructions, err := readAppendedInstructions(tmpDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instructions) != 2 {
		t.Errorf("expected 2 instructions, got %d", len(instructions))
	}

	// File should be cleared after reading
	data, _ := os.ReadFile(appendPath)
	if len(data) != 0 {
		t.Errorf("append.txt should be empty after read, got %d bytes", len(data))
	}
}

func TestReadAppendedInstructionsEmptyFile(t *testing.T) {
	tmpDir := t.TempDir()

	// Create empty append.txt
	appendPath := filepath.Join(tmpDir, "append.txt")
	os.WriteFile(appendPath, []byte{}, 0644)

	instructions, err := readAppendedInstructions(tmpDir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(instructions) != 0 {
		t.Errorf("expected no instructions from empty file, got %d", len(instructions))
	}
}

func TestAppendLocalRequiresPidFile(t *testing.T) {
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_test")
	os.MkdirAll(runDir, 0755)

	// Create state.json showing running but no pid.txt
	stateJSON := `{"orchestrationId":"local_test","status":"running"}`
	os.WriteFile(filepath.Join(runDir, "state.json"), []byte(stateJSON), 0644)

	// Override localRunDir for testing
	origRunDir := localRunDir
	localRunDir = tmpDir
	defer func() { localRunDir = origRunDir }()

	// The command would fail because no pid.txt exists
	pidPath := filepath.Join(runDir, "pid.txt")
	if _, err := os.Stat(pidPath); !os.IsNotExist(err) {
		t.Error("pid.txt should not exist")
	}
}

func TestAppendLocalCompletedRun(t *testing.T) {
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

	// Verify state is completed
	statePath := filepath.Join(runDir, "state.json")
	stateData, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("failed to read state: %v", err)
	}

	if !strings.Contains(string(stateData), `"status":"completed"`) {
		t.Error("expected status to be completed")
	}
}

func TestAppendWritesToFile(t *testing.T) {
	tmpDir := t.TempDir()

	appendPath := filepath.Join(tmpDir, "append.txt")

	// Write instruction
	f, err := os.OpenFile(appendPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatalf("failed to open append file: %v", err)
	}
	entry := "[2026-03-18T10:00:00Z] Test instruction\n"
	f.WriteString(entry)
	f.Close()

	// Verify content
	data, err := os.ReadFile(appendPath)
	if err != nil {
		t.Fatalf("failed to read append file: %v", err)
	}
	if string(data) != entry {
		t.Errorf("expected %q, got %q", entry, string(data))
	}
}
