// internal/cli/team.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/cmux-cli/cmux-devbox/internal/auth"
	"github.com/cmux-cli/cmux-devbox/internal/vm"
	"github.com/spf13/cobra"
)

var teamCmd = &cobra.Command{
	Use:   "team",
	Short: "Manage teams",
	Long:  `List teams and switch between them.`,
}

var teamSwitchCmd = &cobra.Command{
	Use:   "switch <team>",
	Short: "Switch to a different team",
	Long: `Switch your active team. This change syncs with the web app.

The team can be specified by slug or ID.

Examples:
  cmux team switch dev
  cmux team switch my-team
  cmux team switch e2afe2c9-bcb9-4c2e-82d9-f8d789d3f3c5`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		teamSlugOrId := args[0]

		// Check if DEVBOX_TEAM is set - warn user it will override
		if envTeam := os.Getenv("DEVBOX_TEAM"); envTeam != "" {
			fmt.Printf("Note: DEVBOX_TEAM=%s is set and will override this selection for CLI commands.\n", envTeam)
			fmt.Println("Unset DEVBOX_TEAM to use the switched team.")
			fmt.Println()
		}

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		client, err := vm.NewClient()
		if err != nil {
			return fmt.Errorf("failed to create client: %w", err)
		}

		fmt.Printf("Switching to team: %s\n", teamSlugOrId)

		result, err := client.SwitchTeam(ctx, teamSlugOrId)
		if err != nil {
			return fmt.Errorf("failed to switch team: %w", err)
		}

		// Clear cached user profile so next command fetches fresh data
		if err := auth.ClearUserProfileCache(); err != nil {
			// Non-fatal, just warn
			fmt.Printf("Warning: failed to clear profile cache: %v\n", err)
		}

		if flagJSON {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
		} else {
			fmt.Println("✓ Switched team")
			if result.TeamDisplayName != "" {
				fmt.Printf("  Team: %s\n", result.TeamDisplayName)
			} else {
				fmt.Printf("  Team: %s\n", result.TeamSlug)
			}
		}

		return nil
	},
}

var teamListCmd = &cobra.Command{
	Use:   "list",
	Short: "List your teams",
	Long:  `List all teams you are a member of.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		client, err := vm.NewClient()
		if err != nil {
			return fmt.Errorf("failed to create client: %w", err)
		}

		result, err := client.ListTeams(ctx)
		if err != nil {
			return fmt.Errorf("failed to list teams: %w\nRun 'cmux auth login' to authenticate", err)
		}

		if flagJSON {
			data, _ := json.MarshalIndent(result, "", "  ")
			fmt.Println(string(data))
		} else {
			if len(result.Teams) == 0 {
				fmt.Println("No teams found.")
				return nil
			}

			fmt.Println("Teams:")
			for _, team := range result.Teams {
				teamName := team.DisplayName
				if teamName == "" {
					teamName = team.Slug
				}
				if teamName == "" {
					teamName = team.TeamID
				}

				marker := "  "
				suffix := ""
				if team.Selected {
					marker = "* "
					suffix = " (selected)"
				}

				fmt.Printf("  %s%s%s\n", marker, teamName, suffix)
			}
			fmt.Println()
			fmt.Println("Use 'cmux team switch <team>' to switch teams.")
		}

		return nil
	},
}

func init() {
	teamCmd.AddCommand(teamSwitchCmd)
	teamCmd.AddCommand(teamListCmd)
}
