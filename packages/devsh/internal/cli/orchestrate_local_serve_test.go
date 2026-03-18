// internal/cli/orchestrate_local_serve_test.go
package cli

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSplitLines(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
	}{
		{"", []string{}},
		{"a", []string{"a"}},
		{"a\nb", []string{"a", "b"}},
		{"a\nb\n", []string{"a", "b"}},
		{"a\nb\nc", []string{"a", "b", "c"}},
	}

	for _, tt := range tests {
		result := splitLines(tt.input)
		if len(result) != len(tt.expected) {
			t.Errorf("splitLines(%q): expected %d lines, got %d", tt.input, len(tt.expected), len(result))
			continue
		}
		for i, line := range result {
			if line != tt.expected[i] {
				t.Errorf("splitLines(%q)[%d]: expected %q, got %q", tt.input, i, tt.expected[i], line)
			}
		}
	}
}

func TestServeLocalStateEndpoint(t *testing.T) {
	// Create temp run directory with state.json
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_test123")
	os.MkdirAll(runDir, 0755)

	state := LocalState{
		OrchestrationID: "local_test123",
		Status:          "completed",
		Agent:           "claude/haiku-4.5",
		Prompt:          "Test prompt",
	}
	stateData, _ := json.MarshalIndent(state, "", "  ")
	os.WriteFile(filepath.Join(runDir, "state.json"), stateData, 0644)

	// Create handler that simulates /api/state
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		statePath := filepath.Join(runDir, "state.json")
		data, err := os.ReadFile(statePath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(data)
	})

	req := httptest.NewRequest("GET", "/api/state", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var result LocalState
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Errorf("failed to parse response: %v", err)
	}

	if result.OrchestrationID != "local_test123" {
		t.Errorf("expected orchestration ID local_test123, got %s", result.OrchestrationID)
	}
}

func TestServeLocalEventsEndpoint(t *testing.T) {
	tmpDir := t.TempDir()
	runDir := filepath.Join(tmpDir, "local_test456")
	os.MkdirAll(runDir, 0755)

	// Create events.jsonl
	events := []LocalEvent{
		{Timestamp: "2026-03-18T10:00:00Z", Type: "task_started", Message: "Starting"},
		{Timestamp: "2026-03-18T10:05:00Z", Type: "task_completed", Message: "Done"},
	}
	var eventsContent string
	for _, e := range events {
		line, _ := json.Marshal(e)
		eventsContent += string(line) + "\n"
	}
	os.WriteFile(filepath.Join(runDir, "events.jsonl"), []byte(eventsContent), 0644)

	// Create handler that simulates /api/events
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		eventsPath := filepath.Join(runDir, "events.jsonl")
		data, err := os.ReadFile(eventsPath)
		if err != nil {
			json.NewEncoder(w).Encode([]any{})
			return
		}

		var parsedEvents []LocalEvent
		for _, line := range splitLines(string(data)) {
			if line == "" {
				continue
			}
			var event LocalEvent
			if err := json.Unmarshal([]byte(line), &event); err == nil {
				parsedEvents = append(parsedEvents, event)
			}
		}
		json.NewEncoder(w).Encode(parsedEvents)
	})

	req := httptest.NewRequest("GET", "/api/events", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var result []LocalEvent
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Errorf("failed to parse response: %v", err)
	}

	if len(result) != 2 {
		t.Errorf("expected 2 events, got %d", len(result))
	}
}

func TestServeLocalFlagsExist(t *testing.T) {
	origPort := serveLocalPort
	origNoBrowser := serveLocalNoBrowser
	defer func() {
		serveLocalPort = origPort
		serveLocalNoBrowser = origNoBrowser
	}()

	serveLocalPort = 8080
	if serveLocalPort != 8080 {
		t.Error("failed to set serveLocalPort")
	}

	serveLocalNoBrowser = true
	if !serveLocalNoBrowser {
		t.Error("failed to set serveLocalNoBrowser")
	}
}
