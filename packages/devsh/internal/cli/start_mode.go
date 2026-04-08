package cli

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/karlorz/devsh/internal/provider"
)

type startMode struct {
	provider      string
	serverManaged bool
}

func resolveStartMode(flagValue string) (startMode, error) {
	normalized, err := provider.NormalizeProvider(flagValue)
	if err != nil {
		return startMode{}, err
	}
	if normalized != "" {
		return startMode{provider: normalized}, nil
	}
	if provider.HasPveEnv() {
		return startMode{provider: provider.PveLxc}, nil
	}
	if provider.HasE2BEnv() {
		return startMode{provider: provider.E2B}, nil
	}
	return startMode{serverManaged: true}, nil
}

func resolveOptionalStartPath(args []string) (string, string, error) {
	if len(args) == 0 {
		return "", "", nil
	}

	syncPath, err := filepath.Abs(args[0])
	if err != nil {
		return "", "", fmt.Errorf("invalid path: %w", err)
	}

	info, err := os.Stat(syncPath)
	if err != nil {
		return "", "", fmt.Errorf("path not found: %w", err)
	}
	if !info.IsDir() {
		return "", "", fmt.Errorf("path must be a directory")
	}

	return filepath.Base(syncPath), syncPath, nil
}
