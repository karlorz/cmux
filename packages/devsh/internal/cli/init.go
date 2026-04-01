// internal/cli/init.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/karlorz/devsh/internal/skills"
	"github.com/spf13/cobra"
)

var (
	initFlagUpdate bool
	initFlagList   bool
	initFlagTarget string
	initFlagMCP    bool
)

var initCmd = &cobra.Command{
	Use:   "init [path]",
	Short: "Initialize devsh skills and configuration in a project",
	Long: `Initialize devsh orchestration skills and optional MCP configuration.

This command bootstraps a project with skills that enable Claude Code and other
agents to orchestrate sub-agents via the devsh CLI.

Examples:
  devsh init                           # Install all skills to .claude/skills/
  devsh init ./my-project              # Install skills in specific directory
  devsh init --update                  # Update existing skills
  devsh init --list                    # List available skills
  devsh init --target .cursor/skills   # Custom target directory
  devsh init --mcp                     # Also configure MCP server

Skills installed:
  - devsh-orchestrator   Multi-agent orchestration commands
  - devsh-spawn          Quick task delegation
  - devsh-inject         Send instructions to running agents
  - devsh-team           Multi-agent coordination patterns
  - head-agent-init      Initialize head agent mode
  - execute-plan         Execute saved implementation plans
  - devsh                Core devsh CLI reference`,
	Args: cobra.MaximumNArgs(1),
	RunE: runInit,
}

func init() {
	initCmd.Flags().BoolVar(&initFlagUpdate, "update", false, "Update existing skills instead of skipping")
	initCmd.Flags().BoolVar(&initFlagList, "list", false, "List available skills and exit")
	initCmd.Flags().StringVar(&initFlagTarget, "target", "", "Target directory for skills (default: auto-detect)")
	initCmd.Flags().BoolVar(&initFlagMCP, "mcp", false, "Configure MCP server in settings.json")

	// Keep old flag for backwards compatibility
	initCmd.Flags().BoolP("force", "f", false, "Alias for --update")
	initCmd.Flags().MarkHidden("force")

	rootCmd.AddCommand(initCmd)
}

func runInit(cmd *cobra.Command, args []string) error {
	// Handle --list flag
	if initFlagList {
		return listSkills()
	}

	// Determine base directory
	baseDir := "."
	if len(args) > 0 {
		baseDir = args[0]
	}

	// Resolve to absolute path
	absBase, err := filepath.Abs(baseDir)
	if err != nil {
		return fmt.Errorf("failed to resolve path: %w", err)
	}

	// Check base exists
	info, err := os.Stat(absBase)
	if err != nil {
		return fmt.Errorf("target directory does not exist: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("target is not a directory: %s", absBase)
	}

	// Change to base directory for skill detection
	oldDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get current directory: %w", err)
	}
	if err := os.Chdir(absBase); err != nil {
		return fmt.Errorf("failed to change to target directory: %w", err)
	}
	defer os.Chdir(oldDir)

	// Determine target directory
	targetDir := initFlagTarget
	if targetDir == "" {
		targetDir = skills.DefaultTargetDir()
	}

	// Handle backwards-compatible --force flag
	update := initFlagUpdate
	if forceFlag, _ := cmd.Flags().GetBool("force"); forceFlag {
		update = true
	}

	projectType := skills.DetectProjectType()
	fmt.Printf("Project: %s\n", absBase)
	fmt.Printf("Type: %s\n", projectType)
	fmt.Printf("Skills directory: %s\n", targetDir)
	fmt.Println()

	// Install skills
	result, err := skills.Install(skills.InstallOptions{
		TargetDir: targetDir,
		Update:    update,
	})
	if err != nil {
		return fmt.Errorf("failed to install skills: %w", err)
	}

	fmt.Println(skills.FormatInstallSummary(result))

	if len(result.Errors) > 0 {
		return fmt.Errorf("some skills failed to install")
	}

	// Configure MCP if requested
	if initFlagMCP {
		if err := configureMCP(absBase); err != nil {
			return fmt.Errorf("failed to configure MCP: %w", err)
		}
		fmt.Println("\nMCP configuration added to .claude/settings.json")
	}

	fmt.Println("\nDone! Skills are ready to use.")
	fmt.Println("\nQuick start:")
	fmt.Println("  devsh orchestrate spawn --agent claude/haiku-4.5 --repo owner/repo \"Fix the bug\"")
	fmt.Println("  devsh orchestrate status <task-id> --watch")

	return nil
}

func listSkills() error {
	skillList := skills.List()

	if flagJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(skillList)
	}

	fmt.Println("Available skills:")
	fmt.Println()
	for _, s := range skillList {
		fmt.Printf("  %-20s %s\n", s.Name, s.Description)
	}
	fmt.Println()
	fmt.Println("Install with: devsh init")
	fmt.Println("Update with:  devsh init --update")

	return nil
}

func configureMCP(baseDir string) error {
	settingsDir := filepath.Join(baseDir, ".claude")
	settingsFile := filepath.Join(settingsDir, "settings.json")

	// Ensure directory exists
	if err := os.MkdirAll(settingsDir, 0755); err != nil {
		return fmt.Errorf("failed to create settings directory: %w", err)
	}

	// Read existing settings or create new
	var settings map[string]interface{}
	if data, err := os.ReadFile(settingsFile); err == nil {
		if err := json.Unmarshal(data, &settings); err != nil {
			return fmt.Errorf("failed to parse existing settings: %w", err)
		}
	} else {
		settings = make(map[string]interface{})
	}

	// Add MCP server configuration
	mcpServers, ok := settings["mcpServers"].(map[string]interface{})
	if !ok {
		mcpServers = make(map[string]interface{})
	}

	mcpServers["devsh-memory"] = map[string]interface{}{
		"command": "npx",
		"args":    []string{"-y", "devsh-memory-mcp"},
	}

	settings["mcpServers"] = mcpServers

	// Write updated settings
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal settings: %w", err)
	}

	if err := os.WriteFile(settingsFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write settings: %w", err)
	}

	return nil
}
