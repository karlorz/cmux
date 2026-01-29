// internal/port/devbox_test.go
package port

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestUpdateDevboxEnv(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "devbox-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devboxPath := filepath.Join(tmpDir, "devbox.json")

	// Create initial devbox.json
	initial := map[string]interface{}{
		"$schema":  "https://raw.githubusercontent.com/jetify-com/devbox/main/.schema/devbox.schema.json",
		"packages": []string{"nodejs@20"},
		"env": map[string]interface{}{
			"PORT":     "3000",
			"NODE_ENV": "development",
		},
	}
	data, _ := json.MarshalIndent(initial, "", "  ")
	if err := os.WriteFile(devboxPath, data, 0644); err != nil {
		t.Fatalf("Failed to write devbox.json: %v", err)
	}

	// Update env
	if err := UpdateDevboxEnv(devboxPath, "API_PORT", 3001); err != nil {
		t.Fatalf("UpdateDevboxEnv failed: %v", err)
	}

	// Read back and verify
	data, err = os.ReadFile(devboxPath)
	if err != nil {
		t.Fatalf("Failed to read devbox.json: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to parse devbox.json: %v", err)
	}

	env := result["env"].(map[string]interface{})
	if env["API_PORT"] != "3001" {
		t.Errorf("Expected API_PORT=3001, got %v", env["API_PORT"])
	}
	if env["PORT"] != "3000" {
		t.Errorf("Expected PORT=3000 to be preserved, got %v", env["PORT"])
	}
	if env["NODE_ENV"] != "development" {
		t.Errorf("Expected NODE_ENV=development to be preserved, got %v", env["NODE_ENV"])
	}
}

func TestUpdateDevboxEnvCreatesEnvSection(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "devbox-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devboxPath := filepath.Join(tmpDir, "devbox.json")

	// Create devbox.json without env section
	initial := map[string]interface{}{
		"packages": []string{"nodejs@20"},
	}
	data, _ := json.MarshalIndent(initial, "", "  ")
	if err := os.WriteFile(devboxPath, data, 0644); err != nil {
		t.Fatalf("Failed to write devbox.json: %v", err)
	}

	// Update env
	if err := UpdateDevboxEnv(devboxPath, "PORT", 8080); err != nil {
		t.Fatalf("UpdateDevboxEnv failed: %v", err)
	}

	// Verify env section was created
	data, _ = os.ReadFile(devboxPath)
	var result map[string]interface{}
	json.Unmarshal(data, &result)

	env, ok := result["env"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected env section to be created")
	}
	if env["PORT"] != "8080" {
		t.Errorf("Expected PORT=8080, got %v", env["PORT"])
	}
}

func TestUpdateDevboxEnvMultiple(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "devbox-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devboxPath := filepath.Join(tmpDir, "devbox.json")

	// Create initial devbox.json
	initial := map[string]interface{}{
		"packages": []string{"nodejs@20"},
		"env":      map[string]interface{}{},
	}
	data, _ := json.MarshalIndent(initial, "", "  ")
	os.WriteFile(devboxPath, data, 0644)

	// Update multiple ports
	ports := map[string]int{
		"PORT":      10000,
		"API_PORT":  10001,
		"CODE_PORT": 10080,
	}
	if err := UpdateDevboxEnvMultiple(devboxPath, ports); err != nil {
		t.Fatalf("UpdateDevboxEnvMultiple failed: %v", err)
	}

	// Verify
	data, _ = os.ReadFile(devboxPath)
	var result map[string]interface{}
	json.Unmarshal(data, &result)

	env := result["env"].(map[string]interface{})
	if env["PORT"] != "10000" {
		t.Errorf("Expected PORT=10000, got %v", env["PORT"])
	}
	if env["API_PORT"] != "10001" {
		t.Errorf("Expected API_PORT=10001, got %v", env["API_PORT"])
	}
	if env["CODE_PORT"] != "10080" {
		t.Errorf("Expected CODE_PORT=10080, got %v", env["CODE_PORT"])
	}
}

