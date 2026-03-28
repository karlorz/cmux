// @vitest-environment jsdom

/**
 * VaultNoteContent Component Tests
 *
 * Tests the markdown rendering and content handling logic.
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VaultNoteContent } from "./VaultNoteContent";
import { transformObsidianLinks } from "./vault-note-markdown";

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

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

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

describe("VaultNoteContent", () => {
  describe("basic rendering", () => {
    it("renders markdown content with headings", async () => {
      await act(async () => {
        root.render(<VaultNoteContent content="# Hello World" />);
      });

      const h1 = container.querySelector("h1");
      expect(h1).not.toBeNull();
      expect(h1?.textContent).toBe("Hello World");
    });

    it("renders empty state for empty content", async () => {
      await act(async () => {
        root.render(<VaultNoteContent content="" />);
      });

      expect(container.textContent).toContain("This note is empty");
    });

    it("renders empty state for whitespace-only content", async () => {
      await act(async () => {
        root.render(<VaultNoteContent content="   " />);
      });

      expect(container.textContent).toContain("This note is empty");
    });

    it("renders lists correctly", async () => {
      const content = `
- Item 1
- Item 2
- Item 3
`;
      await act(async () => {
        root.render(<VaultNoteContent content={content} />);
      });

      const listItems = container.querySelectorAll("li");
      expect(listItems.length).toBe(3);
    });

    it("renders blockquotes", async () => {
      const content = `> This is a quote`;
      await act(async () => {
        root.render(<VaultNoteContent content={content} />);
      });

      const blockquote = container.querySelector("blockquote");
      expect(blockquote).not.toBeNull();
      expect(blockquote?.textContent).toContain("This is a quote");
    });
  });

  describe("external links", () => {
    it("opens external links in new tab", async () => {
      await act(async () => {
        root.render(
          <VaultNoteContent content="Visit [Google](https://google.com)" />
        );
      });

      const link = container.querySelector("a");
      expect(link).not.toBeNull();
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it("does not set target for relative links", async () => {
      await act(async () => {
        root.render(<VaultNoteContent content="See [page](/page)" />);
      });

      const link = container.querySelector("a");
      expect(link).not.toBeNull();
      expect(link?.getAttribute("target")).toBeNull();
    });
  });

  describe("wiki links", () => {
    it("rewrites Obsidian wiki links outside code spans", () => {
      expect(transformObsidianLinks("See [[Folder/My Note|alias]].")).toBe(
        "See [alias](/__cmux_vault_wiki__/Folder%2FMy%20Note)."
      );
    });

    it("does not rewrite wiki links inside fenced mermaid blocks", () => {
      const content = [
        "```mermaid",
        "graph TD",
        "  DEVLOG[[cmux-dev-log-index]]",
        "```",
      ].join("\n");

      expect(transformObsidianLinks(content)).toBe(content);
    });

    it("does not rewrite wiki links inside inline code spans", () => {
      expect(transformObsidianLinks("Use `[[cmux-dev-log-index]]` as text.")).toBe(
        "Use `[[cmux-dev-log-index]]` as text."
      );
    });
  });

  describe("large content handling", () => {
    it("shows full content when under max length", async () => {
      const content = "Short content";
      await act(async () => {
        root.render(<VaultNoteContent content={content} maxLength={1000} />);
      });

      // Should not have "Show full note" button
      const expandButton = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("Show full note")
      );
      expect(expandButton).toBeUndefined();
    });

    it("truncates content when over max length", async () => {
      const content = "A".repeat(100);
      await act(async () => {
        root.render(<VaultNoteContent content={content} maxLength={50} />);
      });

      // Should have "Show full note" button
      const expandButton = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("Show full note")
      );
      expect(expandButton).not.toBeUndefined();
    });

    it("expands and collapses content on button click", async () => {
      const content = "A".repeat(100);
      await act(async () => {
        root.render(<VaultNoteContent content={content} maxLength={50} />);
      });

      // Find and click expand button
      let expandButton = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("Show full note")
      );
      expect(expandButton).not.toBeUndefined();

      await act(async () => {
        expandButton?.click();
      });

      // Should now show "Show less"
      const collapseButton = Array.from(
        container.querySelectorAll("button")
      ).find((btn) => btn.textContent?.includes("Show less"));
      expect(collapseButton).not.toBeUndefined();

      // Click collapse
      await act(async () => {
        collapseButton?.click();
      });

      // Should show expand button again
      expandButton = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("Show full note")
      );
      expect(expandButton).not.toBeUndefined();
    });
  });

  describe("code blocks", () => {
    it("renders inline code", async () => {
      await act(async () => {
        root.render(<VaultNoteContent content="Use `const x = 1`" />);
      });

      const code = container.querySelector("code");
      expect(code).not.toBeNull();
      expect(code?.textContent).toBe("const x = 1");
    });

    it("renders fenced code blocks", async () => {
      const content = `
\`\`\`javascript
const x = 1;
\`\`\`
`;
      await act(async () => {
        root.render(<VaultNoteContent content={content} />);
      });

      const pre = container.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre?.textContent).toContain("const x = 1;");
    });
  });

  describe("accessibility", () => {
    it("wraps content in article element", async () => {
      await act(async () => {
        root.render(<VaultNoteContent content="Test content" />);
      });

      const article = container.querySelector("article");
      expect(article).not.toBeNull();
    });

    it("renders heading hierarchy correctly", async () => {
      const content = `
# Heading 1
## Heading 2
### Heading 3
`;
      await act(async () => {
        root.render(<VaultNoteContent content={content} />);
      });

      expect(container.querySelector("h1")).not.toBeNull();
      expect(container.querySelector("h2")).not.toBeNull();
      expect(container.querySelector("h3")).not.toBeNull();
    });
  });

  describe("GFM features", () => {
    it("renders tables", async () => {
      const content = `
| Col A | Col B |
|-------|-------|
| 1     | 2     |
`;
      await act(async () => {
        root.render(<VaultNoteContent content={content} />);
      });

      const table = container.querySelector("table");
      expect(table).not.toBeNull();
      const cells = container.querySelectorAll("td");
      expect(cells.length).toBe(2);
    });

    it("renders strikethrough text", async () => {
      await act(async () => {
        root.render(<VaultNoteContent content="~~deleted~~" />);
      });

      const del = container.querySelector("del");
      expect(del).not.toBeNull();
      expect(del?.textContent).toBe("deleted");
    });
  });
});
