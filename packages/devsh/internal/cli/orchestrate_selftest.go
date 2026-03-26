// internal/cli/orchestrate_selftest.go
package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

// SelftestResult represents the result of a single preflight check
type SelftestResult struct {
	Name    string `json:"name"`
	Status  string `json:"status"` // "pass", "fail", "warn", "skip"
	Message string `json:"message,omitempty"`
}

// SelftestReport represents the complete selftest report
type SelftestReport struct {
	Agent     string           `json:"agent"`
	Workspace string           `json:"workspace"`
	Results   []SelftestResult `json:"results"`
	AllPassed bool             `json:"allPassed"`
}

var (
	selftestAgent     string
	selftestWorkspace string
	selftestVerbose   bool
)

var orchestrateSelftestCmd = &cobra.Command{
	Use:   "selftest-local",
	Short: "Run preflight validation for local orchestration",
	Long: `Validate that local orchestration prerequisites are met before running tasks.

Checks:
  - Agent CLI availability (claude, codex, gemini, opencode, amp)
  - Workspace validity (exists, is git repo, has CLAUDE.md/AGENTS.md)
  - Credential availability (API keys, OAuth tokens)
  - Live view support (serve-local dependencies)

Examples:
  devsh orchestrate selftest-local
  devsh orchestrate selftest-local --agent claude
  devsh orchestrate selftest-local --workspace /path/to/repo
  devsh orchestrate selftest-local --verbose`,
	RunE: runSelftest,
}

func init() {
	orchestrateCmd.AddCommand(orchestrateSelftestCmd)

	orchestrateSelftestCmd.Flags().StringVarP(&selftestAgent, "agent", "a", "", "Agent to test (claude, codex, gemini, opencode, amp). Tests all if not specified.")
	orchestrateSelftestCmd.Flags().StringVarP(&selftestWorkspace, "workspace", "w", "", "Workspace directory to validate (default: current directory)")
	orchestrateSelftestCmd.Flags().BoolVarP(&selftestVerbose, "verbose", "v", false, "Show detailed output for each check")
}

func runSelftest(cmd *cobra.Command, args []string) error {
	workspace := selftestWorkspace
	if workspace == "" {
		var err error
		workspace, err = os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get current directory: %w", err)
		}
	}

	// Resolve to absolute path
	absWorkspace, err := filepath.Abs(workspace)
	if err != nil {
		return fmt.Errorf("failed to resolve workspace path: %w", err)
	}

	report := SelftestReport{
		Agent:     selftestAgent,
		Workspace: absWorkspace,
		Results:   []SelftestResult{},
		AllPassed: true,
	}

	// Determine which agents to test
	agents := []string{"claude", "codex", "gemini", "opencode", "amp"}
	if selftestAgent != "" {
		agents = []string{selftestAgent}
	}

	fmt.Printf("Running preflight checks for local orchestration...\n\n")

	// 1. Workspace checks
	fmt.Println("Workspace Checks:")
	report.Results = append(report.Results, checkWorkspaceExists(absWorkspace))
	report.Results = append(report.Results, checkIsGitRepo(absWorkspace))
	report.Results = append(report.Results, checkAgentInstructions(absWorkspace))
	fmt.Println()

	// 2. Agent CLI checks
	fmt.Println("Agent CLI Checks:")
	for _, agent := range agents {
		report.Results = append(report.Results, checkAgentCLI(agent))
	}
	fmt.Println()

	// 3. Credential checks
	fmt.Println("Credential Checks:")
	for _, agent := range agents {
		report.Results = append(report.Results, checkAgentCredentials(agent))
	}
	fmt.Println()

	// 4. Live view checks
	fmt.Println("Live View Checks:")
	report.Results = append(report.Results, checkLiveViewDependencies())
	fmt.Println()

	// Calculate overall status
	passCount := 0
	failCount := 0
	warnCount := 0
	for _, r := range report.Results {
		switch r.Status {
		case "pass":
			passCount++
		case "fail":
			failCount++
			report.AllPassed = false
		case "warn":
			warnCount++
		}
	}

	// Print summary
	fmt.Println("Summary:")
	fmt.Printf("  %d passed, %d failed, %d warnings\n", passCount, failCount, warnCount)

	if report.AllPassed {
		fmt.Println("\n✓ All preflight checks passed. Ready for local orchestration.")
		return nil
	}

	fmt.Println("\n✗ Some checks failed. Review the output above.")
	return fmt.Errorf("preflight checks failed")
}

