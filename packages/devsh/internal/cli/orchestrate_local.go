// internal/cli/orchestrate_local.go
package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

var (
	localAgent           string
	localWorkspace       string
	localTimeout         string
	localExport          string
	localTUI             bool
	localDryRun          bool
	localModel           string
	localVariant         string
	localEffort          string
	localPersist         bool
	localRunDir          string
	localOrchestrationID string
	localIncludeLogs     bool
	localSelftest        bool
	localPluginDirs      []string
	localSettings        string
	localSettingSources  string
	localMCPConfigs      []string
	localAllowedTools    string
	localDisallowedTools string
)

// LocalState represents the state of a local orchestration run
type LocalState struct {
	OrchestrationID string       `json:"orchestrationId"`
	StartedAt       string       `json:"startedAt"`
	CompletedAt     string       `json:"completedAt,omitempty"`
	DurationMs      int64        `json:"durationMs,omitempty"`
	Status          string       `json:"status"`
	Agent           string       `json:"agent"`
	SelectedVariant string       `json:"selectedVariant,omitempty"`
	Prompt          string       `json:"prompt"`
	Workspace       string       `json:"workspace"`
	Events          []LocalEvent `json:"events"`
	Result          *string      `json:"result,omitempty"`
	Error           *string      `json:"error,omitempty"`
	RunDir          string       `json:"runDir,omitempty"`
}

// LocalRunConfig stores the initial configuration for a local run
type LocalRunConfig struct {
	OrchestrationID string                 `json:"orchestrationId"`
	Agent           string                 `json:"agent"`
	SelectedVariant string                 `json:"selectedVariant,omitempty"`
	Prompt          string                 `json:"prompt"`
	Workspace       string                 `json:"workspace"`
	Timeout         string                 `json:"timeout"`
	Model           string                 `json:"model,omitempty"`
	CreatedAt       string                 `json:"createdAt"`
	DevshVersion    string                 `json:"devshVersion"`
	GitBranch       string                 `json:"gitBranch,omitempty"`
	GitCommit       string                 `json:"gitCommit,omitempty"`
	ClaudeOptions   *LocalClaudeCLIOptions `json:"claudeOptions,omitempty"`
}

// LocalEvent represents an event in the local orchestration
type LocalEvent struct {
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	Message   string `json:"message"`
}

func formatCommandArgs(args []string) string {
	quoted := make([]string, 0, len(args))
	for _, arg := range args {
		quoted = append(quoted, strconv.Quote(arg))
	}
	return strings.Join(quoted, " ")
}

