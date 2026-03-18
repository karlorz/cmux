## Living plan

### Completed: PR heatmap experiment (PR #607)
- packages/pr-heatmap: AI-powered code review with Vercel AI SDK generateObject
- devsh review command (hidden): wraps pr-heatmap for CLI usage
- Unified view --live mode (D5.5): replaces serve-local
- --persist default true: disk-first observability

### Active: Local captain polish
- D5.6: Active instruction handling (blocked on upstream CLI support for mid-run input)
- D5.7: Document local captain as default orchestration prototyping lane
- D5.8: Tighten local-to-cloud bridge (improve bundle metadata, workspace info)

### Backlog / future launches
- linear interface for main thing
- launch 1: “vercel preview environments”
  - vercel comments pill that pipes directly to claude code
- launch 2: after all coding clis are done running, we spin up operator to test the changes and take screenshots to make it easy to verify stuff
  - launch 3: swift app
- code review
  - swipe left or swipe right (order of changes)..
  - merge queue...?
- code review agent that spins up operator to click around and take screenshots and then posts it back to the PR we're reviewing