func checkWorkspaceExists(workspace string) SelftestResult {
	result := SelftestResult{Name: "Workspace exists"}

	info, err := os.Stat(workspace)
	if err != nil {
		result.Status = "fail"
		result.Message = fmt.Sprintf("Directory not found: %s", workspace)
		printResult(result)
		return result
	}

	if !info.IsDir() {
		result.Status = "fail"
		result.Message = "Path is not a directory"
		printResult(result)
		return result
	}

	result.Status = "pass"
	result.Message = workspace
	printResult(result)
	return result
}

func checkIsGitRepo(workspace string) SelftestResult {
	result := SelftestResult{Name: "Git repository"}

	gitDir := filepath.Join(workspace, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		result.Status = "warn"
		result.Message = "Not a git repository (some features may not work)"
		printResult(result)
		return result
	}

	result.Status = "pass"
	result.Message = "Valid git repository"
	printResult(result)
	return result
}

func checkAgentInstructions(workspace string) SelftestResult {
	result := SelftestResult{Name: "Agent instructions"}

	// Check for common instruction files
	instructionFiles := []string{
		"CLAUDE.md",
		"AGENTS.md",
		".claude/CLAUDE.md",
		".cursor/rules",
	}

	found := []string{}
	for _, f := range instructionFiles {
		path := filepath.Join(workspace, f)
		if _, err := os.Stat(path); err == nil {
			found = append(found, f)
		}
	}

	if len(found) == 0 {
		result.Status = "warn"
		result.Message = "No instruction files found (CLAUDE.md, AGENTS.md)"
		printResult(result)
		return result
	}

	result.Status = "pass"
	result.Message = fmt.Sprintf("Found: %s", strings.Join(found, ", "))
	printResult(result)
	return result
}

func checkAgentCLI(agent string) SelftestResult {
	result := SelftestResult{Name: fmt.Sprintf("CLI: %s", agent)}

	cliName := getAgentCLIName(agent)
	path, err := exec.LookPath(cliName)
	if err != nil {
		result.Status = "fail"
		result.Message = fmt.Sprintf("'%s' not found in PATH", cliName)
		printResult(result)
		return result
	}

	// Try to get version
	version := getAgentVersion(cliName)
	if version != "" {
		result.Message = fmt.Sprintf("%s (%s)", path, version)
	} else {
		result.Message = path
	}

	result.Status = "pass"
	printResult(result)
	return result
}

func checkAgentCredentials(agent string) SelftestResult {
	result := SelftestResult{Name: fmt.Sprintf("Credentials: %s", agent)}

	envVars := getAgentEnvVars(agent)
	found := []string{}
	missing := []string{}

	for _, env := range envVars {
		if os.Getenv(env) != "" {
			found = append(found, env)
		} else {
			missing = append(missing, env)
		}
	}

	if len(found) == 0 {
		result.Status = "fail"
		result.Message = fmt.Sprintf("Missing: %s", strings.Join(missing, " or "))
		printResult(result)
		return result
	}

	result.Status = "pass"
	result.Message = fmt.Sprintf("Found: %s", strings.Join(found, ", "))
	printResult(result)
	return result
}

