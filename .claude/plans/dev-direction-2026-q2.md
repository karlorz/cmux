# Dev Direction: cmux Q2 2026

## Vision

cmux evolves from "spawn parallel coding agents" to **the platform where AI agents produce verified, reviewable changes through automated testing and human-in-the-loop code review**.

The three launch pillars:
1. **PR Comment → Agent** (GitHub-native feedback loop)
2. **Operator Visual Verification** (browser automation screenshots on PRs)
3. **Swipe Code Review** (mobile-first review UX with merge queue)

## Current State (Updated 2026-03-19)

### Phase Status
- **Phase 0**: Complete (test PRs merged)
- **Phase 0.5**: Complete (Activity stream in dashboard - PR #687)
- **Phase 1**: Complete (PR Comment → Agent - PR #691, #692)
- **Phase 2**: Complete (Operator Screenshots - PR #693)
- **Phase 3**: Complete (Swipe Code Review - PR #694)
- **Phase 4**: Not started

## Previous State (2026-03-19)

### What's Complete
- Cloud orchestration: SSE events, JWT auth, 31 MCP tools, background worker
- Local captain mode: 32 devsh orchestrate subcommands, supervise-local, view --live
- Agent memory: devsh-memory-mcp v0.3.8, learning pipeline, behavior memory
- Test coverage: ~1200 tests + 20 PRs passing (ready to merge)
- Documentation: 14 packages + 9 apps documented
- Deployment: Docker build decoupled from Coolify, multi-arch (amd64+arm64)
- Providers: PVE-LXC (active), E2B (active, 64 tests), Morph (stale)

### What's Missing (Dev Direction Gaps)
- No PR comment → agent pipeline (GitHub webhook stubs exist but are no-ops)
- No browser automation post-run (magnitude-core exists but not integrated)
- No mobile-friendly review UX (current diff viewer is desktop-focused)
- Memory freshness/forgetting not implemented
- Provider-neutral lifecycle events not implemented
- Vercel deployment cap still bottlenecking apps/www and apps/client
- 20 test PRs need merging

## Confirmed Priority Order (2026-03-19)

```
Phase 0:   Housekeeping (merge 20 test PRs, Coolify start)
Phase 0.5: Native Workflow Dashboard ← FOUNDATION FOR EVERYTHING
Phase 1:   PR Comment → Agent (Launch 1)
Phase 2:   Operator Screenshots (Launch 2)
Phase 3:   Swipe Code Review (Launch 3)
Phase 4:   Memory Quality & Lifecycle
```

> Decision: Native workflow view comes first. All 3 launches build on top of it.
> Without Phase 0.5, users can't see what agents are doing — the dashboard is blind.
> See `.claude/plans/native-workflow-dashboard.md` for detailed Phase 0.5 architecture.

---

## Phase 0: Housekeeping (This Week)

### 0.1 Merge Test Sprint PRs
- 20 open PRs all passing checks
- Batch merge with `gh pr merge --squash --auto` for each
- Validates CI pipeline handles concurrent merges

### 0.2 Coolify Web Stack Migration (Start)
- Move `apps/client` to Coolify stack first (Vite SPA, minimal coupling)
- Then `apps/www` after removing `hono/vercel` adapter
- Unblocks Vercel deployment cap (~100/day limit)
- Reference: [[cmux-coolify-all-in-one-stack-study]]

## Phase 1: PR Comment → Agent ("Launch 1")

### What
GitHub PR/issue comments mentioning `@cmux` trigger a coding agent to work on the described change, then post results back to the PR.

### Architecture
```
PR Comment (@cmux fix the auth bug)
  → GitHub Webhook (issue_comment event)
  → Parse mention + extract prompt
  → Create task (with PR context: repo, branch, diff)
  → Spawn agent in sandbox
  → Agent produces code changes
  → Post result comment to original PR
  → Optional: Crown evaluation picks best result
```

### What Already Exists
- GitHub App webhook handler (`github_webhook.ts`) — stubs for `issue_comment` and `pull_request_review_comment`
- Task creation flow: Task → TaskRun → Sandbox → PR
- PR comment posting: 1400+ lines in `github_pr_comments.ts`
- Crown evaluation system for picking winners
- Preview system with screenshot comments

### What Needs Building
1. **Enable issue_comment webhook handler** — parse `@cmux` mentions
2. **createTaskFromComment action** — extract prompt, PR context, link back
3. **Result posting pipeline** — comment on original PR with agent's work
4. **Vercel pill UI** — optional GitHub App rendering for visual trigger

### Files to Modify
- `packages/convex/convex/github_webhook.ts` — enable comment handler
- `packages/convex/convex/github_pr_comments.ts` — add createTaskFromComment
- `packages/convex/convex/tasks.ts` — ensure cloud workspace creation from comment
- `apps/www/lib/routes/` — webhook route for GitHub App

### Detailed Implementation (from codebase research)

**Existing code to reuse:**
- `github_webhook.ts` line ~220: `issue_comment` case exists (currently no-op)
- `previewRuns.enqueueFromWebhook()`: webhook → preview run pattern (exact template)
- `github_pr_comments.ts` (1,776 lines): `postInitialPreviewComment()`, `updatePreviewComment()`, `postPreviewComment()` - video upload to GitHub Release Assets, markdown sanitization, comment history collapsing
- `crown/actions.ts`: multi-candidate evaluation with Mermaid summary

**Implementation steps:**
1. Enable `issue_comment` handler → parse `@cmux` mentions (2-4 hours)
2. New `createTaskFromComment` internal action → call `tasks.create` with cloud workspace + comment ID for linking (2-3 hours)
3. Result posting → reuse existing `postPreviewComment` (1 hour integration)
4. Testing (2-3 hours)
5. Optional UI pill via GitHub App renderer (4-6 hours)

### Effort: 2-3 days for MVP pipeline, 1 week for polish

## Phase 2: Operator Visual Verification ("Launch 2")

### What
After agents complete their work, spin up a browser automation agent that navigates the preview environment, takes screenshots, and posts them to the PR for easy visual verification.

### Architecture
```
Agent completes task → PR created
  → Trigger operator verification
  → Spin up sandbox with browser (Chrome CDP on port 39381/39382)
  → Navigate preview URL
  → Take screenshots of key pages
  → Post screenshot gallery to PR as comment
  → Update task status with visual verification results
```

### What Already Exists
- Browser automation infra: magnitude-core/patchright in sandbox
- Chrome CDP ports: 39381, 39382 exposed in edge routers
- noVNC on port 39380 for visual debugging
- Preview comment system: uploads to GitHub Release Assets
- Crown evaluation with video uploads

### What Needs Building
1. **Operator agent profile** — specialized for browser testing, not coding
2. **Screenshot capture pipeline** — CDP → screenshots → GitHub comment
3. **Preview URL resolution** — map PR to Vercel preview or local dev URL
4. **Visual verification task type** — separate from coding tasks

### Detailed Infrastructure (from codebase research)

**Already ready:**
- `magnitude-core@^0.3.0` in `apps/worker/package.json` with `startBrowserAgent()`
- `runBrowserAgentFromPrompt.ts`: connects to Chrome via CDP, uses Claude as reasoning engine
- CDP ports: 39381 (HTTP), 39382 (target protocol) - exposed in edge routers
- `@cmux/host-screenshot-collector`: raw video recording, click events, cursor overlay, ffmpeg post-processing, GIF preview
- `screenshotCollector/`: orchestrates capture, uploads to Convex storage
- `docker-run-browser-agent.sh`: Docker container launcher with all ports exposed
- `evals/screenshot/`: LLM-as-judge evaluation system for screenshot quality
- VNC stack: tigervnc + xvfb + fluxbox + noVNC

**What to compose:**
1. Post-task trigger: after coding agents complete → create operator verification task
2. Pass PR link + changed files + preview URL to operator agent
3. magnitude-core navigates and screenshots at key interaction points
4. Post screenshot gallery to PR using existing `postPreviewComment()` pipeline

### Effort: 1-2 weeks (mostly orchestration, infra exists)

## Phase 3: Swipe Code Review ("Launch 3")

### What
Mobile-first code review UX where reviewers swipe through changes, approve/reject files, with AI-assisted review scoring (heatmap) and optional merge queue.

### Architecture
```
PR ready for review
  → Generate AI review heatmap (packages/pr-heatmap)
  → Present changes in swipe-able card format
  → Each file/change is a card: swipe right (approve), left (request changes)
  → AI highlights risk areas via heatmap confidence scores
  → After all files reviewed, option to merge
  → Merge queue for ordered, safe merging
```

### What Already Exists
- `packages/pr-heatmap`: AI-powered code review with Vercel AI SDK
- `devsh review` command (hidden): CLI wrapper for pr-heatmap
- Git diff viewer with heatmap overlay (`git-diff-viewer-with-heatmap.tsx`)
- Crown evaluation for automated quality scoring
- Diff computation via Rust native module in apps/server

### What Needs Building
1. **Card-based review component** — mobile-optimized swipe UI
2. **Review state management** — track per-file approve/reject
3. **Merge queue backend** — ordered merge with check gate
4. **Push notification** — notify reviewer when PR ready

### Detailed Implementation (from codebase research)

**Existing review infrastructure:**
- `packages/pr-heatmap/src/heatmap-generator.ts` (246 lines): GPT-4o-mini line-level scoring (0-10)
- `heatmap-diff-viewer.tsx` (1,037 lines): split-view with 100-step gradient coloring, per-line tooltips, character-level highlighting
- `git-diff-review-viewer.tsx` (2,176 lines): file tree sidebar, Shift+J/K keyboard navigation, intersection observer auto-scrolling
- `code-review.route.ts`: POST `/api/code-review/start` + GET `/api/code-review/stream` (SSE)
- `devsh review` command (hidden): CLI wrapper

**What's missing for swipe UX:**
1. Review decision state (approve/reject per file) + Convex persistence
2. Swipe gesture layer (touch events or A/X keyboard shortcuts) with undo stack
3. Merge queue: new `pr_review_queue` Convex table ranked by heatmap risk + approval rate
4. GitHub API integration for PR status checks + merge gate
5. Batch actions: "Approve all" / "Request changes for all"

### Effort: 2-3 weeks

## Upstream Context (March 2026)

### Key Upstream Changes

| Tool | Version | What Changed | cmux Impact |
|------|---------|-------------|-------------|
| **Claude Code** | v2.1.79 (Mar 18) | 10 releases in 13 days: `SendMessage` replaces `resume`, MCP elicitation, `StopFailure` hook, `InstructionsLoaded` hook, `${CLAUDE_PLUGIN_DATA}`, 45% faster resume | Update agent messaging to align with `SendMessage` pattern |
| **Codex** | v0.115.0 (Mar 16) | Guardian subagent approvals, subagent sandbox inheritance, v0.116.0 alpha imminent | Verify compatibility, update approval flow |
| **Gemini CLI** | v0.36.0-nightly | Subagent support, A2A server with gRPC, Linux sandbox (bubblewrap/seccomp/LXC/gVisor) | Monitor A2A protocol, ensure sandbox passthrough |
| **Cursor** | Automations (Mar 19) | Always-on trigger-based agents (Slack, Linear, GitHub), MCP marketplace (30+ plugins), Composer 2 | Closest orchestration competitor, validate scheduling features |
| **Opencode** | v1.2.27 (Mar 16) | VCS watcher, session management across worktrees, Azure support | Minor integration updates |

### Industry Trends to React To

1. **Sub-agent/Guardian patterns** — Both Claude and Codex converging on sub-agent coordination. cmux already does this but should ensure MAILBOX.json maps to upstream `SendMessage` patterns
2. **Hook standardization** — Claude has 10+ hook types. cmux should map sandbox lifecycle events to provider hook configs
3. **Always-on/Cron agents** — Claude `/loop` + Cursor Automations. cmux could add scheduled task support
4. **A2A/ACP protocols** — Google pushing A2A (gRPC), Cursor pushing ACP. Worth prototyping A2A for cross-CLI coordination
5. **MCP as plugin standard** — Confirmed dominant. cmux's MCP server (31 tools) is well-positioned
6. **Sandbox security convergence** — All CLIs investing in isolation. cmux's multi-provider abstraction remains a differentiator

## Phase 4: Memory Quality & Lifecycle (Infrastructure)

### What
Make agent memory smarter: freshness scoring, forgetting policies, context health visibility. Normalize lifecycle events across providers.

### Why Now
The competition (Claude Code v2.1.79, Codex 0.115.0) is converging on memory curation, not accumulation. cmux already has the memory infrastructure — the quality layer is the differentiator.

### Changes
1. **Memory freshness**: Add `updated_at`, `last_used_at`, `confidence` metadata
2. **Forgetting policy**: Demote stale P2 entries, prune unused behavior rules
3. **Context health**: Provider-neutral warnings in `AgentCommEvent`
4. **Lifecycle events**: `session_stop_blocked`, `context_warning`, `memory_loaded`

### Reference
- [[cmux-context-health-lifecycle-design]]
- [[codex-vs-claude-operator-architecture-2026-03]]
- [[research-weekly-2026-03-19]]

### Effort: 1-2 weeks

## Priority Matrix

| Phase | Feature | User Impact | Effort | Dependencies |
|-------|---------|-------------|--------|--------------|
| 0.1 | Merge test PRs | CI hygiene | 1 hour | None |
| 0.2 | Coolify migration (start) | Deployment unblock | 1 week | None |
| **0.5** | **Native workflow dashboard** | **Critical** (foundation) | **2 weeks** | **Phase 0** |
| 1 | PR Comment → Agent | **High** (new user loop) | 1 week | Phase 0.5 |
| 2 | Operator verification | **High** (visual proof) | 2 weeks | Phase 0.5 |
| 3 | Swipe code review | **Medium** (UX innovation) | 3 weeks | Phase 0.5 |
| 4 | Memory quality | **Medium** (agent reliability) | 2 weeks | Current memory |

## Success Metrics

- **Launch 1**: First PR comment triggers agent within 30 seconds
- **Launch 2**: Screenshots posted to PR within 5 minutes of task completion
- **Launch 3**: Reviewer can review a 10-file PR in under 2 minutes on mobile
- **Memory**: Agents make 30% fewer repeated mistakes with freshness scoring
