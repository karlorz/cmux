# cmux Agent Context Index

cmux runs coding-agent CLIs in isolated sandboxes and exposes their work through a web dashboard. This workspace targets upstream `manaflow-ai/manaflow` and fork `karlorz/cmux`; the separate terminal project belongs in another workspace.

- **Safety and Git:** Work only on a feature branch or an existing isolated/harness-managed worktree. Never commit or push directly to `main`/`master`, never force-push them, preserve merged branches, and never merge a PR without explicit user approval. When `CMUX_TASK_RUN_JWT` is set and `CMUX_IS_ORCHESTRATION_HEAD` is not set, push the task branch but let cmux create or update its PR.
- **Project language and architecture:** Read `CONTEXT.md` for canonical terms and system boundaries.
- **Review policy:** Apply `REVIEW.md` to every code review; the pre-commit hook runs `bun check`, and repository tests use `bun run test` rather than bare `bun test`.
- **Repository references:** Use `docs/` for maintained product/operations documents and `dev-docs/CLAUDE.md` for generated framework references.
- **Dev-loop policy:** Read `.claude/dev-loop.config.md` before automated work; it defines TDD-first planning, worktree isolation, subagent execution, critical paths, verification, and knowledge behavior.
- **Shared knowledge:** Run `skillwiki path` and use `<resolved-vault>/projects/cmux/README.md` plus `<resolved-vault>/projects/cmux/compound/cmux-operating-workflow.md`; never infer or hard-code a legacy vault path. If resolution fails, run `skillwiki doctor` and report the failure.
