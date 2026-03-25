// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarContext } from "@/contexts/sidebar/SidebarContext";
import { SettingsSidebar } from "./SettingsSidebar";

vi.mock("@/client-env", () => ({
  env: {
    NEXT_PUBLIC_WEB_MODE: false,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

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
  window.localStorage.clear();
});

afterEach(() => {
  if (hasDomEnvironment) {
    document.body.innerHTML = "";
  }
  restoreReactActEnvironmentForTest();
  vi.clearAllMocks();
});

describe("SettingsSidebar", () => {
  it("renders a named and labeled settings search input", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SidebarContext.Provider
          value={{
            isHidden: false,
            setIsHidden: vi.fn(),
            toggle: vi.fn(),
          }}
        >
          <SettingsSidebar
            teamSlugOrId="dev"
            activeSection="general"
            onSectionChange={vi.fn()}
            onToggleHidden={vi.fn()}
            isMobileViewport={false}
          />
        </SidebarContext.Provider>
      );
    });

    const searchInput = container.querySelector(
      "input#settings-sidebar-search"
    );

    expect(searchInput).not.toBeNull();
    expect(searchInput?.getAttribute("name")).toBe("settings-sidebar-search");
    expect(searchInput?.getAttribute("aria-label")).toBe("Search settings");

    await act(async () => {
      root.unmount();
    });
  });
});
