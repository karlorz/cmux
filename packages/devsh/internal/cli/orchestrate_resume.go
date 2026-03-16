// internal/cli/orchestrate_resume.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/karlorz/devsh/internal/auth"
	"github.com/karlorz/devsh/internal/vm"
	"github.com/spf13/cobra"
)

var orchestrateResumeCmd = &cobra.Command{
	Use:   "resume <task-id>",
	Short: "Get provider session for resuming a task",
	Long: `Retrieve the provider session binding for a task to enable session resume.

This command fetches the stored session information including provider-specific
session IDs (e.g., Claude session ID, Codex thread ID) that can be used to
reconnect to an existing agent session.

Examples:
  devsh orchestrate resume k97xcv2...
  devsh orchestrate resume <task-id> --json`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		taskID := args[0]

		teamSlug, err := auth.GetTeamSlug()
		if err != nil {
			return fmt.Errorf("failed to get team: %w", err)
		}

		client, err := vm.NewClient()
		if err != nil {
			return fmt.Errorf("failed to create client: %w", err)
		}
		client.SetTeamSlug(teamSlug)

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		session, err := client.GetProviderSession(ctx, taskID)
		if err != nil {
			return fmt.Errorf("failed to get provider session: %w", err)
		}

		if flagJSON {
			data, _ := json.MarshalIndent(session, "", "  ")
			fmt.Println(string(data))
			return nil
		}

		printProviderSession(session)
		return nil
	},
}

func printProviderSession(session *vm.ProviderSession) {
	fmt.Println("Provider Session")
	fmt.Println("================")
	fmt.Printf("  Task ID:         %s\n", session.TaskID)
	fmt.Printf("  Orchestration:   %s\n", session.OrchestrationID)
	fmt.Printf("  Provider:        %s\n", session.Provider)
	fmt.Printf("  Agent:           %s\n", session.AgentName)
	fmt.Printf("  Mode:            %s\n", session.Mode)
	fmt.Printf("  Status:          %s\n", session.Status)

	if session.ProviderSessionID != nil && *session.ProviderSessionID != "" {
		fmt.Printf("  Session ID:      %s\n", *session.ProviderSessionID)
	}
	if session.ProviderThreadID != nil && *session.ProviderThreadID != "" {
		fmt.Printf("  Thread ID:       %s\n", *session.ProviderThreadID)
	}
	if session.ReplyChannel != nil && *session.ReplyChannel != "" {
		fmt.Printf("  Reply Channel:   %s\n", *session.ReplyChannel)
	}
	if session.LastActiveAt != nil && *session.LastActiveAt > 0 {
		fmt.Printf("  Last Active:     %s\n", time.Unix(*session.LastActiveAt/1000, 0).Format(time.RFC3339))
	}

	// Print resume instructions based on provider
	fmt.Println()
	fmt.Println("Resume Instructions")
	fmt.Println("-------------------")
	switch session.Provider {
	case "claude":
		if session.ProviderSessionID != nil && *session.ProviderSessionID != "" {
			fmt.Printf("  Claude session: claude --session-id %s\n", *session.ProviderSessionID)
		} else {
			fmt.Println("  No Claude session ID stored - session may not be resumable")
		}
	case "codex":
		if session.ProviderThreadID != nil && *session.ProviderThreadID != "" {
			fmt.Printf("  Codex thread: codex --thread-id %s\n", *session.ProviderThreadID)
		} else {
			fmt.Println("  No Codex thread ID stored - session may not be resumable")
		}
	default:
		fmt.Printf("  Provider '%s' resume not yet supported\n", session.Provider)
	}
}

func init() {
	orchestrateCmd.AddCommand(orchestrateResumeCmd)
}
