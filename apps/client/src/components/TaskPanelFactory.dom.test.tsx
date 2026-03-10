// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistentWebViewProps } from "./persistent-webview";
import { RenderPanel } from "./TaskPanelFactory";

const hasDomEnvironment =
  typeof document !== "undefined" && typeof window !== "undefined";
let reactActEnvironmentDescriptor: PropertyDescriptor | undefined;
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
});

afterEach(() => {
  if (hasDomEnvironment) {
    document.body.innerHTML = "";
  }
  vi.restoreAllMocks();
  restoreReactActEnvironmentForTest();
});

describe("TaskPanelFactory", () => {
  it("activates the panel on pointer and focus events", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onActivate = vi.fn();

    await act(async () => {
      root.render(
        <RenderPanel
          type="terminal"
          position="topLeft"
          isActivePanel={false}
          onActivate={onActivate}
          TaskRunTerminalPane={() => <div tabIndex={0}>Terminal</div>}
        />
      );
    });

    const panel = container.querySelector('[data-panel-position="topLeft"]');
    const focusTarget = container.querySelector("[tabindex='0']") as HTMLElement | null;
    expect(panel).not.toBeNull();
    expect(focusTarget).not.toBeNull();

    await act(async () => {
      panel?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      focusTarget?.focus();
    });

    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onActivate).toHaveBeenNthCalledWith(1, "topLeft");
    expect(onActivate).toHaveBeenNthCalledWith(2, "topLeft");

    await act(async () => {
      root.unmount();
    });
  });

  it("passes focus eligibility through to workspace and browser webviews", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const receivedProps: PersistentWebViewProps[] = [];
    const PersistentWebViewStub = (props: PersistentWebViewProps) => {
      receivedProps.push(props);
      return <div>webview</div>;
    };

    await act(async () => {
      root.render(
        <>
          <RenderPanel
            type="workspace"
            position="topLeft"
            isActivePanel
            workspaceUrl="https://example.com/workspace"
            workspacePersistKey="workspace-key"
            PersistentWebView={PersistentWebViewStub}
            WorkspaceLoadingIndicator={() => <div>loading</div>}
          />
          <RenderPanel
            type="browser"
            position="topRight"
            isActivePanel={false}
            browserUrl="https://example.com/browser"
            browserPersistKey="browser-key"
            PersistentWebView={PersistentWebViewStub}
            WorkspaceLoadingIndicator={() => <div>loading</div>}
          />
        </>
      );
    });

    expect(receivedProps).toHaveLength(2);
    expect(receivedProps[0]?.isFocusEligible).toBe(true);
    expect(receivedProps[1]?.isFocusEligible).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it("restores a missing React act environment global after cleanup", () => {
    restoreReactActEnvironmentForTest();
    expect(
      Object.prototype.hasOwnProperty.call(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    ).toBe(false);

    setReactActEnvironmentForTest();
    expect(
      Object.prototype.hasOwnProperty.call(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    ).toBe(true);

    restoreReactActEnvironmentForTest();
    expect(
      Object.prototype.hasOwnProperty.call(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    ).toBe(false);
  });
});
