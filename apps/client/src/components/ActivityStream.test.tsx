// @vitest-environment jsdom

import type { Doc, Id } from "@cmux/convex/dataModel";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
}));

vi.mock("@cmux/convex/api", () => ({
  api: {
    taskRunActivity: {
      getByTaskRunAsc: Symbol("taskRunActivity.getByTaskRunAsc"),
    },
  },
}));

import { ActivityStream } from "./ActivityStream";

const hasDomEnvironment =
  typeof document !== "undefined" && typeof window !== "undefined";
let reactActEnvironmentDescriptor: PropertyDescriptor | undefined;
let activityCounter = 0;

const runId = "taskRuns:test-run" as Id<"taskRuns">;

function setReactActEnvironmentForTest() {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
}

function restoreReactActEnvironmentForTest() {
  if (reactActEnvironmentDescriptor) {
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      reactActEnvironmentDescriptor
    );
    return;
  }

  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
}

function createActivity(
  overrides: Partial<Doc<"taskRunActivity">> &
    Pick<Doc<"taskRunActivity">, "type" | "summary">
): Doc<"taskRunActivity"> {
  activityCounter += 1;
  const { type, summary, ...rest } = overrides;

  return {
    _id: `taskRunActivity:${activityCounter}` as Id<"taskRunActivity">,
    _creationTime: overrides.createdAt ?? 1_700_000_000_000,
    taskRunId: runId,
    teamId: "team-1",
    createdAt: 1_700_000_000_000 - activityCounter * 1000,
    type,
    summary,
    ...rest,
  };
}

function renderActivityStream(activities: Doc<"taskRunActivity">[]) {
  mockUseQuery.mockReturnValue(activities);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return { container, root };
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text)
    ) ?? null
  );
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  expect(hasDomEnvironment).toBe(true);
  reactActEnvironmentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "IS_REACT_ACT_ENVIRONMENT"
  );
  setReactActEnvironmentForTest();
  activityCounter = 0;
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(1_700_000_060_000);
});

afterEach(() => {
  if (hasDomEnvironment) {
    document.body.innerHTML = "";
  }
  vi.restoreAllMocks();
  restoreReactActEnvironmentForTest();
});

describe("ActivityStream", () => {
  it("renders lifecycle events with explicit labels, metadata, and fallback labels", async () => {
    const activities = [
      createActivity({
        type: "session_start",
        summary: "Agent session started",
        toolName: "codex",
        providerSessionId: "session-001",
      }),
      createActivity({
        type: "approval_resolved",
        summary: "Write approval granted",
        toolName: "codex",
        approvalId: "approval-42",
        resolution: "allow_session",
        resolvedBy: "operator",
      }),
      createActivity({
        type: "memory_scope_changed",
        summary: "Run memory injected",
        toolName: "codex",
        scopeType: "run",
        scopeAction: "injected",
        scopeBytes: 24_576,
      }),
      createActivity({
        type: "mcp_capabilities_negotiated",
        summary: "MCP filesystem negotiated",
        toolName: "codex",
        serverName: "filesystem",
        transport: "stdio",
        toolCount: 12,
        resourceCount: 4,
        mcpCapabilities: JSON.stringify({ tools: true, resources: true }),
      }),
      createActivity({
        type: "mystery_event",
        summary: "Custom hook event",
      }),
    ];
    const { container, root } = renderActivityStream(activities);

    await act(async () => {
      root.render(<ActivityStream runId={runId} />);
    });

    const text = container.textContent ?? "";
    expect(text).toContain("Session Start");
    expect(text).toContain("Approval Resolved");
    expect(text).toContain("Memory Scope");
    expect(text).toContain("MCP Capabilities");
    expect(text).toContain("Mystery Event");
    expect(text).toContain("Session: session-001");
    expect(text).toContain("Resolution: allow session");
    expect(text).toContain("Size: 24.0 KB");
    expect(text).toContain("Capabilities: tools, resources");

    await act(async () => {
      root.unmount();
    });
  });

  it("filters and searches lifecycle events using explicit type and metadata text", async () => {
    const activities = [
      createActivity({
        type: "run_resumed",
        summary: "Run resumed from checkpoint",
        toolName: "codex",
        resumeReason: "checkpoint",
        checkpointRef: "cp-42",
      }),
      createActivity({
        type: "approval_requested",
        summary: "Approval required for exec",
        toolName: "codex",
        approvalId: "approval-1",
      }),
    ];
    const { container, root } = renderActivityStream(activities);

    await act(async () => {
      root.render(<ActivityStream runId={runId} />);
    });

    const filterToggle = container.querySelector(
      'button[title="Filter by type"]'
    ) as HTMLButtonElement | null;
    expect(filterToggle).not.toBeNull();

    await act(async () => {
      filterToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const runResumedFilter = findButtonByText(container, "Run Resumed (1)");
    expect(runResumedFilter).not.toBeNull();

    await act(async () => {
      runResumedFilter?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    let text = container.textContent ?? "";
    expect(text).toContain("Run resumed from checkpoint");
    expect(text).not.toContain("Approval required for exec");

    const clearButton = findButtonByText(container, "Clear");
    expect(clearButton).not.toBeNull();

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const searchInput = container.querySelector(
      'input[placeholder="Search activities..."]'
    ) as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      if (searchInput) {
        setInputValue(searchInput, "approval-1");
      }
    });

    text = container.textContent ?? "";
    expect(text).toContain("Approval required for exec");
    expect(text).not.toContain("Run resumed from checkpoint");

    await act(async () => {
      root.unmount();
    });
  });
});
