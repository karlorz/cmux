// internal/cli/orchestrate_inject_local.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/spf13/cobra"
)

// LocalSessionInfo stores session identifiers for active instruction injection
type LocalStopInfo struct {
	PID     int    `json:"pid,omitempty"`
	Signal  string `json:"signal,omitempty"`
	Status  string `json:"status,omitempty"`
	Message string `json:"message,omitempty"`
}

type LocalSessionInfo struct {
	Agent                string                 `json:"agent"`
	SessionID            string                 `json:"sessionId,omitempty"` // Claude session UUID
	ThreadID             string                 `json:"threadId,omitempty"`  // Codex thread ID
	CodexHome            string                 `json:"codexHome,omitempty"`
	Workspace            string                 `json:"workspace"`
	ClaudeOptions        *LocalClaudeCLIOptions `json:"claudeOptions,omitempty"`
	InjectionMode        string                 `json:"injectionMode"` // "active" or "passive"
	LastInjectionAt      string                 `json:"lastInjectionAt,omitempty"`
	InjectionCount       int                    `json:"injectionCount"`
	CheckpointRef        string                 `json:"checkpointRef,omitempty"`
	CheckpointGeneration int                    `json:"checkpointGeneration,omitempty"`
	CheckpointLabel      string                 `json:"checkpointLabel,omitempty"`
	CheckpointCreatedAt  int64                  `json:"checkpointCreatedAt,omitempty"`
	Stop                 *LocalStopInfo         `json:"stop,omitempty"`
}

var (
	injectLocalMode string // "active" or "passive" or "auto"
)

var orchestrateResumeLocalCmd = &cobra.Command{
	Use:   "resume-local <run-id> [message]",
	Short: "Resume a checkpoint-backed local task",
	Long: `Resume a checkpoint-backed local orchestration task.

This command is the local checkpoint-restore lane. It records an explicit
checkpoint resume request and appends the resume instruction for the local run.

Examples:
  devsh orchestrate resume-local local_abc123
  devsh orchestrate resume-local local_abc123 "Resume from the saved checkpoint and continue"`,
	Args: cobra.RangeArgs(1, 2),
	RunE: func(cmd *cobra.Command, args []string) error {
		runID := args[0]
		message := ""
		if len(args) > 1 {
			message = args[1]
		}

		runDir, err := resolveLocalRunDir(runID)
		if err != nil {
			return err
		}

		sessionInfo, err := loadSessionInfo(runDir)
		if err != nil {
			return fmt.Errorf("failed to load session info: %w", err)
		}

		result, err := resumeLocalCheckpoint(runID, runDir, sessionInfo, message)
		if err != nil {
			return err
		}

		if flagJSON {
			data, marshalErr := json.MarshalIndent(result, "", "  ")
			if marshalErr != nil {
				return fmt.Errorf("failed to marshal resume result: %w", marshalErr)
			}
			fmt.Println(string(data))
			return nil
		}

		fmt.Printf("Resumed local run %s from checkpoint\n", runID)
		fmt.Printf("Control lane: %s\n", formatRunControlActionLabel("resume_checkpoint"))
		fmt.Printf("Continuation mode: checkpoint_restore\n")
		fmt.Printf("Checkpoint ref: %s\n", sessionInfo.CheckpointRef)
		if sessionInfo.CheckpointLabel != "" {
			fmt.Printf("Checkpoint label: %s\n", sessionInfo.CheckpointLabel)
		}
		fmt.Printf("Message: %s\n", result["message"])
		return nil
	},
}

