// internal/cli/providers.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/karlorz/devsh/internal/credentials"
	"github.com/spf13/cobra"
)

var providersLocal bool

var providersCmd = &cobra.Command{
	Use:   "providers",
	Short: "List AI provider connection status",
	Long: `Show which AI providers are configured and ready to use.

By default, checks server-side credentials (API keys stored in devsh settings).
Use --local to check local credentials instead (env vars, config files, keychains).

Examples:
  devsh providers            # Show server-side provider status
  devsh providers --local    # Show local credential status
  devsh providers --json     # JSON output`,
	RunE: runProviders,
}

func init() {
	providersCmd.Flags().BoolVar(&providersLocal, "local", false, "Check local credentials instead of server-side")
	rootCmd.AddCommand(providersCmd)
}

// ProviderOutput represents a provider for JSON output
type ProviderOutput struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Status       string   `json:"status"`
	Source       string   `json:"source,omitempty"`
	Available    bool     `json:"available"`
	DefaultModel string   `json:"defaultModel,omitempty"`
	Agents       []string `json:"agents,omitempty"`
}

func runProviders(cmd *cobra.Command, args []string) error {
	if providersLocal {
		// Local credential checks (existing behavior)
		status := credentials.CheckAllProviders()
		if flagJSON {
			return printLocalProvidersJSON(status)
		}
		return printLocalProvidersTable(status)
	}

	// Default: server-side checks from control plane
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	controlPlane, err := fetchControlPlaneProviders(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: could not fetch server provider status (%v), falling back to local checks\n", err)
		status := credentials.CheckAllProviders()
		if flagJSON {
			return printLocalProvidersJSON(status)
		}
		return printLocalProvidersTable(status)
	}

	if flagJSON {
		return printControlPlaneProvidersJSON(controlPlane)
	}
	return printControlPlaneProvidersTable(controlPlane)
}

// --- Control Plane display functions ---

func printControlPlaneProvidersTable(resp *ControlPlaneProvidersResponse) error {
	fmt.Println("AI Providers Status (Remote)")
	fmt.Println("============================")
	fmt.Println()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "PROVIDER\tSTATUS\tSOURCE\tDEFAULT MODEL")
	fmt.Fprintln(w, "--------\t------\t------\t-------------")

	for _, p := range resp.Providers {
		statusStr := "Not configured"
		source := "-"
		if p.ConnectionState.IsConnected {
			statusStr = "Connected"
			if p.ConnectionState.Source != nil {
				source = formatConnectionSource(*p.ConnectionState.Source)
			}
		}

		defaultModel := "-"
		if p.DefaultModel != nil {
			defaultModel = p.DefaultModel.Name
		}

		fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", p.Name, statusStr, source, defaultModel)
	}

	w.Flush()
	return nil
}

func printControlPlaneProvidersJSON(resp *ControlPlaneProvidersResponse) error {
	var providers []ProviderOutput

	for _, p := range resp.Providers {
		statusStr := "Not configured"
		source := ""
		if p.ConnectionState.IsConnected {
			statusStr = "Connected"
			if p.ConnectionState.Source != nil {
				source = *p.ConnectionState.Source
			}
		}

		defaultModel := ""
		if p.DefaultModel != nil {
			defaultModel = p.DefaultModel.Name
		}

		providers = append(providers, ProviderOutput{
			ID:           p.ID,
			Name:         p.Name,
			Status:       statusStr,
			Source:       source,
			Available:    p.ConnectionState.IsConnected,
			DefaultModel: defaultModel,
		})
	}

	data, err := json.MarshalIndent(map[string]interface{}{
		"source":      "control-plane",
		"providers":   providers,
		"generatedAt": resp.GeneratedAt,
	}, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}

// formatConnectionSource converts the source enum to a human-readable string
func formatConnectionSource(source string) string {
	switch source {
	case "stored_api_key":
		return "API Key"
	case "stored_oauth_token":
		return "OAuth"
	case "stored_json_blob":
		return "Auth JSON"
	case "env":
		return "Env Var"
	case "override":
		return "Override"
	case "free":
		return "Free Tier"
	default:
		return source
	}
}

// --- Legacy server display functions (used by backwards compat path) ---

func printServerProvidersTable(status *ServerProvidersResponse) error {
	fmt.Println("AI Providers Status (Remote)")
	fmt.Println("============================")
	fmt.Println()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "PROVIDER\tSTATUS\tAGENTS")
	fmt.Fprintln(w, "--------\t------\t------")

	for _, p := range status.Providers {
		statusStr := "Not configured"
		if p.IsAvailable {
			statusStr = "Connected"
		}

		// Collect agent names
		var agentNames []string
		for _, a := range p.Agents {
			agentNames = append(agentNames, a.Name)
		}
		agentSummary := "-"
		if len(agentNames) > 0 {
			if len(agentNames) <= 3 {
				agentSummary = strings.Join(agentNames, ", ")
			} else {
				agentSummary = fmt.Sprintf("%s, ... (%d total)", strings.Join(agentNames[:3], ", "), len(agentNames))
			}
		}

		fmt.Fprintf(w, "%s\t%s\t%s\n", p.Name, statusStr, agentSummary)
	}

	w.Flush()
	return nil
}

func printServerProvidersJSON(status *ServerProvidersResponse) error {
	var providers []ProviderOutput

	for _, p := range status.Providers {
		statusStr := "Not configured"
		if p.IsAvailable {
			statusStr = "Connected"
		}

		var agentNames []string
		for _, a := range p.Agents {
			agentNames = append(agentNames, a.Name)
		}

		providers = append(providers, ProviderOutput{
			Name:      p.Name,
			Status:    statusStr,
			Source:    "server",
			Available: p.IsAvailable,
			Agents:    agentNames,
		})
	}

	data, err := json.MarshalIndent(map[string]interface{}{
		"source":    "server",
		"providers": providers,
	}, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}

// --- Local display functions (existing behavior) ---

func printLocalProvidersJSON(status credentials.AllProviderStatus) error {
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
		"source":    "local",
		"providers": providers,
	}, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}

func printLocalProvidersTable(status credentials.AllProviderStatus) error {
	fmt.Println("AI Providers Status (Local)")
	fmt.Println("===========================")
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
