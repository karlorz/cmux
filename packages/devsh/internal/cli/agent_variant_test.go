package cli

import (
	"os"
	"reflect"
	"testing"
)

func TestResolveVariantFlagValue(t *testing.T) {
	t.Run("accepts alias when one flag is set", func(t *testing.T) {
		value, err := resolveVariantFlagValue("", "xhigh")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if value != "xhigh" {
			t.Fatalf("got %q, want %q", value, "xhigh")
		}
	})

	t.Run("rejects mismatched aliases", func(t *testing.T) {
		_, err := resolveVariantFlagValue("high", "xhigh")
		if err == nil {
			t.Fatal("expected mismatch error")
		}
	})
}

func TestResolveLocalAgentSelection(t *testing.T) {
	t.Run("normalizes legacy codex suffix names", func(t *testing.T) {
		selection, err := resolveLocalAgentSelection("codex/gpt-5.4-xhigh", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if selection.AgentName != "codex/gpt-5.4" {
			t.Fatalf("got agent %q, want %q", selection.AgentName, "codex/gpt-5.4")
		}
		if selection.SelectedVariant != "xhigh" {
			t.Fatalf("got variant %q, want %q", selection.SelectedVariant, "xhigh")
		}
		if selection.CodexModel != "gpt-5.4" {
			t.Fatalf("got model %q, want %q", selection.CodexModel, "gpt-5.4")
		}
	})

	t.Run("rejects unsupported Claude effort on non-opus-4.6 models", func(t *testing.T) {
		_, err := resolveLocalAgentSelection("claude/opus-4.5", "max")
		if err == nil {
			t.Fatal("expected error")
		}
	})
}

func TestBuildLocalCommandArgs(t *testing.T) {
	t.Run("builds Claude args with effort", func(t *testing.T) {
		selection := localAgentSelection{
			AgentName:       "claude/opus-4.6",
			Provider:        "claude",
			SelectedVariant: "max",
			ClaudeModel:     "claude-opus-4-6",
		}

		args := buildLocalClaudeArgs(selection, "fix bug", "", nil)
		want := []string{
			"-p",
			"--dangerously-skip-permissions",
			"--model",
			"claude-opus-4-6",
			"--effort",
			"max",
			"fix bug",
		}
		if !reflect.DeepEqual(args, want) {
			t.Fatalf("got %#v, want %#v", args, want)
		}
	})

	t.Run("builds Claude args with plugin development passthroughs", func(t *testing.T) {
		selection := localAgentSelection{
			AgentName:   "claude/opus-4.6",
			Provider:    "claude",
			ClaudeModel: "claude-opus-4-6",
		}

		options := &LocalClaudeCLIOptions{
			PluginDirs:      []string{"./plugin-a", "./plugin-b"},
			Settings:        "./settings.local.json",
			SettingSources:  "project,local",
			MCPConfigs:      []string{"./mcp.json"},
			AllowedTools:    "Read,Write",
			DisallowedTools: "Bash",
		}

		args := buildLocalClaudeArgs(selection, "fix bug", "", options)
		want := []string{
			"-p",
			"--dangerously-skip-permissions",
			"--model",
			"claude-opus-4-6",
			"--plugin-dir",
			"./plugin-a",
			"--plugin-dir",
			"./plugin-b",
			"--settings",
			"./settings.local.json",
			"--setting-sources",
			"project,local",
			"--mcp-config",
			"./mcp.json",
			"--allowed-tools",
			"Read,Write",
			"--disallowed-tools",
			"Bash",
			"fix bug",
		}
		if !reflect.DeepEqual(args, want) {
			t.Fatalf("got %#v, want %#v", args, want)
		}
	})

	t.Run("builds Codex args with reasoning effort", func(t *testing.T) {
		selection := localAgentSelection{
			AgentName:       "codex/gpt-5.4",
			Provider:        "codex",
			SelectedVariant: "xhigh",
			CodexModel:      "gpt-5.4",
		}

		args := buildLocalCodexArgs(selection, "fix bug")
		want := []string{
			"--model",
			"gpt-5.4",
			"--sandbox",
			"danger-full-access",
			"-c",
			`model_reasoning_effort="xhigh"`,
			"fix bug",
		}
		if !reflect.DeepEqual(args, want) {
			t.Fatalf("got %#v, want %#v", args, want)
		}
	})

	t.Run("builds Codex args with CODEX_SANDBOX_MODE override", func(t *testing.T) {
		os.Setenv("CODEX_SANDBOX_MODE", "workspace-write")
		defer os.Unsetenv("CODEX_SANDBOX_MODE")

		selection := localAgentSelection{
			AgentName:  "codex/gpt-5.4",
			Provider:   "codex",
			CodexModel: "gpt-5.4",
		}

		args := buildLocalCodexArgs(selection, "fix bug")
		want := []string{
			"--model",
			"gpt-5.4",
			"--sandbox",
			"workspace-write",
			"fix bug",
		}
		if !reflect.DeepEqual(args, want) {
			t.Fatalf("got %#v, want %#v", args, want)
		}
	})
}
