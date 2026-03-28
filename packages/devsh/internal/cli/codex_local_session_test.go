package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPrepareCodexHomeForRunMirrorsSelectedEntries(t *testing.T) {
	sourceHome := t.TempDir()
	runDir := t.TempDir()

	t.Setenv("CODEX_HOME", sourceHome)

	mustWriteFile(t, filepath.Join(sourceHome, "config.toml"), "model = \"gpt-5.4\"\n")
	mustWriteFile(t, filepath.Join(sourceHome, "auth.json"), "{\"token\":\"test\"}\n")
	if err := os.Mkdir(filepath.Join(sourceHome, "skills"), 0755); err != nil {
		t.Fatalf("mkdir skills: %v", err)
	}

	runHome, err := prepareCodexHomeForRun(runDir)
	if err != nil {
		t.Fatalf("prepareCodexHomeForRun failed: %v", err)
	}

	if runHome != filepath.Join(runDir, "codex-home") {
		t.Fatalf("unexpected run home: %s", runHome)
	}

	configInfo, err := os.Lstat(filepath.Join(runHome, "config.toml"))
	if err != nil {
		t.Fatalf("lstat config.toml: %v", err)
	}
	if configInfo.Mode()&os.ModeSymlink != 0 {
		t.Fatalf("expected config.toml to be copied so run-local can add trust overrides")
	}

	for _, entry := range []string{"auth.json", "skills"} {
		destPath := filepath.Join(runHome, entry)
		info, err := os.Lstat(destPath)
		if err != nil {
			t.Fatalf("lstat %s: %v", destPath, err)
		}
		if info.Mode()&os.ModeSymlink == 0 {
			t.Fatalf("expected %s to be a symlink", destPath)
		}
	}
}

func TestFindCodexThreadIDMatchesCanonicalWorkspace(t *testing.T) {
	baseDir := t.TempDir()
	codexHome := filepath.Join(baseDir, "codex-home")
	realWorkspace := filepath.Join(baseDir, "workspace-real")
	symlinkWorkspace := filepath.Join(baseDir, "workspace-link")

	if err := os.MkdirAll(filepath.Join(codexHome, "sessions", "2026", "03", "28"), 0755); err != nil {
		t.Fatalf("mkdir sessions: %v", err)
	}
	if err := os.Mkdir(realWorkspace, 0755); err != nil {
		t.Fatalf("mkdir real workspace: %v", err)
	}
	if err := os.Symlink(realWorkspace, symlinkWorkspace); err != nil {
		t.Fatalf("symlink workspace: %v", err)
	}

	sessionPath := filepath.Join(codexHome, "sessions", "2026", "03", "28", "rollout-test.jsonl")
	envelope := codexSessionEnvelope{
		Type: "session_meta",
	}
	envelope.Payload.ID = "thread-123"
	envelope.Payload.Cwd = realWorkspace
	envelope.Payload.Timestamp = "2026-03-28T00:54:26.519Z"

	sessionData, err := json.Marshal(envelope)
	if err != nil {
		t.Fatalf("marshal session envelope: %v", err)
	}
	mustWriteFile(t, sessionPath, string(sessionData)+"\n")

	threadID, err := findCodexThreadID(codexHome, symlinkWorkspace)
	if err != nil {
		t.Fatalf("findCodexThreadID failed: %v", err)
	}
	if threadID != "thread-123" {
		t.Fatalf("unexpected thread id: %s", threadID)
	}
}

func TestEnsureCodexHomeWorkspaceTrustedAddsWorkspaceOverride(t *testing.T) {
	baseDir := t.TempDir()
	codexHome := filepath.Join(baseDir, "codex-home")
	realWorkspace := filepath.Join(baseDir, "workspace-real")
	symlinkWorkspace := filepath.Join(baseDir, "workspace-link")

	if err := os.MkdirAll(codexHome, 0755); err != nil {
		t.Fatalf("mkdir codex home: %v", err)
	}
	if err := os.Mkdir(realWorkspace, 0755); err != nil {
		t.Fatalf("mkdir real workspace: %v", err)
	}
	if err := os.Symlink(realWorkspace, symlinkWorkspace); err != nil {
		t.Fatalf("symlink workspace: %v", err)
	}
	mustWriteFile(t, filepath.Join(codexHome, "config.toml"), "model = \"gpt-5.4\"\n")

	if err := ensureCodexHomeWorkspaceTrusted(codexHome, symlinkWorkspace); err != nil {
		t.Fatalf("ensureCodexHomeWorkspaceTrusted failed: %v", err)
	}

	configData, err := os.ReadFile(filepath.Join(codexHome, "config.toml"))
	if err != nil {
		t.Fatalf("read config.toml: %v", err)
	}
	config := string(configData)

	if !strings.Contains(config, `[projects."`+symlinkWorkspace+`"]`) {
		t.Fatalf("expected original workspace trust entry, got:\n%s", config)
	}
	canonicalWorkspace := canonicalizeCodexPath(realWorkspace)
	if !strings.Contains(config, `[projects."`+canonicalWorkspace+`"]`) {
		t.Fatalf("expected canonical workspace trust entry, got:\n%s", config)
	}
}

func mustWriteFile(t *testing.T, path, contents string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(contents), 0644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
