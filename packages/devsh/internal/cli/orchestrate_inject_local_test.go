// internal/cli/orchestrate_inject_local_test.go
package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestInitSessionForRun(t *testing.T) {
	tmpDir := t.TempDir()

	// Test Claude agent gets session ID
	err := InitSessionForRun(tmpDir, "claude/opus-4.6", "/workspace")
	if err != nil {
		t.Fatalf("InitSessionForRun failed: %v", err)
	}

	info, err := loadSessionInfo(tmpDir)
	if err != nil {
		t.Fatalf("loadSessionInfo failed: %v", err)
	}

	if info.Agent != "claude/opus-4.6" {
		t.Errorf("Expected agent claude/opus-4.6, got %s", info.Agent)
	}

	if info.SessionID == "" {
		t.Error("Expected non-empty session ID for Claude agent")
	}

	if info.InjectionMode != "active" {
		t.Errorf("Expected injection mode 'active' for Claude, got '%s'", info.InjectionMode)
	}
}

func TestInitSessionForRunCodex(t *testing.T) {
	tmpDir := t.TempDir()

	// Test Codex agent (no pre-generated session ID)
	err := InitSessionForRun(tmpDir, "codex/gpt-5.1-codex-mini", "/workspace")
	if err != nil {
		t.Fatalf("InitSessionForRun failed: %v", err)
	}

	info, err := loadSessionInfo(tmpDir)
	if err != nil {
		t.Fatalf("loadSessionInfo failed: %v", err)
	}

	if info.Agent != "codex/gpt-5.1-codex-mini" {
		t.Errorf("Expected agent codex/gpt-5.1-codex-mini, got %s", info.Agent)
	}

	// Codex uses thread IDs, not session IDs - starts passive
	if info.InjectionMode != "passive" {
		t.Errorf("Expected injection mode 'passive' for Codex without thread ID, got '%s'", info.InjectionMode)
	}
}

func TestDetermineInjectionMode(t *testing.T) {
	tests := []struct {
		name     string
		info     *LocalSessionInfo
		expected string
	}{
		{
			name: "Claude with session ID",
			info: &LocalSessionInfo{
				Agent:     "claude/opus-4.5",
				SessionID: "test-session-id",
			},
			expected: "active",
		},
		{
			name: "Claude without session ID",
			info: &LocalSessionInfo{
				Agent: "claude/haiku-4.5",
			},
			expected: "passive",
		},
		{
			name: "Codex with thread ID",
			info: &LocalSessionInfo{
				Agent:    "codex/gpt-5.4-xhigh",
				ThreadID: "test-thread-id",
			},
			expected: "active",
		},
		{
			name: "Codex without thread ID",
			info: &LocalSessionInfo{
				Agent: "codex/gpt-5.1-codex-mini",
			},
			expected: "passive",
		},
		{
			name: "Unknown agent",
			info: &LocalSessionInfo{
				Agent: "gemini/gemini-2.5-pro",
			},
			expected: "passive",
		},
		{
			name: "Empty info",
			info: &LocalSessionInfo{},
			expected: "passive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := determineInjectionMode(tt.info)
			if got != tt.expected {
				t.Errorf("determineInjectionMode() = %s, want %s", got, tt.expected)
			}
		})
	}
}

func TestInjectPassive(t *testing.T) {
	tmpDir := t.TempDir()

	// Inject first message
	err := injectPassive(tmpDir, "First instruction")
	if err != nil {
		t.Fatalf("injectPassive failed: %v", err)
	}

	// Inject second message
	err = injectPassive(tmpDir, "Second instruction")
	if err != nil {
		t.Fatalf("injectPassive second call failed: %v", err)
	}

	// Read append.txt
	appendPath := filepath.Join(tmpDir, "append.txt")
	data, err := os.ReadFile(appendPath)
	if err != nil {
		t.Fatalf("Failed to read append.txt: %v", err)
	}

	content := string(data)
	if !contains(content, "First instruction") {
		t.Error("Expected 'First instruction' in append.txt")
	}
	if !contains(content, "Second instruction") {
		t.Error("Expected 'Second instruction' in append.txt")
	}
}

