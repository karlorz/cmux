package cli

import (
	"fmt"
	"os"
	"strings"
)

type LocalClaudeCLIOptions struct {
	PluginDirs      []string `json:"pluginDirs,omitempty"`
	Settings        string   `json:"settings,omitempty"`
	SettingSources  string   `json:"settingSources,omitempty"`
	MCPConfigs      []string `json:"mcpConfigs,omitempty"`
	AllowedTools    string   `json:"allowedTools,omitempty"`
	DisallowedTools string   `json:"disallowedTools,omitempty"`
}

type localAgentSelection struct {
	RequestedAgentName string
	AgentName          string
	Provider           string
	SelectedVariant    string
	ClaudeModel        string
	CodexModel         string
}

var claudeLocalModelIDs = map[string]string{
	"claude/opus-4.6":   "claude-opus-4-6",
	"claude/opus-4.5":   "claude-opus-4-5-20251101",
	"claude/sonnet-4.5": "claude-sonnet-4-5-20250929",
	"claude/haiku-4.5":  "claude-haiku-4-5-20251001",
}

var claudeOpus46EffortVariants = map[string]struct{}{
	"low":    {},
	"medium": {},
	"high":   {},
	"max":    {},
}

var codexReasoningVariants = []string{
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
}

func resolveVariantFlagValue(variantFlag string, effortFlag string) (string, error) {
	variant := strings.TrimSpace(variantFlag)
	effort := strings.TrimSpace(effortFlag)

	switch {
	case variant == "" && effort == "":
		return "", nil
	case variant == "":
		return effort, nil
	case effort == "":
		return variant, nil
	case variant == effort:
		return variant, nil
	default:
		return "", fmt.Errorf("--variant and --effort must match when both are provided")
	}
}

func normalizeLegacyCodexAgentName(agentName string) (string, string) {
	trimmed := strings.TrimSpace(agentName)
	if !strings.HasPrefix(trimmed, "codex/") {
		return trimmed, ""
	}

	for _, variant := range codexReasoningVariants {
		suffix := "-" + variant
		if strings.HasSuffix(trimmed, suffix) && len(trimmed) > len(suffix) {
			return strings.TrimSuffix(trimmed, suffix), variant
		}
	}

	return trimmed, ""
}

