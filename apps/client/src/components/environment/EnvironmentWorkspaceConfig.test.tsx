// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistentWebViewProps } from "../persistent-webview";
import { EnvironmentWorkspaceConfig } from "./EnvironmentWorkspaceConfig";
import { PersistentWebView } from "@/components/persistent-webview";
import { useVncClipboardBridge } from "@/hooks/useVncClipboardBridge";

vi.mock("@/hooks/useVncClipboardBridge", () => ({
  useVncClipboardBridge: vi.fn(),
}));

vi.mock("@/components/persistent-webview", () => ({
  PersistentWebView: vi.fn((props: PersistentWebViewProps) => (
    <div
      data-testid="persistent-webview"
      data-persist-key={props.persistKey}
      data-src={props.src}
    />
  )),
}));

const hasDomEnvironment =
  typeof document !== "undefined" && typeof window !== "undefined";
let reactActEnvironmentDescriptor: PropertyDescriptor | undefined;

type WorkspaceConfigProps = ComponentProps<typeof EnvironmentWorkspaceConfig>;

const commonProps = {
  teamSlugOrId: "team-1",
  selectedRepos: [],
  maintenanceScript: "",
  devScript: "",
  envVars: [{ name: "", value: "", isSecret: true }],
  exposedPorts: "",
  vscodeUrl: undefined,
  browserHtmlUrl: "https://example.com/vnc.html?autoconnect=1&resize=scale",
  browserPersistKey: "env-workspace-config:browser:test-instance",
  isSaving: false,
  errorMessage: null,
  initialConfigStep: "browser-setup",
  onMaintenanceScriptChange: vi.fn(),
  onDevScriptChange: vi.fn(),
  onEnvVarsChange: vi.fn(),
  onExposedPortsChange: vi.fn(),
  onConfigStepChange: vi.fn(),
  onSave: vi.fn(),
  onBack: vi.fn(),
} satisfies WorkspaceConfigProps;

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

beforeEach(() => {
  expect(hasDomEnvironment).toBe(true);
  reactActEnvironmentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "IS_REACT_ACT_ENVIRONMENT"
  );
  setReactActEnvironmentForTest();
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  if (hasDomEnvironment) {
    document.body.innerHTML = "";
  }
  vi.clearAllMocks();
  restoreReactActEnvironmentForTest();
});

describe("EnvironmentWorkspaceConfig", () => {
  it("enables the clipboard bridge for the browser setup panel", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EnvironmentWorkspaceConfig {...commonProps} />);
    });

    const clipboardBridgeMock = vi.mocked(useVncClipboardBridge);
    const persistentWebViewMock = vi.mocked(PersistentWebView);

    expect(clipboardBridgeMock).toHaveBeenCalledTimes(1);
    expect(clipboardBridgeMock).toHaveBeenCalledWith({
      persistKey: commonProps.browserPersistKey,
      enabled: true,
    });
    expect(persistentWebViewMock).toHaveBeenCalledTimes(1);
    expect(persistentWebViewMock.mock.calls[0]?.[0].persistKey).toBe(
      commonProps.browserPersistKey
    );
    expect(persistentWebViewMock.mock.calls[0]?.[0].src).toBe(
      commonProps.browserHtmlUrl
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps the clipboard bridge disabled before the browser step", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <EnvironmentWorkspaceConfig
          {...commonProps}
          initialConfigStep="run-scripts"
          vscodeUrl={undefined}
        />
      );
    });

    const clipboardBridgeMock = vi.mocked(useVncClipboardBridge);
    const persistentWebViewMock = vi.mocked(PersistentWebView);

    expect(clipboardBridgeMock).toHaveBeenCalledTimes(1);
    expect(clipboardBridgeMock).toHaveBeenCalledWith({
      persistKey: commonProps.browserPersistKey,
      enabled: false,
    });
    expect(persistentWebViewMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
