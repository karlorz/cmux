## Living plan

### Phase 0: Housekeeping — COMPLETE
- [x] Merge 20 passing test PRs from coverage sprint
- [x] Start Coolify web stack migration (workflows deployed)
- [x] PR heatmap experiment (PR #607)
- [x] Local captain mode (32 devsh orchestrate subcommands)
- [x] Documentation coverage (14 packages + 9 apps)

### Phase 0.5: Native Workflow Dashboard — COMPLETE
- [x] Agent activity stream: real-time tool calls, file edits, test results
- [x] Error surfacing: agent errors visible immediately (StopFailure hook)
- [x] Live diff panel: code changes without VS Code iframe (PR #728)
- [x] Test results panel (PR #728)
- VS Code iframe now optional "deep dive", not primary view

### Phase 1: PR Comment → Agent ("Launch 1") — CODE COMPLETE
- [x] `issue_comment` webhook handler in `github_webhook.ts`
- [x] Parse `@cmux` mentions → extract prompt + PR context
- [x] Create task from comment → spawn agent → post result back to PR
- [ ] **ENABLEMENT**: Enable `issue_comment` event in GitHub App settings

### Phase 2: Operator Visual Verification ("Launch 2") — CODE COMPLETE
- [x] Browser automation agent (magnitude-core + operator profile)
- [x] Screenshot capture pipeline
- [x] Post screenshot gallery to PR
- [ ] **ENABLEMENT**: Set `CMUX_ENABLE_OPERATOR_VERIFICATION=true`

### Phase 3: Swipe Code Review ("Launch 3") — COMPLETE
- [x] Mobile-first card-based review UX (swipe-review-ui.tsx)
- [x] Swipe right (approve) / left (request changes) per file
- [x] AI-assisted risk scoring via packages/pr-heatmap
- [x] Merge queue backend (prMergeQueue.ts)
- [x] GitHub API integration for PR reviews

### Phase 4: Memory Quality & Lifecycle — COMPLETE
- [x] Memory freshness scoring (agentMemoryFreshness.ts)
- [x] Usage tracking and stale entry detection
- [x] Context health visibility (context_warning events)
- [x] Provider-neutral lifecycle events (session_stop_blocked, context_warning)
- [x] Context usage tracking and 80% warning threshold

### Phase 5: Approval Bridge — MERGED
- [x] HTTP endpoints for approval broker (PR #754)
- [x] PermissionRequest hook script (PR #755)
- [x] Wire hook into Claude settings.json

### Phase 6: PreCompact Memory Sync — MERGED
- [x] PreCompact hook script (PR #756)
- [x] Sync memory to Convex before context compression
- [x] Post context_warning activity event

### Phase 7: Subagent Lifecycle Hooks — MERGED
- [x] SubagentStart hook (PR #757)
- [x] SubagentStop hook (PR #757)
- [x] Activity events for sub-agent spawning/completion

### Phase 8: User Prompt Tracking — MERGED
- [x] UserPromptSubmit hook (PR #758)
- [x] Activity events for user prompt submissions

### Phase 18: Coolify Web Stack Migration — PLANNED
Based on [[cmux-coolify-all-in-one-stack-study]] recommendations:
- [ ] Phase 18a: Migrate apps/client to Coolify (easiest, static frontend)
- [ ] Phase 18b: Migrate apps/www to Coolify (standalone + Hono entrypoint ready)
- [ ] Phase 18c: Unify into single Docker Compose application
- [ ] Validate env/domain wiring per cutover validation matrix

### Phase 19: MCP Tool Suggestions — PLANNED
Based on Codex `tool_suggest` pattern from [[research-extended-2026-03-21]]:
- [ ] AI-powered tool recommendation for task prompts
- [ ] Surface recommended MCP tools before spawn
- [ ] Learn from user selections (future)

### Phase 20: Memory Forgetting Policy — PLANNED
Based on Codex memory refinements from [[research-weekly-2026-03-19]]:
- [ ] Diff-based forgetting for stale memories
- [ ] Usage-aware selection (prioritize frequently-read entries)
- [ ] Explicit pruning/demotion rules

### Phase 21: Self-Improving Memory (Orchestrator Learning) — CODE COMPLETE
Based on [[cmux-self-improving-memory-roadmap]]:
- [x] S12: Typed learning capture via `log_learning` MCP tool (devsh-memory-mcp)
- [x] S13: Learning events captured with provenance (agentOrchestrationLearning.ts)
- [x] S14: Rule promotion with `promoteRule`/`bulkPromoteRules` mutations
- [x] S15: Active rules loaded into head-agent context (orchestration_http.ts)
- [x] S16: UI panel for rules, candidates, and skill candidates (OrchestrationRulesSection)
- [x] S17: Skill candidate schema and UI (agentOrchestrationSkillCandidates table, SkillsList.tsx)
- [ ] **VALIDATION**: Real-world E2E testing of learning → promotion → injection cycle

### Phase 22: Agent Memory Spike Validation — PLANNED
Based on [[cmux-agent-dev-roadmap]] spike status:
- [ ] S1: Real-world validation of file-based memory protocol
- [ ] S2: Two-agent coordination via MAILBOX.json validation
- [ ] S3: Convex sync observability validation

### Backlog / future
- Swift app (mobile client)
- D5.6: Native agent instruction injection (blocked on upstream CLI support)
- `--bare` mode evaluation (NOT recommended - disables critical hooks, see [[dev-log/2026-03-22-bare-mode-evaluation]])
- `--channels` approval bridge (blocked - flag not in CLI v2.1.79)
- Cost reduction roadmap: OpenRouter for 20-30% savings, local AI routing (see [[cmux-costreduce-roadmap]])
- Sandbox prewarming for faster agent startup

### Open Issues
- #735: PVE-LXC exec connectivity failure (infrastructure)

### Enablement Checklist (CODE COMPLETE, needs config)
- [ ] **Phase 1**: Enable `issue_comment` webhook in GitHub App settings
- [ ] **Phase 2**: Set `CMUX_ENABLE_OPERATOR_VERIFICATION=true` in production env

### Phase 9: Notification Hook — MERGED
- [x] Notification hook (PR #759)
- [x] Activity events for attention requests

### Phase 10: PostCompact Context Re-injection — MERGED
- [x] PostCompact hook (PR #760)
- [x] Re-inject P0 Core memory after compaction
- [x] Activity events for compaction completion

### Claude Code Hook Integration Summary (Phases 5-10)
All 11 Claude Code v2.1.78 hooks integrated:
- Stop, StopFailure (existing)
- PermissionRequest, PreCompact, PostCompact (lifecycle)
- SubagentStart, SubagentStop (coordination)
- UserPromptSubmit, Notification (activity tracking)
- PostToolUse (tool-specific)

### Phase 11: Codex CLI Hook Integration — MERGED
- [x] Stop hook for session completion tracking (PR #761)
- [x] SessionStart hook for session initialization
- [x] StopFailure hook for error surfacing
- [x] hooks.json configuration file
- [x] Enable `codex_hooks = true` feature flag in config.toml

### Phase 12: OpenCode Activity Stream Integration — MERGED
- [x] Session completion activity event posting (PR #762)
- [x] Session start hook with activity event
- [x] Error hook for error surfacing
- [x] Plugin integration for session lifecycle

### Phase 13: Gemini Activity Stream Integration — MERGED
- [x] Session start hook with activity event (PR #763)
- [x] Session completion hook with activity event
- [x] Error hook for error surfacing
- [x] Startup command to fire session start

### Phase 14: Amp Activity Stream Integration — MERGED
- [x] Session start hook with activity event (PR #764)
- [x] Session completion hook with activity event
- [x] Error hook for error surfacing
- [x] Startup command to fire session start

### Phase 15: Grok Activity Stream Integration — MERGED
- [x] Session start hook with activity event (PR #765)
- [x] Session completion hook with activity event
- [x] Error hook for error surfacing
- [x] Startup command to fire session start

### Phase 16: Qwen Activity Stream Integration — MERGED
- [x] Session start hook with activity event (PR #766)
- [x] Session completion hook with activity event
- [x] Error hook for error surfacing
- [x] Startup command to fire session start

### Phase 17: Cursor Activity Stream Integration — MERGED
- [x] Session start hook with activity event (PR #767)
- [x] Session completion hook with activity event
- [x] Error hook for error surfacing
- [x] Startup command to fire session start

### Activity Stream Integration Summary (Phases 11-17)
All 8 providers now have real-time dashboard activity streaming:
- Claude Code (anthropic) - Phases 5-10 hooks
- Codex CLI (openai) - Phase 11
- OpenCode - Phase 12
- Gemini CLI - Phase 13
- Amp - Phase 14
- Grok - Phase 15
- Qwen - Phase 16
- Cursor - Phase 17
