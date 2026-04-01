// internal/cli/init.go
package cli

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

//go:embed skills/*
var embeddedSkills embed.FS

var initForce bool

var initCmd = &cobra.Command{
	Use:   "init [path]",
	Short: "Initialize devsh skills and configs in a project",
	Long: `Initialize a project with devsh skills for Claude Code and Codex CLI integration.

This scaffolds:
  .claude/skills/devsh-orchestrator/  - Multi-agent orchestration skill

If skills already exist, use --force to overwrite them.

Examples:
  devsh init                    # Initialize current directory
  devsh init ./my-project       # Initialize specific directory
  devsh init --force            # Overwrite existing skills`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		targetDir := "."
		if len(args) > 0 {
			targetDir = args[0]
		}

		// Resolve to absolute path
		absTarget, err := filepath.Abs(targetDir)
		if err != nil {
			return fmt.Errorf("failed to resolve path: %w", err)
		}

		// Check target exists
		info, err := os.Stat(absTarget)
		if err != nil {
			return fmt.Errorf("target directory does not exist: %w", err)
		}
		if !info.IsDir() {
			return fmt.Errorf("target is not a directory: %s", absTarget)
		}

		// Create .claude/skills directory
		skillsDir := filepath.Join(absTarget, ".claude", "skills")
		if err := os.MkdirAll(skillsDir, 0755); err != nil {
			return fmt.Errorf("failed to create skills directory: %w", err)
		}

		// Copy embedded skills
		skillsCreated := 0
		entries, err := embeddedSkills.ReadDir("skills")
		if err != nil {
			return fmt.Errorf("failed to read embedded skills: %w", err)
		}

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}

			skillName := entry.Name()
			skillTargetDir := filepath.Join(skillsDir, skillName)

			// Check if skill already exists
			if _, err := os.Stat(skillTargetDir); err == nil {
				if !initForce {
					fmt.Printf("  Skipping %s (already exists, use --force to overwrite)\n", skillName)
					continue
				}
				// Remove existing skill dir for overwrite
				if err := os.RemoveAll(skillTargetDir); err != nil {
					return fmt.Errorf("failed to remove existing skill %s: %w", skillName, err)
				}
			}

			// Create skill directory
			if err := os.MkdirAll(skillTargetDir, 0755); err != nil {
				return fmt.Errorf("failed to create skill directory %s: %w", skillName, err)
			}

			// Copy skill files
			skillEntries, err := embeddedSkills.ReadDir(filepath.Join("skills", skillName))
			if err != nil {
				return fmt.Errorf("failed to read skill %s: %w", skillName, err)
			}

			for _, fileEntry := range skillEntries {
				if fileEntry.IsDir() {
					continue // Skip subdirectories for now
				}

				srcPath := filepath.Join("skills", skillName, fileEntry.Name())
				dstPath := filepath.Join(skillTargetDir, fileEntry.Name())

				content, err := embeddedSkills.ReadFile(srcPath)
				if err != nil {
					return fmt.Errorf("failed to read %s: %w", srcPath, err)
				}

				if err := os.WriteFile(dstPath, content, 0644); err != nil {
					return fmt.Errorf("failed to write %s: %w", dstPath, err)
				}
			}

			fmt.Printf("  Created %s\n", skillName)
			skillsCreated++
		}

		if skillsCreated == 0 {
			fmt.Println("No skills created (all already exist).")
		} else {
			fmt.Printf("\nInitialized %d skill(s) in %s\n", skillsCreated, skillsDir)
			fmt.Println("\nYou can now use these skills in Claude Code with /devsh-orchestrator")
		}

		return nil
	},
}

func init() {
	initCmd.Flags().BoolVarP(&initForce, "force", "f", false, "Overwrite existing skills")
	rootCmd.AddCommand(initCmd)
}
