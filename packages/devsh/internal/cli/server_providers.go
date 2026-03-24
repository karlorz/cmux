// internal/cli/server_providers.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/karlorz/devsh/internal/auth"
)

// ControlPlaneConnectionState represents the connection state from the control plane
type ControlPlaneConnectionState struct {
	IsConnected       bool     `json:"isConnected"`
	Source            *string  `json:"source"` // "env", "stored_api_key", "stored_oauth_token", "stored_json_blob", "override", "free", or null
	ConfiguredEnvVars []string `json:"configuredEnvVars"`
	HasFreeModels     bool     `json:"hasFreeModels"`
}

// ControlPlaneDefaultModel represents a default model for a provider
type ControlPlaneDefaultModel struct {
	Name        string  `json:"name"`
	DisplayName string  `json:"displayName"`
	Reason      *string `json:"reason,omitempty"`
}

// ControlPlaneAuthMethod represents an auth method from the control plane
type ControlPlaneAuthMethod struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"` // "api_key", "oauth_token", "json_blob", "custom_endpoint"
	DisplayName string  `json:"displayName"`
	Description *string `json:"description,omitempty"`
	EnvVar      string  `json:"envVar"`
	Preferred   *bool   `json:"preferred,omitempty"`
}

// ControlPlaneProvider represents a provider from the control plane API
type ControlPlaneProvider struct {
	ID               string                      `json:"id"`
	Name             string                      `json:"name"`
	DefaultBaseUrl   string                      `json:"defaultBaseUrl"`
	EffectiveBaseUrl string                      `json:"effectiveBaseUrl"`
	APIFormat        string                      `json:"apiFormat"`
	AuthMethods      []ControlPlaneAuthMethod    `json:"authMethods"`
	ConnectionState  ControlPlaneConnectionState `json:"connectionState"`
	DefaultModel     *ControlPlaneDefaultModel   `json:"defaultModel,omitempty"`
	IsOverridden     bool                        `json:"isOverridden"`
}

// ControlPlaneProvidersResponse is the response from GET /api/provider-control-plane
type ControlPlaneProvidersResponse struct {
	Providers   []ControlPlaneProvider `json:"providers"`
	GeneratedAt int64                  `json:"generatedAt"`
}

// ServerAgentStatus represents an individual agent's availability from the server
// NOTE: This is the legacy format used by the older /api/providers endpoint.
// Kept for backwards compatibility with older code paths.
type ServerAgentStatus struct {
	Name        string `json:"name"`
	IsAvailable bool   `json:"isAvailable"`
}

// ServerProviderStatus represents a vendor-level provider status from the server
// NOTE: This is the legacy format. New code should use ControlPlaneProvider.
type ServerProviderStatus struct {
	Name        string              `json:"name"`
	IsAvailable bool                `json:"isAvailable"`
	Agents      []ServerAgentStatus `json:"agents,omitempty"`
}

// ServerProvidersResponse is the legacy response format.
// NOTE: New code should use ControlPlaneProvidersResponse directly.
type ServerProvidersResponse struct {
	Success   bool                   `json:"success"`
	Providers []ServerProviderStatus `json:"providers"`
	Error     string                 `json:"error,omitempty"`
}

// fetchServerProviderStatus calls GET /api/provider-control-plane (authenticated) to get
// provider status from Convex-stored API keys. This reflects the actual
// credentials available for remote sandbox execution.
//
// Returns the legacy ServerProvidersResponse format for backwards compatibility.
// Internally uses the new control plane API for richer connection state information.
func fetchServerProviderStatus(ctx context.Context) (*ServerProvidersResponse, error) {
	controlPlane, err := fetchControlPlaneProviders(ctx)
	if err != nil {
		return nil, err
	}

	// Convert control plane response to legacy format
	response := &ServerProvidersResponse{
		Success:   true,
		Providers: make([]ServerProviderStatus, 0, len(controlPlane.Providers)),
	}

	for _, p := range controlPlane.Providers {
		legacy := ServerProviderStatus{
			Name:        p.ID,
			IsAvailable: p.ConnectionState.IsConnected,
		}

		// If there's a default model, add it as an agent
		if p.DefaultModel != nil {
			legacy.Agents = []ServerAgentStatus{{
				Name:        p.DefaultModel.Name,
				IsAvailable: p.ConnectionState.IsConnected,
			}}
		}

		response.Providers = append(response.Providers, legacy)
	}

	return response, nil
}

// fetchControlPlaneProviders calls the canonical control plane API
// and returns the full provider response with connection states.
func fetchControlPlaneProviders(ctx context.Context) (*ControlPlaneProvidersResponse, error) {
	cfg := auth.GetConfig()
	if cfg.ServerURL == "" {
		return nil, fmt.Errorf("CMUX_SERVER_URL not configured")
	}

	accessToken, err := auth.GetAccessToken()
	if err != nil {
		return nil, fmt.Errorf("not authenticated: %w", err)
	}

	teamSlug, err := auth.GetTeamSlug()
	if err != nil {
		return nil, fmt.Errorf("failed to get team: %w", err)
	}

	endpoint := fmt.Sprintf("%s/api/provider-control-plane?teamSlugOrId=%s",
		cfg.ServerURL, url.QueryEscape(teamSlug))
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch providers: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(body))
	}

	var result ControlPlaneProvidersResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &result, nil
}

// FetchControlPlaneProviders is exported for use by other packages
func FetchControlPlaneProviders(ctx context.Context) (*ControlPlaneProvidersResponse, error) {
	return fetchControlPlaneProviders(ctx)
}
