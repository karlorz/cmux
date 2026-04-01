// Package plan provides plan parsing and batch task management.
package plan

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"gopkg.in/yaml.v3"
)

// BatchTask represents a single task in a batch spawn request.
type BatchTask struct {
	ID        string   `json:"id" yaml:"id"`
	Prompt    string   `json:"prompt" yaml:"prompt"`
	Agent     string   `json:"agent" yaml:"agent"`
	DependsOn []string `json:"depends_on,omitempty" yaml:"depends_on,omitempty"`
	Priority  int      `json:"priority,omitempty" yaml:"priority,omitempty"`
	Repo      string   `json:"repo,omitempty" yaml:"repo,omitempty"`
	Branch    string   `json:"branch,omitempty" yaml:"branch,omitempty"`
}

// BatchDefaults contains default values applied to all tasks.
type BatchDefaults struct {
	Repo   string `json:"repo,omitempty" yaml:"repo,omitempty"`
	Branch string `json:"branch,omitempty" yaml:"branch,omitempty"`
	Agent  string `json:"agent,omitempty" yaml:"agent,omitempty"`
}

// BatchSpec represents a complete batch spawn specification.
type BatchSpec struct {
	Tasks    []BatchTask   `json:"tasks" yaml:"tasks"`
	Defaults BatchDefaults `json:"defaults,omitempty" yaml:"defaults,omitempty"`
}

// ParseBatchFile parses a YAML or JSON batch file.
func ParseBatchFile(path string) (*BatchSpec, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	return ParseBatch(data)
}

// ParseBatch parses batch data from YAML or JSON bytes.
func ParseBatch(data []byte) (*BatchSpec, error) {
	var spec BatchSpec

	// Try YAML first (also handles JSON)
	if err := yaml.Unmarshal(data, &spec); err != nil {
		// Try explicit JSON
		if jsonErr := json.Unmarshal(data, &spec); jsonErr != nil {
			return nil, fmt.Errorf("failed to parse as YAML or JSON: %w", err)
		}
	}

	if len(spec.Tasks) == 0 {
		return nil, fmt.Errorf("no tasks defined in batch spec")
	}

	// Apply defaults
	for i := range spec.Tasks {
		task := &spec.Tasks[i]
		if task.Agent == "" && spec.Defaults.Agent != "" {
			task.Agent = spec.Defaults.Agent
		}
		if task.Repo == "" && spec.Defaults.Repo != "" {
			task.Repo = spec.Defaults.Repo
		}
		if task.Branch == "" && spec.Defaults.Branch != "" {
			task.Branch = spec.Defaults.Branch
		}
	}

	// Validate tasks
	ids := make(map[string]bool)
	for _, task := range spec.Tasks {
		if task.ID == "" {
			return nil, fmt.Errorf("task missing required 'id' field")
		}
		if ids[task.ID] {
			return nil, fmt.Errorf("duplicate task ID: %s", task.ID)
		}
		ids[task.ID] = true

		if task.Prompt == "" {
			return nil, fmt.Errorf("task %s missing required 'prompt' field", task.ID)
		}
		if task.Agent == "" {
			return nil, fmt.Errorf("task %s missing required 'agent' field (set in task or defaults)", task.ID)
		}
	}

	// Validate dependencies
	for _, task := range spec.Tasks {
		for _, dep := range task.DependsOn {
			if !ids[dep] {
				return nil, fmt.Errorf("task %s depends on unknown task: %s", task.ID, dep)
			}
		}
	}

	return &spec, nil
}

// TopologicalBatches returns tasks grouped into parallel execution batches.
// Each batch contains tasks that can run in parallel (all dependencies satisfied).
// Returns an error if the dependency graph contains a cycle.
func TopologicalBatches(tasks []BatchTask) ([][]BatchTask, error) {
	// Build task index
	taskMap := make(map[string]*BatchTask)
	for i := range tasks {
		taskMap[tasks[i].ID] = &tasks[i]
	}

	// Build dependency graph
	inDegree := make(map[string]int)
	dependents := make(map[string][]string)

	for _, task := range tasks {
		if _, exists := inDegree[task.ID]; !exists {
			inDegree[task.ID] = 0
		}
		for _, dep := range task.DependsOn {
			inDegree[task.ID]++
			dependents[dep] = append(dependents[dep], task.ID)
		}
	}

	var batches [][]BatchTask
	remaining := len(tasks)

	for remaining > 0 {
		// Find all tasks with zero in-degree
		var batch []BatchTask
		var batchIDs []string

		for _, task := range tasks {
			if inDegree[task.ID] == 0 {
				batch = append(batch, task)
				batchIDs = append(batchIDs, task.ID)
			}
		}

		if len(batch) == 0 {
			// Cycle detected
			return nil, fmt.Errorf("circular dependency detected in task graph")
		}

		// Sort batch by priority (lower = higher priority) then ID for determinism
		sort.Slice(batch, func(i, j int) bool {
			if batch[i].Priority != batch[j].Priority {
				return batch[i].Priority < batch[j].Priority
			}
			return batch[i].ID < batch[j].ID
		})

		batches = append(batches, batch)
		remaining -= len(batch)

		// Remove processed tasks and update degrees
		for _, id := range batchIDs {
			inDegree[id] = -1 // Mark as processed
			for _, depID := range dependents[id] {
				if inDegree[depID] > 0 {
					inDegree[depID]--
				}
			}
		}
	}

	return batches, nil
}

// ValidateBatch checks a batch spec for errors without executing.
func ValidateBatch(spec *BatchSpec) error {
	_, err := TopologicalBatches(spec.Tasks)
	return err
}
