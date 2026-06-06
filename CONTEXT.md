# cmux

cmux is an agent orchestration product for running multiple coding agents in isolated sandboxes and reviewing their work through a web dashboard.

## Language

**cmux**:
The web app and orchestration system that starts, supervises, and reviews coding-agent runs across repositories.
_Avoid_: manaflow, terminal cmux

**Agent**:
A coding CLI such as Claude Code, Codex CLI, Gemini CLI, Amp, or Opencode that performs implementation work inside a sandbox.
_Avoid_: bot, worker, model

**Task**:
A user-requested unit of work that cmux can assign to one or more agent runs.
_Avoid_: job, ticket, prompt

**Task Run**:
A single execution attempt for a task by one selected agent in one sandbox.
_Avoid_: session, job run, attempt

**Sandbox**:
The isolated execution environment where an agent runs the repository, tools, terminal, and editor surface.
_Avoid_: VM, container, workspace when referring to the isolation boundary

**Provider**:
The backend that creates and manages sandboxes, such as Morph, PVE LXC, E2B, or Modal.
_Avoid_: host, cloud, runtime

**openvscode**:
The browser-based editor instance opened inside a sandbox for inspecting diffs, terminals, and running code.
_Avoid_: VS Code when referring to the sandbox editor surface

**devsh**:
The CLI for creating, executing commands in, and deleting sandbox environments from a terminal.
_Avoid_: cmux terminal project, cloudrouter

**Cloudrouter**:
The developer-facing cloud sandbox routing flow that starts remote environments from the local repository.
_Avoid_: devsh when referring to the higher-level cloud workflow

**Convex**:
The backend data and realtime layer for cmux state, including tasks, task runs, memory, orchestration events, and configuration.
_Avoid_: database, backend when the specific Convex layer matters

**Hono App**:
The HTTP API layer that exposes cmux server routes and drives OpenAPI client generation.
_Avoid_: Next.js API when referring to Hono routes

**Edge Router**:
The deployed routing worker that connects browser/editor traffic to sandbox services for a provider family.
_Avoid_: proxy, gateway

**Agent Memory**:
The persistent memory protocol available to agents for long-term knowledge, daily logs, tasks, and inter-agent mailbox coordination.
_Avoid_: notes, cache

**Crown Evaluation**:
The cmux mechanism for comparing multiple agent outputs and selecting the best candidate.
_Avoid_: winner picking, ranking

**Snapshot**:
A reusable sandbox image or paused runtime state used to speed up new sandbox creation.
_Avoid_: backup, image when referring to provider-specific reusable sandbox state
