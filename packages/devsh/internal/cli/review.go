// internal/cli/review.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var (
	reviewBase        string
	reviewConcurrency int
	reviewModel       string
	reviewOutput      string
	reviewVerbose     bool
	reviewJSON        bool
)

var reviewCmd = &cobra.Command{
	Use:   "review [pr-number|branch]",
	Short: "Generate AI-powered code review heatmap for PR changes",
	Long: `Generate an AI-powered heatmap showing which lines in a PR need human review attention.

This command analyzes the diff between the current branch and a base branch (default: origin/main),
using AI to score each changed line by review priority. High-priority lines are those with
potential bugs, security issues, or breaking changes.

The heatmap output includes:
- Per-line review priority scores (0-10)
- Explanations for high-priority lines
- File-level risk scores
- Overall summary with focus areas

Requires OPENAI_API_KEY environment variable to be set.

Examples:
  devsh review                       # Review changes against origin/main
  devsh review -b main               # Review changes against local main
  devsh review -v                    # Verbose output showing progress
  devsh review -o ./review-output    # Custom output directory
  devsh review --json                # Output summary as JSON
  devsh review -m gpt-4o             # Use GPT-4o model`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		// Check for OPENAI_API_KEY
		if os.Getenv("OPENAI_API_KEY") == "" {
			return fmt.Errorf("OPENAI_API_KEY environment variable is required")
		}

		// If a PR number is given, we could fetch the PR diff
		// For now, we use the local git diff
		if len(args) > 0 {
			// TODO: Support `gh pr diff` for PR numbers
			fmt.Fprintf(os.Stderr, "Note: PR number argument not yet supported, using local git diff\n")
		}

		// Build args for pr-heatmap
		heatmapArgs := []string{}
		if reviewBase != "" {
			heatmapArgs = append(heatmapArgs, "-b", reviewBase)
		}
		if reviewConcurrency > 0 {
			heatmapArgs = append(heatmapArgs, "-c", fmt.Sprintf("%d", reviewConcurrency))
		}
		if reviewModel != "" {
			heatmapArgs = append(heatmapArgs, "-m", reviewModel)
		}
		if reviewOutput != "" {
			heatmapArgs = append(heatmapArgs, "-o", reviewOutput)
		}
		if reviewVerbose {
			heatmapArgs = append(heatmapArgs, "-v")
		}

		// Try to find pr-heatmap in various locations
		heatmapBin := findPRHeatmapBinary()
		if heatmapBin == "" {
			// Fall back to running via bun from the package
			return runHeatmapViaBun(heatmapArgs)
		}

		// Run pr-heatmap binary
		execCmd := exec.Command(heatmapBin, heatmapArgs...)
		execCmd.Stdout = os.Stdout
		execCmd.Stderr = os.Stderr
		execCmd.Env = os.Environ()

		return execCmd.Run()
	},
}

func findPRHeatmapBinary() string {
	// Check common locations
	locations := []string{
		"pr-heatmap",                           // PATH
		"./node_modules/.bin/pr-heatmap",       // Local node_modules
		"../pr-heatmap/bin/cli.js",             // Sibling package
	}

	for _, loc := range locations {
		if path, err := exec.LookPath(loc); err == nil {
			return path
		}
	}

	return ""
}

func runHeatmapViaBun(args []string) error {
	// Find the pr-heatmap package relative to devsh
	// This assumes we're in a monorepo structure
	possiblePaths := []string{
		"packages/pr-heatmap/src/cli.ts",
		"../pr-heatmap/src/cli.ts",
		"../../packages/pr-heatmap/src/cli.ts",
	}

	var cliPath string
	for _, p := range possiblePaths {
		if _, err := os.Stat(p); err == nil {
			cliPath = p
			break
		}
	}

	// Also check from workspace root
	if cwd, err := os.Getwd(); err == nil {
		// Walk up to find packages/pr-heatmap
		dir := cwd
		for i := 0; i < 5; i++ {
			candidate := filepath.Join(dir, "packages", "pr-heatmap", "src", "cli.ts")
			if _, err := os.Stat(candidate); err == nil {
				cliPath = candidate
				break
			}
			dir = filepath.Dir(dir)
		}
	}

	if cliPath == "" {
		return fmt.Errorf("pr-heatmap package not found. Install it with: cd packages/pr-heatmap && bun install")
	}

	// Run via bun
	bunArgs := append([]string{"run", cliPath}, args...)
	execCmd := exec.Command("bun", bunArgs...)
	execCmd.Stdout = os.Stdout
	execCmd.Stderr = os.Stderr
	execCmd.Env = os.Environ()

	return execCmd.Run()
}

// ReviewSummary is returned when --json flag is used
type ReviewSummary struct {
	Base           string   `json:"base"`
	Head           string   `json:"head"`
	TotalFiles     int      `json:"totalFiles"`
	HighRiskFiles  []string `json:"highRiskFiles"`
	TopFocusAreas  []string `json:"topFocusAreas"`
}

func printReviewSummaryJSON(outputDir string) error {
	summaryPath := filepath.Join(outputDir, "summary.json")
	data, err := os.ReadFile(summaryPath)
	if err != nil {
		return err
	}

	// Parse and re-output just the summary part
	var full map[string]any
	if err := json.Unmarshal(data, &full); err != nil {
		return err
	}

	summary := ReviewSummary{}
	if base, ok := full["base"].(string); ok {
		summary.Base = base
	}
	if head, ok := full["head"].(string); ok {
		summary.Head = head
	}
	if summaryMap, ok := full["summary"].(map[string]any); ok {
		if total, ok := summaryMap["totalFiles"].(float64); ok {
			summary.TotalFiles = int(total)
		}
		if highRisk, ok := summaryMap["highRiskFiles"].([]any); ok {
			for _, f := range highRisk {
				if s, ok := f.(string); ok {
					summary.HighRiskFiles = append(summary.HighRiskFiles, s)
				}
			}
		}
		if focus, ok := summaryMap["topFocusAreas"].([]any); ok {
			for _, f := range focus {
				if s, ok := f.(string); ok {
					summary.TopFocusAreas = append(summary.TopFocusAreas, s)
				}
			}
		}
	}

	out, _ := json.MarshalIndent(summary, "", "  ")
	fmt.Println(string(out))
	return nil
}

func init() {
	reviewCmd.Flags().StringVarP(&reviewBase, "base", "b", "origin/main", "Base ref to diff against")
	reviewCmd.Flags().IntVarP(&reviewConcurrency, "concurrency", "c", 3, "Number of parallel AI calls")
	reviewCmd.Flags().StringVarP(&reviewModel, "model", "m", "gpt-4o-mini", "OpenAI model to use")
	reviewCmd.Flags().StringVarP(&reviewOutput, "output", "o", "./heatmap-output", "Output directory for heatmap files")
	reviewCmd.Flags().BoolVarP(&reviewVerbose, "verbose", "v", false, "Show progress messages")
	reviewCmd.Flags().BoolVar(&reviewJSON, "json", false, "Output summary as JSON")

	// Mark as hidden until fully tested
	reviewCmd.Hidden = true

	rootCmd.AddCommand(reviewCmd)
}

// Helper to check if a string looks like a PR number
func isPRNumber(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
}

// Helper to get PR diff via gh CLI (future enhancement)
func getPRDiff(prNumber string) (string, error) {
	cmd := exec.Command("gh", "pr", "diff", prNumber)
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get PR diff: %w", err)
	}
	return strings.TrimSpace(string(output)), nil
}
