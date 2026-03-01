package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var (
	projectListInstallationID int
	projectListOwner          string
	projectListOwnerType      string
)

var projectListCmd = &cobra.Command{
	Use:   "list --installation-id <id>",
	Short: "List GitHub Projects",
	Long: `List GitHub Projects for a GitHub App installation.
If --owner is omitted, owner and owner type are inferred from the installation connection.

Examples:
  devsh project list --installation-id 12345 --owner my-org --owner-type organization
  devsh project list --installation-id 12345 --owner my-user --owner-type user
  devsh project list --installation-id 12345 --owner my-org --json`,
	Aliases: []string{"ls"},
	RunE:    runProjectList,
}

func runProjectList(cmd *cobra.Command, args []string) error {
	if projectListInstallationID <= 0 {
		return fmt.Errorf("--installation-id flag is required")
	}

	ownerType := strings.ToLower(strings.TrimSpace(projectListOwnerType))
	if ownerType != "" && ownerType != "user" && ownerType != "organization" {
		return fmt.Errorf("--owner-type must be 'user' or 'organization'")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	teamSlug, err := auth.GetTeamSlug()
	if err != nil {
		return fmt.Errorf("failed to get team: %w", err)
	}

	client, err := vm.NewClient()
	if err != nil {
		return fmt.Errorf("failed to create client: %w", err)
	}
	client.SetTeamSlug(teamSlug)

	result, err := client.ListProjects(ctx, vm.ListProjectsOptions{
		InstallationID: projectListInstallationID,
		Owner:          projectListOwner,
		OwnerType:      ownerType,
	})
	if err != nil {
		return fmt.Errorf("failed to list projects: %w", err)
	}

	if flagJSON {
		data, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(data))
		return nil
	}

	if len(result.Projects) == 0 {
		if result.NeedsReauthorization {
			fmt.Println("No projects found. Additional OAuth 'project' scope authorization may be required for user-owned projects.")
			return nil
		}
		fmt.Println("No projects found.")
		return nil
	}

	fmt.Printf("%-10s %-48s %-60s %s\n", "#NUMBER", "TITLE", "URL", "CLOSED")
	fmt.Println("----------", "------------------------------------------------", "------------------------------------------------------------", "------")

	for _, project := range result.Projects {
		title := project.Title
		if len(title) > 48 {
			title = title[:45] + "..."
		}

		url := project.URL
		if len(url) > 60 {
			url = url[:57] + "..."
		}

		fmt.Printf("%-10d %-48s %-60s %t\n", project.Number, title, url, project.Closed)
	}

	if result.NeedsReauthorization {
		fmt.Println()
		fmt.Println("Note: Additional OAuth 'project' scope authorization may be required for user-owned projects.")
	}

	return nil
}

func init() {
	projectListCmd.Flags().IntVar(&projectListInstallationID, "installation-id", 0, "GitHub App installation ID (required)")
	projectListCmd.Flags().StringVar(&projectListOwner, "owner", "", "GitHub owner login (user or organization)")
	projectListCmd.Flags().StringVar(&projectListOwnerType, "owner-type", "", "Owner type: user or organization (optional)")
	projectCmd.AddCommand(projectListCmd)
}
