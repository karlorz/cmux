// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardInputControls } from "./DashboardInputControls";

const navigateMock = vi.fn();
const invalidateQueriesMock = vi.fn();

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
      onChange: (value: string[]) => void;
    },
    ref: React.ForwardedRef<{ open: (options?: { focusValue?: string }) => void }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      open: () => undefined,
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

    return <div data-testid="searchable-select">{props.value?.join(",")}</div>;
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
  getElectronBridge: () => null,
  isElectron: false,
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
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
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
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  document.body.innerHTML = "";
  vi.clearAllMocks();

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
});
