package cli

import (
	"fmt"
	"net/url"
	"os/exec"
	"runtime"

	"github.com/cmux-cli/cmux-devbox-2/internal/api"
	"github.com/spf13/cobra"
)

var openFlagVNC bool

// buildAuthURL builds a URL with token authentication
// E2B gives each port its own subdomain, so we use query params for auth
func buildAuthURL(baseURL, token string, isVNC bool) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %w", err)
	}
	query := parsed.Query()
	if isVNC {
		// noVNC uses 'password' param, first 8 chars of token
		if len(token) >= 8 {
			query.Set("password", token[:8])
		}
		// Add default noVNC params
		query.Set("resize", "scale")
		query.Set("quality", "9")
		query.Set("compression", "0")
	} else {
		// VSCode uses 'tkn' param
		query.Set("tkn", token)
		// Set default folder
		query.Set("folder", "/home/user/workspace")
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

var openCmd = &cobra.Command{
	Use:   "open <id>",
	Short: "Open sandbox in browser (VSCode or VNC)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		teamSlug, err := getTeamSlug()
		if err != nil {
			return fmt.Errorf("failed to get team: %w", err)
		}

		client := api.NewClient()
		inst, err := client.GetInstance(teamSlug, args[0])
		if err != nil {
			return err
		}

		// Fetch auth token from the sandbox
		token, err := client.GetAuthToken(teamSlug, args[0])
		if err != nil {
			return fmt.Errorf("failed to get auth token: %w", err)
		}

		var authURL string
		if openFlagVNC {
			if inst.VNCURL == "" {
				return fmt.Errorf("VNC URL not available")
			}
			authURL, err = buildAuthURL(inst.VNCURL, token, true)
			if err != nil {
				return err
			}
			if flagVerbose {
				fmt.Printf("VNC URL: %s\n", authURL)
			}
			fmt.Println("Opening VNC...")
		} else {
			if inst.VSCodeURL == "" {
				return fmt.Errorf("VSCode URL not available")
			}
			authURL, err = buildAuthURL(inst.VSCodeURL, token, false)
			if err != nil {
				return err
			}
			if flagVerbose {
				fmt.Printf("VSCode URL: %s\n", authURL)
			}
			fmt.Println("Opening VSCode...")
		}

		return openURL(authURL)
	},
}

func init() {
	openCmd.Flags().BoolVar(&openFlagVNC, "vnc", false, "Open VNC instead of VSCode")
}

func openURL(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		return fmt.Errorf("unsupported platform")
	}
	return cmd.Start()
}
