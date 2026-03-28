// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderStatusSettingsContent } from "./provider-status-settings";

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
  restoreReactActEnvironmentForTest();
  vi.clearAllMocks();
});

describe("ProviderStatusSettingsContent", () => {
  it("omits Docker and Git rows when only provider readiness should be shown", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onRefresh = vi.fn();

    await act(async () => {
      root.render(
        <ProviderStatusSettingsContent
          loading={false}
          onRefresh={onRefresh}
          showSystemChecks={false}
          status={{
            success: true,
            dockerStatus: {
              isRunning: true,
              version: "web-mode",
            },
            gitStatus: {
              isAvailable: true,
              version: "2.43.0",
            },
            providers: [
              {
                name: "Anthropic",
                isAvailable: false,
                missingRequirements: [
                  "Claude OAuth Token or Anthropic API Key",
                ],
              },
              {
                name: "OpenAI",
                isAvailable: true,
              },
            ],
          }}
        />
      );
    });

    const labels = Array.from(container.querySelectorAll("span")).map(
      (element) => element.textContent ?? ""
    );
    const text = container.textContent ?? "";

    expect(text).toContain("Anthropic");
    expect(text).toContain("OpenAI");
    expect(labels).not.toContain("Docker required");
    expect(labels).not.toContain("Git 2.43.0");

    await act(async () => {
      root.unmount();
    });
  });

  it("shows Docker and Git rows by default", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onRefresh = vi.fn();

    await act(async () => {
      root.render(
        <ProviderStatusSettingsContent
          loading={false}
          onRefresh={onRefresh}
          status={{
            success: true,
            dockerStatus: {
              isRunning: true,
              version: "27.1.0",
            },
            gitStatus: {
              isAvailable: true,
              version: "2.43.0",
            },
            providers: [
              {
                name: "Anthropic",
                isAvailable: true,
              },
            ],
          }}
        />
      );
    });

    const labels = Array.from(container.querySelectorAll("span")).map(
      (element) => element.textContent ?? ""
    );
    const text = container.textContent ?? "";

    expect(labels).toContain("Docker required 27.1.0");
    expect(labels).toContain("Git 2.43.0");
    expect(text).toContain("Anthropic");

    await act(async () => {
      root.unmount();
    });
  });
});
