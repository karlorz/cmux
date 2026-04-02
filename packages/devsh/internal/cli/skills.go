// internal/cli/skills.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/karlorz/devsh/internal/skills"
	"github.com/spf13/cobra"
)

var skillsCmd = &cobra.Command{
	Use:   "skills",
	Short: "Manage devsh orchestration skills",
	Long: `Manage devsh orchestration skills for Claude Code and other agents.

Skills are markdown files that teach agents how to use devsh CLI commands
for orchestration, spawning sub-agents, and coordination.

Examples:
  devsh skills list                    # List all available and installed skills
  devsh skills add devsh-orchestrator  # Add a specific skill
  devsh skills remove devsh-spawn      # Remove an installed skill
  devsh skills show devsh-team         # Show skill details`,
}

var skillsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available and installed skills",
	Long: `List all available skills (embedded in devsh) and their installation status.

Shows which skills are installed in the current project and which are available
to add.`,
	RunE: runSkillsList,
}

var skillsAddCmd = &cobra.Command{
	Use:   "add <skill-name>",
	Short: "Add a skill to the project",
	Long: `Add an embedded skill to the current project's skills directory.

The skill will be installed to .claude/skills/ (or .cursor/skills/ if detected).
Use --target to specify a different directory.

Examples:
  devsh skills add devsh-orchestrator
  devsh skills add devsh-spawn devsh-team    # Add multiple skills
  devsh skills add --all                     # Add all available skills`,
	Args: cobra.MinimumNArgs(0),
	RunE: runSkillsAdd,
}

var skillsRemoveCmd = &cobra.Command{
	Use:   "remove <skill-name>",
	Short: "Remove an installed skill",
	Long: `Remove an installed skill from the project's skills directory.

This deletes the skill directory and its contents.

Examples:
  devsh skills remove devsh-spawn
  devsh skills remove devsh-spawn devsh-team  # Remove multiple skills`,
	Args: cobra.MinimumNArgs(1),
	RunE: runSkillsRemove,
}

var skillsShowCmd = &cobra.Command{
	Use:   "show <skill-name>",
	Short: "Show skill details",
	Long: `Display the full content of a skill, either from the embedded bundle
or from an installed location.

Examples:
  devsh skills show devsh-orchestrator
  devsh skills show devsh-team --installed    # Show installed version`,
	Args: cobra.ExactArgs(1),
	RunE: runSkillsShow,
}

var (
	skillsTargetDir   string
	skillsAddAll      bool
	skillsShowInstall bool
)

func init() {
	// List command flags
	skillsListCmd.Flags().StringVar(&skillsTargetDir, "target", "", "Skills directory (default: auto-detect)")

	// Add command flags
	skillsAddCmd.Flags().StringVar(&skillsTargetDir, "target", "", "Skills directory (default: auto-detect)")
	skillsAddCmd.Flags().BoolVar(&skillsAddAll, "all", false, "Add all available skills")

	// Remove command flags
	skillsRemoveCmd.Flags().StringVar(&skillsTargetDir, "target", "", "Skills directory (default: auto-detect)")

	// Show command flags
	skillsShowCmd.Flags().BoolVar(&skillsShowInstall, "installed", false, "Show installed version instead of embedded")

	// Register subcommands
	skillsCmd.AddCommand(skillsListCmd)
	skillsCmd.AddCommand(skillsAddCmd)
	skillsCmd.AddCommand(skillsRemoveCmd)
	skillsCmd.AddCommand(skillsShowCmd)

	rootCmd.AddCommand(skillsCmd)
}

// SkillStatus represents the status of a skill.
type SkillStatus struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Available   bool   `json:"available"`
	Installed   bool   `json:"installed"`
	Path        string `json:"path,omitempty"`
}

func runSkillsList(cmd *cobra.Command, args []string) error {
	targetDir := skillsTargetDir
	if targetDir == "" {
		targetDir = skills.DefaultTargetDir()
	}

	// Get available skills
	available := skills.List()

	// Check installation status
	statuses := make([]SkillStatus, 0, len(available))
	for _, skill := range available {
		status := SkillStatus{
			Name:        skill.Name,
			Description: skill.Description,
			Available:   true,
		}

		// Check if installed
		skillPath := filepath.Join(targetDir, skill.Name, "SKILL.md")
		if _, err := os.Stat(skillPath); err == nil {
			status.Installed = true
			status.Path = skillPath
		}

		statuses = append(statuses, status)
	}

	// Sort by name
	sort.Slice(statuses, func(i, j int) bool {
		return statuses[i].Name < statuses[j].Name
	})

	if flagJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(statuses)
	}

	// Count installed
	installedCount := 0
	for _, s := range statuses {
		if s.Installed {
			installedCount++
		}
	}

	fmt.Printf("Skills (%d/%d installed)\n", installedCount, len(statuses))
	fmt.Printf("Directory: %s\n\n", targetDir)

	for _, s := range statuses {
		marker := "[ ]"
		if s.Installed {
			marker = "[x]"
		}
		fmt.Printf("  %s %-20s %s\n", marker, s.Name, s.Description)
	}

	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  devsh skills add <name>     Add a skill")
	fmt.Println("  devsh skills add --all      Add all skills")
	fmt.Println("  devsh skills remove <name>  Remove a skill")
	fmt.Println("  devsh skills show <name>    Show skill content")

	return nil
}

