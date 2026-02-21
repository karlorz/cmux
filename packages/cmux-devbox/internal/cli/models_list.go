// internal/cli/models_list.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/cmux-cli/cmux-devbox/internal/auth"
	"github.com/spf13/cobra"
)

// ModelInfo describes an available AI model (from server API)
type ModelInfo struct {
	Name            string   `json:"name"`
	DisplayName     string   `json:"displayName"`
	Vendor          string   `json:"vendor"`
	RequiredApiKeys []string `json:"requiredApiKeys"`
	Tier            string   `json:"tier"`
	Disabled        bool     `json:"disabled"`
	DisabledReason  *string  `json:"disabledReason"`
	Tags            []string `json:"tags"`
}

// ModelsListResponse from /api/models
type ModelsListResponse struct {
	Models []ModelInfo `json:"models"`
}

// cachedModels stores fetched models to avoid repeated API calls
var cachedModels []ModelInfo

var modelsCmd = &cobra.Command{
	Use:   "models",
	Short: "Manage AI models",
	Long:  `Commands for listing and managing AI models.`,
}

var modelsListCmd = &cobra.Command{
	Use:   "list [filter]",
	Short: "List available AI models",
	Long: `List all available AI models with their display names, vendors, and tiers.

Fetches the current model list from the server.

Examples:
  cmux models list                    # List all models
  cmux models list --json             # JSON output
  cmux models list claude             # Filter by name
  cmux models list --provider openai  # Filter by vendor
  cmux models list --enabled-only     # Only show enabled models
  cmux models list --verbose          # Show API keys required`,
	RunE: runModelsList,
}

func init() {
	modelsListCmd.Flags().String("provider", "", "Filter by provider (anthropic, openai, opencode, etc.)")
	modelsListCmd.Flags().Bool("enabled-only", false, "Only show enabled models")

	modelsCmd.AddCommand(modelsListCmd)
	rootCmd.AddCommand(modelsCmd)
}

func runModelsList(cmd *cobra.Command, args []string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	models, err := FetchModels(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch models: %w", err)
	}

	// Get filter flags
	provider, _ := cmd.Flags().GetString("provider")
	enabledOnly, _ := cmd.Flags().GetBool("enabled-only")

	// Filter text from args
	filter := ""
	if len(args) > 0 {
		filter = strings.ToLower(args[0])
	}

	// Apply filters
	filtered := filterModels(models, provider, enabledOnly, filter)

	// JSON output
	if flagJSON {
		data, err := json.MarshalIndent(map[string]interface{}{"models": filtered}, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(data))
		return nil
	}

	// Table output
	fmt.Printf("Available Models (%d)\n", len(filtered))
	fmt.Println("====================")
	fmt.Println()

	return printModelsTable(filtered, flagVerbose)
}

// FetchModels retrieves model list from server API
func FetchModels(ctx context.Context) ([]ModelInfo, error) {
	if len(cachedModels) > 0 {
		return cachedModels, nil
	}

	cfg := auth.GetConfig()
	if cfg.ServerURL == "" {
		return nil, fmt.Errorf("CMUX_SERVER_URL not configured")
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", cfg.ServerURL+"/api/models", nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch models: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(body))
	}

	var result ModelsListResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	cachedModels = result.Models
	return cachedModels, nil
}

func filterModels(models []ModelInfo, provider string, enabledOnly bool, filter string) []ModelInfo {
	var result []ModelInfo
	for _, m := range models {
		// Filter by provider/vendor
		if provider != "" && !strings.EqualFold(m.Vendor, provider) {
			continue
		}
		// Filter out disabled if requested
		if enabledOnly && m.Disabled {
			continue
		}
		// Text filter
		if filter != "" {
			nameMatch := strings.Contains(strings.ToLower(m.Name), filter)
			displayMatch := strings.Contains(strings.ToLower(m.DisplayName), filter)
			vendorMatch := strings.Contains(strings.ToLower(m.Vendor), filter)
			if !nameMatch && !displayMatch && !vendorMatch {
				continue
			}
		}
		result = append(result, m)
	}
	return result
}

func printModelsTable(models []ModelInfo, verbose bool) error {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)

	if verbose {
		fmt.Fprintf(w, "NAME\tDISPLAY\tVENDOR\tTIER\tREQUIRES\n")
		fmt.Fprintf(w, "----\t-------\t------\t----\t--------\n")
		for _, m := range models {
			keys := "(none)"
			if len(m.RequiredApiKeys) > 0 {
				keys = strings.Join(m.RequiredApiKeys, ", ")
			}
			disabled := ""
			if m.Disabled {
				disabled = " (disabled)"
			}
			fmt.Fprintf(w, "%s%s\t%s\t%s\t%s\t%s\n",
				m.Name, disabled, m.DisplayName, m.Vendor, m.Tier, keys)
		}
	} else {
		fmt.Fprintf(w, "NAME\tDISPLAY\tVENDOR\tTIER\n")
		fmt.Fprintf(w, "----\t-------\t------\t----\n")
		for _, m := range models {
			disabled := ""
			if m.Disabled {
				disabled = " (disabled)"
			}
			fmt.Fprintf(w, "%s%s\t%s\t%s\t%s\n",
				m.Name, disabled, m.DisplayName, m.Vendor, m.Tier)
		}
	}

	w.Flush()

	fmt.Println()
	fmt.Println("Usage: cmux task create --agent <name> --repo owner/repo \"prompt\"")

	return nil
}
