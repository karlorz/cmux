package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const codexSessionPollInterval = 250 * time.Millisecond

type codexSessionEnvelope struct {
	Type    string `json:"type"`
	Payload struct {
		ID        string `json:"id"`
		Cwd       string `json:"cwd"`
		Timestamp string `json:"timestamp"`
	} `json:"payload"`
}

func configureCodexLocalCommand(ctx context.Context, state *LocalState, workspace string, cmd *exec.Cmd) (func(), error) {
	if state.RunDir == "" {
		return func() {}, nil
	}

	codexHome, err := prepareCodexHomeForRun(state.RunDir)
	if err != nil {
		return func() {}, err
	}
	if err := ensureCodexHomeWorkspaceTrusted(codexHome, workspace); err != nil {
		return func() {}, err
	}

	if err := UpdateCodexHome(state.RunDir, codexHome); err != nil {
		return func() {}, fmt.Errorf("persist codex home: %w", err)
	}

	cmd.Env = withEnvVar(cmd.Env, "CODEX_HOME", codexHome)

	watchCtx, cancel := context.WithCancel(ctx)
	go func() {
		threadID, err := waitForCodexThreadID(watchCtx, codexHome, workspace)
		if err != nil || threadID == "" {
			return
		}
		_ = UpdateThreadID(state.RunDir, threadID)
	}()

	return cancel, nil
}

func prepareCodexHomeForRun(runDir string) (string, error) {
	sourceHome, err := resolveCodexHome()
	if err != nil {
		return "", err
	}

	runHome := filepath.Join(runDir, "codex-home")
	if err := os.MkdirAll(runHome, 0755); err != nil {
		return "", fmt.Errorf("create run codex home: %w", err)
	}

	entries := []string{
		"config.toml",
		"auth.json",
		"AGENTS.md",
		"skills",
		"hooks",
		"hooks.json",
		"memories",
		"models_cache.json",
		"tools",
		"vendor_imports",
		".codex-global-state.json",
		"version.json",
	}

	for _, entry := range entries {
		if err := mirrorCodexHomeEntry(sourceHome, runHome, entry); err != nil {
			return "", err
		}
	}

	return runHome, nil
}

func resolveCodexHome() (string, error) {
	if codexHome := os.Getenv("CODEX_HOME"); codexHome != "" {
		return filepath.Abs(codexHome)
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home: %w", err)
	}

	return filepath.Join(homeDir, ".codex"), nil
}

func mirrorCodexHomeEntry(sourceHome, runHome, entry string) error {
	sourcePath := filepath.Join(sourceHome, entry)
	if _, err := os.Lstat(sourcePath); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return fmt.Errorf("stat source codex entry %s: %w", entry, err)
	}

	destPath := filepath.Join(runHome, entry)
	if _, err := os.Lstat(destPath); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat destination codex entry %s: %w", entry, err)
	}

	if entry == "config.toml" {
		data, err := os.ReadFile(sourcePath)
		if err != nil {
			return fmt.Errorf("read source codex config: %w", err)
		}
		if err := os.WriteFile(destPath, data, 0600); err != nil {
			return fmt.Errorf("write run codex config: %w", err)
		}
		return nil
	}

	if err := os.Symlink(sourcePath, destPath); err != nil {
		return fmt.Errorf("symlink codex entry %s: %w", entry, err)
	}

	return nil
}

func ensureCodexHomeWorkspaceTrusted(codexHome, workspace string) error {
	configPath := filepath.Join(codexHome, "config.toml")
	configData, err := os.ReadFile(configPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read run codex config: %w", err)
	}

	contents := string(configData)
	paths := []string{workspace, canonicalizeCodexPath(workspace)}
	for _, path := range paths {
		if path == "" {
			continue
		}

		section := fmt.Sprintf("[projects.%q]", path)
		if strings.Contains(contents, section) {
			continue
		}

		if contents != "" && !strings.HasSuffix(contents, "\n") {
			contents += "\n"
		}
		contents += fmt.Sprintf("\n%s\ntrust_level = \"trusted\"\n", section)
	}

	return os.WriteFile(configPath, []byte(contents), 0600)
}

func waitForCodexThreadID(ctx context.Context, codexHome, workspace string) (string, error) {
	ticker := time.NewTicker(codexSessionPollInterval)
	defer ticker.Stop()

	for {
		threadID, err := findCodexThreadID(codexHome, workspace)
		if err == nil && threadID != "" {
			return threadID, nil
		}
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}

		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-ticker.C:
		}
	}
}

func findCodexThreadID(codexHome, workspace string) (string, error) {
	sessionsDir := filepath.Join(codexHome, "sessions")
	if _, err := os.Stat(sessionsDir); err != nil {
		return "", err
	}

	wantWorkspace := canonicalizeCodexPath(workspace)
	var newestID string
	var newestTime time.Time

	walkErr := filepath.WalkDir(sessionsDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() || filepath.Ext(path) != ".jsonl" {
			return nil
		}

		envelope, err := readCodexSessionEnvelope(path)
		if err != nil {
			return nil
		}
		if envelope.Type != "session_meta" || envelope.Payload.ID == "" {
			return nil
		}
		if canonicalizeCodexPath(envelope.Payload.Cwd) != wantWorkspace {
			return nil
		}

		sessionTime, err := time.Parse(time.RFC3339Nano, envelope.Payload.Timestamp)
		if err != nil {
			sessionTime = time.Time{}
		}
		if newestID == "" || sessionTime.After(newestTime) {
			newestID = envelope.Payload.ID
			newestTime = sessionTime
		}

		return nil
	})
	if walkErr != nil {
		return "", walkErr
	}
	if newestID == "" {
		return "", fs.ErrNotExist
	}

	return newestID, nil
}

func readCodexSessionEnvelope(path string) (*codexSessionEnvelope, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var envelope codexSessionEnvelope
	if err := json.NewDecoder(file).Decode(&envelope); err != nil {
		return nil, err
	}

	return &envelope, nil
}

func canonicalizeCodexPath(path string) string {
	if path == "" {
		return ""
	}

	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		path = resolved
	}
	if absPath, err := filepath.Abs(path); err == nil {
		path = absPath
	}

	return filepath.Clean(path)
}

func withEnvVar(env []string, key, value string) []string {
	if len(env) == 0 {
		env = os.Environ()
	}

	prefix := key + "="
	filtered := make([]string, 0, len(env)+1)
	for _, entry := range env {
		if !strings.HasPrefix(entry, prefix) {
			filtered = append(filtered, entry)
		}
	}

	return append(filtered, prefix+value)
}
