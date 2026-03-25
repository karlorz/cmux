// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AIProvidersSection } from "./AIProvidersSection";

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

describe("AIProvidersSection", () => {
  it("keeps a real textarea target for masked Codex auth JSON", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AIProvidersSection
          apiKeys={[
            {
              envVar: "CODEX_AUTH_JSON",
              displayName: "Codex Auth JSON",
            },
          ]}
          providerInfoByEnvVar={{}}
          apiKeyModelsByEnv={{}}
          apiKeyValues={{
            CODEX_AUTH_JSON: '{"access_token":"test"}',
          }}
          originalApiKeyValues={{
            CODEX_AUTH_JSON: '{"access_token":"test"}',
          }}
          showKeys={{ CODEX_AUTH_JSON: false }}
          showBaseUrls={false}
          baseUrlValues={{}}
          isTestingConnection={{}}
          connectionTestResults={{}}
          bypassAnthropicProxy={false}
          expandedUsedList={{}}
          overflowUsedList={{}}
          usedListRefs={{ current: {} }}
          showProviderStatus={false}
          onApiKeyChange={vi.fn()}
          onToggleShowKey={vi.fn()}
          onToggleShowBaseUrls={vi.fn()}
          onBaseUrlChange={vi.fn()}
          onTestBaseUrlConnection={vi.fn()}
          onBypassAnthropicProxyChange={vi.fn()}
          onToggleUsedList={vi.fn()}
        />
      );
    });

    const label = container.querySelector('label[for="CODEX_AUTH_JSON"]');
    const textarea = container.querySelector(
      "textarea#CODEX_AUTH_JSON"
    ) as HTMLTextAreaElement | null;

    expect(label).not.toBeNull();
    expect(textarea).not.toBeNull();
    expect(textarea?.getAttribute("name")).toBe("api-key-CODEX_AUTH_JSON");
    expect(textarea?.readOnly).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
