// internal/cli/orchestrate_preflight.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/spf13/cobra"
)

// ProviderStatus represents the availability of a sandbox provider
type ProviderStatus struct {
	Available bool   `json:"available"`
	Configured bool  `json:"configured"`
	Error     string `json:"error,omitempty"`
}

// PreflightResult contains provider availability information
type PreflightResult struct {
	Providers     map[string]ProviderStatus `json:"providers"`
	Authenticated bool                      `json:"authenticated"`
	TeamSlug      string                    `json:"team_slug,omitempty"`
	DefaultAgent  string                    `json:"default_agent,omitempty"`
}

var orchestratePreflightCmd = &cobra.Command{
	Use:   "preflight",
	Short: "Check sandbox provider availability before spawning",
	Long: `Check the availability and configuration of sandbox providers before spawning agents.

This helps agents decide which backend to use and validates that the environment
is properly configured for orchestration.

Checks:
  - Authentication status
  - PVE-LXC provider availability (if PVE_API_URL is set)
  - Morph provider availability (if MORPH_API_KEY is set)

Examples:
  devsh orchestrate preflight
  devsh orchestrate preflight --json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		result := PreflightResult{
			Providers: make(map[string]ProviderStatus),
		}

		// Check authentication
		teamSlug, err := auth.GetTeamSlug()
		if err != nil {
			result.Authenticated = false
		} else {
			result.Authenticated = true
			result.TeamSlug = teamSlug
		}

		// Check PVE-LXC provider
		pveStatus := checkPVEProvider()
		result.Providers["pve-lxc"] = pveStatus

		// Check Morph provider
		morphStatus := checkMorphProvider()
		result.Providers["morph"] = morphStatus

		// Get default agent from environment if set
		if defaultAgent := os.Getenv("CMUX_DEFAULT_CODING_AGENT"); defaultAgent != "" {
			result.DefaultAgent = defaultAgent
		}

		if flagJSON {
			data, _ := json.Marshal(result)
			fmt.Println(string(data))
			return nil
		}

		// Human-readable output
		fmt.Println("Orchestration Preflight Check")
		fmt.Println("=============================")
		fmt.Printf("  Authenticated: %v\n", result.Authenticated)
		if result.TeamSlug != "" {
			fmt.Printf("  Team:          %s\n", result.TeamSlug)
		}
		if result.DefaultAgent != "" {
			fmt.Printf("  Default Agent: %s\n", result.DefaultAgent)
		}
		fmt.Println()
		fmt.Println("Providers:")
		for name, status := range result.Providers {
			configStr := "not configured"
			if status.Configured {
				configStr = "configured"
			}
			availStr := "unavailable"
			if status.Available {
				availStr = "available"
			}
			fmt.Printf("  %-10s %s, %s\n", name+":", configStr, availStr)
			if status.Error != "" {
				fmt.Printf("             Error: %s\n", status.Error)
			}
		}

		return nil
	},
}

func checkPVEProvider() ProviderStatus {
	status := ProviderStatus{}

	// Check if PVE is configured via environment variables
	pveURL := os.Getenv("PVE_API_URL")
	pveToken := os.Getenv("PVE_API_TOKEN")

	if pveURL == "" || pveToken == "" {
		status.Configured = false
		status.Available = false
		return status
	}

	status.Configured = true
	// If configured, assume available (actual connectivity checked on spawn)
	status.Available = true
	return status
}

func checkMorphProvider() ProviderStatus {
	status := ProviderStatus{}

	// Check if Morph is configured via environment variable
	morphKey := os.Getenv("MORPH_API_KEY")

	if morphKey == "" {
		status.Configured = false
		status.Available = false
		return status
	}

	status.Configured = true
	// If configured, assume available (actual connectivity checked on spawn)
	status.Available = true
	return status
}

func init() {
	orchestrateCmd.AddCommand(orchestratePreflightCmd)
}
