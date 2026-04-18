// internal/cli/head_agent_start.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var (
	headAgentStartProjectID      string
	headAgentStartInstallationID int
	headAgentStartRepo           string
	headAgentStartStatus         string
	headAgentStartAgent          string
	headAgentStartAgentDefault   string
	headAgentStartAgentFrontend  string
	headAgentStartAgentBackend   string
	headAgentStartMaxItems       int
	headAgentStartMaxRetries     int
	headAgentStartPollInterval   int
	headAgentStartChecksLimit    int
	headAgentStartLogFile        string
)

var headAgentStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start a head agent polling loop",
	Long: `Start a continuous polling loop that monitors a GitHub Project for new items
and automatically dispatches agents to work on them.

The loop runs indefinitely until interrupted (Ctrl+C). Each poll:
  1. Fetches project items in the specified status with no linked cmux task
  2. Dispatches agents for each new item
  3. Scans for tasks with failing quality gates and dispatches retries
  4. Sleeps for the poll interval before repeating

Agent Selection (when --agent=auto):
  1. Project field "Agent" override (explicit agent name in field)
  2. GitHub labels: "frontend"/"backend"
  3. Project fields: Area/Component = frontend/backend
  4. Default: --agent-default value

Examples:
  devsh head-agent start --project-id PVT_xxx --installation-id 12345 --repo owner/repo
  devsh head-agent start --project-id PVT_xxx --installation-id 12345 --repo owner/repo --agent auto
  devsh head-agent start --project-id PVT_xxx --installation-id 12345 --repo owner/repo --poll-interval 300
  devsh head-agent start --project-id PVT_xxx --installation-id 12345 --repo owner/repo --status "Ready" --max-items 3`,
	RunE: runHeadAgentStart,
}

// LoopStatus represents the current state of the head agent loop
type LoopStatus struct {
	Running       bool      `json:"running"`
	StartedAt     time.Time `json:"startedAt"`
	PollCount     int       `json:"pollCount"`
	LastPollAt    time.Time `json:"lastPollAt,omitempty"`
	TotalDispatched int     `json:"totalDispatched"`
	TotalRetries  int       `json:"totalRetries"`
	Errors        []string  `json:"errors,omitempty"`
}

func runHeadAgentStart(cmd *cobra.Command, args []string) error {
	if headAgentStartProjectID == "" {
		return fmt.Errorf("--project-id flag is required")
	}
	if headAgentStartInstallationID <= 0 {
		return fmt.Errorf("--installation-id flag is required")
	}
	if headAgentStartRepo == "" {
		return fmt.Errorf("--repo flag is required")
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

	// Setup signal handling for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log("Received shutdown signal, stopping...")
		cancel()
	}()

	// Print startup info
	log("Starting head agent loop")
	log("  Project ID: %s", headAgentStartProjectID)
	log("  Installation ID: %d", headAgentStartInstallationID)
	log("  Repo: %s", headAgentStartRepo)
	log("  Agent: %s", headAgentStartAgent)
	if headAgentStartAgent == "auto" {
		log("  Auto selection:")
		log("    default=%s", headAgentStartAgentDefault)
		log("    frontend=%s", headAgentStartAgentFrontend)
		log("    backend=%s", headAgentStartAgentBackend)
	}
	log("  Poll Interval: %ds", headAgentStartPollInterval)
	log("  Status Filter: %s", headAgentStartStatus)
	log("  Max Items: %d", headAgentStartMaxItems)
	log("  Max Retries: %d", headAgentStartMaxRetries)

	status := &LoopStatus{
		Running:   true,
		StartedAt: time.Now(),
	}

	// Main polling loop
	for {
		select {
		case <-ctx.Done():
			log("Shutting down...")
			status.Running = false
			if flagJSON {
				data, _ := json.MarshalIndent(status, "", "  ")
				fmt.Println(string(data))
			}
			return nil
		default:
		}

		// Run a single poll
		pollCtx, pollCancel := context.WithTimeout(ctx, 5*time.Minute)
		result := runSinglePoll(pollCtx, client)
		pollCancel()

		// Update status
		status.PollCount++
		status.LastPollAt = time.Now()
		status.TotalDispatched += result.ItemsDispatched
		status.TotalRetries += result.RetriesDispatched
		if len(result.Errors) > 0 {
			status.Errors = append(status.Errors, result.Errors...)
			// Keep only last 10 errors
			if len(status.Errors) > 10 {
				status.Errors = status.Errors[len(status.Errors)-10:]
			}
		}

		// Log poll result
		log("Poll #%d: %d items found, %d dispatched, %d retries dispatched",
			status.PollCount, result.ItemsFound, result.ItemsDispatched, result.RetriesDispatched)

		// Sleep until next poll
		log("Sleeping for %ds...", headAgentStartPollInterval)
		select {
		case <-ctx.Done():
			log("Shutting down...")
			status.Running = false
			return nil
		case <-time.After(time.Duration(headAgentStartPollInterval) * time.Second):
		}
	}
}

