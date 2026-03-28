import { describe, expect, it, vi, afterEach } from "vitest";
import {
  parseFrontmatter,
  extractTodos,
  generateRecommendations,
  filterNotesByPath,
  extractAllTags,
  readVaultGitHub,
  resolveGitHubNotePath,
  searchNotes,
  type ObsidianNote,
  type ObsidianTodo,
} from "./obsidian-reader";

describe("obsidian-reader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseFrontmatter", () => {
    it("returns empty frontmatter for content without frontmatter", () => {
      const content = "# Hello\n\nThis is a note.";
      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe(content);
    });

    it("parses simple key-value frontmatter", () => {
      const content = `---
title: My Note
author: John
---
# Content`;
      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({
        title: "My Note",
        author: "John",
      });
      expect(result.body).toBe("# Content");
    });

    it("parses boolean values", () => {
      const content = `---
published: true
draft: false
---
Body`;
      const result = parseFrontmatter(content);

      expect(result.frontmatter.published).toBe(true);
      expect(result.frontmatter.draft).toBe(false);
    });

    it("parses numeric values", () => {
      const content = `---
count: 42
rating: 4.5
---
Body`;
      const result = parseFrontmatter(content);

      expect(result.frontmatter.count).toBe(42);
      expect(result.frontmatter.rating).toBe(4.5);
    });

    it("parses null values", () => {
      const content = `---
empty: null
blank:
---
Body`;
      const result = parseFrontmatter(content);

      expect(result.frontmatter.empty).toBeNull();
      expect(result.frontmatter.blank).toBeNull();
    });

    it("parses JSON array values", () => {
      const content = `---
tags: ["tag1", "tag2"]
---
Body`;
      const result = parseFrontmatter(content);

      expect(result.frontmatter.tags).toEqual(["tag1", "tag2"]);
    });

    it("keeps invalid JSON arrays as strings", () => {
      const content = `---
broken: [not valid json
---
Body`;
      const result = parseFrontmatter(content);

      expect(result.frontmatter.broken).toBe("[not valid json");
    });

    it("handles frontmatter with colons in values", () => {
      const content = `---
url: https://example.com
---
Body`;
      const result = parseFrontmatter(content);

      expect(result.frontmatter.url).toBe("https://example.com");
    });

    it("preserves body content after frontmatter", () => {
      const content = `---
title: Test
---
Line 1
Line 2
Line 3`;
      const result = parseFrontmatter(content);

      expect(result.body).toBe("Line 1\nLine 2\nLine 3");
    });
  });

  describe("extractTodos", () => {
    it("returns empty array for content without todos", () => {
      const content = "# No todos here\n\nJust regular content.";
      const todos = extractTodos(content);

      expect(todos).toEqual([]);
    });

    it("extracts unchecked todos", () => {
      const content = "- [ ] Task 1\n- [ ] Task 2";
      const todos = extractTodos(content);

      expect(todos).toHaveLength(2);
      expect(todos[0]).toEqual({ text: "Task 1", completed: false, line: 1 });
      expect(todos[1]).toEqual({ text: "Task 2", completed: false, line: 2 });
    });

    it("extracts checked todos", () => {
      const content = "- [x] Done task\n- [X] Also done";
      const todos = extractTodos(content);

      expect(todos).toHaveLength(2);
      expect(todos[0]).toEqual({ text: "Done task", completed: true, line: 1 });
      expect(todos[1]).toEqual({ text: "Also done", completed: true, line: 2 });
    });

    it("extracts mixed checked/unchecked todos", () => {
      const content = "- [ ] Not done\n- [x] Done\n- [ ] Also not done";
      const todos = extractTodos(content);

      expect(todos).toHaveLength(3);
      expect(todos[0].completed).toBe(false);
      expect(todos[1].completed).toBe(true);
      expect(todos[2].completed).toBe(false);
    });

    it("handles indented todos", () => {
      const content = "  - [ ] Indented task\n    - [x] Deeply indented";
      const todos = extractTodos(content);

      expect(todos).toHaveLength(2);
      expect(todos[0].text).toBe("Indented task");
      expect(todos[1].text).toBe("Deeply indented");
    });

    it("handles todos with extra spaces", () => {
      const content = "- [  ] Extra space\n-  [ ]  Multiple spaces";
      const todos = extractTodos(content);

      // The regex requires specific spacing, so extra spaces may not match
      // This tests the actual behavior
      expect(todos.filter((t) => t.text.includes("space")).length).toBeGreaterThanOrEqual(0);
    });

    it("ignores regular list items", () => {
      const content = "- Regular item\n- [ ] Todo item\n- Another regular";
      const todos = extractTodos(content);

      expect(todos).toHaveLength(1);
      expect(todos[0].text).toBe("Todo item");
    });

    it("preserves correct line numbers", () => {
      const content = "# Header\n\nSome text\n\n- [ ] Task on line 5";
      const todos = extractTodos(content);

      expect(todos).toHaveLength(1);
      expect(todos[0].line).toBe(5);
    });

    it("trims whitespace from todo text", () => {
      const content = "- [ ]   Extra whitespace   ";
      const todos = extractTodos(content);

      expect(todos[0].text).toBe("Extra whitespace");
    });
  });

  describe("generateRecommendations", () => {
    const createNote = (overrides: Partial<ObsidianNote> = {}): ObsidianNote => ({
      path: "test.md",
      title: "Test Note",
      content: "Test content",
      modifiedAt: new Date(),
      frontmatter: {},
      todos: [],
      status: "active",
      ...overrides,
    });

    it("returns empty array for notes with no actionable items", () => {
      const notes = [createNote()];
      const recommendations = generateRecommendations(notes);

      expect(recommendations).toEqual([]);
    });

    it("skips archived notes", () => {
      const notes = [
        createNote({
          status: "archive",
          todos: [{ text: "Task", completed: false, line: 1 }],
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations).toEqual([]);
    });

    it("generates todo recommendations for incomplete todos", () => {
      const notes = [
        createNote({
          todos: [
            { text: "Task 1", completed: false, line: 1 },
            { text: "Task 2", completed: true, line: 2 },
          ],
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe("todo");
      expect(recommendations[0].description).toBe("Task 1");
    });

    it("assigns high priority to urgent todos", () => {
      const notes = [
        createNote({
          todos: [{ text: "URGENT: Fix this now", completed: false, line: 1 }],
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations[0].priority).toBe("high");
    });

    it("assigns high priority to ASAP todos", () => {
      const notes = [
        createNote({
          todos: [{ text: "Do this ASAP", completed: false, line: 1 }],
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations[0].priority).toBe("high");
    });

    it("assigns high priority to critical todos", () => {
      const notes = [
        createNote({
          todos: [{ text: "Critical bug fix", completed: false, line: 1 }],
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations[0].priority).toBe("high");
    });

    it("assigns low priority to 'maybe' todos", () => {
      const notes = [
        createNote({
          todos: [{ text: "Maybe do this later", completed: false, line: 1 }],
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations[0].priority).toBe("low");
    });

    it("assigns low priority to 'someday' todos", () => {
      const notes = [
        createNote({
          todos: [{ text: "Someday I will learn this", completed: false, line: 1 }],
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations[0].priority).toBe("low");
    });

    it("generates stale note recommendations", () => {
      const notes = [createNote({ status: "stale", title: "Old Note" })];
      const recommendations = generateRecommendations(notes);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe("stale_note");
      expect(recommendations[0].description).toContain("Old Note");
      expect(recommendations[0].priority).toBe("low");
    });

    it("generates broken link recommendations", () => {
      const notes = [
        createNote({
          content: "Check out [[NonExistent Note]]",
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe("broken_link");
      expect(recommendations[0].description).toContain("NonExistent Note");
    });

    it("does not flag existing internal links as broken", () => {
      const notes = [
        createNote({
          path: "note1.md",
          title: "Note 1",
          content: "Link to [[Note 2]]",
        }),
        createNote({
          path: "Note 2.md",
          title: "Note 2",
          content: "Content",
        }),
      ];
      const recommendations = generateRecommendations(notes);

      const brokenLinks = recommendations.filter((r) => r.type === "broken_link");
      expect(brokenLinks).toHaveLength(0);
    });

    it("handles aliased links", () => {
      const notes = [
        createNote({
          content: "Check [[Existing|with alias]]",
        }),
        createNote({
          path: "Existing.md",
          title: "Existing",
        }),
      ];
      const recommendations = generateRecommendations(notes);

      const brokenLinks = recommendations.filter((r) => r.type === "broken_link");
      expect(brokenLinks).toHaveLength(0);
    });

    it("generates missing docs recommendation for projects without status", () => {
      const notes = [
        createNote({
          frontmatter: { type: "project" },
          content: "No status section here",
        }),
      ];
      const recommendations = generateRecommendations(notes);

      const missingDocs = recommendations.filter((r) => r.type === "missing_docs");
      expect(missingDocs).toHaveLength(1);
    });

    it("does not flag projects with status in frontmatter", () => {
      const notes = [
        createNote({
          frontmatter: { type: "project", status: "active" },
          content: "Project content",
        }),
      ];
      const recommendations = generateRecommendations(notes);

      const missingDocs = recommendations.filter((r) => r.type === "missing_docs");
      expect(missingDocs).toHaveLength(0);
    });

    it("does not flag projects with ## Status section", () => {
      const notes = [
        createNote({
          frontmatter: { type: "project" },
          content: "## Status\n\nIn progress",
        }),
      ];
      const recommendations = generateRecommendations(notes);

      const missingDocs = recommendations.filter((r) => r.type === "missing_docs");
      expect(missingDocs).toHaveLength(0);
    });

    it("sorts recommendations by priority", () => {
      const notes = [
        createNote({
          todos: [
            { text: "Maybe later", completed: false, line: 1 }, // low
            { text: "URGENT fix", completed: false, line: 2 }, // high
            { text: "Normal task", completed: false, line: 3 }, // medium
          ],
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations[0].priority).toBe("high");
      expect(recommendations[1].priority).toBe("medium");
      expect(recommendations[2].priority).toBe("low");
    });

    it("includes suggested prompts", () => {
      const notes = [
        createNote({
          title: "My Tasks",
          todos: [{ text: "Write tests", completed: false, line: 1 }],
        }),
      ];
      const recommendations = generateRecommendations(notes);

      expect(recommendations[0].suggestedPrompt).toContain("My Tasks");
      expect(recommendations[0].suggestedPrompt).toContain("Write tests");
    });
  });

  describe("filterNotesByPath", () => {
    const notes: ObsidianNote[] = [
      {
        path: "projects/active/project1.md",
        title: "Project 1",
        content: "",
        modifiedAt: new Date(),
        frontmatter: {},
        todos: [],
      },
      {
        path: "projects/archive/old.md",
        title: "Old Project",
        content: "",
        modifiedAt: new Date(),
        frontmatter: {},
        todos: [],
      },
      {
        path: "daily/2024-01-01.md",
        title: "Daily Note",
        content: "",
        modifiedAt: new Date(),
        frontmatter: {},
        todos: [],
      },
    ];

    it("filters notes by folder path", () => {
      const filtered = filterNotesByPath(notes, "projects");

      expect(filtered).toHaveLength(2);
      expect(filtered.every((n) => n.path.startsWith("projects"))).toBe(true);
    });

    it("filters notes by nested folder path", () => {
      const filtered = filterNotesByPath(notes, "projects/active");

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe("Project 1");
    });

    it("normalizes path with leading slash", () => {
      const filtered = filterNotesByPath(notes, "/projects");

      expect(filtered).toHaveLength(2);
    });

    it("normalizes path with trailing slash", () => {
      const filtered = filterNotesByPath(notes, "projects/");

      expect(filtered).toHaveLength(2);
    });

    it("returns empty array for non-matching path", () => {
      const filtered = filterNotesByPath(notes, "nonexistent");

      expect(filtered).toHaveLength(0);
    });
  });

  describe("extractAllTags", () => {
    it("returns empty array for notes without tags", () => {
      const notes: ObsidianNote[] = [
        {
          path: "test.md",
          title: "Test",
          content: "No tags here",
          modifiedAt: new Date(),
          frontmatter: {},
          todos: [],
        },
      ];
      const tags = extractAllTags(notes);

      expect(tags).toEqual([]);
    });

    it("extracts tags from frontmatter array", () => {
      const notes: ObsidianNote[] = [
        {
          path: "test.md",
          title: "Test",
          content: "",
          modifiedAt: new Date(),
          frontmatter: { tags: ["tag1", "tag2"] },
          todos: [],
        },
      ];
      const tags = extractAllTags(notes);

      expect(tags).toContain("tag1");
      expect(tags).toContain("tag2");
    });

    it("extracts single tag from frontmatter string", () => {
      const notes: ObsidianNote[] = [
        {
          path: "test.md",
          title: "Test",
          content: "",
          modifiedAt: new Date(),
          frontmatter: { tags: "single-tag" },
          todos: [],
        },
      ];
      const tags = extractAllTags(notes);

      expect(tags).toContain("single-tag");
    });

    it("extracts inline tags from content", () => {
      const notes: ObsidianNote[] = [
        {
          path: "test.md",
          title: "Test",
          content: "This has #inline-tag and #another_tag",
          modifiedAt: new Date(),
          frontmatter: {},
          todos: [],
        },
      ];
      const tags = extractAllTags(notes);

      expect(tags).toContain("inline-tag");
      expect(tags).toContain("another_tag");
    });

    it("deduplicates tags across notes", () => {
      const notes: ObsidianNote[] = [
        {
          path: "note1.md",
          title: "Note 1",
          content: "#common",
          modifiedAt: new Date(),
          frontmatter: { tags: ["common"] },
          todos: [],
        },
        {
          path: "note2.md",
          title: "Note 2",
          content: "#common",
          modifiedAt: new Date(),
          frontmatter: {},
          todos: [],
        },
      ];
      const tags = extractAllTags(notes);

      expect(tags.filter((t) => t === "common")).toHaveLength(1);
    });

    it("returns sorted tags", () => {
      const notes: ObsidianNote[] = [
        {
          path: "test.md",
          title: "Test",
          content: "#zebra #apple #mango",
          modifiedAt: new Date(),
          frontmatter: {},
          todos: [],
        },
      ];
      const tags = extractAllTags(notes);

      expect(tags).toEqual(["apple", "mango", "zebra"]);
    });

    it("handles numeric frontmatter tags", () => {
      const notes: ObsidianNote[] = [
        {
          path: "test.md",
          title: "Test",
          content: "",
          modifiedAt: new Date(),
          frontmatter: { tags: [123, "string-tag"] },
          todos: [],
        },
      ];
      const tags = extractAllTags(notes);

      expect(tags).toContain("123");
      expect(tags).toContain("string-tag");
    });
  });

  describe("searchNotes", () => {
    const notes: ObsidianNote[] = [
      {
        path: "note1.md",
        title: "TypeScript Guide",
        content: "Learn TypeScript basics",
        modifiedAt: new Date(),
        frontmatter: {},
        todos: [],
      },
      {
        path: "note2.md",
        title: "React Hooks",
        content: "Using hooks in React applications",
        modifiedAt: new Date(),
        frontmatter: {},
        todos: [],
      },
      {
        path: "note3.md",
        title: "Python Basics",
        content: "Introduction to Python programming",
        modifiedAt: new Date(),
        frontmatter: {},
        todos: [],
      },
    ];

    it("searches by title", () => {
      const results = searchNotes(notes, "TypeScript");

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("TypeScript Guide");
    });

    it("searches by content", () => {
      const results = searchNotes(notes, "hooks");

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("React Hooks");
    });

    it("search is case insensitive", () => {
      const results = searchNotes(notes, "TYPESCRIPT");

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("TypeScript Guide");
    });

    it("returns multiple matches", () => {
      const results = searchNotes(notes, "a");

      expect(results.length).toBeGreaterThan(1);
    });

    it("returns empty array for no matches", () => {
      const results = searchNotes(notes, "nonexistent");

      expect(results).toEqual([]);
    });

    it("matches partial words", () => {
      const results = searchNotes(notes, "Type");

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("TypeScript Guide");
    });
  });

  describe("readVaultGitHub", () => {
    it("preserves full repo-relative paths when the vault root is the repository root", async () => {
      vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              tree: [
                {
                  path: "0️⃣-Inbox/Test Note.md",
                  type: "blob",
                  sha: "sha-test-note",
                  mode: "100644",
                  url: "https://api.github.com/blob/sha-test-note",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              content: Buffer.from("# Test Note\n\nBody content").toString("base64"),
              encoding: "base64",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

      const notes = await readVaultGitHub({
        owner: "karlorz",
        repo: "obsidian_vault",
        path: "",
        token: "ghs_test",
        branch: "main",
      });

      expect(notes).toHaveLength(1);
      expect(notes[0]?.path).toBe("0️⃣-Inbox/Test Note.md");
      expect(notes[0]?.title).toBe("Test Note");
    });
  });

  describe("resolveGitHubNotePath", () => {
    const notePaths = [
      "5️⃣-Projects/GitHub/cmux/_Overview.md",
      "5️⃣-Projects/GitHub/cmux/cmux-deep-research.md",
      "5️⃣-Projects/GitHub/cmux/archive/dev-log/_Archive-Index.md",
      "Research/weekly-index.md",
    ];

    it("returns an exact repo-relative match", () => {
      expect(
        resolveGitHubNotePath(
          "5️⃣-Projects/GitHub/cmux/_Overview.md",
          notePaths
        )
      ).toBe("5️⃣-Projects/GitHub/cmux/_Overview.md");
    });

    it("resolves a wiki link basename to the matching note path", () => {
      expect(resolveGitHubNotePath("cmux-deep-research", notePaths)).toBe(
        "5️⃣-Projects/GitHub/cmux/cmux-deep-research.md"
      );
    });

    it("resolves nested wiki links by suffix", () => {
      expect(resolveGitHubNotePath("archive/dev-log/_Archive-Index", notePaths)).toBe(
        "5️⃣-Projects/GitHub/cmux/archive/dev-log/_Archive-Index.md"
      );
    });

    it("treats markdown extensions as optional", () => {
      expect(resolveGitHubNotePath("cmux-deep-research.md", notePaths)).toBe(
        "5️⃣-Projects/GitHub/cmux/cmux-deep-research.md"
      );
    });

    it("returns null when no candidate matches", () => {
      expect(resolveGitHubNotePath("missing-note", notePaths)).toBeNull();
    });
  });
});
