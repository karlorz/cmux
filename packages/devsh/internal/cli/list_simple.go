// internal/cli/list_simple.go
package cli

import (
	"context"
	"fmt"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/e2b"
	"github.com/karlorz/devsh/internal/provider"
	"github.com/karlorz/devsh/internal/pvelxc"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var listCmd = &cobra.Command{
	Use:     "ls",
	Aliases: []string{"list", "ps"},
	Short:   "List your VMs",
	Long: `List all your VM instances.

Examples:
  devsh ls
  devsh list`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		selected, err := resolveProviderForCommand()
		if err != nil {
			return err
		}

		var instances []vm.Instance

		switch selected {
		case provider.PveLxc:
			if provider.HasPveEnv() {
				client, err := pvelxc.NewClientFromEnv()
				if err != nil {
					return fmt.Errorf("failed to create PVE LXC client: %w\nSet PVE_API_URL and PVE_API_TOKEN", err)
				}
				pveInstances, err := client.ListInstances(ctx)
				if err != nil {
					return fmt.Errorf("failed to list instances: %w", err)
				}
				for _, inst := range pveInstances {
					instances = append(instances, vm.Instance{
						ID:        inst.ID,
						Status:    inst.Status,
						VSCodeURL: inst.VSCodeURL,
					})
				}
				break
			}

			teamSlug, err := auth.GetTeamSlug()
			if err != nil {
				return fmt.Errorf("failed to get team: %w", err)
			}

			client, err := vm.NewClient()
			if err != nil {
				return fmt.Errorf("failed to create client: %w", err)
			}
			client.SetTeamSlug(teamSlug)

			pveInstances, err := client.ListPveLxcInstances(ctx)
			if err != nil {
				return fmt.Errorf("failed to list instances: %w", err)
			}
			instances = append(instances, pveInstances...)
		case provider.Morph:
			teamSlug, err := auth.GetTeamSlug()
			if err != nil {
				return fmt.Errorf("failed to get team: %w", err)
			}

			client, err := vm.NewClient()
			if err != nil {
				return fmt.Errorf("failed to create client: %w", err)
			}
			client.SetTeamSlug(teamSlug)

			basicInstances, err := client.ListInstances(ctx)
			if err != nil {
				return fmt.Errorf("failed to list instances: %w", err)
			}

			// Fetch full details for each instance to get URLs
			// (list endpoint returns basic info only)
			for _, basic := range basicInstances {
				full, err := client.GetInstance(ctx, basic.ID)
				if err != nil {
					// Fall back to basic info if fetch fails
					instances = append(instances, basic)
				} else {
					instances = append(instances, *full)
				}
			}
		case provider.E2B:
			teamSlug, err := auth.GetTeamSlug()
			if err != nil {
				return fmt.Errorf("failed to get team: %w", err)
			}

			client, err := e2b.NewClient()
			if err != nil {
				return fmt.Errorf("failed to create E2B client: %w", err)
			}
			client.SetTeamSlug(teamSlug)

			e2bInstances, err := client.ListInstances(ctx)
			if err != nil {
				return fmt.Errorf("failed to list instances: %w", err)
			}
			for _, inst := range e2bInstances {
				instances = append(instances, vm.Instance{
					ID:        inst.ID,
					Status:    inst.Status,
					VSCodeURL: inst.VSCodeURL,
				})
			}
		default:
			return fmt.Errorf("unsupported provider: %s", selected)
		}

		if len(instances) == 0 {
			fmt.Println("No VMs found. Run 'devsh start' to create one.")
			return nil
		}

		fmt.Printf("%-20s %-10s %s\n", "ID", "STATUS", "VS CODE URL")
		fmt.Println("-------------------- ---------- " + "----------------------------------------")

		for _, inst := range instances {
			url := inst.VSCodeURL
			if len(url) > 40 {
				url = url[:40] + "..."
			}
			fmt.Printf("%-20s %-10s %s\n", inst.ID, inst.Status, url)
		}

		return nil
	},
}

func init() {
	rootCmd.AddCommand(listCmd)
}