var orchestrateInjectLocalCmd = &cobra.Command{
	Use:   "inject-local <run-id> <message>",
	Short: "Continue session or append instruction to a running local task",
	Long: `Send an instruction to a running local orchestration task.

Uses the same continuation lanes as the cloud dashboard:

  Continue session (preferred when available):
    - Claude: Uses --continue --session-id to inject into the same session
    - Codex: Uses codex exec resume <thread-id> <message> for thread continuation

  Append instruction (fallback):
    - Writes to append.txt for agents to poll

The command auto-detects the best continuation mode based on session info.
Use --mode to force a specific mode.

Examples:
  devsh orchestrate inject-local local_abc123 "Also add tests for edge cases"
  devsh orchestrate inject-local local_abc123 "Focus on error handling" --mode active
  devsh orchestrate inject-local local_abc123 "Prioritize security" --mode passive`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		runID := args[0]
		message := args[1]

		// Resolve run directory
		runDir, err := resolveLocalRunDir(runID)
		if err != nil {
			return err
		}

		// Check if run is active
		pidPath := filepath.Join(runDir, "pid.txt")
		if _, err := os.Stat(pidPath); os.IsNotExist(err) {
			statePath := filepath.Join(runDir, "state.json")
			if stateData, stateErr := os.ReadFile(statePath); stateErr == nil {
				var state LocalState
				if json.Unmarshal(stateData, &state) == nil {
					if state.Status == "completed" || state.Status == "failed" {
						return fmt.Errorf("run %s is already %s - cannot inject into finished task", runID, state.Status)
					}
				}
			}
			return fmt.Errorf("run %s has no pid.txt - task may not be running or was not started with --persist", runID)
		}

		// Load session info
		sessionInfo, err := loadSessionInfo(runDir)
		if err != nil {
			sessionInfo = &LocalSessionInfo{
				InjectionMode: "passive",
			}
		}

		// Determine injection mode
		mode := injectLocalMode
		if mode == "" || mode == "auto" {
			mode = determineInjectionMode(sessionInfo)
		}

		var injectionErr error
		switch mode {
		case "active":
			injectionErr = injectActive(runDir, sessionInfo, message)
		case "passive":
			injectionErr = injectPassive(runDir, message)
		default:
			return fmt.Errorf("unknown injection mode: %s (use 'active', 'passive', or 'auto')", mode)
		}

		if injectionErr != nil {
			return injectionErr
		}

		// Update session info
		sessionInfo.LastInjectionAt = time.Now().UTC().Format(time.RFC3339)
		sessionInfo.InjectionCount++
		if err := saveSessionInfo(runDir, sessionInfo); err != nil {
			if !flagJSON {
				fmt.Printf("Warning: failed to update session info: %v\n", err)
			}
		}

		// Log event
		logInjectionEvent(runDir, mode, message)

		printInjectLocalResult(runID, mode, message, sessionInfo)

		return nil
	},
}

func determineInjectionMode(info *LocalSessionInfo) string {
	// Check if we have session info for active injection
	agent := strings.ToLower(info.Agent)

	if strings.HasPrefix(agent, "claude/") {
		// Claude supports --continue --session-id for active injection
		if info.SessionID != "" {
			return "active"
		}
	}

	if strings.HasPrefix(agent, "codex/") {
		// Codex supports active follow-up when we have a stored thread identifier.
		if info.ThreadID != "" {
			return "active"
		}
	}

	// Fallback to passive
	return "passive"
}

func activeInjectionTarget(info *LocalSessionInfo) (fieldName, displayLabel, value string) {
	if info.SessionID != "" {
		return "sessionId", "Session", info.SessionID
	}

	if info.ThreadID != "" {
		return "threadId", "Thread ID", info.ThreadID
	}

	return "", "", ""
}

func printInjectLocalResult(runID, mode, message string, sessionInfo *LocalSessionInfo) {
	controlLane := controlLaneForInjectionMode(mode)
	continuationMode := continuationModeForInjectionMode(mode)

	if flagJSON {
		output := map[string]interface{}{
			"runId":            runID,
			"mode":             mode,
			"message":          message,
			"injectionCount":   sessionInfo.InjectionCount,
			"controlLane":      controlLane,
			"continuationMode": continuationMode,
			"availableActions": []string{controlLane},
		}
		fieldName, _, value := activeInjectionTarget(sessionInfo)
		if mode == "active" && fieldName != "" {
			output[fieldName] = value
		}
		data, _ := json.MarshalIndent(output, "", "  ")
		fmt.Println(string(data))
		return
	}

	fmt.Printf("Injected instruction into run %s\n", runID)
	fmt.Printf("Mode: %s\n", mode)
	fmt.Printf("Control lane: %s\n", formatRunControlActionLabel(controlLane))
	fmt.Printf("Continuation mode: %s\n", continuationMode)
	fmt.Printf("Message: %s\n", message)
	if mode == "active" {
		_, label, value := activeInjectionTarget(sessionInfo)
		if label != "" {
			fmt.Printf("%s: %s\n", label, value)
		}
	}
	fmt.Printf("Total injections: %d\n", sessionInfo.InjectionCount)
}

