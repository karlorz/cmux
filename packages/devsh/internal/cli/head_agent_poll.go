// internal/cli/head_agent_poll.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/models"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var (
	headAgentPollProjectID      string
	headAgentPollInstallationID int
	headAgentPollRepo           string
	headAgentPollStatus         string
	headAgentPollAgent          string
	headAgentPollAgentDefault   string
	headAgentPollAgentFrontend  string
	headAgentPollAgentBackend   string
	headAgentPollMaxItems       int
	headAgentPollMaxRetries     int
	headAgentPollDryRun         bool
	headAgentPollChecksLimit    int
)

var headAgentPollCmd = &cobra.Command{
	Use:   "poll-once",
	Short: "Poll GitHub Project once and dispatch agents for new items",
	Long: `Poll a GitHub Project for items in the specified status (default: "Backlog")
that don't have linked cmux tasks, then create tasks and dispatch agents for each.

This is a single-run command. Use 'devsh head-agent start' for continuous polling.

Agent Selection (when --agent=auto):
  1. Project field "Agent" override (explicit agent name in field)
  2. GitHub labels: "frontend"/"backend"
  3. Project fields: Area/Component = frontend/backend
  4. Default: --agent-default value

After dispatching new items, this also scans for existing tasks with failing quality gates
and dispatches retries (up to --max-retries per task).

Examples:
  devsh head-agent poll-once --project-id PVT_xxx --installation-id 12345 --repo owner/repo
  devsh head-agent poll-once --project-id PVT_xxx --installation-id 12345 --repo owner/repo --agent auto
  devsh head-agent poll-once --project-id PVT_xxx --installation-id 12345 --repo owner/repo --status "Ready" --max-items 3
  devsh head-agent poll-once --project-id PVT_xxx --installation-id 12345 --repo owner/repo --dry-run
  devsh head-agent poll-once --project-id PVT_xxx --installation-id 12345 --repo owner/repo --json`,
	RunE: runHeadAgentPoll,
}

// HeadAgentPollResult represents the result of a single poll operation
type HeadAgentPollResult struct {
	ItemsFound        int              `json:"itemsFound"`
	ItemsDispatched   int              `json:"itemsDispatched"`
	RetriesFound      int              `json:"retriesFound"`
	RetriesDispatched int              `json:"retriesDispatched"`
	Dispatched        []DispatchedItem `json:"dispatched,omitempty"`
	Retries           []RetryResult    `json:"retries,omitempty"`
	Errors            []string         `json:"errors,omitempty"`
}

// DispatchedItem represents a dispatched project item
type DispatchedItem struct {
	ItemID string `json:"itemId"`
	Title  string `json:"title"`
	Agent  string `json:"agent"`
	TaskID string `json:"taskId,omitempty"`
	Error  string `json:"error,omitempty"`
}

// RetryResult represents a retry attempt
type RetryResult struct {
	TaskID     string `json:"taskId"`
	Dispatched bool   `json:"dispatched"`
	Reason     string `json:"reason,omitempty"`
	Error      string `json:"error,omitempty"`
}

func runHeadAgentPoll(cmd *cobra.Command, args []string) error {
	if headAgentPollProjectID == "" {
		return fmt.Errorf("--project-id flag is required")
	}
	if headAgentPollInstallationID <= 0 {
		return fmt.Errorf("--installation-id flag is required")
	}
	if headAgentPollRepo == "" {
		return fmt.Errorf("--repo flag is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
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

	result := &HeadAgentPollResult{}

	// Poll for new items
	if err := pollNewItems(ctx, client, result); err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("poll error: %s", err))
	}

	// Poll for retry-eligible tasks
	if err := pollRetries(ctx, client, result); err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("retry poll error: %s", err))
	}

	// Output
	if flagJSON {
		data, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(data))
		return nil
	}

	// Human-readable output
	fmt.Printf("Poll complete: %d items found, %d dispatched\n", result.ItemsFound, result.ItemsDispatched)
	if result.RetriesFound > 0 {
		fmt.Printf("Retries: %d eligible, %d dispatched\n", result.RetriesFound, result.RetriesDispatched)
	}

	for _, d := range result.Dispatched {
		if d.Error != "" {
			fmt.Printf("  FAILED: %s - %s\n", d.ItemID, d.Error)
		} else if d.TaskID != "" {
			fmt.Printf("  Created task %s for item %s (agent: %s)\n", d.TaskID, d.ItemID, d.Agent)
		} else {
			fmt.Printf("  Would dispatch: %s (agent: %s) [dry-run]\n", d.ItemID, d.Agent)
		}
	}

	for _, r := range result.Retries {
		if r.Error != "" {
			fmt.Printf("  RETRY FAILED: %s - %s\n", r.TaskID, r.Error)
		} else if r.Dispatched {
			fmt.Printf("  Retried task %s\n", r.TaskID)
		} else {
			fmt.Printf("  Retry skipped: %s - %s\n", r.TaskID, r.Reason)
		}
	}

	if len(result.Errors) > 0 {
		fmt.Println("\nErrors:")
		for _, e := range result.Errors {
			fmt.Printf("  - %s\n", e)
		}
	}

	return nil
}