var orchestrateLocalCmd = &cobra.Command{
	Use:   "run-local <prompt>",
	Short: "Run an orchestration task locally without cloud infrastructure",
	Long: `Run an agent task locally without requiring Convex, sandbox providers, or cloud services.

This is useful for:
- Quick prototyping of orchestration patterns
- Debugging agent behavior offline
- Testing prompts before cloud deployment

The agent runs directly on your machine using its native CLI (claude, codex, etc.).

Persistent Run Directory (default):
  By default, all run artifacts are saved to ~/.devsh/orchestrations/<run-id>/:
  - config.json   Initial run configuration
  - state.json    Final state with result/error
  - events.jsonl  Event timeline (appended during run)
  - bundle.json   Export bundle compatible with 'devsh orchestrate view'
  - session.json  Local continuation metadata for continue-session or append-instruction follow-up

  This enables disk-first observability: even if the process crashes, you have
  partial state and events up to that point. Use --persist=false to disable.

Supported agents:
  claude/*    - Claude Code CLI (haiku-4.5, sonnet-4.5, opus-4.5, opus-4.6, opus-4.7)
  codex/*     - Codex CLI (gpt-5.4, gpt-5.3-codex, gpt-5.2-codex, gpt-5.1-codex-mini, etc.)
  gemini/*    - Gemini CLI (gemini-2.5-pro, gemini-2.5-flash)
  opencode/*  - Opencode CLI (big-pickle, small-pickle)
  amp/*       - Amp CLI (amp-1)

Examples:
  devsh orchestrate run-local --agent claude/opus-4.7 "Fix the bug in auth.ts"
  devsh orchestrate run-local --agent claude/opus-4.7 --effort max "Handle the hairy refactor"
  devsh orchestrate run-local --agent codex/gpt-5.4 --variant xhigh --workspace ./my-repo "Add tests"
  devsh orchestrate run-local --agent gemini/gemini-2.5-pro --export ./debug.json "Refactor"
  devsh orchestrate run-local --agent claude/haiku-4.5 --timeout 1h "Long running task"
  devsh orchestrate run-local --persist=false "Skip artifact persistence"
  devsh orchestrate run-local --dry-run "Check setup"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		prompt := args[0]
		selectedVariant, err := resolveVariantFlagValue(localVariant, localEffort)
		if err != nil {
			return err
		}
		resolvedSelection, err := resolveLocalAgentSelection(localAgent, selectedVariant)
		if err != nil {
			return err
		}
		if localModel != "" && resolvedSelection.SelectedVariant != "" {
			return fmt.Errorf("--model cannot be combined with --variant or --effort")
		}
		localAgent = resolvedSelection.AgentName

		// Resolve workspace
		workspace := localWorkspace
		if workspace == "" {
			var err error
			workspace, err = os.Getwd()
			if err != nil {
				return fmt.Errorf("failed to get current directory: %w", err)
			}
		}

		// Resolve absolute path
		absWorkspace, err := filepath.Abs(workspace)
		if err != nil {
			return fmt.Errorf("failed to resolve workspace path: %w", err)
		}

		// Validate workspace exists
		if _, err := os.Stat(absWorkspace); os.IsNotExist(err) {
			return fmt.Errorf("workspace does not exist: %s", absWorkspace)
		}

		// Run preflight checks if requested
		if localSelftest {
			if !flagJSON {
				fmt.Println("Running preflight checks...")
			}
			if err := runSelftestForAgent(resolvedSelection.AgentName, absWorkspace); err != nil {
				return fmt.Errorf("preflight checks failed: %w", err)
			}
			if !flagJSON {
				fmt.Println()
			}
		}

		// Generate orchestration ID
		orchID := strings.TrimSpace(localOrchestrationID)
		if orchID == "" {
			orchID = fmt.Sprintf("local_%d", time.Now().UnixNano())
		}
		startTime := time.Now()
		resolvedModelForConfig := localModel
		if resolvedModelForConfig == "" {
			switch resolvedSelection.Provider {
			case "claude":
				resolvedModelForConfig = resolvedSelection.ClaudeModel
			case "codex":
				resolvedModelForConfig = resolvedSelection.CodexModel
			}
		}

		// Initialize state
		state := &LocalState{
			OrchestrationID: orchID,
			StartedAt:       startTime.UTC().Format(time.RFC3339),
			Status:          "running",
			Agent:           resolvedSelection.AgentName,
			SelectedVariant: resolvedSelection.SelectedVariant,
			Prompt:          prompt,
			Workspace:       absWorkspace,
			Events:          []LocalEvent{},
		}

		// Add start event
		state.addEvent("task_started", fmt.Sprintf("Starting %s in %s", resolvedSelection.AgentName, absWorkspace))

		// Dry-run mode: just show what would happen
		if localDryRun {
			if !flagJSON {
				fmt.Printf("Local Orchestration: %s\n", orchID)
				fmt.Printf("Agent: %s\n", resolvedSelection.AgentName)
				if resolvedSelection.SelectedVariant != "" {
					fmt.Printf("Effort: %s\n", resolvedSelection.SelectedVariant)
				}
				fmt.Printf("Workspace: %s\n", absWorkspace)
				fmt.Printf("Prompt: %s\n", prompt)
				if flagVerbose {
					fmt.Printf("Timeout: %s\n", localTimeout)
					if localModel != "" {
						fmt.Printf("Model Override: %s\n", localModel)
					}
				}
				fmt.Printf("\n[DRY RUN] Would execute:\n")
			}
			switch resolvedSelection.Provider {
			case "claude":
				args := buildLocalClaudeArgs(resolvedSelection, prompt, localModel, currentLocalClaudeCLIOptions())
				fmt.Printf("  claude %s\n", formatCommandArgs(args))
			case "codex":
				args := buildLocalCodexArgs(resolvedSelection, prompt)
				fmt.Printf("  codex %s\n", formatCommandArgs(args))
			case "gemini":
				fmt.Printf("  gemini -p \"%s\"\n", prompt)
			case "opencode":
				fmt.Printf("  opencode \"%s\"\n", prompt)
			case "amp":
				fmt.Printf("  amp \"%s\"\n", prompt)
			default:
				fmt.Printf("  (unsupported agent: %s)\n", resolvedSelection.AgentName)
			}
			fmt.Printf("  Working directory: %s\n", absWorkspace)
			fmt.Printf("  Timeout: %s\n", localTimeout)
			if localExport != "" {
				fmt.Printf("  Export to: %s\n", localExport)
			}
			return nil
		}

		// Create persistent run directory if enabled
		var runDir string
		if localPersist {
			config := &LocalRunConfig{
				OrchestrationID: orchID,
				Agent:           resolvedSelection.AgentName,
				SelectedVariant: resolvedSelection.SelectedVariant,
				Prompt:          prompt,
				Workspace:       absWorkspace,
				Timeout:         localTimeout,
				Model:           resolvedModelForConfig,
				CreatedAt:       startTime.UTC().Format(time.RFC3339),
				DevshVersion:    GetVersion(),
				GitBranch:       getGitBranch(absWorkspace),
				GitCommit:       getGitCommit(absWorkspace),
				ClaudeOptions:   localClaudeOptionsForProvider(resolvedSelection.Provider),
			}
			var err error
			runDir, err = createRunDirectory(orchID, config)
			if err != nil {
				return fmt.Errorf("failed to create run directory: %w", err)
			}
			state.RunDir = runDir
		}

		// Write PID file for stop-local support
		if runDir != "" {
			if err := writePidFile(runDir); err != nil {
				if !flagJSON {
					fmt.Printf("Warning: failed to write pid file: %v\n", err)
				}
			}
			defer removePidFile(runDir)

			// Initialize session info for active instruction injection (D5.6)
			if err := InitSessionForRun(runDir, resolvedSelection.AgentName, absWorkspace, localClaudeOptionsForProvider(resolvedSelection.Provider)); err != nil {
				if !flagJSON && flagVerbose {
					fmt.Printf("Warning: failed to init session info: %v\n", err)
				}
			}
		}

		if !flagJSON {
			fmt.Printf("Local Orchestration: %s\n", orchID)
			fmt.Printf("Agent: %s\n", resolvedSelection.AgentName)
			if resolvedSelection.SelectedVariant != "" {
				fmt.Printf("Effort: %s\n", resolvedSelection.SelectedVariant)
			}
			fmt.Printf("Workspace: %s\n", absWorkspace)
			fmt.Printf("Prompt: %s\n", prompt)
			if runDir != "" {
				fmt.Printf("Run Directory: %s\n", runDir)
			}
			if flagVerbose {
				fmt.Printf("Timeout: %s\n", localTimeout)
				if localModel != "" {
					fmt.Printf("Model Override: %s\n", localModel)
				}
				if options := currentLocalClaudeCLIOptions(); options != nil {
					if len(options.PluginDirs) > 0 {
						fmt.Printf("Plugin Dirs: %s\n", strings.Join(options.PluginDirs, ", "))
					}
					if options.Settings != "" {
						fmt.Printf("Settings: %s\n", options.Settings)
					}
					if options.SettingSources != "" {
						fmt.Printf("Setting Sources: %s\n", options.SettingSources)
					}
					if len(options.MCPConfigs) > 0 {
						fmt.Printf("MCP Configs: %s\n", strings.Join(options.MCPConfigs, ", "))
					}
					if options.AllowedTools != "" {
						fmt.Printf("Allowed Tools: %s\n", options.AllowedTools)
					}
					if options.DisallowedTools != "" {
						fmt.Printf("Disallowed Tools: %s\n", options.DisallowedTools)
					}
				}
			}
		}

		if !flagJSON {
			fmt.Println()
		}

		// Parse timeout
		timeout, err := time.ParseDuration(localTimeout)
		if err != nil {
			return fmt.Errorf("invalid timeout format: %w", err)
		}

		// Create context with timeout
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()

		// Run the agent (with TUI if requested)
		var runErr error
		if localTUI {
			runErr = runLocalWithTUI(ctx, state, prompt, absWorkspace)
		} else {
			switch resolvedSelection.Provider {
			case "claude":
				runErr = runClaudeLocal(ctx, state, prompt, absWorkspace)
			case "codex":
				runErr = runCodexLocal(ctx, state, prompt, absWorkspace)
			case "gemini":
				runErr = runGeminiLocal(ctx, state, prompt, absWorkspace)
			case "opencode":
				runErr = runOpencodeLocal(ctx, state, prompt, absWorkspace)
			case "amp":
				runErr = runAmpLocal(ctx, state, prompt, absWorkspace)
			default:
				return fmt.Errorf("unsupported local agent: %s (supported: claude/*, codex/*, gemini/*, opencode/*, amp/*)", resolvedSelection.AgentName)
			}
		}

		// Update final state with timing
		endTime := time.Now()
		state.CompletedAt = endTime.UTC().Format(time.RFC3339)
		state.DurationMs = endTime.Sub(startTime).Milliseconds()

		if runErr != nil {
			state.Status = "failed"
			errStr := runErr.Error()
			state.Error = &errStr
			state.addEvent("task_failed", runErr.Error())
		} else {
			state.Status = "completed"
			result := "Task completed successfully"
			state.Result = &result
			state.addEvent("task_completed", "Agent finished successfully")
		}

		// Save final state to run directory
		if runDir != "" {
			if err := updateStateFile(runDir, state); err != nil {
				if !flagJSON {
					fmt.Printf("Warning: failed to save final state: %v\n", err)
				}
			}
			// Auto-export bundle to run directory (always include logs for persist mode)
			bundlePath := filepath.Join(runDir, "bundle.json")
			if err := exportLocalStateWithOptions(state, bundlePath, true); err != nil {
				if !flagJSON {
					fmt.Printf("Warning: failed to export bundle: %v\n", err)
				}
			}
		}

		// Export to custom path if requested
		if localExport != "" {
			if err := exportLocalStateWithOptions(state, localExport, localIncludeLogs); err != nil {
				if !flagJSON {
					fmt.Printf("Warning: failed to export state: %v\n", err)
				}
			} else if !flagJSON {
				fmt.Printf("\nExported to: %s\n", localExport)
			}
		}

		// Print summary (JSON or text based on global flag)
		if flagJSON {
			// JSON output for programmatic usage
			output, _ := json.MarshalIndent(state, "", "  ")
			fmt.Println(string(output))
		} else {
			fmt.Printf("\n--- Summary ---\n")
			fmt.Printf("Status: %s\n", state.Status)
			fmt.Printf("Duration: %s\n", formatDuration(state.DurationMs))
			fmt.Printf("Events: %d\n", len(state.Events))
			if state.Error != nil {
				fmt.Printf("Error: %s\n", *state.Error)
			}
			if runDir != "" {
				fmt.Printf("Run artifacts: %s\n", runDir)
				fmt.Printf("  - config.json, state.json, events.jsonl, bundle.json\n")
				fmt.Printf("View with: devsh orchestrate view %s/bundle.json\n", runDir)
			}
		}

		if runErr != nil {
			return runErr
		}
		return nil
	},
}

func (s *LocalState) addEvent(eventType, message string) {
	ts := time.Now().UTC().Format(time.RFC3339)
	event := LocalEvent{
		Timestamp: ts,
		Type:      eventType,
		Message:   message,
	}
	s.Events = append(s.Events, event)
	if flagVerbose && !flagJSON {
		fmt.Printf("[%s] %s: %s\n", ts, eventType, message)
	}
	// Append to events.jsonl if run directory exists
	if s.RunDir != "" {
		appendEventToFile(s.RunDir, event)
	}
}

// getLocalRunsDir returns the base directory for local orchestration runs
func getLocalRunsDir() string {
	if localRunDir != "" {
		return localRunDir
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".devsh/orchestrations"
	}
	return filepath.Join(home, ".devsh", "orchestrations")
}

func currentLocalClaudeCLIOptions() *LocalClaudeCLIOptions {
	options := &LocalClaudeCLIOptions{
		PluginDirs:      append([]string(nil), localPluginDirs...),
		Settings:        strings.TrimSpace(localSettings),
		SettingSources:  strings.TrimSpace(localSettingSources),
		MCPConfigs:      append([]string(nil), localMCPConfigs...),
		AllowedTools:    strings.TrimSpace(localAllowedTools),
		DisallowedTools: strings.TrimSpace(localDisallowedTools),
	}

	if len(options.PluginDirs) == 0 &&
		options.Settings == "" &&
		options.SettingSources == "" &&
		len(options.MCPConfigs) == 0 &&
		options.AllowedTools == "" &&
		options.DisallowedTools == "" {
		return nil
	}

	return options
}

func localClaudeOptionsForProvider(provider string) *LocalClaudeCLIOptions {
	if provider != "claude" {
		return nil
	}
	return currentLocalClaudeCLIOptions()
}

// createRunDirectory creates a persistent run directory with initial config
func createRunDirectory(orchID string, config *LocalRunConfig) (string, error) {
	baseDir := getLocalRunsDir()
	runDir := filepath.Join(baseDir, orchID)

	if entries, err := os.ReadDir(runDir); err == nil && len(entries) > 0 {
		return "", fmt.Errorf("run directory already exists: %s", runDir)
	}

	if err := os.MkdirAll(runDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create run directory: %w", err)
	}

	// Write config.json
	configData, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal config: %w", err)
	}
	if err := os.WriteFile(filepath.Join(runDir, "config.json"), configData, 0644); err != nil {
		return "", fmt.Errorf("failed to write config: %w", err)
	}

	// Create empty events.jsonl
	if _, err := os.Create(filepath.Join(runDir, "events.jsonl")); err != nil {
		return "", fmt.Errorf("failed to create events file: %w", err)
	}

	return runDir, nil
}

// appendEventToFile appends an event to events.jsonl
func appendEventToFile(runDir string, event LocalEvent) {
	f, err := os.OpenFile(filepath.Join(runDir, "events.jsonl"), os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
	if err != nil {
		return
	}
	defer f.Close()

	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	f.WriteString(string(data) + "\n")
}

// updateStateFile writes the current state to state.json
func updateStateFile(runDir string, state *LocalState) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(runDir, "state.json"), data, 0644)
}

// createLogWriters creates stdout.log and stderr.log writers
func createLogWriters(runDir string) (*os.File, *os.File, error) {
	stdout, err := os.Create(filepath.Join(runDir, "stdout.log"))
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create stdout.log: %w", err)
	}

	stderr, err := os.Create(filepath.Join(runDir, "stderr.log"))
	if err != nil {
		stdout.Close()
		return nil, nil, fmt.Errorf("failed to create stderr.log: %w", err)
	}

	return stdout, stderr, nil
}

func formatDuration(ms int64) string {
	d := time.Duration(ms) * time.Millisecond
	if d < time.Second {
		return fmt.Sprintf("%dms", ms)
	}
	if d < time.Minute {
		return fmt.Sprintf("%.1fs", d.Seconds())
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm%ds", int(d.Minutes()), int(d.Seconds())%60)
	}
	return fmt.Sprintf("%dh%dm%ds", int(d.Hours()), int(d.Minutes())%60, int(d.Seconds())%60)
}

func runClaudeLocal(ctx context.Context, state *LocalState, prompt, workspace string) error {
	state.addEvent("agent_invoked", "Spawning claude CLI")

	// Check if claude CLI is available
	claudePath, err := resolveAgentCLIPath("claude")
	if err != nil {
		return fmt.Errorf("claude CLI not found in PATH: %w", err)
	}

	// Build command args
	selection, err := resolveLocalAgentSelection(state.Agent, state.SelectedVariant)
	if err != nil {
		return err
	}
	args := buildLocalClaudeArgs(selection, prompt, localModel, currentLocalClaudeCLIOptions())
	if localModel != "" {
		state.addEvent("model_override", fmt.Sprintf("Using model: %s", localModel))
	}
	if selection.SelectedVariant != "" {
		state.addEvent("effort_override", fmt.Sprintf("Using effort: %s", selection.SelectedVariant))
	}

	cmd := exec.CommandContext(ctx, claudePath, args...)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	state.addEvent("agent_running", "Claude CLI executing in print mode")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("claude CLI timed out after %s", localTimeout)
		}
		return fmt.Errorf("claude CLI failed: %w", err)
	}

	return nil
}

func runCodexLocal(ctx context.Context, state *LocalState, prompt, workspace string) error {
	state.addEvent("agent_invoked", "Spawning codex CLI")

	// Check if codex CLI is available
	codexPath, err := exec.LookPath("codex")
	if err != nil {
		return fmt.Errorf("codex CLI not found in PATH: %w", err)
	}

	selection, err := resolveLocalAgentSelection(state.Agent, state.SelectedVariant)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, codexPath, buildLocalCodexArgs(selection, prompt)...)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	cleanup, err := configureCodexLocalCommand(ctx, state, workspace, cmd)
	if err != nil {
		if flagVerbose && !flagJSON {
			fmt.Printf("Warning: failed to configure Codex session tracking: %v\n", err)
		}
		cleanup = func() {}
	}
	defer cleanup()

	state.addEvent("agent_running", "Codex CLI executing")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("codex CLI timed out after %s", localTimeout)
		}
		return fmt.Errorf("codex CLI failed: %w", err)
	}

	return nil
}

func runGeminiLocal(ctx context.Context, state *LocalState, prompt, workspace string) error {
	state.addEvent("agent_invoked", "Spawning gemini CLI")

	// Check if gemini CLI is available
	geminiPath, err := exec.LookPath("gemini")
	if err != nil {
		return fmt.Errorf("gemini CLI not found in PATH: %w", err)
	}

	// Use -p for print mode (non-interactive)
	cmd := exec.CommandContext(ctx, geminiPath, "-p", prompt)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	state.addEvent("agent_running", "Gemini CLI executing")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("gemini CLI timed out after %s", localTimeout)
		}
		return fmt.Errorf("gemini CLI failed: %w", err)
	}

	return nil
}

func runOpencodeLocal(ctx context.Context, state *LocalState, prompt, workspace string) error {
	state.addEvent("agent_invoked", "Spawning opencode CLI")

	// Check if opencode CLI is available
	opencodePath, err := exec.LookPath("opencode")
	if err != nil {
		return fmt.Errorf("opencode CLI not found in PATH: %w", err)
	}

	cmd := exec.CommandContext(ctx, opencodePath, prompt)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	state.addEvent("agent_running", "Opencode CLI executing")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("opencode CLI timed out after %s", localTimeout)
		}
		return fmt.Errorf("opencode CLI failed: %w", err)
	}

	return nil
}

func runAmpLocal(ctx context.Context, state *LocalState, prompt, workspace string) error {
	state.addEvent("agent_invoked", "Spawning amp CLI")

	// Check if amp CLI is available
	ampPath, err := exec.LookPath("amp")
	if err != nil {
		return fmt.Errorf("amp CLI not found in PATH: %w", err)
	}

	cmd := exec.CommandContext(ctx, ampPath, prompt)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	state.addEvent("agent_running", "Amp CLI executing")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("amp CLI timed out after %s", localTimeout)
		}
		return fmt.Errorf("amp CLI failed: %w", err)
	}

	return nil
}

// Thread-safe agent runners that take agent as parameter (for parallel execution)
func runClaudeLocalWithAgent(ctx context.Context, state *LocalState, agent, prompt, workspace string) error {
	state.addEvent("agent_invoked", fmt.Sprintf("Spawning claude CLI (%s)", agent))

	claudePath, err := resolveAgentCLIPath("claude")
	if err != nil {
		return fmt.Errorf("claude CLI not found in PATH: %w", err)
	}

	selection, err := resolveLocalAgentSelection(agent, state.SelectedVariant)
	if err != nil {
		return err
	}
	args := buildLocalClaudeArgs(selection, prompt, localModel, currentLocalClaudeCLIOptions())

	cmd := exec.CommandContext(ctx, claudePath, args...)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	state.addEvent("agent_running", "Claude CLI executing in print mode")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("claude CLI timed out")
		}
		return fmt.Errorf("claude CLI failed: %w", err)
	}
	return nil
}

func runCodexLocalWithAgent(ctx context.Context, state *LocalState, agent, prompt, workspace string) error {
	state.addEvent("agent_invoked", fmt.Sprintf("Spawning codex CLI (%s)", agent))

	codexPath, err := exec.LookPath("codex")
	if err != nil {
		return fmt.Errorf("codex CLI not found in PATH: %w", err)
	}

	selection, err := resolveLocalAgentSelection(agent, state.SelectedVariant)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, codexPath, buildLocalCodexArgs(selection, prompt)...)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	cleanup, err := configureCodexLocalCommand(ctx, state, workspace, cmd)
	if err != nil {
		if flagVerbose && !flagJSON {
			fmt.Printf("Warning: failed to configure Codex session tracking: %v\n", err)
		}
		cleanup = func() {}
	}
	defer cleanup()

	state.addEvent("agent_running", "Codex CLI executing")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("codex CLI timed out")
		}
		return fmt.Errorf("codex CLI failed: %w", err)
	}
	return nil
}

func runGeminiLocalWithAgent(ctx context.Context, state *LocalState, agent, prompt, workspace string) error {
	state.addEvent("agent_invoked", fmt.Sprintf("Spawning gemini CLI (%s)", agent))

	geminiPath, err := exec.LookPath("gemini")
	if err != nil {
		return fmt.Errorf("gemini CLI not found in PATH: %w", err)
	}

	cmd := exec.CommandContext(ctx, geminiPath, "-p", prompt)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	state.addEvent("agent_running", "Gemini CLI executing")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("gemini CLI timed out")
		}
		return fmt.Errorf("gemini CLI failed: %w", err)
	}
	return nil
}

func runOpencodeLocalWithAgent(ctx context.Context, state *LocalState, agent, prompt, workspace string) error {
	state.addEvent("agent_invoked", fmt.Sprintf("Spawning opencode CLI (%s)", agent))

	opencodePath, err := exec.LookPath("opencode")
	if err != nil {
		return fmt.Errorf("opencode CLI not found in PATH: %w", err)
	}

	cmd := exec.CommandContext(ctx, opencodePath, prompt)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	state.addEvent("agent_running", "Opencode CLI executing")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("opencode CLI timed out")
		}
		return fmt.Errorf("opencode CLI failed: %w", err)
	}
	return nil
}

func runAmpLocalWithAgent(ctx context.Context, state *LocalState, agent, prompt, workspace string) error {
	state.addEvent("agent_invoked", fmt.Sprintf("Spawning amp CLI (%s)", agent))

	ampPath, err := exec.LookPath("amp")
	if err != nil {
		return fmt.Errorf("amp CLI not found in PATH: %w", err)
	}

	cmd := exec.CommandContext(ctx, ampPath, prompt)
	cmd.Dir = workspace
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	state.addEvent("agent_running", "Amp CLI executing")

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("amp CLI timed out")
		}
		return fmt.Errorf("amp CLI failed: %w", err)
	}
	return nil
}

func exportLocalState(state *LocalState, outputPath string) error {
	return exportLocalStateWithOptions(state, outputPath, false)
}

func exportLocalStateWithOptions(state *LocalState, outputPath string, includeLogs bool) error {
	// Convert to export bundle format for compatibility with view command
	agentName := state.Agent
	bundle := ExportBundle{
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Version:    "1.0.0",
		Orchestration: OrchestrationExportInfo{
			ID:        state.OrchestrationID,
			Status:    state.Status,
			CreatedAt: state.StartedAt,
			Prompt:    state.Prompt,
		},
		Summary: ExportSummary{
			TotalTasks:     1,
			CompletedTasks: 0,
			FailedTasks:    0,
			RunningTasks:   0,
		},
		Tasks: []TaskExportInfo{
			{
				TaskID:    state.OrchestrationID + "_task",
				Prompt:    state.Prompt,
				AgentName: &agentName,
				Status:    state.Status,
			},
		},
		Events: []EventExportInfo{},
	}

	// Update summary based on status
	switch state.Status {
	case "completed":
		bundle.Summary.CompletedTasks = 1
	case "failed":
		bundle.Summary.FailedTasks = 1
	case "running":
		bundle.Summary.RunningTasks = 1
	}

	// Convert events
	for _, e := range state.Events {
		bundle.Events = append(bundle.Events, EventExportInfo{
			Timestamp: e.Timestamp,
			Type:      e.Type,
			Message:   e.Message,
			TaskID:    state.OrchestrationID + "_task",
		})
	}

	// Include logs if requested and run directory exists
	if includeLogs && state.RunDir != "" {
		logs := &ExportLogs{}
		if stdout, err := os.ReadFile(filepath.Join(state.RunDir, "stdout.log")); err == nil {
			logs.Stdout = string(stdout)
		}
		if stderr, err := os.ReadFile(filepath.Join(state.RunDir, "stderr.log")); err == nil {
			logs.Stderr = string(stderr)
		}
		if logs.Stdout != "" || logs.Stderr != "" {
			bundle.Logs = logs
		}
	}

	// Write to file
	data, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal state: %w", err)
	}

	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

func init() {
	orchestrateLocalCmd.Flags().StringVar(&localAgent, "agent", "claude/haiku-4.5", "Agent to use (claude/*, codex/*, gemini/*, opencode/*, amp/*)")
	orchestrateLocalCmd.Flags().StringVar(&localWorkspace, "workspace", "", "Workspace directory (default: current directory)")
	orchestrateLocalCmd.Flags().StringVar(&localTimeout, "timeout", "30m", "Task timeout")
	orchestrateLocalCmd.Flags().StringVar(&localExport, "export", "", "Export state to JSON file when done")
	orchestrateLocalCmd.Flags().BoolVar(&localTUI, "tui", false, "Show live terminal UI with spinner, events, and scrollable output")
	orchestrateLocalCmd.Flags().BoolVar(&localDryRun, "dry-run", false, "Show what would be executed without running")
	orchestrateLocalCmd.Flags().StringVar(&localModel, "model", "", "Override the raw Claude model id directly (expert mode; mutually exclusive with --variant/--effort)")
	orchestrateLocalCmd.Flags().StringVar(&localVariant, "variant", "", "Effort variant to use for the selected model")
	orchestrateLocalCmd.Flags().StringVar(&localEffort, "effort", "", "Alias for --variant")
	orchestrateLocalCmd.Flags().BoolVar(&localPersist, "persist", true, "Save run artifacts to ~/.devsh/orchestrations/<run-id>/ (default: true, use --persist=false to disable)")
	orchestrateLocalCmd.Flags().StringVar(&localRunDir, "run-dir", "", "Custom base directory for run artifacts (default: ~/.devsh/orchestrations)")
	orchestrateLocalCmd.Flags().StringVar(&localOrchestrationID, "orchestration-id", "", "Explicit orchestration ID / run directory name for persisted local runs")
	orchestrateLocalCmd.Flags().BoolVar(&localIncludeLogs, "include-logs", false, "Include stdout/stderr logs in --export bundle (always included with --persist)")
	orchestrateLocalCmd.Flags().BoolVar(&localSelftest, "selftest", false, "Run preflight checks before starting (validates CLI, credentials, workspace)")
	orchestrateLocalCmd.Flags().StringArrayVar(&localPluginDirs, "plugin-dir", nil, "Claude plugin directory to load for this local run (repeatable)")
	orchestrateLocalCmd.Flags().StringVar(&localSettings, "settings", "", "Additional Claude settings file or JSON string for this local run")
	orchestrateLocalCmd.Flags().StringVar(&localSettingSources, "setting-sources", "", "Comma-separated Claude setting sources (user, project, local)")
	orchestrateLocalCmd.Flags().StringArrayVar(&localMCPConfigs, "mcp-config", nil, "Claude MCP config file or JSON string to load for this local run (repeatable)")
	orchestrateLocalCmd.Flags().StringVar(&localAllowedTools, "allowed-tools", "", "Comma-separated list of allowed Claude tools for this local run")
	orchestrateLocalCmd.Flags().StringVar(&localDisallowedTools, "disallowed-tools", "", "Comma-separated list of denied Claude tools for this local run")
	orchestrateCmd.AddCommand(orchestrateLocalCmd)
}
