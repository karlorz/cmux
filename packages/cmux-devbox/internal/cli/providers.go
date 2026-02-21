// internal/cli/providers.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/cmux-cli/cmux-devbox/internal/credentials"
	"github.com/spf13/cobra"
)

var providersCmd = &cobra.Command{
	Use:   "providers",
	Short: "List AI provider connection status",
	Long: `Show which AI providers are configured and ready to use.

Checks for credentials from:
  - Environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
  - CLI tool configurations (~/.claude.json, ~/.codex/auth.json, etc.)
  - System keychains (macOS)
  - OpenCode CLI (if installed)

Examples:
  cmux providers            # Show provider status
  cmux providers --json     # JSON output`,
	RunE: runProviders,
}

func init() {
	rootCmd.AddCommand(providersCmd)
}

// ProviderOutput represents a provider for JSON output
type ProviderOutput struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	Source    string `json:"source,omitempty"`
	Available bool   `json:"available"`
}

func runProviders(cmd *cobra.Command, args []string) error {
	status := credentials.CheckAllProviders()

	if flagJSON {
		return printProvidersJSON(status)
	}

	return printProvidersTable(status)
}

func printProvidersJSON(status credentials.AllProviderStatus) error {
	var providers []ProviderOutput

	for _, name := range credentials.ProviderOrder {
		ps, ok := status.Providers[name]
		statusStr := "Not configured"
		if ok && ps.Available {
			statusStr = "Connected"
		}
		providers = append(providers, ProviderOutput{
			Name:      name,
			Status:    statusStr,
			Source:    ps.Source,
			Available: ps.Available,
		})
	}

	data, err := json.MarshalIndent(map[string]interface{}{
		"providers": providers,
	}, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}

func printProvidersTable(status credentials.AllProviderStatus) error {
	fmt.Println("AI Providers Status")
	fmt.Println("===================")
	fmt.Println()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "PROVIDER\tSTATUS\tSOURCE")
	fmt.Fprintln(w, "--------\t------\t------")

	for _, name := range credentials.ProviderOrder {
		ps, ok := status.Providers[name]
		statusStr := "Not configured"
		source := "-"
		if ok && ps.Available {
			statusStr = "Connected"
			source = ps.Source
		}
		fmt.Fprintf(w, "%s\t%s\t%s\n", name, statusStr, source)
	}

	w.Flush()
	return nil
}
