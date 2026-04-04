// internal/cli/orchestrate_local_tui.go
package cli

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Styles for the TUI
var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("39")).
			MarginBottom(1)

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241"))

	runningStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("214"))

	completedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("42"))

	failedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("196"))

	eventStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245"))

	outputStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("62")).
			Padding(0, 1)

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241")).
			MarginTop(1)
)

// TUI messages
type outputMsg string
type statusMsg string
type eventMsg LocalEvent
type doneMsg struct {
	err error
}

// tuiModel is the bubbletea model for local orchestration TUI
type tuiModel struct {
	state       *LocalState
	spinner     spinner.Model
	viewport    viewport.Model
	outputLines []string
	ready       bool
	done        bool
	err         error
	width       int
	height      int
}

func initialTUIModel(state *LocalState) tuiModel {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))

	return tuiModel{
		state:       state,
		spinner:     s,
		outputLines: []string{},
	}
}

func (m tuiModel) Init() tea.Cmd {
	return m.spinner.Tick
}

func (m tuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

		headerHeight := 7 // Title + status + events header
		footerHeight := 3 // Help text
		viewportHeight := m.height - headerHeight - footerHeight

		if !m.ready {
			m.viewport = viewport.New(m.width-4, viewportHeight)
			m.viewport.YPosition = headerHeight
			m.ready = true
		} else {
			m.viewport.Width = m.width - 4
			m.viewport.Height = viewportHeight
		}

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)

	case outputMsg:
		m.outputLines = append(m.outputLines, string(msg))
		m.viewport.SetContent(strings.Join(m.outputLines, "\n"))
		m.viewport.GotoBottom()

	case statusMsg:
		m.state.Status = string(msg)

	case eventMsg:
		m.state.Events = append(m.state.Events, LocalEvent(msg))

	case doneMsg:
		m.done = true
		m.err = msg.err
		if msg.err != nil {
			m.state.Status = "failed"
			errStr := msg.err.Error()
			m.state.Error = &errStr
		} else {
			m.state.Status = "completed"
			result := "Task completed successfully"
			m.state.Result = &result
		}
		return m, tea.Quit
	}

	// Update viewport
	var vpCmd tea.Cmd
	m.viewport, vpCmd = m.viewport.Update(msg)
	cmds = append(cmds, vpCmd)

	return m, tea.Batch(cmds...)
}

func (m tuiModel) View() string {
	if !m.ready {
		return "Initializing..."
	}

	var b strings.Builder

	// Title
	b.WriteString(titleStyle.Render("Local Orchestration"))
	b.WriteString("\n")

	// Status line
	statusText := fmt.Sprintf("Agent: %s | Workspace: %s", m.state.Agent, m.state.Workspace)
	b.WriteString(statusStyle.Render(statusText))
	b.WriteString("\n")

	// Running status with spinner
	var statusIndicator string
	switch m.state.Status {
	case "running":
		statusIndicator = m.spinner.View() + " " + runningStyle.Render("Running...")
	case "completed":
		statusIndicator = completedStyle.Render("[DONE] Completed")
	case "failed":
		statusIndicator = failedStyle.Render("[FAIL] Failed")
		if m.state.Error != nil {
			statusIndicator += ": " + *m.state.Error
		}
	default:
		statusIndicator = statusStyle.Render(m.state.Status)
	}
	b.WriteString(statusIndicator)
	b.WriteString("\n\n")

	// Events count
	eventsText := fmt.Sprintf("Events: %d | Duration: %s",
		len(m.state.Events),
		formatDuration(time.Since(parseTime(m.state.StartedAt)).Milliseconds()))
	b.WriteString(eventStyle.Render(eventsText))
	b.WriteString("\n")

	// Output viewport
	b.WriteString(outputStyle.Render(m.viewport.View()))
	b.WriteString("\n")

	// Help
	if m.done {
		b.WriteString(helpStyle.Render("Press q to exit"))
	} else {
		b.WriteString(helpStyle.Render("Press q to cancel | Scroll with arrow keys"))
	}

	return b.String()
}

func parseTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Now()
	}
	return t
}

// runWithTUI executes the agent with a live TUI display
func runWithTUI(ctx context.Context, state *LocalState, prompt, workspace string) error {
	// Create the TUI model
	m := initialTUIModel(state)

	// Create the bubbletea program
	p := tea.NewProgram(m, tea.WithAltScreen())

	// Channel for agent completion
	doneCh := make(chan error, 1)

	// Start the agent in a goroutine
	go func() {
		err := runAgentWithTUI(ctx, state, prompt, workspace, p)
		doneCh <- err
	}()

	// Run the TUI
	go func() {
		err := <-doneCh
		p.Send(doneMsg{err: err})
	}()

	finalModel, err := p.Run()
	if err != nil {
		return fmt.Errorf("TUI error: %w", err)
	}

	// Get final state from model
	if fm, ok := finalModel.(tuiModel); ok {
		*state = *fm.state
	}

	return state.getError()
}

