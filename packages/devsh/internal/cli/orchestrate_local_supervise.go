// internal/cli/orchestrate_local_supervise.go
package cli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

var (
	superviseExecutor   string
	superviseSupervisor string
	superviseMaxRounds  int
	superviseWorkspace  string
	superviseTimeout    string
	supervisePersist    bool
)

// SupervisionState tracks the supervision loop state
type SupervisionState struct {
	OrchestrationID string           `json:"orchestrationId"`
	Status          string           `json:"status"`
	Supervisor      string           `json:"supervisor"`
	Executor        string           `json:"executor"`
	Prompt          string           `json:"prompt"`
	Workspace       string           `json:"workspace"`
	Rounds          []SuperviseRound `json:"rounds"`
	StartedAt       string           `json:"startedAt"`
	CompletedAt     string           `json:"completedAt,omitempty"`
	DurationMs      int64            `json:"durationMs,omitempty"`
	FinalVerdict    string           `json:"finalVerdict,omitempty"`
	Events          []LocalEvent     `json:"events"`
}

// SuperviseRound represents one iteration of the supervision loop
type SuperviseRound struct {
	Round            int    `json:"round"`
	ExecutorOutput   string `json:"executorOutput"`
	SupervisorReview string `json:"supervisorReview"`
	Verdict          string `json:"verdict"` // "approved", "rejected", "continue"
	Feedback         string `json:"feedback,omitempty"`
	Timestamp        string `json:"timestamp"`
}

