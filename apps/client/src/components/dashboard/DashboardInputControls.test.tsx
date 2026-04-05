// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardInputControls } from "./DashboardInputControls";

const {
  addManualRepoMock,
  bindSessionToBridgeMock,
  electronEventHandlers,
  ensureTaskRunBridgeMock,
  launchClaudePluginDevMock,
  localClaudeLaunchesListMock,
  mintInstallStateMock,
  recordLocalClaudeLaunchMock,
  removeLocalClaudeProfileMock,
  updateLocalClaudeLaunchMetadataMock,
  updateLocalClaudeLaunchOutcomeMock,
  upsertLocalClaudeProfileMock,
} = vi.hoisted(() => ({
  addManualRepoMock: vi.fn(),
  bindSessionToBridgeMock: vi.fn(),
  electronEventHandlers: new Map<string, Set<(payload: unknown) => void>>(),
  ensureTaskRunBridgeMock: vi.fn(),
  launchClaudePluginDevMock: vi.fn(),
  localClaudeLaunchesListMock: vi.fn(),
  mintInstallStateMock: vi.fn(),
  recordLocalClaudeLaunchMock: vi.fn(),
  removeLocalClaudeProfileMock: vi.fn(),
  updateLocalClaudeLaunchMetadataMock: vi.fn(),
  updateLocalClaudeLaunchOutcomeMock: vi.fn(),
  upsertLocalClaudeProfileMock: vi.fn(),
}));

const navigateMock = vi.fn();
const invalidateQueriesMock = vi.fn();

function emitElectronEvent(eventName: string, payload: unknown) {
  const handlers = electronEventHandlers.get(eventName);
  handlers?.forEach((handler) => handler(payload));
}

vi.mock("@/client-env", () => ({
  env: {
    NEXT_PUBLIC_WEB_MODE: false,
    NEXT_PUBLIC_GITHUB_APP_SLUG: "cmux-local-dev",
  },
}));

vi.mock("@/components/icons/agent-logos", () => ({
  AgentLogo: () => <span data-testid="agent-logo" />,
}));

vi.mock("@/components/icons/github", () => ({
  GitHubIcon: () => <span data-testid="github-icon" />,
}));

vi.mock("@/components/dashboard/provider-status-meta", () => ({
  buildAggregatedVendorStatuses: () => new Map(),
  getProviderStatusMeta: () => ({}),
}));

vi.mock("@/contexts/socket/use-socket", () => ({
  useSocket: () => ({
    socket: null,
    isConnected: false,
    availableEditors: null,
  }),
}));

vi.mock("@/components/ui/mode-toggle-tooltip", () => ({
  ModeToggleTooltip: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/ui/searchable-select", async () => {
  const React = await import("react");
  const SearchableSelect = React.forwardRef(function MockSearchableSelect(
    props: {
      options: Array<string | { label: string; value: string; heading?: boolean }>;
      placeholder?: string;
      singleSelect?: boolean;
      triggerAriaLabel?: string;
      value?: string[];
      searchRightElement?: React.ReactNode;
      onChange: (value: string[]) => void;
    },
    ref: React.ForwardedRef<{
      open: (options?: { focusValue?: string }) => void;
      close: () => void;
    }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      open: () => undefined,
      close: () => undefined,
    }));

    if (props.singleSelect) {
      const normalizedOptions = props.options
        .map((option) =>
          typeof option === "string"
            ? { label: option, value: option, heading: false }
            : { label: option.label, value: option.value, heading: option.heading ?? false },
        )
        .filter((option) => !option.heading);

      return (
        <select
          aria-label={props.triggerAriaLabel ?? props.placeholder ?? "searchable-select"}
          value={props.value?.[0] ?? ""}
          onChange={(event) => props.onChange([event.target.value])}
        >
          {normalizedOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <div data-testid="searchable-select">
        {props.value?.join(",")}
        {props.searchRightElement}
      </div>
    );
  });

  return {
    __esModule: true,
    default: SearchableSelect,
  };
});

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/lib/electron", () => ({
  getElectronBridge: () => ({
    local: {
      launchClaudePluginDev: launchClaudePluginDevMock,
    },
    on: (eventName: string, handler: (payload: unknown) => void) => {
      const handlers = electronEventHandlers.get(eventName) ?? new Set();
      handlers.add(handler);
      electronEventHandlers.set(eventName, handlers);
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          electronEventHandlers.delete(eventName);
        }
      };
    },
  }),
  isElectron: true,
}));

