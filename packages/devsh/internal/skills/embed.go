// Package skills provides embedded skill templates for devsh init.
package skills

import "embed"

// EmbeddedSkills contains all skill templates embedded at compile time.
//
//go:embed embedded/devsh-orchestrator/SKILL.md
//go:embed embedded/devsh-spawn/SKILL.md
//go:embed embedded/devsh-inject/SKILL.md
//go:embed embedded/devsh-team/SKILL.md
//go:embed embedded/head-agent-init/SKILL.md
//go:embed embedded/execute-plan/SKILL.md
//go:embed embedded/devsh/SKILL.md
var EmbeddedSkills embed.FS

// SkillNames lists all available skills in order of importance.
var SkillNames = []string{
	"devsh-orchestrator",
	"devsh-spawn",
	"devsh-inject",
	"devsh-team",
	"head-agent-init",
	"execute-plan",
	"devsh",
}

// SkillDescriptions provides a brief description for each skill.
var SkillDescriptions = map[string]string{
	"devsh-orchestrator": "Multi-agent orchestration for spawning and coordinating sub-agents",
	"devsh-spawn":        "Quick task delegation to remote sandbox agents",
	"devsh-inject":       "Send instructions to running agents mid-task",
	"devsh-team":         "Multi-agent coordination patterns (fan-out, pipeline, review)",
	"head-agent-init":    "Initialize session as workflow head agent",
	"execute-plan":       "Execute saved implementation plans via spawned agents",
	"devsh":              "Core devsh CLI reference for cloud VMs",
}
