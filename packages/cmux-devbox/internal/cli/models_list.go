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
	"github.com/cmux-cli/cmux-devbox/internal/credentials"
	"github.com/spf13/cobra"
)

// ModelVariant describes a thinking/reasoning mode variant
type ModelVariant struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Description string `json:"description,omitempty"`
}

// ModelInfo describes an available AI model (from server API)
type ModelInfo struct {
	Name            string         `json:"name"`
	DisplayName     string         `json:"displayName"`
	Vendor          string         `json:"vendor"`
	RequiredApiKeys []string       `json:"requiredApiKeys"`
	Tier            string         `json:"tier"`
	Source          string         `json:"source,omitempty"`          // "curated" or "discovered"
	DiscoveredFrom  string         `json:"discoveredFrom,omitempty"`  // e.g., "openrouter"
	DiscoveredAt    int64          `json:"discoveredAt,omitempty"`    // Unix timestamp
	Disabled        bool           `json:"disabled"`
	DisabledReason  *string        `json:"disabledReason"`
	Tags            []string       `json:"tags"`
	Variants        []ModelVariant `json:"variants"`
	DefaultVariant  string         `json:"defaultVariant"`
}

// ModelsListResponse from /api/models
type ModelsListResponse struct {
	Models []ModelInfo `json:"models"`
}

// cachedModels stores fetched models to avoid repeated API calls
var cachedModels []ModelInfo

var modelsCmd = &cobra.Command{
	Use:   "models [filter]",
	Short: "List available AI models",
	Long: `List AI models. By default, only shows models with configured credentials.

Checks server-side credentials (API keys stored in cmux settings) to filter models.
Use --local to check local credentials instead, or --all to show all models.

Examples:
  cmux models                         # List model names (one per line)
  cmux models --all                   # List ALL models (ignore credentials)
  cmux models --local                 # Use local credentials for filtering
  cmux models --verbose               # Show table with details
  cmux models --json                  # JSON output
  cmux models claude                  # Filter by name
  cmux models --provider openai       # Filter by vendor`,
	RunE: runModelsList,
}

var modelsListCmd = &cobra.Command{
	Use:   "list [filter]",
	Short: "List available AI models",
	Long: `List AI models. By default, only shows models with configured credentials.

Checks server-side credentials (API keys stored in cmux settings) to filter models.
Use --local to check local credentials instead, or --all to show all models.

Examples:
  cmux models list                    # List model names (one per line)
  cmux models list --all              # List ALL models (ignore credentials)
  cmux models list --local            # Use local credentials for filtering
  cmux models list --verbose          # Show table with details
  cmux models list --json             # JSON output
  cmux models list claude             # Filter by name
  cmux models list --provider openai  # Filter by vendor`,
	RunE: runModelsList,
}

func init() {
	// Add flags to modelsCmd (default command)
	modelsCmd.Flags().String("provider", "", "Filter by provider (anthropic, openai, opencode, etc.)")
	modelsCmd.Flags().Bool("enabled-only", false, "Only show enabled models")
	modelsCmd.Flags().Bool("refresh", false, "Refresh cached model list from server")
	modelsCmd.Flags().Bool("all", false, "Show all models (including unavailable)")
	modelsCmd.Flags().Bool("local", false, "Use local credentials for filtering (default: server-side)")

	// Also add to modelsListCmd for backwards compatibility
	modelsListCmd.Flags().String("provider", "", "Filter by provider (anthropic, openai, opencode, etc.)")
	modelsListCmd.Flags().Bool("enabled-only", false, "Only show enabled models")
	modelsListCmd.Flags().Bool("refresh", false, "Refresh cached model list from server")
	modelsListCmd.Flags().Bool("all", false, "Show all models (including unavailable)")
	modelsListCmd.Flags().Bool("local", false, "Use local credentials for filtering (default: server-side)")

	modelsCmd.AddCommand(modelsListCmd)
	rootCmd.AddCommand(modelsCmd)
}

