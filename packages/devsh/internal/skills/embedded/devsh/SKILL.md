---
name: devsh
description: Core devsh CLI reference for cloud VMs, local orchestration, and agent workflow helpers.
context: local
allowed-tools:
  - Bash
  - Read
when_to_use: >
  When you need a compact reference for the main devsh command families:
  local orchestration, cloud orchestration, task tracking, and project bootstrap.
argument-hint: <command> [flags]
---

# devsh - Core CLI Reference

Use this skill as the quick orientation guide for the `devsh` CLI.

## Main command families

### Local orchestration

```bash
devsh orchestrate selftest-local
devsh orchestrate run-local --agent claude/haiku-4.5 "Fix the bug"
devsh orchestrate inject-local <run-id> "Also add tests"
devsh orchestrate show-local <run-id>
devsh orchestrate list-local
```

### Cloud orchestration

```bash
devsh orchestrate spawn --agent claude/haiku-4.5 --repo owner/repo "Implement feature X"
devsh orchestrate status <orch-task-id> --watch
devsh orchestrate wait <orch-task-id>
devsh orchestrate cancel <orch-task-id>
```

### Project bootstrap

```bash
devsh init
devsh init --mcp
devsh skills
```

## High-signal notes

- Use `run-local` for fast local iteration and persisted artifacts.
- Use `spawn` for remote sandbox execution with orchestration tracking.
- Use `inject-local` or `message` for follow-up steering after launch.
- Use `selftest-local` before local Claude or Codex runs when validating a new environment.

## See also

- `/devsh-orchestrator`
- `/devsh-spawn`
- `/devsh-inject`
- `/devsh-team`