vi.mock("@/lib/github-oauth-flow", () => ({
  consumeGitHubAppInstallIntent: () => null,
  setGitHubAppInstallIntent: () => undefined,
}));

vi.mock("@/lib/model-vendor-utils", () => ({
  getVendorDisplayName: (vendor: string) => vendor,
  sortModelsByVendor: <T,>(models: T[]) => models,
}));

vi.mock("@/lib/wwwOrigin", () => ({
  WWW_ORIGIN: "http://localhost:9779",
}));

vi.mock("@cmux/convex/api", () => ({
  api: {
    github_app: {
      mintInstallState: "github_app.mintInstallState",
    },
    github_http: {
      addManualRepo: "github_http.addManualRepo",
    },
    localClaudeProfiles: {
      list: "localClaudeProfiles.list",
      upsert: "localClaudeProfiles.upsert",
      remove: "localClaudeProfiles.remove",
    },
    localClaudeLaunches: {
      list: "localClaudeLaunches.list",
      record: "localClaudeLaunches.record",
      ensureTaskRunBridge: "localClaudeLaunches.ensureTaskRunBridge",
      bindSessionToBridge: "localClaudeLaunches.bindSessionToBridge",
      updateOutcome: "localClaudeLaunches.updateOutcome",
      updateMetadata: "localClaudeLaunches.updateMetadata",
    },
  },
}));

vi.mock("@stackframe/react", () => ({
  useUser: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useNavigate: () => navigateMock,
}));

vi.mock("convex/react", () => ({
  useQuery: (name: string) => {
    if (name === "localClaudeProfiles.list") {
      return undefined;
    }
    if (name === "localClaudeLaunches.list") {
      return localClaudeLaunchesListMock();
    }
    return undefined;
  },
  useAction: (name: string) => {
    if (name === "github_http.addManualRepo") {
      return addManualRepoMock;
    }
    return vi.fn();
  },
  useMutation: (name: string) => {
    switch (name) {
      case "github_app.mintInstallState":
        return mintInstallStateMock;
      case "localClaudeProfiles.upsert":
        return upsertLocalClaudeProfileMock;
      case "localClaudeProfiles.remove":
        return removeLocalClaudeProfileMock;
      case "localClaudeLaunches.record":
        return recordLocalClaudeLaunchMock;
      case "localClaudeLaunches.updateOutcome":
        return updateLocalClaudeLaunchOutcomeMock;
      case "localClaudeLaunches.updateMetadata":
        return updateLocalClaudeLaunchMetadataMock;
      case "localClaudeLaunches.bindSessionToBridge":
        return bindSessionToBridgeMock;
      case "localClaudeLaunches.ensureTaskRunBridge":
        return ensureTaskRunBridgeMock;
      default:
        return vi.fn();
    }
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./AgentCommandItem", () => ({
  AgentCommandItem: () => null,
  MAX_AGENT_COMMAND_COUNT: 4,
}));

type ResizeObserverCallback = (entries: ResizeObserverEntry[]) => void;

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(): void {
    this.callback([]);
  }

  disconnect(): void {}
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let reactActEnvironmentDescriptor: PropertyDescriptor | undefined;

async function waitForAssertion(assertion: () => void, timeoutMs = 1000) {
  const start = Date.now();

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) {
        throw error;
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const prototype = Object.getPrototypeOf(input) as HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(input, value);

  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function mockCallsContainObject(
  mockFn: { mock: { calls: unknown[][] } },
  matcher: (arg: Record<string, unknown>) => boolean,
) {
  return mockFn.mock.calls.some(([arg]) => {
    if (!arg || typeof arg !== "object") {
      return false;
    }
    return matcher(arg as Record<string, unknown>);
  });
}

beforeEach(() => {
  reactActEnvironmentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "IS_REACT_ACT_ENVIRONMENT",
  );
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverMock,
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  invalidateQueriesMock.mockReset();
  navigateMock.mockReset();
  addManualRepoMock.mockReset();
  bindSessionToBridgeMock.mockReset();
  ensureTaskRunBridgeMock.mockReset();
  launchClaudePluginDevMock.mockReset();
  mintInstallStateMock.mockReset();
  recordLocalClaudeLaunchMock.mockReset();
  removeLocalClaudeProfileMock.mockReset();
  updateLocalClaudeLaunchMetadataMock.mockReset();
  updateLocalClaudeLaunchOutcomeMock.mockReset();
  upsertLocalClaudeProfileMock.mockReset();
  localClaudeLaunchesListMock.mockReset();
  localClaudeLaunchesListMock.mockReturnValue(undefined);
  electronEventHandlers.clear();
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "test-random-uuid"),
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.unstubAllGlobals();

  if (reactActEnvironmentDescriptor) {
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      reactActEnvironmentDescriptor,
    );
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});

