// internal/cli/orchestrate_local_clean.go
package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/spf13/cobra"
)

var (
	cleanLocalDays    int
	cleanLocalDryRun  bool
	cleanLocalAll     bool
	cleanLocalStatus  string
)

var orchestrateCleanLocalCmd = &cobra.Command{
	Use:   "clean-local",
	Short: "Clean up old local orchestration runs",
	Long: `Remove old local orchestration runs from ~/.devsh/orchestrations/.

By default, removes runs older than 7 days. Use --days to change the threshold.
Use --dry-run to preview what would be deleted without actually removing files.

Examples:
  devsh orchestrate clean-local                 # Remove runs older than 7 days
  devsh orchestrate clean-local --days 30       # Remove runs older than 30 days
  devsh orchestrate clean-local --dry-run       # Preview without deleting
  devsh orchestrate clean-local --all           # Remove all runs
  devsh orchestrate clean-local --status failed # Remove only failed runs`,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseDir := getLocalRunsDir()

		// Check if directory exists
		if _, err := os.Stat(baseDir); os.IsNotExist(err) {
			if !flagJSON {
				fmt.Printf("No local runs found in %s\n", baseDir)
			}
			return nil
		}

		// Read all run directories
		entries, err := os.ReadDir(baseDir)
		if err != nil {
			return fmt.Errorf("failed to read runs directory: %w", err)
		}

		var toDelete []cleanCandidate
		var toKeep int
		cutoff := time.Now().AddDate(0, 0, -cleanLocalDays)

		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}

			runDir := filepath.Join(baseDir, entry.Name())
			summary, err := loadRunSummary(runDir)
			if err != nil {
				// Invalid run directory - mark for cleanup
				toDelete = append(toDelete, cleanCandidate{
					runDir:  runDir,
					orchID:  entry.Name(),
					reason:  "invalid",
					status:  "unknown",
					startAt: time.Time{},
				})
				continue
			}

			// Parse start time
			startTime, err := time.Parse(time.RFC3339, summary.StartedAt)
			if err != nil {
				startTime = time.Time{}
			}

			// Check if should be deleted
			shouldDelete := false
			reason := ""

			if cleanLocalAll {
				shouldDelete = true
				reason = "all"
			} else if cleanLocalStatus != "" && summary.Status == cleanLocalStatus {
				shouldDelete = true
				reason = fmt.Sprintf("status=%s", cleanLocalStatus)
			} else if !startTime.IsZero() && startTime.Before(cutoff) {
				shouldDelete = true
				reason = fmt.Sprintf("older than %d days", cleanLocalDays)
			}

			if shouldDelete {
				toDelete = append(toDelete, cleanCandidate{
					runDir:  runDir,
					orchID:  summary.OrchestrationID,
					reason:  reason,
					status:  summary.Status,
					startAt: startTime,
				})
			} else {
				toKeep++
			}
		}

		// Sort by start time (oldest first)
		sort.Slice(toDelete, func(i, j int) bool {
			return toDelete[i].startAt.Before(toDelete[j].startAt)
		})

		if len(toDelete) == 0 {
			if !flagJSON {
				fmt.Printf("No runs to clean up (keeping %d runs)\n", toKeep)
			}
			return nil
		}

		// Preview mode
		if cleanLocalDryRun {
			fmt.Printf("[DRY RUN] Would delete %d runs:\n", len(toDelete))
			for _, c := range toDelete {
				age := ""
				if !c.startAt.IsZero() {
					age = fmt.Sprintf(" (%s old)", formatAge(c.startAt))
				}
				fmt.Printf("  - %s [%s] %s%s\n", c.orchID, c.status, c.reason, age)
			}
			fmt.Printf("\nRuns to keep: %d\n", toKeep)
			fmt.Printf("\nRun without --dry-run to delete.\n")
			return nil
		}

		// Actually delete
		deleted := 0
		var deleteErrors []string
		for _, c := range toDelete {
			if err := os.RemoveAll(c.runDir); err != nil {
				deleteErrors = append(deleteErrors, fmt.Sprintf("%s: %v", c.orchID, err))
			} else {
				deleted++
				if flagVerbose && !flagJSON {
					fmt.Printf("Deleted: %s\n", c.orchID)
				}
			}
		}

		if !flagJSON {
			fmt.Printf("Cleaned up %d runs, keeping %d\n", deleted, toKeep)
			if len(deleteErrors) > 0 {
				fmt.Printf("Errors (%d):\n", len(deleteErrors))
				for _, e := range deleteErrors {
					fmt.Printf("  - %s\n", e)
				}
			}
		}

		return nil
	},
}

type cleanCandidate struct {
	runDir  string
	orchID  string
	reason  string
	status  string
	startAt time.Time
}

func formatAge(t time.Time) string {
	diff := time.Since(t)
	if diff < 24*time.Hour {
		return fmt.Sprintf("%dh", int(diff.Hours()))
	}
	return fmt.Sprintf("%dd", int(diff.Hours()/24))
}

func init() {
	orchestrateCleanLocalCmd.Flags().IntVar(&cleanLocalDays, "days", 7, "Remove runs older than this many days")
	orchestrateCleanLocalCmd.Flags().BoolVar(&cleanLocalDryRun, "dry-run", false, "Preview what would be deleted without removing")
	orchestrateCleanLocalCmd.Flags().BoolVar(&cleanLocalAll, "all", false, "Remove all runs regardless of age")
	orchestrateCleanLocalCmd.Flags().StringVar(&cleanLocalStatus, "status", "", "Remove only runs with this status (completed, failed, running)")
	orchestrateCmd.AddCommand(orchestrateCleanLocalCmd)
}
