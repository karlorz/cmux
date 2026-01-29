// internal/port/devbox.go
package port

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// DevboxConfig represents a devbox.json file
type DevboxConfig struct {
	Schema   string                 `json:"$schema,omitempty"`
	Packages interface{}            `json:"packages,omitempty"`
	Env      map[string]string      `json:"env,omitempty"`
	Shell    map[string]interface{} `json:"shell,omitempty"`
	// Preserve any other fields
	Extra map[string]interface{} `json:"-"`
}

// UpdateDevboxEnv updates a single environment variable in devbox.json
func UpdateDevboxEnv(devboxPath string, name string, value int) error {
	// Read existing file
	data, err := os.ReadFile(devboxPath)
	if err != nil {
		return fmt.Errorf("failed to read devbox.json: %w", err)
	}

	// Parse as generic map to preserve all fields
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse devbox.json: %w", err)
	}

	// Get or create env section
	env, ok := config["env"].(map[string]interface{})
	if !ok {
		env = make(map[string]interface{})
		config["env"] = env
	}

	// Update the port value
	env[name] = strconv.Itoa(value)

	// Write back with proper formatting
	output, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal devbox.json: %w", err)
	}

	// Write with trailing newline
	output = append(output, '\n')

	if err := os.WriteFile(devboxPath, output, 0644); err != nil {
		return fmt.Errorf("failed to write devbox.json: %w", err)
	}

	return nil
}

// UpdateDevboxEnvMultiple updates multiple environment variables in devbox.json
func UpdateDevboxEnvMultiple(devboxPath string, ports map[string]int) error {
	// Read existing file
	data, err := os.ReadFile(devboxPath)
	if err != nil {
		return fmt.Errorf("failed to read devbox.json: %w", err)
	}

	// Parse as generic map to preserve all fields
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse devbox.json: %w", err)
	}

	// Get or create env section
	env, ok := config["env"].(map[string]interface{})
	if !ok {
		env = make(map[string]interface{})
		config["env"] = env
	}

	// Update all port values
	for name, value := range ports {
		env[name] = strconv.Itoa(value)
	}

	// Write back with proper formatting
	output, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal devbox.json: %w", err)
	}

	// Write with trailing newline
	output = append(output, '\n')

	if err := os.WriteFile(devboxPath, output, 0644); err != nil {
		return fmt.Errorf("failed to write devbox.json: %w", err)
	}

	return nil
}

// RemoveDevboxEnv removes an environment variable from devbox.json
func RemoveDevboxEnv(devboxPath string, name string) error {
	// Read existing file
	data, err := os.ReadFile(devboxPath)
	if err != nil {
		return fmt.Errorf("failed to read devbox.json: %w", err)
	}

	// Parse as generic map to preserve all fields
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse devbox.json: %w", err)
	}

	// Get env section
	env, ok := config["env"].(map[string]interface{})
	if !ok {
		// No env section, nothing to remove
		return nil
	}

	// Remove the port
	delete(env, name)

	// Write back with proper formatting
	output, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal devbox.json: %w", err)
	}

	// Write with trailing newline
	output = append(output, '\n')

	if err := os.WriteFile(devboxPath, output, 0644); err != nil {
		return fmt.Errorf("failed to write devbox.json: %w", err)
	}

	return nil
}

// GetDevboxPath returns the path to devbox.json for a workspace path
func GetDevboxPath(workspacePath string) string {
	return filepath.Join(workspacePath, "devbox.json")
}
