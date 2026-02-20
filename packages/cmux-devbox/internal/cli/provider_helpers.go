package cli

import "github.com/cmux-cli/cmux-devbox/internal/provider"

func resolveProviderForCommand() (string, error) {
	normalized, err := provider.NormalizeProvider(flagProvider)
	if err != nil {
		return "", err
	}
	if normalized != "" {
		return normalized, nil
	}
	return provider.DetectFromEnv(), nil
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