var orchestrateSuperviseLocalCmd = &cobra.Command{
	Use:   "supervise-local <prompt>",
	Short: "Run a supervised local task with executor and supervisor agents",
	Long: `Run a local task with explicit supervisor/executor separation.

The executor agent works on the task while the supervisor agent reviews
the output and decides whether to approve, reject, or request changes.

This implements a TaskCaptain-style review loop where:
1. Executor works on the prompt
2. Supervisor reviews executor's output
3. If approved: task completes
4. If rejected: supervisor provides feedback for next round
5. Loop continues until approved or max rounds reached

Examples:
  devsh orchestrate supervise-local "Fix the authentication bug" \
    --executor codex/gpt-5.1-codex-mini \
    --supervisor claude/haiku-4.5

  devsh orchestrate supervise-local "Refactor the API layer" \
    --executor claude/sonnet-4.5 \
    --supervisor claude/opus-4.7 \
    --max-rounds 3 \
    --persist`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		prompt := args[0]

		// Resolve workspace
		workspace := superviseWorkspace
		if workspace == "" {
			var err error
			workspace, err = os.Getwd()
			if err != nil {
				return fmt.Errorf("failed to get working directory: %w", err)
			}
		}
		absWorkspace, err := filepath.Abs(workspace)
		if err != nil {
			return fmt.Errorf("failed to resolve workspace: %w", err)
		}

		// Generate orchestration ID
		orchID := fmt.Sprintf("supervise_%s", time.Now().Format("20060102_150405"))

		// Initialize state
		startTime := time.Now()
		state := &SupervisionState{
			OrchestrationID: orchID,
			Status:          "running",
			Supervisor:      superviseSupervisor,
			Executor:        superviseExecutor,
			Prompt:          prompt,
			Workspace:       absWorkspace,
			Rounds:          []SuperviseRound{},
			StartedAt:       startTime.UTC().Format(time.RFC3339),
			Events:          []LocalEvent{},
		}

		// Create run directory if persist mode
		var runDir string
		if supervisePersist {
			runDir = filepath.Join(localRunDir, orchID)
			if err := os.MkdirAll(runDir, 0755); err != nil {
				return fmt.Errorf("failed to create run directory: %w", err)
			}
			// Write PID file
			if err := writePidFile(runDir); err != nil {
				fmt.Printf("Warning: failed to write pid file: %v\n", err)
			}
			defer removePidFile(runDir)
		}

		state.addSuperviseEvent("supervision_started", fmt.Sprintf("Starting supervised task with %s executor and %s supervisor", superviseExecutor, superviseSupervisor))

		if !flagJSON {
			fmt.Printf("Supervised Local Task: %s\n", orchID)
			fmt.Printf("  Executor: %s\n", superviseExecutor)
			fmt.Printf("  Supervisor: %s\n", superviseSupervisor)
			fmt.Printf("  Max rounds: %d\n", superviseMaxRounds)
			fmt.Printf("  Workspace: %s\n", absWorkspace)
			fmt.Println()
		}

		// Parse timeout
		timeout, err := time.ParseDuration(superviseTimeout)
		if err != nil {
			return fmt.Errorf("invalid timeout: %w", err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()

		// Run supervision loop
		var finalErr error
		currentPrompt := prompt

		for round := 1; round <= superviseMaxRounds; round++ {
			if ctx.Err() != nil {
				finalErr = ctx.Err()
				break
			}

			state.addSuperviseEvent("round_started", fmt.Sprintf("Starting round %d/%d", round, superviseMaxRounds))

			if !flagJSON {
				fmt.Printf("=== Round %d/%d ===\n\n", round, superviseMaxRounds)
			}

			// Run executor
			if !flagJSON {
				fmt.Printf("[Executor: %s]\n", superviseExecutor)
			}
			executorOutput, err := runAgentCaptureOutput(ctx, superviseExecutor, currentPrompt, absWorkspace)
			if err != nil {
				state.addSuperviseEvent("executor_failed", err.Error())
				finalErr = fmt.Errorf("executor failed: %w", err)
				break
			}

			// Build supervisor prompt
			supervisorPrompt := buildSupervisorPrompt(prompt, executorOutput, round)

			// Run supervisor
			if !flagJSON {
				fmt.Printf("\n[Supervisor: %s]\n", superviseSupervisor)
			}
			supervisorOutput, err := runAgentCaptureOutput(ctx, superviseSupervisor, supervisorPrompt, absWorkspace)
			if err != nil {
				state.addSuperviseEvent("supervisor_failed", err.Error())
				finalErr = fmt.Errorf("supervisor failed: %w", err)
				break
			}

			// Parse supervisor verdict
			verdict, feedback := parseSupervisorVerdict(supervisorOutput)

			roundState := SuperviseRound{
				Round:            round,
				ExecutorOutput:   truncateOutput(executorOutput, 10000),
				SupervisorReview: truncateOutput(supervisorOutput, 5000),
				Verdict:          verdict,
				Feedback:         feedback,
				Timestamp:        time.Now().UTC().Format(time.RFC3339),
			}
			state.Rounds = append(state.Rounds, roundState)

			state.addSuperviseEvent("round_completed", fmt.Sprintf("Round %d verdict: %s", round, verdict))

			if !flagJSON {
				fmt.Printf("\nVerdict: %s\n", strings.ToUpper(verdict))
				if feedback != "" {
					fmt.Printf("Feedback: %s\n", feedback)
				}
				fmt.Println()
			}

			if verdict == "approved" {
				state.FinalVerdict = "approved"
				state.Status = "completed"
				break
			}

			if verdict == "rejected" && round == superviseMaxRounds {
				state.FinalVerdict = "rejected"
				state.Status = "failed"
				finalErr = fmt.Errorf("task rejected after %d rounds", superviseMaxRounds)
				break
			}

			// Continue with feedback
			if feedback != "" {
				currentPrompt = fmt.Sprintf("%s\n\nPrevious feedback from supervisor:\n%s", prompt, feedback)
			}

			// Save intermediate state
			if runDir != "" {
				saveSupervisionState(runDir, state)
			}
		}

		// Final state update
		endTime := time.Now()
		state.CompletedAt = endTime.UTC().Format(time.RFC3339)
		state.DurationMs = endTime.Sub(startTime).Milliseconds()

		if state.Status == "running" {
			if finalErr != nil {
				state.Status = "failed"
			} else {
				state.Status = "completed"
				state.FinalVerdict = "max_rounds"
			}
		}

		state.addSuperviseEvent("supervision_completed", fmt.Sprintf("Final verdict: %s after %d rounds", state.FinalVerdict, len(state.Rounds)))

		// Save final state
		if runDir != "" {
			saveSupervisionState(runDir, state)
		}

		// Print summary
		if flagJSON {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			enc.Encode(state)
		} else {
			fmt.Printf("=== Summary ===\n")
			fmt.Printf("Orchestration ID: %s\n", state.OrchestrationID)
			fmt.Printf("Status: %s\n", state.Status)
			fmt.Printf("Rounds: %d\n", len(state.Rounds))
			fmt.Printf("Final verdict: %s\n", state.FinalVerdict)
			fmt.Printf("Duration: %dms\n", state.DurationMs)
			if runDir != "" {
				fmt.Printf("Run directory: %s\n", runDir)
			}
		}

		return finalErr
	},
}

func (s *SupervisionState) addSuperviseEvent(eventType, message string) {
	s.Events = append(s.Events, LocalEvent{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Type:      eventType,
		Message:   message,
	})
}

func buildSupervisorPrompt(originalPrompt, executorOutput string, round int) string {
	return fmt.Sprintf(`You are a code review supervisor. Review the following work and provide a verdict.

ORIGINAL TASK:
%s

EXECUTOR OUTPUT (Round %d):
%s

INSTRUCTIONS:
1. Review the executor's work carefully
2. Check if the task was completed correctly
3. Provide your verdict as one of:
   - APPROVED: Work is satisfactory, task complete
   - REJECTED: Work has issues that need fixing
   - CONTINUE: Work is partially complete, provide feedback for next iteration

Your response MUST start with one of these exact words: APPROVED, REJECTED, or CONTINUE
If REJECTED or CONTINUE, explain what needs to be fixed or improved.

VERDICT:`, originalPrompt, round, truncateOutput(executorOutput, 8000))
}

func parseSupervisorVerdict(output string) (verdict, feedback string) {
	output = strings.TrimSpace(output)
	lines := strings.Split(output, "\n")

	// Look for verdict keyword in first few lines
	for i, line := range lines {
		line = strings.TrimSpace(strings.ToUpper(line))
		if strings.HasPrefix(line, "APPROVED") {
			if i+1 < len(lines) {
				feedback = strings.TrimSpace(strings.Join(lines[i+1:], "\n"))
			}
			return "approved", feedback
		}
		if strings.HasPrefix(line, "REJECTED") {
			if i+1 < len(lines) {
				feedback = strings.TrimSpace(strings.Join(lines[i+1:], "\n"))
			}
			return "rejected", feedback
		}
		if strings.HasPrefix(line, "CONTINUE") {
			if i+1 < len(lines) {
				feedback = strings.TrimSpace(strings.Join(lines[i+1:], "\n"))
			}
			return "continue", feedback
		}
		// Only check first 5 lines for verdict
		if i >= 4 {
			break
		}
	}

	// Default to continue if no clear verdict
	return "continue", output
}

func runAgentCaptureOutput(ctx context.Context, agent, prompt, workspace string) (string, error) {
	var cmd *exec.Cmd
	var stdout, stderr bytes.Buffer

	switch {
	case strings.HasPrefix(agent, "claude/"):
		claudePath, err := resolveAgentCLIPath("claude")
		if err != nil {
			return "", fmt.Errorf("claude CLI not found: %w", err)
		}
		cmd = exec.CommandContext(ctx, claudePath, "-p", "--dangerously-skip-permissions", prompt)

	case strings.HasPrefix(agent, "codex/"):
		codexPath, err := exec.LookPath("codex")
		if err != nil {
			return "", fmt.Errorf("codex CLI not found: %w", err)
		}
		cmd = exec.CommandContext(ctx, codexPath, prompt)

	case strings.HasPrefix(agent, "gemini/"):
		geminiPath, err := exec.LookPath("gemini")
		if err != nil {
			return "", fmt.Errorf("gemini CLI not found: %w", err)
		}
		cmd = exec.CommandContext(ctx, geminiPath, "-p", prompt)

	default:
		return "", fmt.Errorf("unsupported agent: %s", agent)
	}

	cmd.Dir = workspace
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Also tee to real stdout for visibility
	cmd.Stdout = &teeWriter{&stdout, os.Stdout}
	cmd.Stderr = &teeWriter{&stderr, os.Stderr}

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("agent timed out")
		}
		return stdout.String() + stderr.String(), fmt.Errorf("agent failed: %w", err)
	}

	return stdout.String(), nil
}

