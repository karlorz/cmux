# Dev Loop — cmux

## Identity

```yaml
slug: cmux
release_branch: main
```

## PRD layer

```yaml
prd_layer: superpowers
prd_pipeline: tdd-first

prd_backends:
  superpowers:
    capabilities: [brainstorm, spec, plan, execute, review, subagent_dispatch]
    skills:
      brainstorm: superpowers:brainstorming
      plan: superpowers:writing-plans
      execute: superpowers:subagent-driven-development
      execute_fallback: superpowers:executing-plans
      review: simplify:simplify
```

## Execution disciplines

```yaml
prd_disciplines:
  - skill: superpowers:using-git-worktrees
    when: execute
    mode: mandatory
    include_paths:
      - "**"
  - skill: superpowers:test-driven-development
    when: execute
    mode: mandatory
    include_paths:
      - packages/convex/**
      - apps/www/lib/routes/**
      - apps/server/**
      - packages/shared/**
      - packages/sandbox/**
      - packages/devsh/**
      - apps/edge-router/**
      - apps/edge-router-pvelxc/**
  - skill: superpowers:test-driven-development
    when: execute
    mode: advisory
  - skill: superpowers:systematic-debugging
    when: failure
    mode: reactive
```

## Critical paths

```yaml
critical_paths:
  sandbox_lifecycle:
    code:
      - packages/sandbox/**
      - apps/server/src/agentSpawner*.ts
      - packages/shared/src/sandbox-presets.ts
      - apps/edge-router/**
      - apps/edge-router-pvelxc/**
    vault:
      - cmux
    history_pins:
      - "Provider lifecycle changes affect isolated task sandboxes and openvscode routing."
  backend_api:
    code:
      - packages/convex/convex/**
      - apps/www/lib/hono-app.ts
      - apps/www/lib/routes/**
      - packages/www-openapi-client/**
    vault:
      - cmux
    history_pins:
      - "Hono request bodies must set request.body.required for proper Content-Type validation."
  agent_dashboard:
    code:
      - apps/client/src/components/**
      - apps/client/src/routes/**
      - apps/client/src/hooks/**
      - apps/client/src/lib/**
    vault:
      - cmux
    history_pins:
      - "Task-run activity, diff, terminal, browser, PR, and memory routes are core operator visibility surfaces."
  devsh_cli:
    code:
      - packages/devsh/**
      - packages/cloudrouter/**
      - packages/shared/src/agent-*.ts
    vault:
      - cmux
    history_pins:
      - "devsh manages sandbox lifecycle and publishing is separate from the terminal cmux project."
```

## Fact checking

```yaml
fact_check:
  enabled: true
  source_order:
    - local_repo
    - vault_query
  triggers:
    - version claims
    - deprecation notices
    - CVE checks
    - external API behavior
    - provider API changes
  evidence_contract:
    require_sources_used_section: true
```

## Idle deep research

```yaml
idle_deep_research:
  enabled: true
  topic_seeds:
    - sandbox provider lifecycle reliability
    - Convex and Hono API validation drift
    - agent dashboard browser regressions
    - devsh CLI release and sandbox orchestration quality
    - PVE LXC and Morph snapshot maintenance
  bias_toward: critical_paths
  cooldown_cycles: 3
  max_per_day: 4
  skip_if_recent_query_page_exists: 14
  budget:
    web_searches: 3
    deep_fetches: 3
    context7_calls: 3
```

## Investigation and preflight

```yaml
investigate:
  max_items: 5
  topic_seeds: []

preflight:
  enabled: true
  default_limit: 5
  default_lanes: [work, captures, hygiene]
  require_approved_spec_and_plan: true
  unattended_not_ready_behavior: skip
  defaults:
    compatibility_policy: "Platform compatibility changes are additive unless explicitly scoped otherwise."
```

## Browser verification

```yaml
browser_verification:
  enabled: true
  trigger:
    - "apps/client/**/*.tsx"
    - "apps/client/**/*.ts"
    - "apps/client/**/*.css"
    - "apps/www/app/**/*.tsx"
    - "apps/www/app/**/*.ts"
    - "apps/www/lib/routes/**/*.ts"
  prerequisites:
    - "curl -fsS http://localhost:5173 >/dev/null"
  driver: playwright-cli
  base_url: http://localhost:5173
  smoke_routes:
    - /
    - /sign-in
  reviser_workflow:
    - take_snapshot
    - list_console_messages
    - evaluate_script
  e2e_fallback: bun run test
```

## Reactive debugging

```yaml
reactive_debugging:
  enabled: true
  auto_retry_attempts: 2
  evidence_dir: .claude/dev-loop-debug/
  evidence_capture:
    - "git diff > {evidence_dir}/{cycle}-diff.patch"
    - "git log --oneline -5 > {evidence_dir}/{cycle}-commits.log"
  escalate_after:
    consecutive_idle_cycles: 3
    same_error_signature: true
  escalation_action: surface_p1_finding
```

## Code review

```yaml
code_review:
  parallel: true
  codex:
    enabled_in_normal: false
    enabled_in_high: false
    agent: dev-loop:codex-review-worker
```

## Knowledge layer

```yaml
knowledge_layer: skillwiki

knowledge_backends:
  skillwiki:
    vault: auto
    cli_entry: skillwiki
  none:
    work_dir: .claude/dev-loop-work/

vault_auto_commit: true

vault_sync:
  peer_aware: true
  lock_timeout_seconds: 30
  retry_budget: 3
  presync_skill: auto-detect
```

## Interview

```yaml
interview:
  setup:
    skill: setup-dev-loop
    glossary: grill-with-docs
  work_item:
    upgrade: grill-with-docs
    trigger: auto
    goal_override: never
```

## Code layout

```yaml
cli_src: packages/devsh/
cli_test: packages/devsh/
skills_glob: ""
cli_entry_override: ""
```

## E2E

```yaml
e2e_scripts: []
```

## Release and deploy

```yaml
bump_script: ""
publish_via: none
deploy_script: ""
manifests_count: 0
remote_hosts: []
```

## CI behavior

```yaml
ci_configured: false
ci_discovery: runtime
```

Existing GitHub Actions still validate pushed branches and PRs. Dev-loop CI auto-merge is deliberately disabled because cmux requires explicit user approval before every merge.

## Repository overrides

```yaml
notes:
  canonical_policy: "CLAUDE.md (also exposed through the AGENTS.md symlink)"
  repo_target: "Primary upstream manaflow-ai/manaflow; fork karlorz/cmux. The terminal cmux project is a separate workspace."
  worktree_policy: "Before execute, reuse existing isolation or create an isolated feature-branch worktree via superpowers:using-git-worktrees; never nest worktrees."
  package_manager: "Use bun install and bun run test; never substitute npm or bare bun test."
  git_policy: "Never commit or push directly to main/master. Push feature branches only."
  task_sandbox_pr_policy: "When CMUX_TASK_RUN_JWT is set and CMUX_IS_ORCHESTRATION_HEAD is not set, do not run gh pr create; cmux owns the task PR."
  merge_policy: "Never enable auto-merge or merge a PR without explicit user approval. Preserve branches after merge."
  dev_cycle: "Commit normally so the pre-commit hook runs bun check; do not run bun check manually before commit and never use --no-verify."
  review_policy: "Run simplify:simplify as the required base code-review gate for code changes."
```