func TestUpdateSessionID(t *testing.T) {
	tmpDir := t.TempDir()

	// Init session without ID
	err := InitSessionForRun(tmpDir, "codex/gpt-5.1-codex-mini", "/workspace")
	if err != nil {
		t.Fatalf("InitSessionForRun failed: %v", err)
	}

	// Update with session ID
	err = UpdateSessionID(tmpDir, "new-session-123")
	if err != nil {
		t.Fatalf("UpdateSessionID failed: %v", err)
	}

	info, err := loadSessionInfo(tmpDir)
	if err != nil {
		t.Fatalf("loadSessionInfo failed: %v", err)
	}

	if info.SessionID != "new-session-123" {
		t.Errorf("Expected session ID 'new-session-123', got '%s'", info.SessionID)
	}

	if info.InjectionMode != "active" {
		t.Errorf("Expected injection mode 'active' after updating session ID, got '%s'", info.InjectionMode)
	}
}

func TestUpdateThreadID(t *testing.T) {
	tmpDir := t.TempDir()

	// Init session
	err := InitSessionForRun(tmpDir, "codex/gpt-5.4-xhigh", "/workspace")
	if err != nil {
		t.Fatalf("InitSessionForRun failed: %v", err)
	}

	// Update with thread ID
	err = UpdateThreadID(tmpDir, "thread-abc456")
	if err != nil {
		t.Fatalf("UpdateThreadID failed: %v", err)
	}

	info, err := loadSessionInfo(tmpDir)
	if err != nil {
		t.Fatalf("loadSessionInfo failed: %v", err)
	}

	if info.ThreadID != "thread-abc456" {
		t.Errorf("Expected thread ID 'thread-abc456', got '%s'", info.ThreadID)
	}

	if info.InjectionMode != "active" {
		t.Errorf("Expected injection mode 'active' after updating thread ID, got '%s'", info.InjectionMode)
	}
}

func TestSaveAndLoadSessionInfo(t *testing.T) {
	tmpDir := t.TempDir()

	original := &LocalSessionInfo{
		Agent:           "claude/opus-4.6",
		SessionID:       "test-session-uuid",
		ThreadID:        "",
		Workspace:       "/test/workspace",
		InjectionMode:   "active",
		LastInjectionAt: "2026-03-26T12:00:00Z",
		InjectionCount:  5,
	}

	// Save
	err := saveSessionInfo(tmpDir, original)
	if err != nil {
		t.Fatalf("saveSessionInfo failed: %v", err)
	}

	// Load
	loaded, err := loadSessionInfo(tmpDir)
	if err != nil {
		t.Fatalf("loadSessionInfo failed: %v", err)
	}

	// Verify
	if loaded.Agent != original.Agent {
		t.Errorf("Agent mismatch: got %s, want %s", loaded.Agent, original.Agent)
	}
	if loaded.SessionID != original.SessionID {
		t.Errorf("SessionID mismatch: got %s, want %s", loaded.SessionID, original.SessionID)
	}
	if loaded.InjectionMode != original.InjectionMode {
		t.Errorf("InjectionMode mismatch: got %s, want %s", loaded.InjectionMode, original.InjectionMode)
	}
	if loaded.InjectionCount != original.InjectionCount {
		t.Errorf("InjectionCount mismatch: got %d, want %d", loaded.InjectionCount, original.InjectionCount)
	}
}

func TestLogInjectionEvent(t *testing.T) {
	tmpDir := t.TempDir()

	logInjectionEvent(tmpDir, "active", "Test injection message")

	eventsPath := filepath.Join(tmpDir, "events.jsonl")
	data, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatalf("Failed to read events.jsonl: %v", err)
	}

	var event LocalEvent
	if err := json.Unmarshal(data, &event); err != nil {
		t.Fatalf("Failed to unmarshal event: %v", err)
	}

	if event.Type != "instruction_injected" {
		t.Errorf("Expected event type 'instruction_injected', got '%s'", event.Type)
	}

	if !contains(event.Message, "active") {
		t.Error("Expected event message to contain 'active'")
	}

	if !contains(event.Message, "Test injection message") {
		t.Error("Expected event message to contain 'Test injection message'")
	}
}
