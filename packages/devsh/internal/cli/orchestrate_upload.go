// internal/cli/orchestrate_upload.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var (
	orchestrateUploadUseEnvJwt bool
	orchestrateUploadFromStdin bool
)

var orchestrateUploadCmd = &cobra.Command{
	Use:   "upload <bundle.json>",
	Short: "Upload a local orchestration bundle to Convex",
	Long: `Upload a local orchestration export bundle (case file) to Convex.

This enables users to share local orchestration runs with team members
and view them in the web UI.

The bundle file should be a JSON file created by 'devsh orchestrate export'
or 'devsh orchestrate run-local -o <file>'.

Examples:
  devsh orchestrate upload ./my-bundle.json
  devsh orchestrate upload ./debug-bundle.json --use-env-jwt
  cat bundle.json | devsh orchestrate upload --stdin`,
	Args: func(cmd *cobra.Command, args []string) error {
		if orchestrateUploadFromStdin {
			return nil
		}
		if len(args) != 1 {
			return fmt.Errorf("requires exactly 1 argument (bundle file path)")
		}
		return nil
	},
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// Read bundle from file or stdin
		var bundleData []byte
		var err error

		if orchestrateUploadFromStdin {
			bundleData, err = io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("failed to read from stdin: %w", err)
			}
		} else {
			bundlePath := args[0]
			bundleData, err = os.ReadFile(bundlePath)
			if err != nil {
				return fmt.Errorf("failed to read bundle file: %w", err)
			}
		}

		// Validate bundle structure locally
		var bundle ExportBundle
		if err := json.Unmarshal(bundleData, &bundle); err != nil {
			return fmt.Errorf("invalid bundle JSON: %w", err)
		}

		// Basic validation
		if bundle.Orchestration.ID == "" {
			return fmt.Errorf("invalid bundle: missing orchestration.id")
		}
		if bundle.Version == "" {
			return fmt.Errorf("invalid bundle: missing version")
		}

		// Get JWT from environment if --use-env-jwt flag is set
		var taskRunJwt string
		if orchestrateUploadUseEnvJwt {
			taskRunJwt = os.Getenv("CMUX_TASK_RUN_JWT")
			if taskRunJwt == "" {
				return fmt.Errorf("--use-env-jwt flag set but CMUX_TASK_RUN_JWT environment variable is not set")
			}
		}

		client, err := vm.NewClient()
		if err != nil {
			return fmt.Errorf("failed to create client: %w", err)
		}

		// Only set team slug if not using JWT auth
		if taskRunJwt == "" {
			teamSlug, err := auth.GetTeamSlug()
			if err != nil {
				return fmt.Errorf("failed to get team: %w", err)
			}
			client.SetTeamSlug(teamSlug)
		}

		// Upload the bundle
		result, err := client.UploadBundle(ctx, bundleData, taskRunJwt)
		if err != nil {
			return fmt.Errorf("failed to upload bundle: %w", err)
		}

		fmt.Printf("Bundle uploaded successfully!\n")
		fmt.Printf("  Bundle ID: %s\n", result.BundleID)
		fmt.Printf("  Orchestration ID: %s\n", result.OrchestrationID)
		fmt.Printf("  Tasks: %d (completed: %d, failed: %d, running: %d, pending: %d)\n",
			bundle.Summary.TotalTasks,
			bundle.Summary.CompletedTasks,
			bundle.Summary.FailedTasks,
			bundle.Summary.RunningTasks,
			bundle.Summary.PendingTasks)

		return nil
	},
}

func init() {
	orchestrateUploadCmd.Flags().BoolVar(&orchestrateUploadUseEnvJwt, "use-env-jwt", false, "Use CMUX_TASK_RUN_JWT from environment for authentication")
	orchestrateUploadCmd.Flags().BoolVar(&orchestrateUploadFromStdin, "stdin", false, "Read bundle from stdin instead of file")
	orchestrateCmd.AddCommand(orchestrateUploadCmd)
}
