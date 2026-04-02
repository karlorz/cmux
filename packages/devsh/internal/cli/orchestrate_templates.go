// internal/cli/orchestrate_templates.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/karlorz/devsh/internal/plan"
	"github.com/spf13/cobra"
)

var orchestrateTemplatesCmd = &cobra.Command{
	Use:   "templates",
	Short: "List available orchestration templates",
	Long: `List built-in templates for common orchestration patterns.

Templates can be used with spawn-batch to quickly set up multi-agent workflows
without writing YAML files.

Available templates:
  fan-out   - Process multiple files/tasks in parallel
  pipeline  - Sequential stages with handoffs (design -> implement -> test -> review)
  review    - Implementation with code review gate
  parallel  - Run independent tasks simultaneously

Examples:
  devsh orchestrate templates
  devsh orchestrate spawn-batch --template pipeline --prompt "Add user auth" --repo owner/repo`,
	RunE: runTemplates,
}

func init() {
	orchestrateCmd.AddCommand(orchestrateTemplatesCmd)
}

func runTemplates(cmd *cobra.Command, args []string) error {
	templates := plan.Templates()

	if flagJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(templates)
	}

	fmt.Println("Orchestration Templates")
	fmt.Println("=======================")
	fmt.Println()

	for _, t := range templates {
		fmt.Printf("  %s\n", t.Name)
		fmt.Printf("    %s\n", t.Description)
		fmt.Printf("    Usage: devsh orchestrate spawn-batch %s\n", t.Usage)
		fmt.Printf("    Example: %s\n", t.Example)
		fmt.Println()
	}

	fmt.Println("Use --dry-run to preview the execution plan before spawning.")

	return nil
}
