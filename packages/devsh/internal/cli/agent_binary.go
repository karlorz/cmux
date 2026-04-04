package cli

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

var claudeCLIOverrideEnvVars = []string{
	"DEVSH_CLAUDE_BIN",
	"CMUX_CLAUDE_BIN",
}

func resolveAgentCLIPath(cliName string) (string, error) {
	if cliName == "claude" {
		for _, envVar := range claudeCLIOverrideEnvVars {
			override := strings.TrimSpace(os.Getenv(envVar))
			if override == "" {
				continue
			}

			resolvedPath, err := exec.LookPath(override)
			if err != nil {
				return "", fmt.Errorf("%s=%q did not resolve to a runnable claude CLI: %w", envVar, override, err)
			}

			return resolvedPath, nil
		}
	}

	return exec.LookPath(cliName)
}