type teeWriter struct {
	buf    *bytes.Buffer
	writer *os.File
}

func (t *teeWriter) Write(p []byte) (n int, err error) {
	t.buf.Write(p)
	return t.writer.Write(p)
}

func truncateOutput(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "\n... [truncated]"
}

func saveSupervisionState(runDir string, state *SupervisionState) {
	statePath := filepath.Join(runDir, "state.json")
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(statePath, data, 0644)

	// Also write events
	eventsPath := filepath.Join(runDir, "events.jsonl")
	f, err := os.Create(eventsPath)
	if err != nil {
		return
	}
	defer f.Close()

	w := bufio.NewWriter(f)
	for _, event := range state.Events {
		line, _ := json.Marshal(event)
		w.WriteString(string(line) + "\n")
	}
	w.Flush()
}

func init() {
	orchestrateSuperviseLocalCmd.Flags().StringVar(&superviseExecutor, "executor", "codex/gpt-5.1-codex-mini", "Executor agent (does the work)")
	orchestrateSuperviseLocalCmd.Flags().StringVar(&superviseSupervisor, "supervisor", "claude/haiku-4.5", "Supervisor agent (reviews the work)")
	orchestrateSuperviseLocalCmd.Flags().IntVar(&superviseMaxRounds, "max-rounds", 3, "Maximum supervision rounds")
	orchestrateSuperviseLocalCmd.Flags().StringVar(&superviseWorkspace, "workspace", "", "Working directory (default: current)")
	orchestrateSuperviseLocalCmd.Flags().StringVar(&superviseTimeout, "timeout", "30m", "Total timeout for supervision")
	orchestrateSuperviseLocalCmd.Flags().BoolVar(&supervisePersist, "persist", false, "Persist run state to disk")

	orchestrateCmd.AddCommand(orchestrateSuperviseLocalCmd)
}