func runSkillsAdd(cmd *cobra.Command, args []string) error {
	targetDir := skillsTargetDir
	if targetDir == "" {
		targetDir = skills.DefaultTargetDir()
	}

	// Determine which skills to add
	var skillNames []string
	if skillsAddAll {
		skillNames = skills.SkillNames
	} else {
		if len(args) == 0 {
			return fmt.Errorf("specify skill names or use --all")
		}
		skillNames = args
	}

	// Validate skill names
	availableSet := make(map[string]bool)
	for _, name := range skills.SkillNames {
		availableSet[name] = true
	}
	for _, name := range skillNames {
		if !availableSet[name] {
			return fmt.Errorf("unknown skill: %s (use 'devsh skills list' to see available)", name)
		}
	}

	// Install skills
	result, err := skills.Install(skills.InstallOptions{
		TargetDir:  targetDir,
		Update:     false,
		SkillNames: skillNames,
	})
	if err != nil {
		return err
	}

	if flagJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(result)
	}

	if len(result.Installed) > 0 {
		fmt.Printf("Added: %s\n", strings.Join(result.Installed, ", "))
	}
	if len(result.Skipped) > 0 {
		fmt.Printf("Already installed: %s\n", strings.Join(result.Skipped, ", "))
	}
	if len(result.Errors) > 0 {
		for name, err := range result.Errors {
			fmt.Printf("Error: %s: %v\n", name, err)
		}
		return fmt.Errorf("some skills failed to add")
	}

	return nil
}

func runSkillsRemove(cmd *cobra.Command, args []string) error {
	targetDir := skillsTargetDir
	if targetDir == "" {
		targetDir = skills.DefaultTargetDir()
	}

	var removed []string
	var notFound []string
	var errors []string

	for _, name := range args {
		skillDir := filepath.Join(targetDir, name)

		// Check if exists
		if _, err := os.Stat(skillDir); os.IsNotExist(err) {
			notFound = append(notFound, name)
			continue
		}

		// Remove the directory
		if err := os.RemoveAll(skillDir); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", name, err))
			continue
		}

		removed = append(removed, name)
	}

	if flagJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(map[string]interface{}{
			"removed":  removed,
			"notFound": notFound,
			"errors":   errors,
		})
	}

	if len(removed) > 0 {
		fmt.Printf("Removed: %s\n", strings.Join(removed, ", "))
	}
	if len(notFound) > 0 {
		fmt.Printf("Not found: %s\n", strings.Join(notFound, ", "))
	}
	if len(errors) > 0 {
		for _, e := range errors {
			fmt.Printf("Error: %s\n", e)
		}
		return fmt.Errorf("some skills failed to remove")
	}

	return nil
}

func runSkillsShow(cmd *cobra.Command, args []string) error {
	name := args[0]
	targetDir := skillsTargetDir
	if targetDir == "" {
		targetDir = skills.DefaultTargetDir()
	}

	var content []byte
	var source string

	if skillsShowInstall {
		// Read from installed location
		skillPath := filepath.Join(targetDir, name, "SKILL.md")
		var err error
		content, err = os.ReadFile(skillPath)
		if err != nil {
			return fmt.Errorf("skill not installed: %s (use 'devsh skills add %s' to install)", name, name)
		}
		source = skillPath
	} else {
		// Read from embedded
		embeddedPath := fmt.Sprintf("embedded/%s/SKILL.md", name)
		var err error
		content, err = skills.EmbeddedSkills.ReadFile(embeddedPath)
		if err != nil {
			return fmt.Errorf("unknown skill: %s (use 'devsh skills list' to see available)", name)
		}
		source = "embedded"
	}

	if flagJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(map[string]interface{}{
			"name":    name,
			"source":  source,
			"content": string(content),
		})
	}

	fmt.Printf("# %s (source: %s)\n\n", name, source)
	fmt.Println(string(content))

	return nil
}