func TestRemoveDevboxEnv(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "devbox-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devboxPath := filepath.Join(tmpDir, "devbox.json")

	// Create initial devbox.json with ports
	initial := map[string]interface{}{
		"packages": []string{"nodejs@20"},
		"env": map[string]interface{}{
			"PORT":     "10000",
			"API_PORT": "10001",
			"NODE_ENV": "development",
		},
	}
	data, _ := json.MarshalIndent(initial, "", "  ")
	os.WriteFile(devboxPath, data, 0644)

	// Remove API_PORT
	if err := RemoveDevboxEnv(devboxPath, "API_PORT"); err != nil {
		t.Fatalf("RemoveDevboxEnv failed: %v", err)
	}

	// Verify
	data, _ = os.ReadFile(devboxPath)
	var result map[string]interface{}
	json.Unmarshal(data, &result)

	env := result["env"].(map[string]interface{})
	if _, ok := env["API_PORT"]; ok {
		t.Error("API_PORT should have been removed")
	}
	if env["PORT"] != "10000" {
		t.Errorf("PORT should still exist, got %v", env["PORT"])
	}
	if env["NODE_ENV"] != "development" {
		t.Errorf("NODE_ENV should still exist, got %v", env["NODE_ENV"])
	}
}

func TestRemoveDevboxEnvNoEnvSection(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "devbox-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devboxPath := filepath.Join(tmpDir, "devbox.json")

	// Create devbox.json without env section
	initial := map[string]interface{}{
		"packages": []string{"nodejs@20"},
	}
	data, _ := json.MarshalIndent(initial, "", "  ")
	os.WriteFile(devboxPath, data, 0644)

	// Should not error even if env section doesn't exist
	if err := RemoveDevboxEnv(devboxPath, "PORT"); err != nil {
		t.Errorf("RemoveDevboxEnv should not fail on missing env section: %v", err)
	}
}

func TestUpdateDevboxEnvPreservesFormatting(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "devbox-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devboxPath := filepath.Join(tmpDir, "devbox.json")

	// Create initial devbox.json with complex structure
	initial := map[string]interface{}{
		"$schema":  "https://raw.githubusercontent.com/jetify-com/devbox/main/.schema/devbox.schema.json",
		"packages": []string{"nodejs@20", "python@3.11"},
		"env": map[string]interface{}{
			"PORT": "3000",
		},
		"shell": map[string]interface{}{
			"init_hook": []string{"echo 'Hello'"},
			"scripts": map[string]string{
				"dev":  "npm run dev",
				"test": "npm test",
			},
		},
	}
	data, _ := json.MarshalIndent(initial, "", "  ")
	os.WriteFile(devboxPath, data, 0644)

	// Update env
	UpdateDevboxEnv(devboxPath, "API_PORT", 3001)

	// Verify all sections are preserved
	data, _ = os.ReadFile(devboxPath)
	var result map[string]interface{}
	json.Unmarshal(data, &result)

	if result["$schema"] == nil {
		t.Error("$schema should be preserved")
	}
	packages := result["packages"].([]interface{})
	if len(packages) != 2 {
		t.Errorf("Expected 2 packages, got %d", len(packages))
	}
	shell := result["shell"].(map[string]interface{})
	if shell["init_hook"] == nil {
		t.Error("shell.init_hook should be preserved")
	}
}

func TestUpdateDevboxEnvFileNotExist(t *testing.T) {
	err := UpdateDevboxEnv("/nonexistent/path/devbox.json", "PORT", 3000)
	if err == nil {
		t.Error("Expected error for non-existent file")
	}
}

func TestUpdateDevboxEnvInvalidJSON(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "devbox-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devboxPath := filepath.Join(tmpDir, "devbox.json")

	// Write invalid JSON
	os.WriteFile(devboxPath, []byte("not valid json"), 0644)

	err = UpdateDevboxEnv(devboxPath, "PORT", 3000)
	if err == nil {
		t.Error("Expected error for invalid JSON")
	}
}

func TestGetDevboxPath(t *testing.T) {
	path := GetDevboxPath("/home/user/workspace")
	expected := "/home/user/workspace/devbox.json"
	if path != expected {
		t.Errorf("Expected %s, got %s", expected, path)
	}
}