describe("DashboardInputControls", () => {
  it("renders the effort selector for effort-capable dashboard models and persists changes", async () => {
    const onAgentSelectionsChange = vi.fn();

    await act(async () => {
      root.render(
        <DashboardInputControls
          projectOptions={[{ label: "karlorz/cmux", value: "karlorz/cmux" }]}
          selectedProject={["karlorz/cmux"]}
          onProjectChange={vi.fn()}
          branchOptions={["main"]}
          selectedBranch={["main"]}
          onBranchChange={vi.fn()}
          selectedAgentSelections={[
            {
              agentName: "codex/gpt-5.2",
              selectedVariant: "medium",
            },
          ]}
          onAgentSelectionsChange={onAgentSelectionsChange}
          isCloudMode
          onCloudModeToggle={vi.fn()}
          isLoadingProjects={false}
          isLoadingBranches={false}
          teamSlugOrId="dev"
          convexModels={[
            {
              _id: "model-1",
              name: "codex/gpt-5.2",
              displayName: "GPT-5.2",
              vendor: "openai",
              tier: "paid",
              enabled: true,
              requiredApiKeys: [],
              sortOrder: 1,
              variants: [
                { id: "low", displayName: "Low" },
                { id: "medium", displayName: "Medium" },
                { id: "high", displayName: "High" },
                { id: "xhigh", displayName: "Extra High" },
              ],
              defaultVariant: "medium",
            },
          ]}
        />,
      );
    });

    expect(container.textContent).not.toContain("Effort");

    const effortSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Select effort for GPT-5.2"]',
    );
    expect(effortSelect).not.toBeNull();
    const effortInfoButton = container.querySelector(
      'button[aria-label="What effort means for GPT-5.2"]',
    );
    expect(effortInfoButton).not.toBeNull();
    expect(
      Array.from(effortSelect?.querySelectorAll("option") ?? []).map(
        (option) => option.textContent,
      ),
    ).toEqual([
      "Low",
      "Medium (Default)",
      "High",
      "Extra High",
    ]);

    await act(async () => {
      if (!effortSelect) {
        throw new Error("Effort selector was not rendered");
      }
      effortSelect.value = "high";
      effortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onAgentSelectionsChange).toHaveBeenCalledWith([
      {
        agentName: "codex/gpt-5.2",
        selectedVariant: "high",
      },
    ]);
  });

  it("bridges local Electron launches into shared runtime metadata and binds later sessions", async () => {
    launchClaudePluginDevMock.mockResolvedValue({
      ok: true,
      launchId: "launch-123",
      command: "devsh orchestrate run-local --json",
      orchestrationId: "local_www_123",
      runDir: "/tmp/local_www_123",
      sessionInfoPath: "/tmp/local_www_123/session.json",
    });
    recordLocalClaudeLaunchMock.mockResolvedValue("launch_record_1");
    ensureTaskRunBridgeMock.mockResolvedValue({
      taskId: "task_123",
      taskRunId: "tskrun_123",
    });
    updateLocalClaudeLaunchMetadataMock.mockResolvedValue("launch_record_1");
    bindSessionToBridgeMock.mockResolvedValue({ success: true });

    await act(async () => {
      root.render(
        <DashboardInputControls
          projectOptions={[{ label: "karlorz/cmux", value: "karlorz/cmux" }]}
          selectedProject={["karlorz/cmux"]}
          onProjectChange={vi.fn()}
          branchOptions={["main"]}
          selectedBranch={["main"]}
          onBranchChange={vi.fn()}
          selectedAgentSelections={[
            {
              agentName: "claude/opus-4.6",
            },
          ]}
          onAgentSelectionsChange={vi.fn()}
          isCloudMode={false}
          onCloudModeToggle={vi.fn()}
          isLoadingProjects={false}
          isLoadingBranches={false}
          teamSlugOrId="dev"
          taskDescription="Investigate Local Runs bridge"
          convexModels={[
            {
              _id: "model-1",
              name: "claude/opus-4.6",
              displayName: "Claude Opus 4.6",
              vendor: "anthropic",
              tier: "paid",
              enabled: true,
              requiredApiKeys: [],
              sortOrder: 1,
            },
          ]}
        />,
      );
    });

    const workspaceInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="/path/to/local/repo"]',
    );
    expect(workspaceInput).not.toBeNull();
    if (!workspaceInput) {
      throw new Error("Workspace input missing");
    }

    await setInputValue(workspaceInput, "/root/workspace");

    let runButton: HTMLButtonElement | undefined;
    await waitForAssertion(() => {
      runButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Run in Terminal"),
      ) as HTMLButtonElement | undefined;
      expect(runButton).toBeDefined();
    });

    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForAssertion(() => {
      expect(recordLocalClaudeLaunchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          teamSlugOrId: "dev",
          launchId: "launch-123",
          orchestrationId: "local_www_123",
          agentName: "claude/opus-4.6",
          runDir: "/tmp/local_www_123",
        }),
      );
    });

    expect(recordLocalClaudeLaunchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        injectionMode: expect.anything(),
      }),
    );

    await waitForAssertion(() => {
      expect(ensureTaskRunBridgeMock).toHaveBeenCalledWith({
        teamSlugOrId: "dev",
        launchId: "launch-123",
        prompt: "Investigate Local Runs bridge",
        workspacePath: "/root/workspace",
        agentName: "claude/opus-4.6",
        orchestrationId: "local_www_123",
      });
    });

    await waitForAssertion(() => {
      expect(
        mockCallsContainObject(updateLocalClaudeLaunchMetadataMock, (arg) =>
          arg.teamSlugOrId === "dev" &&
          arg.launchId === "launch-123" &&
          arg.orchestrationId === "local_www_123" &&
          arg.runDir === "/tmp/local_www_123" &&
          arg.sessionInfoPath === "/tmp/local_www_123/session.json",
        ),
      ).toBe(true);
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Shared runtime: tskrun_123");
      expect(container.textContent).toContain("Open shared run page");
      expect(container.textContent).toContain("Open shared activity page");
      expect(container.textContent).toContain("Open shared logs page");
    });


    await act(async () => {
      emitElectronEvent("local-command-metadata", {
        launchId: "launch-123",
        orchestrationId: "local_www_123",
        runDir: "/tmp/local_www_123",
        sessionInfoPath: "/tmp/local_www_123/session.json",
        sessionId: "session_123",
        injectionMode: "active",
        lastInjectionAt: "2026-04-05T09:03:00Z",
        injectionCount: 2,
      });
    });

    await waitForAssertion(() => {
      expect(bindSessionToBridgeMock).toHaveBeenCalledWith({
        teamSlugOrId: "dev",
        launchId: "launch-123",
        sessionId: "session_123",
      });
      expect(
        mockCallsContainObject(updateLocalClaudeLaunchMetadataMock, (arg) =>
          arg.teamSlugOrId === "dev" &&
          arg.launchId === "launch-123" &&
          arg.orchestrationId === "local_www_123" &&
          arg.runDir === "/tmp/local_www_123" &&
          arg.sessionInfoPath === "/tmp/local_www_123/session.json" &&
          arg.sessionId === "session_123" &&
          arg.injectionMode === "active" &&
          arg.lastInjectionAt === "2026-04-05T09:03:00Z" &&
          arg.injectionCount === 2,
        ),
      ).toBe(true);
    });

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Local session: session_123 · active · 2 injections");
      expect(container.textContent).toContain("Last local injection:");
    });
  });

  it("skips no-op local metadata events", async () => {
    const initialEntry = {
      command: "claude --print",
      workspacePath: "/root/workspace",
      terminal: "terminal" as const,
      launchedAt: "2026-04-05T09:00:00Z",
      launchId: "launch-noop",
      orchestrationId: "local_www_noop",
      runDir: "/tmp/local_www_noop",
      sessionInfoPath: "/tmp/local_www_noop/session.json",
      sessionId: "session_noop",
      injectionMode: "active",
      lastInjectionAt: "2026-04-05T09:03:00Z",
      injectionCount: 2,
      agentName: "claude/opus-4.6",
      taskId: "task_noop",
      taskRunId: "tskrun_noop",
    };

    localClaudeLaunchesListMock.mockReturnValue([initialEntry]);

    await act(async () => {
      root.render(
        <DashboardInputControls
          projectOptions={[{ label: "karlorz/cmux", value: "karlorz/cmux" }]}
          selectedProject={["karlorz/cmux"]}
          onProjectChange={vi.fn()}
          branchOptions={["main"]}
          selectedBranch={["main"]}
          onBranchChange={vi.fn()}
          selectedAgentSelections={[]}
          onAgentSelectionsChange={vi.fn()}
          isCloudMode
          onCloudModeToggle={vi.fn()}
          isLoadingProjects={false}
          isLoadingBranches={false}
          teamSlugOrId="dev"
          convexModels={[]}
          taskDescription="Investigate Local Runs bridge"
        />,
      );
    });

    updateLocalClaudeLaunchMetadataMock.mockClear();
    bindSessionToBridgeMock.mockClear();
    ensureTaskRunBridgeMock.mockClear();

    await act(async () => {
      emitElectronEvent("local-command-metadata", {
        launchId: "launch-noop",
        orchestrationId: "local_www_noop",
        runDir: "/tmp/local_www_noop",
        sessionInfoPath: "/tmp/local_www_noop/session.json",
        sessionId: "session_noop",
        injectionMode: "active",
        lastInjectionAt: "2026-04-05T09:03:00Z",
        injectionCount: 2,
      });
    });

    expect(updateLocalClaudeLaunchMetadataMock).not.toHaveBeenCalled();
    expect(bindSessionToBridgeMock).not.toHaveBeenCalled();
    expect(ensureTaskRunBridgeMock).not.toHaveBeenCalled();
  });

  it("routes provider settings access through the agent picker controls", async () => {
    await act(async () => {
      root.render(
        <DashboardInputControls
          projectOptions={[{ label: "karlorz/cmux", value: "karlorz/cmux" }]}
          selectedProject={["karlorz/cmux"]}
          onProjectChange={vi.fn()}
          branchOptions={["main"]}
          selectedBranch={["main"]}
          onBranchChange={vi.fn()}
          selectedAgentSelections={[
            {
              agentName: "codex/gpt-5.2",
              selectedVariant: "medium",
            },
          ]}
          onAgentSelectionsChange={vi.fn()}
          isCloudMode
          onCloudModeToggle={vi.fn()}
          isLoadingProjects={false}
          isLoadingBranches={false}
          teamSlugOrId="dev"
          convexModels={[
            {
              _id: "model-1",
              name: "codex/gpt-5.2",
              displayName: "GPT-5.2",
              vendor: "openai",
              tier: "paid",
              enabled: true,
              requiredApiKeys: [],
              sortOrder: 1,
              variants: [
                { id: "low", displayName: "Low" },
                { id: "medium", displayName: "Medium" },
              ],
              defaultVariant: "medium",
            },
          ]}
        />,
      );
    });

    const providerSettingsButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open AI provider settings"]',
    );
    expect(providerSettingsButton).not.toBeNull();

    await act(async () => {
      providerSettingsButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/$teamSlugOrId/settings",
      params: { teamSlugOrId: "dev" },
      search: { section: "ai-providers" },
    });
  });
});
