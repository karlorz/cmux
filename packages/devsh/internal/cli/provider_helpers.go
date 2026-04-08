package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/provider"
)

var sandboxConfigHTTPClient = &http.Client{Timeout: 5 * time.Second}

type sandboxConfigResponse struct {
	Provider string `json:"provider"`
}

func resolveProviderForCommand() (string, error) {
	normalized, err := provider.NormalizeProvider(flagProvider)
	if err != nil {
		return "", err
	}
	if normalized != "" {
		return normalized, nil
	}

	detected := provider.DetectFromEnv()
	if detected != provider.Morph {
		return detected, nil
	}

	serverProvider, err := fetchServerSandboxProvider(context.Background(), auth.GetConfig().CmuxURL)
	if err == nil {
		return serverProvider, nil
	}

	return detected, nil
}

func resolveProviderForInstance(instanceID string) (string, error) {
	normalized, err := provider.NormalizeProvider(flagProvider)
	if err != nil {
		return "", err
	}
	if normalized != "" {
		return normalized, nil
	}
	return provider.ProviderForInstanceID(instanceID), nil
}

func fetchServerSandboxProvider(ctx context.Context, cmuxURL string) (string, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cmuxURL), "/")
	if baseURL == "" {
		return "", fmt.Errorf("cmux URL not configured")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/config/sandbox", nil)
	if err != nil {
		return "", fmt.Errorf("build sandbox config request: %w", err)
	}

	resp, err := sandboxConfigHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch sandbox config: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("sandbox config returned %d", resp.StatusCode)
	}

	var result sandboxConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode sandbox config: %w", err)
	}

	selected, err := provider.NormalizeProvider(result.Provider)
	if err != nil {
		return "", fmt.Errorf("unsupported sandbox provider %q: %w", result.Provider, err)
	}
	if selected == "" {
		return "", fmt.Errorf("sandbox provider missing from response")
	}

	return selected, nil
}
