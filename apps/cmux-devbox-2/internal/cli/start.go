package cli

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/cmux-cli/cmux-devbox-2/internal/api"
	"github.com/spf13/cobra"
)

var (
	startFlagName     string
	startFlagTemplate string
	startFlagOpen     bool
)

var startCmd = &cobra.Command{
	Use:     "start",
	Aliases: []string{"create", "new"},
	Short:   "Create a new E2B sandbox",
	RunE: func(cmd *cobra.Command, args []string) error {
		teamSlug, err := getTeamSlug()
		if err != nil {
			return fmt.Errorf("failed to get team: %w", err)
		}

		client := api.NewClient()
		resp, err := client.CreateInstance(teamSlug, startFlagTemplate, startFlagName)
		if err != nil {
			return err
		}

		// Try to fetch auth token (may need a few retries as sandbox boots)
		var token string
		fmt.Print("Waiting for sandbox to initialize")
		for i := 0; i < 10; i++ {
			time.Sleep(2 * time.Second)
			fmt.Print(".")
			token, err = client.GetAuthToken(teamSlug, resp.DevboxID)
			if err == nil && token != "" {
				break
			}
		}
		fmt.Println()

		// Build authenticated URLs
		var vscodeAuthURL, vncAuthURL string
		if token != "" {
			if resp.VSCodeURL != "" {
				vscodeAuthURL, _ = buildAuthURL(resp.VSCodeURL, token, false)
			}
			if resp.VNCURL != "" {
				vncAuthURL, _ = buildAuthURL(resp.VNCURL, token, true)
			}
		}

		if flagJSON {
			output := map[string]interface{}{
				"devboxId":      resp.DevboxID,
				"e2bInstanceId": resp.E2BInstanceID,
				"status":        resp.Status,
			}
			if vscodeAuthURL != "" {
				output["vscodeUrl"] = vscodeAuthURL
			} else if resp.VSCodeURL != "" {
				output["vscodeUrl"] = resp.VSCodeURL
			}
			if vncAuthURL != "" {
				output["vncUrl"] = vncAuthURL
			} else if resp.VNCURL != "" {
				output["vncUrl"] = resp.VNCURL
			}
			data, _ := json.MarshalIndent(output, "", "  ")
			fmt.Println(string(data))
		} else {
			fmt.Printf("Created sandbox: %s\n", resp.DevboxID)
			fmt.Printf("  Status: %s\n", resp.Status)
			if vscodeAuthURL != "" {
				fmt.Printf("  VSCode: %s\n", vscodeAuthURL)
			} else if resp.VSCodeURL != "" {
				fmt.Printf("  VSCode: %s\n", resp.VSCodeURL)
			}
			if vncAuthURL != "" {
				fmt.Printf("  VNC:    %s\n", vncAuthURL)
			} else if resp.VNCURL != "" {
				fmt.Printf("  VNC:    %s\n", resp.VNCURL)
			}
			if resp.E2BInstanceID != "" && flagVerbose {
				fmt.Printf("  E2B ID: %s\n", resp.E2BInstanceID)
			}
		}

		if startFlagOpen && vscodeAuthURL != "" {
			fmt.Println("\nOpening VSCode...")
			openURL(vscodeAuthURL)
		}

		return nil
	},
}

func init() {
	startCmd.Flags().StringVarP(&startFlagName, "name", "n", "", "Name for the sandbox")
	startCmd.Flags().StringVarP(&startFlagTemplate, "template", "T", "", "E2B template ID")
	startCmd.Flags().BoolVarP(&startFlagOpen, "open", "o", false, "Open VSCode after creation")
}
