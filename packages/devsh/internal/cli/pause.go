// internal/cli/pause.go
package cli

import (
	"context"
	"fmt"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/e2b"
	"github.com/karlorz/devsh/internal/provider"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var pauseCmd = &cobra.Command{
	Use:   "pause <id>",
	Short: "Pause a VM",
	Long: `Pause a VM by its ID. The VM state is preserved and can be resumed.

Examples:
  devsh pause cmux_abc123`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		instanceID := args[0]

		selected, err := resolveProviderForInstance(instanceID)
		if err != nil {
			return err
		}

		timeout := 30 * time.Second
		if selected == provider.PveLxc {
			timeout = 2 * time.Minute
		}
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()

		fmt.Printf("Pausing VM %s...\n", instanceID)

		switch selected {
		case provider.PveLxc:
			if err := pausePveLxcInstance(ctx, instanceID); err != nil {
				return err
			}
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

			if err := client.PauseInstance(ctx, instanceID); err != nil {
				return fmt.Errorf("failed to pause VM: %w", err)
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

			if err := client.PauseInstance(ctx, instanceID); err != nil {
				return fmt.Errorf("failed to pause sandbox: %w", err)
			}
		default:
			return fmt.Errorf("unsupported provider: %s", selected)
		}

		fmt.Println("✓ VM paused")
		fmt.Printf("  Resume with: devsh resume %s\n", instanceID)
		return nil
	},
}

func init() {
	rootCmd.AddCommand(pauseCmd)
}
