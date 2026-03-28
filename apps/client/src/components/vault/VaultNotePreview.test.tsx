// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultNotePreview } from "./VaultNotePreview";

type MockNoteData = {
  path: string;
  title: string;
  content: string;
};

type MockQueryResult = {
  data?: MockNoteData;
  isLoading: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
};

const useQueryMock = vi.fn();
const getApiVaultNoteOptionsMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@cmux/www-openapi-client/react-query", () => ({
  getApiVaultNoteOptions: (...args: unknown[]) => getApiVaultNoteOptionsMock(...args),
}));

const hasDomEnvironment =
  typeof document !== "undefined" && typeof window !== "undefined";

let reactActEnvironmentDescriptor: PropertyDescriptor | undefined;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let queryResult: MockQueryResult;

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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  queryResult = {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  };

  useQueryMock.mockImplementation(() => queryResult);
  getApiVaultNoteOptionsMock.mockImplementation((options: unknown) => options);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  if (hasDomEnvironment) {
    document.body.innerHTML = "";
  }
  vi.restoreAllMocks();
  restoreReactActEnvironmentForTest();
});

describe("VaultNotePreview", () => {
  it("renders an empty state when no note is selected", async () => {
    await act(async () => {
      root.render(
        <VaultNotePreview teamSlugOrId="dev" vaultName="obsidian_vault" />
      );
    });

    expect(container.textContent).toContain("Select a vault note");
    expect(container.textContent).toContain("shareable URL");
  });

  it("shows the toggle button and close button for a selected note", async () => {
    queryResult.data = {
      path: "5️⃣-Projects/GitHub/cmux/_Overview.md",
      title: "_Overview",
      content: "# Overview",
    };

    const onToggleNoteList = vi.fn();
    const onSelectedNotePathChange = vi.fn();

    await act(async () => {
      root.render(
        <VaultNotePreview
          teamSlugOrId="dev"
          vaultName="obsidian_vault"
          notePath="5️⃣-Projects/GitHub/cmux/_Overview.md"
          isNoteListVisible={false}
          onToggleNoteList={onToggleNoteList}
          onSelectedNotePathChange={onSelectedNotePathChange}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const showNotesButton = buttons.find((button) =>
      button.textContent?.includes("Show notes")
    );
    const closeButton = buttons.find((button) =>
      button.textContent?.includes("Close")
    );

    expect(showNotesButton).toBeDefined();
    expect(closeButton).toBeDefined();

    await act(async () => {
      showNotesButton?.click();
    });
    expect(onToggleNoteList).toHaveBeenCalledTimes(1);

    await act(async () => {
      closeButton?.click();
    });
    expect(onSelectedNotePathChange).toHaveBeenCalledWith(undefined);
  });

  it("switches the toggle label when the note list is visible", async () => {
    queryResult.data = {
      path: "5️⃣-Projects/GitHub/cmux/_Overview.md",
      title: "_Overview",
      content: "# Overview",
    };

    await act(async () => {
      root.render(
        <VaultNotePreview
          teamSlugOrId="dev"
          vaultName="obsidian_vault"
          notePath="5️⃣-Projects/GitHub/cmux/_Overview.md"
          isNoteListVisible
        />
      );
    });

    expect(container.textContent).toContain("Hide notes");
  });

  it("normalizes the selected note path when the API resolves a canonical path", async () => {
    queryResult.data = {
      path: "5️⃣-Projects/GitHub/cmux/_Overview.md",
      title: "_Overview",
      content: "# Overview",
    };

    const onSelectedNotePathChange = vi.fn();

    await act(async () => {
      root.render(
        <VaultNotePreview
          teamSlugOrId="dev"
          vaultName="obsidian_vault"
          notePath="5️⃣-Projects/GitHub/cmux/_Overview"
          onSelectedNotePathChange={onSelectedNotePathChange}
        />
      );
    });

    expect(onSelectedNotePathChange).toHaveBeenCalledWith(
      "5️⃣-Projects/GitHub/cmux/_Overview.md"
    );
  });

  it("does not re-emit the path when it is already canonical", async () => {
    queryResult.data = {
      path: "5️⃣-Projects/GitHub/cmux/_Overview.md",
      title: "_Overview",
      content: "# Overview",
    };

    const onSelectedNotePathChange = vi.fn();

    await act(async () => {
      root.render(
        <VaultNotePreview
          teamSlugOrId="dev"
          vaultName="obsidian_vault"
          notePath="5️⃣-Projects/GitHub/cmux/_Overview.md"
          onSelectedNotePathChange={onSelectedNotePathChange}
        />
      );
    });

    expect(onSelectedNotePathChange).not.toHaveBeenCalled();
  });
});