func resolveLocalAgentSelection(
	agentName string,
	explicitVariant string,
) (localAgentSelection, error) {
	requested := strings.TrimSpace(agentName)
	if requested == "" {
		return localAgentSelection{}, fmt.Errorf("agent is required")
	}

	switch {
	case strings.HasPrefix(requested, "claude/"):
		claudeModel, ok := claudeLocalModelIDs[requested]
		if !ok {
			return localAgentSelection{}, fmt.Errorf("unsupported local Claude agent: %s", requested)
		}
		if explicitVariant != "" {
			if requested != "claude/opus-4.6" {
				return localAgentSelection{}, fmt.Errorf("effort is only supported locally for claude/opus-4.6")
			}
			if _, ok := claudeOpus46EffortVariants[explicitVariant]; !ok {
				return localAgentSelection{}, fmt.Errorf("unsupported Claude effort %q (allowed: low, medium, high, max)", explicitVariant)
			}
		}
		return localAgentSelection{
			RequestedAgentName: requested,
			AgentName:          requested,
			Provider:           "claude",
			SelectedVariant:    explicitVariant,
			ClaudeModel:        claudeModel,
		}, nil
	case strings.HasPrefix(requested, "codex/"):
		baseAgentName, inferredVariant := normalizeLegacyCodexAgentName(requested)
		if explicitVariant != "" && inferredVariant != "" && explicitVariant != inferredVariant {
			return localAgentSelection{}, fmt.Errorf("legacy agent %s implies effort %q but --variant/--effort requested %q", requested, inferredVariant, explicitVariant)
		}
		selectedVariant := explicitVariant
		if selectedVariant == "" {
			selectedVariant = inferredVariant
		}
		for _, variant := range []string{selectedVariant} {
			if variant == "" {
				continue
			}
			valid := false
			for _, allowed := range codexReasoningVariants {
				if variant == allowed {
					valid = true
					break
				}
			}
			if !valid {
				return localAgentSelection{}, fmt.Errorf("unsupported Codex effort %q (allowed: minimal, low, medium, high, xhigh)", variant)
			}
		}
		return localAgentSelection{
			RequestedAgentName: requested,
			AgentName:          baseAgentName,
			Provider:           "codex",
			SelectedVariant:    selectedVariant,
			CodexModel:         strings.TrimPrefix(baseAgentName, "codex/"),
		}, nil
	case strings.HasPrefix(requested, "gemini/"):
		if explicitVariant != "" {
			return localAgentSelection{}, fmt.Errorf("effort is not supported for local Gemini runs")
		}
		return localAgentSelection{
			RequestedAgentName: requested,
			AgentName:          requested,
			Provider:           "gemini",
		}, nil
	case strings.HasPrefix(requested, "opencode/"):
		if explicitVariant != "" {
			return localAgentSelection{}, fmt.Errorf("effort is not supported for local OpenCode runs")
		}
		return localAgentSelection{
			RequestedAgentName: requested,
			AgentName:          requested,
			Provider:           "opencode",
		}, nil
	case strings.HasPrefix(requested, "amp/"):
		if explicitVariant != "" {
			return localAgentSelection{}, fmt.Errorf("effort is not supported for local Amp runs")
		}
		return localAgentSelection{
			RequestedAgentName: requested,
			AgentName:          requested,
			Provider:           "amp",
		}, nil
	default:
		return localAgentSelection{}, fmt.Errorf("unsupported agent: %s", requested)
	}
}

func buildLocalClaudeArgs(selection localAgentSelection, prompt string, modelOverride string, options *LocalClaudeCLIOptions) []string {
	args := []string{"-p", "--dangerously-skip-permissions"}
	model := strings.TrimSpace(modelOverride)
	if model == "" {
		model = selection.ClaudeModel
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	if selection.SelectedVariant != "" {
		args = append(args, "--effort", selection.SelectedVariant)
	}
	if options != nil {
		for _, pluginDir := range options.PluginDirs {
			if strings.TrimSpace(pluginDir) != "" {
				args = append(args, "--plugin-dir", pluginDir)
			}
		}
		if strings.TrimSpace(options.Settings) != "" {
			args = append(args, "--settings", options.Settings)
		}
		if strings.TrimSpace(options.SettingSources) != "" {
			args = append(args, "--setting-sources", options.SettingSources)
		}
		for _, mcpConfig := range options.MCPConfigs {
			if strings.TrimSpace(mcpConfig) != "" {
				args = append(args, "--mcp-config", mcpConfig)
			}
		}
		if strings.TrimSpace(options.AllowedTools) != "" {
			args = append(args, "--allowed-tools", options.AllowedTools)
		}
		if strings.TrimSpace(options.DisallowedTools) != "" {
			args = append(args, "--disallowed-tools", options.DisallowedTools)
		}
	}
	return append(args, prompt)
}

func buildLocalCodexArgs(selection localAgentSelection, prompt string) []string {
	// Allow override via CODEX_SANDBOX_MODE env var, default to danger-full-access
	// Options: danger-full-access (default), workspace-write, off
	// workspace-write requires bubblewrap support in the container (kernel.unprivileged_userns_clone=1)
	sandboxMode := os.Getenv("CODEX_SANDBOX_MODE")
	if sandboxMode == "" {
		sandboxMode = "danger-full-access"
	}
	args := []string{"--model", selection.CodexModel, "--sandbox", sandboxMode}
	if selection.SelectedVariant != "" {
		args = append(args, "-c", fmt.Sprintf("model_reasoning_effort=\"%s\"", selection.SelectedVariant))
	}
	return append(args, prompt)
}
