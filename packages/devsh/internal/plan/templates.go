// Package plan provides batch specification parsing and templates.
package plan

import (
	"fmt"
	"strings"

	"github.com/karlorz/devsh/internal/models"
)

// TemplateName identifies a built-in orchestration template.
type TemplateName string

const (
	TemplateFanOut   TemplateName = "fan-out"
	TemplatePipeline TemplateName = "pipeline"
	TemplateReview   TemplateName = "review"
	TemplateParallel TemplateName = "parallel"
)

// TemplateInfo describes a template.
type TemplateInfo struct {
	Name        TemplateName
	Description string
	Usage       string
	Example     string
}

// Templates returns information about all available templates.
func Templates() []TemplateInfo {
	return []TemplateInfo{
		{
			Name:        TemplateFanOut,
			Description: "Spawn multiple agents for the same task type, then aggregate",
			Usage:       "--template fan-out --files file1.ts,file2.ts,file3.ts",
			Example:     "Fix bugs in multiple files in parallel",
		},
		{
			Name:        TemplatePipeline,
			Description: "Sequential stages: design -> implement -> test -> review",
			Usage:       "--template pipeline --prompt 'Add user auth'",
			Example:     "End-to-end feature implementation with handoffs",
		},
		{
			Name:        TemplateReview,
			Description: "One agent implements, another reviews",
			Usage:       "--template review --prompt 'Refactor auth module'",
			Example:     "Implementation with code review gate",
		},
		{
			Name:        TemplateParallel,
			Description: "Run independent tasks in parallel",
			Usage:       "--template parallel --prompts 'Task A,Task B,Task C'",
			Example:     "Multiple independent improvements",
		},
	}
}

// TemplateParams contains parameters for generating a batch spec from a template.
type TemplateParams struct {
	Template TemplateName
	Prompt   string   // Primary prompt (for pipeline, review)
	Prompts  []string // Multiple prompts (for parallel, fan-out)
	Files    []string // Files to operate on (for fan-out)
	Repo     string
	Branch   string
	Agent    string // Override default agent
}

// GenerateFromTemplate creates a BatchSpec from a template and parameters.
func GenerateFromTemplate(params TemplateParams) (*BatchSpec, error) {
	switch params.Template {
	case TemplateFanOut:
		return generateFanOut(params)
	case TemplatePipeline:
		return generatePipeline(params)
	case TemplateReview:
		return generateReview(params)
	case TemplateParallel:
		return generateParallel(params)
	default:
		return nil, fmt.Errorf("unknown template: %s", params.Template)
	}
}

func generateFanOut(params TemplateParams) (*BatchSpec, error) {
	if len(params.Files) == 0 && len(params.Prompts) == 0 {
		return nil, fmt.Errorf("fan-out template requires --files or --prompts")
	}

	agent := params.Agent
	if agent == "" {
		agent = "claude/haiku-4.5"
	}

	spec := &BatchSpec{
		Defaults: BatchDefaults{
			Repo:   params.Repo,
			Branch: params.Branch,
			Agent:  agent,
		},
	}

	// Generate tasks for each file or prompt
	items := params.Files
	if len(items) == 0 {
		items = params.Prompts
	}

	for i, item := range items {
		prompt := params.Prompt
		if prompt == "" {
			prompt = "Process"
		}

		// If it's a file, include in prompt
		taskPrompt := prompt
		if len(params.Files) > 0 {
			taskPrompt = fmt.Sprintf("%s: %s", prompt, item)
		} else {
			taskPrompt = item
		}

		spec.Tasks = append(spec.Tasks, BatchTask{
			ID:     fmt.Sprintf("task-%d", i+1),
			Prompt: taskPrompt,
			Agent:  agent,
			Repo:   params.Repo,
			Branch: params.Branch,
		})
	}

	return spec, nil
}

