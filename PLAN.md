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

### Phase 5: Approval Bridge — CODE COMPLETE
- [x] HTTP endpoints for approval broker (PR #754)
- [x] PermissionRequest hook script (PR #755)
- [x] Wire hook into Claude settings.json

### Phase 6: PreCompact Memory Sync — CODE COMPLETE
- [x] PreCompact hook script (PR #756)
- [x] Sync memory to Convex before context compression
- [x] Post context_warning activity event

### Phase 7: Subagent Lifecycle Hooks — CODE COMPLETE
- [x] SubagentStart hook (PR #757)
- [x] SubagentStop hook (PR #757)
- [x] Activity events for sub-agent spawning/completion

### Backlog / future
- Swift app (mobile client)
- D5.6: Native agent instruction injection (blocked on upstream CLI support)

### Open Issues
- #735: PVE-LXC exec connectivity failure (infrastructure)