func (s *LocalState) getError() error {
	if s.Error != nil {
		return fmt.Errorf("%s", *s.Error)
	}
	return nil
}

// runAgentWithTUI runs the agent and sends output to the TUI
func runAgentWithTUI(ctx context.Context, state *LocalState, prompt, workspace string, p *tea.Program) error {
	state.addEvent("task_started", fmt.Sprintf("Starting %s in %s", state.Agent, workspace))
	p.Send(eventMsg(state.Events[len(state.Events)-1]))

	var cmd *exec.Cmd
	var cliName string
	selection, err := resolveLocalAgentSelection(state.Agent, state.SelectedVariant)
	if err != nil {
		return err
	}

	switch selection.Provider {
	case "claude":
		claudePath, err := resolveAgentCLIPath("claude")
		if err != nil {
			return fmt.Errorf("claude CLI not found: %w", err)
		}
		args := buildLocalClaudeArgs(selection, prompt, localModel, currentLocalClaudeCLIOptions())
		cmd = exec.CommandContext(ctx, claudePath, args...)
		cliName = "Claude"

	case "codex":
		codexPath, err := exec.LookPath("codex")
		if err != nil {
			return fmt.Errorf("codex CLI not found: %w", err)
		}
		cmd = exec.CommandContext(ctx, codexPath, buildLocalCodexArgs(selection, prompt)...)
		cliName = "Codex"

	case "gemini":
		geminiPath, err := exec.LookPath("gemini")
		if err != nil {
			return fmt.Errorf("gemini CLI not found: %w", err)
		}
		cmd = exec.CommandContext(ctx, geminiPath, "-p", prompt)
		cliName = "Gemini"

	case "opencode":
		opencodePath, err := exec.LookPath("opencode")
		if err != nil {
			return fmt.Errorf("opencode CLI not found: %w", err)
		}
		cmd = exec.CommandContext(ctx, opencodePath, prompt)
		cliName = "Opencode"

	case "amp":
		ampPath, err := exec.LookPath("amp")
		if err != nil {
			return fmt.Errorf("amp CLI not found: %w", err)
		}
		cmd = exec.CommandContext(ctx, ampPath, prompt)
		cliName = "Amp"

	default:
		return fmt.Errorf("unsupported agent: %s", state.Agent)
	}

	cmd.Dir = workspace

	cleanup := func() {}
	if cliName == "Codex" {
		var err error
		cleanup, err = configureCodexLocalCommand(ctx, state, workspace, cmd)
		if err != nil {
			if flagVerbose && !flagJSON {
				fmt.Printf("Warning: failed to configure Codex session tracking: %v\n", err)
			}
			cleanup = func() {}
		}
	}
	defer cleanup()

	// Create pipes for stdout and stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	state.addEvent("agent_invoked", fmt.Sprintf("Spawning %s CLI", cliName))
	p.Send(eventMsg(state.Events[len(state.Events)-1]))
	p.Send(statusMsg("running"))

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start command: %w", err)
	}

	state.addEvent("agent_running", fmt.Sprintf("%s CLI executing", cliName))
	p.Send(eventMsg(state.Events[len(state.Events)-1]))

	// Stream output to TUI
	go streamToTUI(stdout, p)
	go streamToTUI(stderr, p)

	// Wait for command completion
	if err := cmd.Wait(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("%s CLI timed out after %s", cliName, localTimeout)
		}
		return fmt.Errorf("%s CLI failed: %w", cliName, err)
	}

	return nil
}

func streamToTUI(r io.Reader, p *tea.Program) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		p.Send(outputMsg(scanner.Text()))
	}
}

// runLocalWithTUI is the TUI-enabled version of run-local
func runLocalWithTUI(ctx context.Context, state *LocalState, prompt, workspace string) error {
	// Check if stdout is a terminal
	if fileInfo, _ := os.Stdout.Stat(); (fileInfo.Mode() & os.ModeCharDevice) == 0 {
		// Not a terminal, fall back to non-TUI mode
		return runAgentNonTUI(ctx, state, prompt, workspace)
	}

	return runWithTUI(ctx, state, prompt, workspace)
}

// runAgentNonTUI runs the agent without TUI (fallback for non-terminal)
func runAgentNonTUI(ctx context.Context, state *LocalState, prompt, workspace string) error {
	selection, err := resolveLocalAgentSelection(state.Agent, state.SelectedVariant)
	if err != nil {
		return err
	}

	switch selection.Provider {
	case "claude":
		return runClaudeLocal(ctx, state, prompt, workspace)
	case "codex":
		return runCodexLocal(ctx, state, prompt, workspace)
	case "gemini":
		return runGeminiLocal(ctx, state, prompt, workspace)
	case "opencode":
		return runOpencodeLocal(ctx, state, prompt, workspace)
	case "amp":
		return runAmpLocal(ctx, state, prompt, workspace)
	default:
		return fmt.Errorf("unsupported agent: %s", state.Agent)
	}
}