func pollNewItems(ctx context.Context, client *vm.Client, result *HeadAgentPollResult) error {
	if !flagJSON {
		fmt.Printf("Polling project %s for items with status '%s' and no linked task...\n",
			headAgentPollProjectID, headAgentPollStatus)
	}

	// Get project items with filters
	itemsResult, err := client.GetProjectItems(ctx, vm.GetProjectItemsOptions{
		ProjectID:      headAgentPollProjectID,
		InstallationID: headAgentPollInstallationID,
		First:          headAgentPollMaxItems,
		Status:         headAgentPollStatus,
		NoLinkedTask:   true,
	})
	if err != nil {
		return fmt.Errorf("failed to get project items: %w", err)
	}

	// Client-side filter for status and no-linked-task (in case server doesn't support)
	tasksResult, err := client.ListTasks(ctx, false)
	if err != nil {
		return fmt.Errorf("failed to list tasks: %w", err)
	}
	linkedItemIds := make(map[string]bool)
	for _, task := range tasksResult.Tasks {
		if task.GithubProjectItemId != "" {
			linkedItemIds[task.GithubProjectItemId] = true
		}
	}

	var filteredItems []vm.ProjectItem
	for _, item := range itemsResult.Items {
		// Status filter
		if headAgentPollStatus != "" {
			itemStatus := ""
			if sv, ok := item.FieldValues["Status"]; ok {
				if s, ok := sv.(string); ok {
					itemStatus = s
				}
			}
			if !strings.EqualFold(itemStatus, headAgentPollStatus) {
				continue
			}
		}

		// No linked task filter
		if linkedItemIds[item.ID] {
			continue
		}

		filteredItems = append(filteredItems, item)
		if len(filteredItems) >= headAgentPollMaxItems {
			break
		}
	}

	result.ItemsFound = len(filteredItems)

	if !flagJSON {
		fmt.Printf("Found %d item(s) ready for dispatch\n", result.ItemsFound)
	}

	// Dispatch agents for each item
	for _, item := range filteredItems {
		dispatched := dispatchItem(ctx, client, item)
		result.Dispatched = append(result.Dispatched, dispatched)
		if dispatched.TaskID != "" {
			result.ItemsDispatched++
		}
	}

	return nil
}

func dispatchItem(ctx context.Context, client *vm.Client, item vm.ProjectItem) DispatchedItem {
	title := "(untitled)"
	if item.Content != nil {
		title = item.Content.Title
	}

	// Select agent
	agent := selectAgentForItem(item)

	dispatched := DispatchedItem{
		ItemID: item.ID,
		Title:  title,
		Agent:  agent,
	}

	if headAgentPollDryRun {
		return dispatched
	}

	// Build prompt from item
	var prompt strings.Builder
	if item.Content != nil {
		prompt.WriteString(item.Content.Title)
		if item.Content.Body != nil && strings.TrimSpace(*item.Content.Body) != "" {
			prompt.WriteString("\n\n")
			prompt.WriteString(*item.Content.Body)
		}
	}

	// Create task
	taskResult, err := client.CreateTask(ctx, vm.CreateTaskOptions{
		Prompt:                      prompt.String(),
		Repository:                  headAgentPollRepo,
		BaseBranch:                  "main",
		Agents:                      []string{agent},
		GithubProjectId:             headAgentPollProjectID,
		GithubProjectItemId:         item.ID,
		GithubProjectInstallationId: headAgentPollInstallationID,
	})
	if err != nil {
		dispatched.Error = err.Error()
		return dispatched
	}

	dispatched.TaskID = taskResult.TaskID

	// Start the agent
	if len(taskResult.TaskRuns) > 0 {
		taskRunIDs := make([]string, 0, len(taskResult.TaskRuns))
		selectedAgents := make([]string, 0, len(taskResult.TaskRuns))
		for _, run := range taskResult.TaskRuns {
			taskRunIDs = append(taskRunIDs, run.TaskRunID)
			selectedAgents = append(selectedAgents, run.AgentName)
		}

		repoURL := fmt.Sprintf("https://github.com/%s", headAgentPollRepo)
		_, err := client.StartTaskAgents(ctx, vm.StartTaskAgentsOptions{
			TaskID:          taskResult.TaskID,
			TaskDescription: prompt.String(),
			ProjectFullName: headAgentPollRepo,
			RepoURL:         repoURL,
			Branch:          "main",
			TaskRunIDs:      taskRunIDs,
			SelectedAgents:  selectedAgents,
			IsCloudMode:     true,
		})
		if err != nil {
			dispatched.Error = fmt.Sprintf("task created but agent start failed: %s", err)
		}
	}

	return dispatched
}