func injectActive(runDir string, info *LocalSessionInfo, message string) error {
	agent := strings.ToLower(info.Agent)

	if strings.HasPrefix(agent, "claude/") {
		return injectClaude(runDir, info, message)
	}

	if strings.HasPrefix(agent, "codex/") {
		return injectCodex(runDir, info, message)
	}

	// Unsupported agent for active injection
	if !flagJSON {
		fmt.Printf("Active injection not supported for agent %s, falling back to passive\n", info.Agent)
	}
	return injectPassive(runDir, message)
}

func injectClaude(runDir string, info *LocalSessionInfo, message string) error {
	// Use --continue --session-id to inject into the same session
	claudePath, err := resolveAgentCLIPath("claude")
	if err != nil {
		return fmt.Errorf("claude CLI not found: %w", err)
	}

	// If no session ID, we need to create one
	if info.SessionID == "" {
		info.SessionID = uuid.New().String()
		if !flagJSON {
			fmt.Printf("Creating new Claude session: %s\n", info.SessionID)
		}
	}

	args := []string{
		"-p",
		"--continue",
		"--session-id", info.SessionID,
	}
	if info.ClaudeOptions != nil {
		for _, pluginDir := range info.ClaudeOptions.PluginDirs {
			if strings.TrimSpace(pluginDir) != "" {
				args = append(args, "--plugin-dir", pluginDir)
			}
		}
		if strings.TrimSpace(info.ClaudeOptions.Settings) != "" {
			args = append(args, "--settings", info.ClaudeOptions.Settings)
		}
		if strings.TrimSpace(info.ClaudeOptions.SettingSources) != "" {
			args = append(args, "--setting-sources", info.ClaudeOptions.SettingSources)
		}
		for _, mcpConfig := range info.ClaudeOptions.MCPConfigs {
			if strings.TrimSpace(mcpConfig) != "" {
				args = append(args, "--mcp-config", mcpConfig)
			}
		}
		if strings.TrimSpace(info.ClaudeOptions.AllowedTools) != "" {
			args = append(args, "--allowed-tools", info.ClaudeOptions.AllowedTools)
		}
		if strings.TrimSpace(info.ClaudeOptions.DisallowedTools) != "" {
			args = append(args, "--disallowed-tools", info.ClaudeOptions.DisallowedTools)
		}
	}
	args = append(args, message)

	cmd := exec.Command(claudePath, args...)
	cmd.Dir = info.Workspace

	// Capture output but don't wait for full completion
	// Just send the message to the existing session
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Log output for debugging
		if len(output) > 0 && !flagJSON {
			fmt.Printf("Claude output: %s\n", string(output))
		}
		return fmt.Errorf("claude injection failed: %w", err)
	}

	return nil
}

func injectCodex(runDir string, info *LocalSessionInfo, message string) error {
	// Use non-interactive exec resume with the stored thread identifier.
	codexPath, err := exec.LookPath("codex")
	if err != nil {
		return fmt.Errorf("codex CLI not found: %w", err)
	}

	if info.ThreadID == "" {
		// Codex thread IDs are typically created by the initial run
		// Fall back to passive injection
		if !flagJSON {
			fmt.Println("No thread ID available, falling back to passive injection")
		}
		return injectPassive(runDir, message)
	}

	args := buildCodexResumeArgs(info.ThreadID, message)

	cmd := exec.Command(codexPath, args...)
	cmd.Dir = info.Workspace
	if info.CodexHome != "" {
		cmd.Env = withEnvVar(nil, "CODEX_HOME", info.CodexHome)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		if len(output) > 0 && !flagJSON {
			fmt.Printf("Codex output: %s\n", string(output))
		}
		return fmt.Errorf("codex injection failed: %w", err)
	}

	return nil
}

func injectPassive(runDir string, message string) error {
	// Write to append.txt for passive polling
	appendPath := filepath.Join(runDir, "append.txt")
	timestamp := time.Now().UTC().Format(time.RFC3339)
	entry := fmt.Sprintf("[%s] %s\n", timestamp, message)

	f, err := os.OpenFile(appendPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open append file: %w", err)
	}
	defer f.Close()

	if _, err := f.WriteString(entry); err != nil {
		return fmt.Errorf("failed to write instruction: %w", err)
	}

	return nil
}