func runSinglePoll(ctx context.Context, client *vm.Client) *HeadAgentPollResult {
	result := &HeadAgentPollResult{}

	// Copy poll parameters from start command to poll command vars
	headAgentPollProjectID = headAgentStartProjectID
	headAgentPollInstallationID = headAgentStartInstallationID
	headAgentPollRepo = headAgentStartRepo
	headAgentPollStatus = headAgentStartStatus
	headAgentPollAgent = headAgentStartAgent
	headAgentPollAgentDefault = headAgentStartAgentDefault
	headAgentPollAgentFrontend = headAgentStartAgentFrontend
	headAgentPollAgentBackend = headAgentStartAgentBackend
	headAgentPollMaxItems = headAgentStartMaxItems
	headAgentPollMaxRetries = headAgentStartMaxRetries
	headAgentPollDryRun = false
	headAgentPollChecksLimit = headAgentStartChecksLimit

	// Poll for new items
	if err := pollNewItems(ctx, client, result); err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("poll error: %s", err))
	}

	// Poll for retry-eligible tasks
	if err := pollRetries(ctx, client, result); err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("retry poll error: %s", err))
	}

	return result
}

func log(format string, args ...interface{}) {
	timestamp := time.Now().Format(time.RFC3339)
	msg := fmt.Sprintf(format, args...)
	line := fmt.Sprintf("[%s] %s", timestamp, msg)
	fmt.Println(line)

	// Also write to log file if specified
	if headAgentStartLogFile != "" {
		f, err := os.OpenFile(headAgentStartLogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err == nil {
			defer f.Close()
			f.WriteString(line + "\n")
		}
	}
}

func init() {
	headAgentStartCmd.Flags().StringVar(&headAgentStartProjectID, "project-id", "", "GitHub Project node ID (PVT_xxx) (required)")
	headAgentStartCmd.Flags().IntVar(&headAgentStartInstallationID, "installation-id", 0, "GitHub App installation ID (required)")
	headAgentStartCmd.Flags().StringVar(&headAgentStartRepo, "repo", "", "Repository in owner/repo format (required)")
	headAgentStartCmd.Flags().StringVar(&headAgentStartStatus, "status", "Backlog", "Project status to filter by (default: Backlog)")
	headAgentStartCmd.Flags().StringVar(&headAgentStartAgent, "agent", "auto", "Agent to dispatch (or 'auto' for label/field-based selection)")
	headAgentStartCmd.Flags().StringVar(&headAgentStartAgentDefault, "agent-default", "claude/haiku-4.5", "Default agent when using auto selection")
	headAgentStartCmd.Flags().StringVar(&headAgentStartAgentFrontend, "agent-frontend", "codex/gpt-5.2-xhigh", "Agent for frontend items when using auto selection")
	headAgentStartCmd.Flags().StringVar(&headAgentStartAgentBackend, "agent-backend", "claude/opus-4.7", "Agent for backend items when using auto selection")
	headAgentStartCmd.Flags().IntVar(&headAgentStartMaxItems, "max-items", 5, "Maximum items to dispatch per poll (default: 5)")
	headAgentStartCmd.Flags().IntVar(&headAgentStartMaxRetries, "max-retries", 2, "Maximum retry attempts per task (default: 2)")
	headAgentStartCmd.Flags().IntVar(&headAgentStartPollInterval, "poll-interval", 300, "Seconds between polls (default: 300 = 5 minutes)")
	headAgentStartCmd.Flags().IntVar(&headAgentStartChecksLimit, "checks-limit", 50, "Max checks to fetch for quality gate context (default: 50)")
	headAgentStartCmd.Flags().StringVar(&headAgentStartLogFile, "log-file", "", "Log file path (in addition to stdout)")
	headAgentCmd.AddCommand(headAgentStartCmd)
}