func checkLiveViewDependencies() SelftestResult {
	result := SelftestResult{Name: "Live view (serve-local)"}

	// Check for devsh orchestrations directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		result.Status = "warn"
		result.Message = "Could not determine home directory"
		printResult(result)
		return result
	}

	orchDir := filepath.Join(homeDir, ".devsh", "orchestrations")
	if _, err := os.Stat(orchDir); os.IsNotExist(err) {
		// Create it
		if err := os.MkdirAll(orchDir, 0755); err != nil {
			result.Status = "warn"
			result.Message = "Could not create orchestrations directory"
			printResult(result)
			return result
		}
	}

	result.Status = "pass"
	result.Message = orchDir
	printResult(result)
	return result
}

func getAgentCLIName(agent string) string {
	switch agent {
	case "claude":
		return "claude"
	case "codex":
		return "codex"
	case "gemini":
		return "gemini"
	case "opencode":
		return "opencode"
	case "amp":
		return "amp"
	default:
		return agent
	}
}

func getAgentVersion(cliName string) string {
	var versionFlag string
	switch cliName {
	case "claude":
		versionFlag = "--version"
	case "codex":
		versionFlag = "--version"
	case "gemini":
		versionFlag = "--version"
	case "opencode":
		versionFlag = "version"
	case "amp":
		versionFlag = "--version"
	default:
		versionFlag = "--version"
	}

	cmd := exec.Command(cliName, versionFlag)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}

	version := strings.TrimSpace(string(out))
	// Take first line only
	if idx := strings.Index(version, "\n"); idx != -1 {
		version = version[:idx]
	}
	// Truncate if too long
	if len(version) > 50 {
		version = version[:50] + "..."
	}
	return version
}

func getAgentEnvVars(agent string) []string {
	switch agent {
	case "claude":
		return []string{"ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"}
	case "codex":
		return []string{"OPENAI_API_KEY", "CODEX_AUTH_JSON"}
	case "gemini":
		return []string{"GOOGLE_API_KEY", "GEMINI_API_KEY"}
	case "opencode":
		return []string{"OPENCODE_AUTH_JSON", "OPENAI_API_KEY"}
	case "amp":
		return []string{"ANTHROPIC_API_KEY", "AMP_API_KEY"}
	default:
		return []string{}
	}
}

func printResult(result SelftestResult) {
	var icon string
	switch result.Status {
	case "pass":
		icon = "✓"
	case "fail":
		icon = "✗"
	case "warn":
		icon = "⚠"
	case "skip":
		icon = "○"
	default:
		icon = "?"
	}

	if result.Message != "" && selftestVerbose {
		fmt.Printf("  %s %s: %s\n", icon, result.Name, result.Message)
	} else if result.Status != "pass" || selftestVerbose {
		if result.Message != "" {
			fmt.Printf("  %s %s: %s\n", icon, result.Name, result.Message)
		} else {
			fmt.Printf("  %s %s\n", icon, result.Name)
		}
	} else {
		fmt.Printf("  %s %s\n", icon, result.Name)
	}
}

// runSelftestForAgent runs targeted preflight checks for a specific agent
// This is called by run-local --selftest to validate before starting
func runSelftestForAgent(agent string, workspace string) error {
	// Extract base agent name (e.g., "claude" from "claude/opus-4.6")
	baseAgent := agent
	if idx := strings.Index(agent, "/"); idx != -1 {
		baseAgent = agent[:idx]
	}

	var failures []string

	// Check workspace
	result := checkWorkspaceExists(workspace)
	if result.Status == "fail" {
		failures = append(failures, result.Message)
	}

	// Check git repo (warning only, not a failure)
	checkIsGitRepo(workspace)

	// Check agent CLI
	result = checkAgentCLI(baseAgent)
	if result.Status == "fail" {
		failures = append(failures, fmt.Sprintf("%s CLI: %s", baseAgent, result.Message))
	}

	// Check credentials
	result = checkAgentCredentials(baseAgent)
	if result.Status == "fail" {
		failures = append(failures, fmt.Sprintf("%s credentials: %s", baseAgent, result.Message))
	}

	if len(failures) > 0 {
		return fmt.Errorf("%s", strings.Join(failures, "; "))
	}

	fmt.Println("  ✓ Preflight checks passed")
	return nil
}