func runModelsList(cmd *cobra.Command, args []string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Check --refresh flag
	refresh, _ := cmd.Flags().GetBool("refresh")
	if refresh {
		cachedModels = nil
	}

	models, err := FetchModels(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch models: %w", err)
	}

	// Get filter flags
	provider, _ := cmd.Flags().GetString("provider")
	enabledOnly, _ := cmd.Flags().GetBool("enabled-only")
	showAll, _ := cmd.Flags().GetBool("all")

	// Filter text from args
	filter := ""
	if len(args) > 0 {
		filter = strings.ToLower(args[0])
	}

	// Apply filters
	filtered := filterModels(models, provider, enabledOnly, filter)

	// Filter by availability (unless --all)
	if !showAll {
		useLocal, _ := cmd.Flags().GetBool("local")

		if useLocal {
			// Explicit local credential checks
			providerStatus := credentials.CheckAllProviders()
			filtered = filterByAvailability(filtered, providerStatus)
		} else {
			// Try server-side first, fall back to local
			serverStatus, err := fetchServerProviderStatus(ctx)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Warning: could not fetch server provider status (%v), falling back to local checks\n", err)
				providerStatus := credentials.CheckAllProviders()
				filtered = filterByAvailability(filtered, providerStatus)
			} else {
				filtered = filterByServerAvailability(filtered, serverStatus)
			}
		}
	}

	// JSON output
	if flagJSON {
		data, err := json.MarshalIndent(map[string]interface{}{"models": filtered}, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(data))
		return nil
	}

	// Verbose table output
	if flagVerbose {
		return printModelsTable(filtered, true)
	}

	// Default: simple output (one model name per line, like opencode)
	for _, m := range filtered {
		fmt.Println(m.Name)
	}

	return nil
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

// filterByAvailability filters models to only include those with available local credentials
func filterByAvailability(models []ModelInfo, status credentials.AllProviderStatus) []ModelInfo {
	var result []ModelInfo
	for _, m := range models {
		if status.IsProviderAvailable(strings.ToLower(m.Vendor)) {
			result = append(result, m)
		}
	}
	return result
}

// filterModelsByTier filters models by their tier (free or paid)
func filterModelsByTier(models []ModelInfo, tier string) []ModelInfo {
	if tier == "" {
		return models
	}
	var result []ModelInfo
	for _, m := range models {
		if strings.EqualFold(m.Tier, tier) {
			result = append(result, m)
		}
	}
	return result
}

// filterModelsOpenRouterFree filters models to only include OpenRouter free models (with :free suffix)
func filterModelsOpenRouterFree(models []ModelInfo) []ModelInfo {
	var result []ModelInfo
	for _, m := range models {
		if strings.HasSuffix(m.Name, ":free") {
			result = append(result, m)
		}
	}
	return result
}

// filterModelsBySource filters models by their source (curated or discovered)
func filterModelsBySource(models []ModelInfo, source string) []ModelInfo {
	if source == "" {
		return models
	}
	var result []ModelInfo
	for _, m := range models {
		if strings.EqualFold(m.Source, source) {
			result = append(result, m)
		}
	}
	return result
}

// filterModelsByDiscoveredFrom filters models by their discovery source (e.g., "openrouter")
func filterModelsByDiscoveredFrom(models []ModelInfo, discoveredFrom string) []ModelInfo {
	if discoveredFrom == "" {
		return models
	}
	var result []ModelInfo
	for _, m := range models {
		if strings.EqualFold(m.DiscoveredFrom, discoveredFrom) {
			result = append(result, m)
		}
	}
	return result
}

// filterByServerAvailability filters models based on server-side provider status (Convex API keys)
func filterByServerAvailability(models []ModelInfo, serverStatus *ServerProvidersResponse) []ModelInfo {
	// Build a set of available vendors from server response
	availableVendors := make(map[string]bool)
	for _, p := range serverStatus.Providers {
		if p.IsAvailable {
			availableVendors[p.Name] = true
		}
	}

	var result []ModelInfo
	for _, m := range models {
		vendor := strings.ToLower(m.Vendor)
		if availableVendors[vendor] {
			result = append(result, m)
		}
	}
	return result
}

func printModelsTable(models []ModelInfo, verbose bool) error {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)

	if verbose {
		fmt.Fprintf(w, "NAME\tDISPLAY\tVENDOR\tTIER\tTAGS\n")
		fmt.Fprintf(w, "----\t-------\t------\t----\t----\n")
		for _, m := range models {
			tags := ""
			if len(m.Tags) > 0 {
				tags = strings.Join(m.Tags, ", ")
			}
			disabled := ""
			if m.Disabled {
				disabled = " (disabled)"
			}
			fmt.Fprintf(w, "%s%s\t%s\t%s\t%s\t%s\n",
				m.Name, disabled, m.DisplayName, m.Vendor, m.Tier, tags)
		}
	} else {
		// Simple list (one per line)
		for _, m := range models {
			fmt.Fprintln(w, m.Name)
		}
	}

	w.Flush()
	return nil
}
