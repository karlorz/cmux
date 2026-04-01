// Package skills provides skill installation and management.
package skills

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// InstallOptions configures skill installation behavior.
type InstallOptions struct {
	// TargetDir is the directory to install skills into.
	// Defaults to ".claude/skills" if empty.
	TargetDir string

	// Update overwrites existing skills instead of skipping.
	Update bool

	// SkillNames limits installation to specific skills.
	// If empty, all skills are installed.
	SkillNames []string

	// Verbose enables detailed output.
	Verbose bool
}

// InstallResult contains the result of a skill installation.
type InstallResult struct {
	Installed []string
	Skipped   []string
	Updated   []string
	Errors    map[string]error
}

// Install copies embedded skills to the target directory.
func Install(opts InstallOptions) (*InstallResult, error) {
	if opts.TargetDir == "" {
		opts.TargetDir = ".claude/skills"
	}

	// Determine which skills to install
	skillsToInstall := SkillNames
	if len(opts.SkillNames) > 0 {
		skillsToInstall = opts.SkillNames
	}

	// Create target directory
	if err := os.MkdirAll(opts.TargetDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create target directory: %w", err)
	}

	result := &InstallResult{
		Errors: make(map[string]error),
	}

	for _, name := range skillsToInstall {
		skillDir := filepath.Join(opts.TargetDir, name)
		skillFile := filepath.Join(skillDir, "SKILL.md")

		// Check if skill exists in embedded FS
		embeddedPath := fmt.Sprintf("embedded/%s/SKILL.md", name)
		content, err := EmbeddedSkills.ReadFile(embeddedPath)
		if err != nil {
			result.Errors[name] = fmt.Errorf("skill not found: %s", name)
			continue
		}

		// Check if already exists
		exists := false
		if _, err := os.Stat(skillFile); err == nil {
			exists = true
			if !opts.Update {
				result.Skipped = append(result.Skipped, name)
				continue
			}
		}

		// Create skill directory
		if err := os.MkdirAll(skillDir, 0755); err != nil {
			result.Errors[name] = fmt.Errorf("failed to create skill directory: %w", err)
			continue
		}

		// Write skill file
		if err := os.WriteFile(skillFile, content, 0644); err != nil {
			result.Errors[name] = fmt.Errorf("failed to write skill file: %w", err)
			continue
		}

		if exists {
			result.Updated = append(result.Updated, name)
		} else {
			result.Installed = append(result.Installed, name)
		}
	}

	return result, nil
}

// List returns information about available skills.
func List() []SkillInfo {
	var skills []SkillInfo
	for _, name := range SkillNames {
		skills = append(skills, SkillInfo{
			Name:        name,
			Description: SkillDescriptions[name],
		})
	}
	return skills
}

// SkillInfo contains metadata about a skill.
type SkillInfo struct {
	Name        string
	Description string
}

// DetectProjectType detects the project type based on existing directories.
func DetectProjectType() string {
	if _, err := os.Stat(".claude"); err == nil {
		return "claude"
	}
	if _, err := os.Stat(".cursor"); err == nil {
		return "cursor"
	}
	return "generic"
}

// DefaultTargetDir returns the default skill target directory based on project type.
func DefaultTargetDir() string {
	switch DetectProjectType() {
	case "claude":
		return ".claude/skills"
	case "cursor":
		return ".cursor/skills"
	default:
		return ".claude/skills"
	}
}

// FormatInstallSummary formats the installation result for display.
func FormatInstallSummary(result *InstallResult) string {
	var lines []string

	if len(result.Installed) > 0 {
		lines = append(lines, fmt.Sprintf("Installed: %s", strings.Join(result.Installed, ", ")))
	}
	if len(result.Updated) > 0 {
		lines = append(lines, fmt.Sprintf("Updated: %s", strings.Join(result.Updated, ", ")))
	}
	if len(result.Skipped) > 0 {
		lines = append(lines, fmt.Sprintf("Skipped (already exist, use --update to overwrite): %s", strings.Join(result.Skipped, ", ")))
	}
	if len(result.Errors) > 0 {
		var errStrs []string
		for name, err := range result.Errors {
			errStrs = append(errStrs, fmt.Sprintf("%s: %v", name, err))
		}
		lines = append(lines, fmt.Sprintf("Errors: %s", strings.Join(errStrs, "; ")))
	}

	if len(lines) == 0 {
		return "No skills to install"
	}

	return strings.Join(lines, "\n")
}
