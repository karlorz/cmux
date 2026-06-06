# Dev Loop — cmux

slug: cmux
vault: /Users/karlchow/wiki
release_branch: main

memory_layer: none

prd_layer: superpowers
prd_pipeline: tdd-first

prd_disciplines:
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
      - "devsh manages sandbox lifecycle and publishing is handled separately from the terminal cmux project."

fact_check:
  enabled: true
  source_order:
    - local_repo
    - context7
    - vault_query
    - web_search
  web_tools:
    primary: mcp__grok_search__web_search
    deep_fetch: mcp__grok_search__web_fetch
    site_map: mcp__grok_search__web_map
    plan_first: mcp__grok_search__plan_intent
  triggers:
    - version claims
    - deprecation notices
    - CVE checks
    - external API behavior
    - provider API changes
  evidence_contract:
    require_sources_used_section: true
    cite_session_id: true

idle_deep_research:
  enabled: true
  skill: deep-research
  trigger:
    when: idle_after_mechanical_scan
    if: no_p2_or_higher_findings
    cooldown: every_3rd_idle_cycle
    max_per_day: 4
  topic_seeds:
    - sandbox provider lifecycle reliability
    - Convex and Hono API validation drift
    - agent dashboard browser regressions
    - devsh CLI release and sandbox orchestration quality
    - PVE LXC and Morph snapshot maintenance
  topic_selection:
    bias_toward: critical_paths
    skip_if_recent_query_page_exists: 14d
  output_mode: vault
  budget:
    web_searches: 3
    deep_fetches: 3
    context7_calls: 3
  followups:
    on_finding: schema_compatible_vault_queue
    p_score_default: P3

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

browser_verification:
  enabled: true
  trigger:
    - apps/client/**/*.tsx
    - apps/client/**/*.ts
    - apps/client/**/*.css
    - apps/www/app/**/*.tsx
    - apps/www/app/**/*.ts
    - apps/www/lib/routes/**/*.ts
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

reactive_debugging:
  enabled: true
  auto_retry_attempts: 2
  evidence_dir: .claude/dev-loop-debug/
  evidence_capture:
    - "bun run check 2>&1 | tee {evidence_dir}/{cycle}-check.log"
    - "git diff > {evidence_dir}/{cycle}-diff.patch"
    - "git log --oneline -5 > {evidence_dir}/{cycle}-commits.log"
  fact_check_tool: mcp__grok_search__web_search
  escalate_after:
    consecutive_idle_cycles: 3
    same_error_signature: true
  escalation_action: surface_p1_finding

code_review:
  parallel: true
  codex:
    enabled_in_normal: false
    enabled_in_high: false
    agent: dev-loop:codex-review-worker

knowledge_layer: skillwiki

knowledge_backends:
  skillwiki:
    vault: /Users/karlchow/wiki
    cli_entry: skillwiki
  none:
    work_dir: .claude/dev-loop-work/

vault_auto_commit: true

vault_sync:
  peer_aware: true
  lock_timeout_seconds: 30
  retry_budget: 3
  presync_skill: auto-detect

interview:
  setup:
    skill: setup-dev-loop
    glossary: grill-with-docs
  work_item:
    default: native
    upgrade: grill-with-docs
    source: mattpocock/skills
    install: "npx skills@latest add mattpocock/skills --skill grill-with-docs -a claude-code -g -y"
    trigger: auto
    goal_override: never

cli_src: packages/devsh/
cli_test: packages/devsh/
skills_glob: ""
cli_entry_override: ""

e2e_scripts:
  - bun run test

bump_script: ""
publish_via: none
deploy_script: ""
manifests_count: 0
remote_hosts: []

ci_configured: true
ci_discovery: runtime

notes:
  canonical_policy: AGENTS.md
  repo_target: "Primary upstream manaflow-ai/manaflow, fork karlorz/cmux."
  ci_note: "Existing checks.yml/tests.yml workflows are present; branch protection required checks were not detected via GitHub API."
  dev_cycle: "After code changes, stage and commit directly; pre-commit hook runs bun check."