func selectAgentForItem(item vm.ProjectItem) string {
	// If explicit agent specified, use it
	if headAgentPollAgent != "" && headAgentPollAgent != "auto" {
		return headAgentPollAgent
	}

	// Auto selection priority:
	// 1. Project field "Agent" override
	if agentField, ok := item.FieldValues["Agent"]; ok {
		if agentStr, ok := agentField.(string); ok && strings.TrimSpace(agentStr) != "" {
			return strings.TrimSpace(agentStr)
		}
	}

	// 2. GitHub labels
	if item.Content != nil {
		labels := make([]string, 0)
		// Labels might be in content.labels as []interface{} or []string
		if labelsRaw, ok := item.FieldValues["Labels"]; ok {
			if labelsSlice, ok := labelsRaw.([]interface{}); ok {
				for _, l := range labelsSlice {
					if lStr, ok := l.(string); ok {
						labels = append(labels, strings.ToLower(lStr))
					}
				}
			}
		}

		for _, label := range labels {
			if label == "frontend" || label == "ui" || label == "react" || label == "vue" || label == "css" {
				return headAgentPollAgentFrontend
			}
			if label == "backend" || label == "api" || label == "server" || label == "database" {
				return headAgentPollAgentBackend
			}
		}
	}

	// 3. Project fields: Area/Component
	for _, fieldName := range []string{"Area", "Component"} {
		if fieldVal, ok := item.FieldValues[fieldName]; ok {
			if fieldStr, ok := fieldVal.(string); ok {
				fieldLower := strings.ToLower(fieldStr)
				if fieldLower == "frontend" || fieldLower == "ui" {
					return headAgentPollAgentFrontend
				}
				if fieldLower == "backend" || fieldLower == "api" {
					return headAgentPollAgentBackend
				}
			}
		}
	}

	// 4. Default
	return headAgentPollAgentDefault
}

