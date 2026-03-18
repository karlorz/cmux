// Package state manages minimal local state for the devsh CLI.
package state

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestStateStruct(t *testing.T) {
	s := State{
		LastInstanceID: "test-instance",
		LastTeamSlug:   "test-team",
	}

	if s.LastInstanceID != "test-instance" {
		t.Errorf("expected LastInstanceID 'test-instance', got '%s'", s.LastInstanceID)
	}
	if s.LastTeamSlug != "test-team" {
		t.Errorf("expected LastTeamSlug 'test-team', got '%s'", s.LastTeamSlug)
	}
}

func TestStateJSON(t *testing.T) {
	s := State{
		LastInstanceID: "json-instance",
		LastTeamSlug:   "json-team",
	}

	data, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("failed to marshal state: %v", err)
	}

	var s2 State
	if err := json.Unmarshal(data, &s2); err != nil {
		t.Fatalf("failed to unmarshal state: %v", err)
	}

	if s2.LastInstanceID != s.LastInstanceID {
		t.Errorf("expected LastInstanceID '%s', got '%s'", s.LastInstanceID, s2.LastInstanceID)
	}
	if s2.LastTeamSlug != s.LastTeamSlug {
		t.Errorf("expected LastTeamSlug '%s', got '%s'", s.LastTeamSlug, s2.LastTeamSlug)
	}
}

func TestStateJSONOmitEmpty(t *testing.T) {
	s := State{}
	data, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("failed to marshal empty state: %v", err)
	}

	// Empty state should produce minimal JSON
	if string(data) != "{}" {
		t.Errorf("expected '{}' for empty state, got '%s'", string(data))
	}
}

func TestStateSaveAndLoad(t *testing.T) {
	// Create a temp directory to use as home
	tmpDir := t.TempDir()
	configDir := filepath.Join(tmpDir, ".config", "cmux")
	if err := os.MkdirAll(configDir, 0700); err != nil {
		t.Fatalf("failed to create config dir: %v", err)
	}

	// Create a test state file directly
	statePath := filepath.Join(configDir, "cmux_devbox_state_prod.json")
	testState := State{
		LastInstanceID: "saved-instance",
		LastTeamSlug:   "saved-team",
	}
	data, _ := json.MarshalIndent(testState, "", "  ")
	if err := os.WriteFile(statePath, data, 0600); err != nil {
		t.Fatalf("failed to write test state: %v", err)
	}

	// Read it back
	readData, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("failed to read state file: %v", err)
	}

	var loaded State
	if err := json.Unmarshal(readData, &loaded); err != nil {
		t.Fatalf("failed to unmarshal loaded state: %v", err)
	}

	if loaded.LastInstanceID != "saved-instance" {
		t.Errorf("expected LastInstanceID 'saved-instance', got '%s'", loaded.LastInstanceID)
	}
	if loaded.LastTeamSlug != "saved-team" {
		t.Errorf("expected LastTeamSlug 'saved-team', got '%s'", loaded.LastTeamSlug)
	}
}

func TestStateFilePermissions(t *testing.T) {
	tmpDir := t.TempDir()
	statePath := filepath.Join(tmpDir, "state.json")

	testState := State{LastInstanceID: "test"}
	data, _ := json.Marshal(testState)

	// Write with restricted permissions (0600)
	if err := os.WriteFile(statePath, data, 0600); err != nil {
		t.Fatalf("failed to write state: %v", err)
	}

	info, err := os.Stat(statePath)
	if err != nil {
		t.Fatalf("failed to stat state file: %v", err)
	}

	// Check file was created with expected permissions
	perm := info.Mode().Perm()
	if perm != 0600 {
		t.Errorf("expected permissions 0600, got %o", perm)
	}
}

func TestStateLoadNonexistent(t *testing.T) {
	tmpDir := t.TempDir()
	statePath := filepath.Join(tmpDir, "nonexistent.json")

	// Reading a nonexistent file should return an error
	_, err := os.ReadFile(statePath)
	if !os.IsNotExist(err) {
		t.Errorf("expected IsNotExist error, got %v", err)
	}
}

func TestStateClearFile(t *testing.T) {
	tmpDir := t.TempDir()
	statePath := filepath.Join(tmpDir, "to-delete.json")

	// Create file
	if err := os.WriteFile(statePath, []byte("{}"), 0600); err != nil {
		t.Fatalf("failed to create file: %v", err)
	}

	// Verify it exists
	if _, err := os.Stat(statePath); os.IsNotExist(err) {
		t.Fatal("file should exist before delete")
	}

	// Delete it
	if err := os.Remove(statePath); err != nil {
		t.Fatalf("failed to delete file: %v", err)
	}

	// Verify it's gone
	if _, err := os.Stat(statePath); !os.IsNotExist(err) {
		t.Error("file should not exist after delete")
	}
}
