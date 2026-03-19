## Living plan

### Phase 0: Housekeeping (active)
- [ ] Merge 20 passing test PRs from coverage sprint
- [ ] Start Coolify web stack migration (apps/client first)
- [x] PR heatmap experiment (PR #607)
- [x] Local captain mode (32 devsh orchestrate subcommands)
- [x] Documentation coverage (14 packages + 9 apps)

### Phase 0.5: Native Workflow Dashboard (NEW — before launches)
- Agent activity stream: real-time tool calls, file edits, test results in web dashboard
- Error surfacing: agent errors visible immediately (not buried in terminal)
- Live diff panel: code changes without VS Code iframe
- VS Code iframe becomes optional "deep dive", not primary view
- See `.claude/plans/native-workflow-dashboard.md` for architecture
- Foundation for all 3 launches (without this, users can't see agent work)

### Phase 1: PR Comment → Agent ("Launch 1")
- Enable `issue_comment` webhook handler in `github_webhook.ts`
- Parse `@cmux` mentions → extract prompt + PR context
- Create task from comment → spawn agent → post result back to PR
- Optional: Crown evaluation picks best result across multiple agents
- See `.claude/plans/dev-direction-2026-q2.md` for full architecture

### Phase 2: Operator Visual Verification ("Launch 2")
- After agents complete, spin up browser automation agent
- Navigate preview environment, take screenshots
- Post screenshot gallery to PR as visual proof
- Separate "operator" agent profile (browser testing, not coding)

### Phase 3: Swipe Code Review ("Launch 3")
- Mobile-first card-based review UX
- Swipe right (approve) / left (request changes) per file
- AI-assisted risk scoring via packages/pr-heatmap
- Optional merge queue for ordered safe merging

### Phase 4: Memory Quality & Lifecycle
- Memory freshness scoring (updated_at, last_used_at, confidence)
- Forgetting policy (demote stale entries, prune unused rules)
- Context health visibility (provider-neutral warnings)
- Provider-neutral lifecycle events (session_stop_blocked, context_warning)

### Backlog / future
- Swift app (mobile client)
- Coolify all-in-one stack (replace Vercel for apps/www + apps/client)
- Flatten rules pipeline (3 statuses instead of 5)
- D5.6: Native agent instruction injection (blocked on upstream CLI support)