func pollRetries(ctx context.Context, client *vm.Client, result *HeadAgentPollResult) error {
	if !flagJSON {
		fmt.Println("Scanning for tasks with failing quality gates...")
	}

	// Get tasks with linked GitHub project items
	tasksResult, err := client.ListTasks(ctx, false)
	if err != nil {
		return fmt.Errorf("failed to list tasks: %w", err)
	}

	for _, task := range tasksResult.Tasks {
		// Only check tasks that have:
		// 1. A linked GitHub project item
		// 2. A PR URL
		// 3. Not merged/closed
		if task.GithubProjectItemId == "" {
			continue
		}
		if task.PullRequestURL == "" || task.PullRequestURL == "pending" {
			continue
		}
		if task.MergeStatus == "pr_merged" || task.MergeStatus == "pr_closed" {
			continue
		}

		retryResult := RetryResult{TaskID: task.ID}
		result.RetriesFound++

		if headAgentPollDryRun {
			retryResult.Reason = "dry-run"
			result.Retries = append(result.Retries, retryResult)
			continue
		}

		// Check quality gate and retry eligibility
		qg, err := client.GetTaskQualityGate(ctx, task.ID, headAgentPollMaxRetries, headAgentPollChecksLimit)
		if err != nil {
			retryResult.Error = err.Error()
			result.Retries = append(result.Retries, retryResult)
			continue
		}

		if !qg.Retry.ShouldRetry {
			reason := "not eligible"
			switch {
			case qg.Retry.HasInFlightRun:
				reason = "in-flight run exists"
			case qg.QualityGate.HasAnyRunning:
				reason = "checks still running"
			case !qg.QualityGate.HasAnyFailure:
				reason = "no failures detected"
			case qg.Retry.Attempted >= qg.Retry.MaxRetries:
				reason = fmt.Sprintf("max retries reached (%d/%d)", qg.Retry.Attempted, qg.Retry.MaxRetries)
			case qg.Retry.RetryBranch == nil:
				reason = "no retry branch"
			}
			retryResult.Reason = reason
			result.Retries = append(result.Retries, retryResult)
			continue
		}

		// Fetch full task details to get task runs (for agent name)
		taskDetail, err := client.GetTask(ctx, task.ID)
		if err != nil {
			retryResult.Error = fmt.Sprintf("failed to get task details: %s", err)
			result.Retries = append(result.Retries, retryResult)
			continue
		}

		// Dispatch retry
		agentName := headAgentPollAgent
		if agentName == "" || agentName == "auto" {
			// Use the agent from the previous run
			for _, run := range taskDetail.TaskRuns {
				if run.Agent != "" {
					agentName = run.Agent
					break
				}
				if run.AgentName != "" {
					agentName = run.AgentName
					break
				}
			}
			if agentName == "" {
				agentName = headAgentPollAgentDefault
			}
		}

		baseBranch := taskDetail.BaseBranch
		if baseBranch == "" {
			baseBranch = "main"
		}

		attempt := qg.Retry.Attempted + 1
		retryPrompt := strings.TrimSpace(taskDetail.Prompt)
		retryPrompt += fmt.Sprintf("\n\n<!-- cmux-head-agent-retry attempt=%d -->\n\n%s\n", attempt, qg.Retry.Context)

		repoURL := fmt.Sprintf("https://github.com/%s", taskDetail.Repository)
		_, err = client.StartTaskAgents(ctx, vm.StartTaskAgentsOptions{
			TaskID:          task.ID,
			TaskDescription: retryPrompt,
			ProjectFullName: taskDetail.Repository,
			RepoURL:         repoURL,
			Branch:          baseBranch,
			BranchNames:     []string{derefString(qg.Retry.RetryBranch, "")},
			SelectedAgents:  []string{agentName},
			IsCloudMode:     true,
		})
		if err != nil {
			retryResult.Error = err.Error()
		} else {
			retryResult.Dispatched = true
			result.RetriesDispatched++
		}

		result.Retries = append(result.Retries, retryResult)
	}

	return nil
}

func init() {
	headAgentPollCmd.Flags().StringVar(&headAgentPollProjectID, "project-id", "", "GitHub Project node ID (PVT_xxx) (required)")
	headAgentPollCmd.Flags().IntVar(&headAgentPollInstallationID, "installation-id", 0, "GitHub App installation ID (required)")
	headAgentPollCmd.Flags().StringVar(&headAgentPollRepo, "repo", "", "Repository in owner/repo format (required)")
	headAgentPollCmd.Flags().StringVar(&headAgentPollStatus, "status", "Backlog", "Project status to filter by (default: Backlog)")
	headAgentPollCmd.Flags().StringVar(&headAgentPollAgent, "agent", "auto", "Agent to dispatch (or 'auto' for label/field-based selection)")
	headAgentPollCmd.Flags().StringVar(&headAgentPollAgentDefault, "agent-default", "claude/haiku-4.5", "Default agent when using auto selection")
	headAgentPollCmd.Flags().StringVar(&headAgentPollAgentFrontend, "agent-frontend", "codex/gpt-5.2-xhigh", "Agent for frontend items when using auto selection")
	headAgentPollCmd.Flags().StringVar(&headAgentPollAgentBackend, "agent-backend", models.RecommendedClaudeAgent, "Agent for backend items when using auto selection")
	headAgentPollCmd.Flags().IntVar(&headAgentPollMaxItems, "max-items", 5, "Maximum items to dispatch per poll (default: 5)")
	headAgentPollCmd.Flags().IntVar(&headAgentPollMaxRetries, "max-retries", 2, "Maximum retry attempts per task (default: 2)")
	headAgentPollCmd.Flags().BoolVar(&headAgentPollDryRun, "dry-run", false, "Show what would be dispatched without actually dispatching")
	headAgentPollCmd.Flags().IntVar(&headAgentPollChecksLimit, "checks-limit", 50, "Max checks to fetch for quality gate context (default: 50)")
	headAgentCmd.AddCommand(headAgentPollCmd)
}