func loadSessionInfo(runDir string) (*LocalSessionInfo, error) {
	path := filepath.Join(runDir, "session.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var info LocalSessionInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}

	return &info, nil
}

func saveSessionInfo(runDir string, info *LocalSessionInfo) error {
	path := filepath.Join(runDir, "session.json")
	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func logInjectionEvent(runDir, mode, message string) {
	eventsPath := filepath.Join(runDir, "events.jsonl")
	event := LocalEvent{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Type:      "instruction_injected",
		Message:   fmt.Sprintf("[%s] %s", mode, message),
	}
	if eventData, err := json.Marshal(event); err == nil {
		if ef, err := os.OpenFile(eventsPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
			ef.WriteString(string(eventData) + "\n")
			ef.Close()
		}
	}
}

// InitSessionForRun creates session.json when starting a new run
// Call this from run-local after spawning the agent
func InitSessionForRun(runDir, agent, workspace string, claudeOptions *LocalClaudeCLIOptions) error {
	info := &LocalSessionInfo{
		Agent:          agent,
		Workspace:      workspace,
		ClaudeOptions:  claudeOptions,
		InjectionMode:  "passive", // Default to passive until we get a session ID
		InjectionCount: 0,
	}

	// For Claude, pre-generate a session ID so the run can use it
	if strings.HasPrefix(strings.ToLower(agent), "claude/") {
		info.SessionID = uuid.New().String()
		info.InjectionMode = "active"
	}

	return saveSessionInfo(runDir, info)
}

// UpdateSessionID updates the session ID after an agent reports it
func UpdateSessionID(runDir, sessionID string) error {
	info, err := loadSessionInfo(runDir)
	if err != nil {
		info = &LocalSessionInfo{}
	}
	info.SessionID = sessionID
	if sessionID != "" {
		info.InjectionMode = "active"
	}
	return saveSessionInfo(runDir, info)
}

// UpdateThreadID updates the thread ID after an agent reports it
func UpdateThreadID(runDir, threadID string) error {
	info, err := loadSessionInfo(runDir)
	if err != nil {
		info = &LocalSessionInfo{}
	}
	info.ThreadID = threadID
	if threadID != "" {
		info.InjectionMode = "active"
	}
	return saveSessionInfo(runDir, info)
}

func UpdateCodexHome(runDir, codexHome string) error {
	info, err := loadSessionInfo(runDir)
	if err != nil {
		info = &LocalSessionInfo{}
	}
	info.CodexHome = codexHome
	return saveSessionInfo(runDir, info)
}

func resumeLocalCheckpoint(runID, runDir string, sessionInfo *LocalSessionInfo, message string) (map[string]any, error) {
	if sessionInfo == nil || sessionInfo.CheckpointRef == "" {
		return nil, fmt.Errorf("run %s does not have a checkpoint to resume", runID)
	}
	if strings.TrimSpace(message) == "" {
		message = "Resume the interrupted task."
	}
	if err := injectPassive(runDir, message); err != nil {
		return nil, err
	}
	sessionInfo.LastInjectionAt = time.Now().UTC().Format(time.RFC3339)
	sessionInfo.InjectionCount++
	if err := saveSessionInfo(runDir, sessionInfo); err != nil {
		return nil, err
	}
	logInjectionEvent(runDir, "checkpoint_restore", message)

	return map[string]any{
		"runId":                runID,
		"mode":                 "checkpoint_restore",
		"message":              message,
		"injectionCount":       sessionInfo.InjectionCount,
		"controlLane":          "resume_checkpoint",
		"continuationMode":     "checkpoint_restore",
		"availableActions":     []string{"resume_checkpoint"},
		"checkpointRef":        sessionInfo.CheckpointRef,
		"checkpointGeneration": sessionInfo.CheckpointGeneration,
		"checkpointLabel":      sessionInfo.CheckpointLabel,
	}, nil
}

func init() {
	orchestrateInjectLocalCmd.Flags().StringVar(&injectLocalMode, "mode", "auto", "Injection mode: 'active' (continue session), 'passive' (append instruction), or 'auto'")
	orchestrateCmd.AddCommand(orchestrateInjectLocalCmd)
	orchestrateCmd.AddCommand(orchestrateResumeLocalCmd)
}

func controlLaneForInjectionMode(mode string) string {
	if mode == "active" {
		return "continue_session"
	}
	return "append_instruction"
}

func continuationModeForInjectionMode(mode string) string {
	if mode == "active" {
		return "session_continuation"
	}
	return "append_instruction"
}