func generatePipeline(params TemplateParams) (*BatchSpec, error) {
	if params.Prompt == "" {
		return nil, fmt.Errorf("pipeline template requires --prompt")
	}

	spec := &BatchSpec{
		Defaults: BatchDefaults{
			Repo:   params.Repo,
			Branch: params.Branch,
		},
	}

	// Stage 1: Design
	spec.Tasks = append(spec.Tasks, BatchTask{
		ID:     "design",
		Prompt: fmt.Sprintf("Design the implementation approach for: %s\n\nOutput a clear plan with:\n1. Files to create/modify\n2. Key interfaces and types\n3. Implementation steps", params.Prompt),
		Agent:  agentOrDefault(params.Agent, models.RecommendedClaudeAgent),
		Repo:   params.Repo,
		Branch: params.Branch,
	})

	// Stage 2: Implement
	spec.Tasks = append(spec.Tasks, BatchTask{
		ID:        "implement",
		Prompt:    fmt.Sprintf("Implement: %s\n\nFollow the design from the previous stage. Write clean, tested code.", params.Prompt),
		Agent:     agentOrDefault(params.Agent, "codex/gpt-5.4-xhigh"),
		DependsOn: []string{"design"},
		Repo:      params.Repo,
		Branch:    params.Branch,
	})

	// Stage 3: Test
	spec.Tasks = append(spec.Tasks, BatchTask{
		ID:        "test",
		Prompt:    fmt.Sprintf("Write comprehensive tests for the implementation of: %s\n\nInclude unit tests, edge cases, and integration tests where appropriate.", params.Prompt),
		Agent:     agentOrDefault(params.Agent, "codex/gpt-5.1-codex-mini"),
		DependsOn: []string{"implement"},
		Repo:      params.Repo,
		Branch:    params.Branch,
	})

	// Stage 4: Review
	spec.Tasks = append(spec.Tasks, BatchTask{
		ID:        "review",
		Prompt:    fmt.Sprintf("Review the implementation and tests for: %s\n\nCheck for:\n1. Code quality and best practices\n2. Test coverage\n3. Security issues\n4. Performance concerns\n\nFix any issues found.", params.Prompt),
		Agent:     agentOrDefault(params.Agent, models.RecommendedClaudeAgent),
		DependsOn: []string{"test"},
		Repo:      params.Repo,
		Branch:    params.Branch,
	})

	return spec, nil
}

func generateReview(params TemplateParams) (*BatchSpec, error) {
	if params.Prompt == "" {
		return nil, fmt.Errorf("review template requires --prompt")
	}

	spec := &BatchSpec{
		Defaults: BatchDefaults{
			Repo:   params.Repo,
			Branch: params.Branch,
		},
	}

	// Stage 1: Implement
	spec.Tasks = append(spec.Tasks, BatchTask{
		ID:     "implement",
		Prompt: params.Prompt,
		Agent:  agentOrDefault(params.Agent, "codex/gpt-5.4-xhigh"),
		Repo:   params.Repo,
		Branch: params.Branch,
	})

	// Stage 2: Review
	spec.Tasks = append(spec.Tasks, BatchTask{
		ID:        "review",
		Prompt:    fmt.Sprintf("Review the changes made for: %s\n\nProvide feedback on:\n1. Code quality\n2. Potential bugs\n3. Test coverage\n4. Documentation\n\nFix any issues you find.", params.Prompt),
		Agent:     agentOrDefault(params.Agent, models.RecommendedClaudeAgent),
		DependsOn: []string{"implement"},
		Repo:      params.Repo,
		Branch:    params.Branch,
	})

	return spec, nil
}

func generateParallel(params TemplateParams) (*BatchSpec, error) {
	if len(params.Prompts) == 0 {
		return nil, fmt.Errorf("parallel template requires --prompts")
	}

	agent := params.Agent
	if agent == "" {
		agent = "claude/haiku-4.5"
	}

	spec := &BatchSpec{
		Defaults: BatchDefaults{
			Repo:   params.Repo,
			Branch: params.Branch,
			Agent:  agent,
		},
	}

	for i, prompt := range params.Prompts {
		spec.Tasks = append(spec.Tasks, BatchTask{
			ID:     fmt.Sprintf("task-%d", i+1),
			Prompt: strings.TrimSpace(prompt),
			Agent:  agent,
			Repo:   params.Repo,
			Branch: params.Branch,
		})
	}

	return spec, nil
}

func agentOrDefault(agent, defaultAgent string) string {
	if agent != "" {
		return agent
	}
	return defaultAgent
}

// ValidateTemplateName checks if a template name is valid.
func ValidateTemplateName(name string) (TemplateName, error) {
	switch TemplateName(name) {
	case TemplateFanOut, TemplatePipeline, TemplateReview, TemplateParallel:
		return TemplateName(name), nil
	default:
		valid := []string{string(TemplateFanOut), string(TemplatePipeline), string(TemplateReview), string(TemplateParallel)}
		return "", fmt.Errorf("unknown template %q (valid: %s)", name, strings.Join(valid, ", "))
	}
}
