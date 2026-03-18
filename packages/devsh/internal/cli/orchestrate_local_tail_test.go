// internal/cli/orchestrate_local_tail_test.go
package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTailLast(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "test.log")

	// Create a log file with 30 lines
	var lines []string
	for i := 1; i <= 30; i++ {
		lines = append(lines, strings.Repeat("x", 10))
	}
	os.WriteFile(logPath, []byte(strings.Join(lines, "\n")+"\n"), 0644)

	// Test that tailLast doesn't error
	err := tailLast(logPath, 10)
	if err != nil {
		t.Errorf("tailLast failed: %v", err)
	}
}

func TestTailLastEmptyFile(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "empty.log")
	os.WriteFile(logPath, []byte{}, 0644)

	err := tailLast(logPath, 10)
	if err != nil {
		t.Errorf("tailLast on empty file failed: %v", err)
	}
}

func TestTailLastFileNotFound(t *testing.T) {
	err := tailLast("/nonexistent/path/file.log", 10)
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestTailLocalFlagsExist(t *testing.T) {
	// Verify flag variables exist and can be set
	origFollow := tailLocalFollow
	origStderr := tailLocalStderr
	origLines := tailLocalLines
	defer func() {
		tailLocalFollow = origFollow
		tailLocalStderr = origStderr
		tailLocalLines = origLines
	}()

	tailLocalFollow = true
	if !tailLocalFollow {
		t.Error("failed to set tailLocalFollow")
	}

	tailLocalStderr = true
	if !tailLocalStderr {
		t.Error("failed to set tailLocalStderr")
	}

	tailLocalLines = 50
	if tailLocalLines != 50 {
		t.Error("failed to set tailLocalLines")
	}
}
