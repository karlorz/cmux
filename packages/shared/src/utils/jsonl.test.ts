import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseJsonSafe,
  readJsonl,
  readJsonlObjects,
  getLastJsonlObject,
  takeLast,
  tailJsonlObjects,
} from "./jsonl";

describe("parseJsonSafe", () => {
  it("parses valid JSON", () => {
    const result = parseJsonSafe<{ name: string }>('{"name": "test"}');
    expect(result).toEqual({ name: "test" });
  });

  it("parses arrays", () => {
    const result = parseJsonSafe<number[]>("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("parses primitives", () => {
    expect(parseJsonSafe<number>("42")).toBe(42);
    expect(parseJsonSafe<string>('"hello"')).toBe("hello");
    expect(parseJsonSafe<boolean>("true")).toBe(true);
    expect(parseJsonSafe<null>("null")).toBe(null);
  });

  it("returns null for invalid JSON", () => {
    expect(parseJsonSafe("{invalid}")).toBeNull();
    expect(parseJsonSafe("not json")).toBeNull();
    expect(parseJsonSafe("")).toBeNull();
  });
});

describe("takeLast", () => {
  it("returns last n elements", () => {
    expect(takeLast([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });

  it("returns empty array for n <= 0", () => {
    expect(takeLast([1, 2, 3], 0)).toEqual([]);
    expect(takeLast([1, 2, 3], -1)).toEqual([]);
  });

  it("returns full array copy if n >= length", () => {
    const arr = [1, 2, 3];
    const result = takeLast(arr, 5);
    expect(result).toEqual([1, 2, 3]);
    // Verify it's a copy
    expect(result).not.toBe(arr);
  });

  it("returns full array copy if n equals length", () => {
    expect(takeLast([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });

  it("handles empty array", () => {
    expect(takeLast([], 3)).toEqual([]);
  });
});

describe("JSONL file operations", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "jsonl-test-"));
    testFile = path.join(tempDir, "test.jsonl");
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("readJsonl", () => {
    it("reads lines from file", async () => {
      await fs.promises.writeFile(testFile, "line1\nline2\nline3\n");
      const lines = await readJsonl(testFile);
      expect(lines).toEqual(["line1", "line2", "line3"]);
    });

    it("trims lines by default", async () => {
      await fs.promises.writeFile(testFile, "  line1  \n  line2  \n");
      const lines = await readJsonl(testFile);
      expect(lines).toEqual(["line1", "line2"]);
    });

    it("skips empty lines by default", async () => {
      await fs.promises.writeFile(testFile, "line1\n\nline2\n\n");
      const lines = await readJsonl(testFile);
      expect(lines).toEqual(["line1", "line2"]);
    });

    it("keeps empty lines when skipEmpty is false", async () => {
      await fs.promises.writeFile(testFile, "line1\n\nline2\n");
      const lines = await readJsonl(testFile, { trim: true, skipEmpty: false });
      expect(lines).toEqual(["line1", "", "line2", ""]);
    });

    it("preserves whitespace when trim is false", async () => {
      await fs.promises.writeFile(testFile, "  line1  \n  line2  \n");
      const lines = await readJsonl(testFile, { trim: false, skipEmpty: true });
      expect(lines).toEqual(["  line1  ", "  line2  "]);
    });
  });

  describe("readJsonlObjects", () => {
    it("parses JSON objects from file", async () => {
      await fs.promises.writeFile(
        testFile,
        '{"id": 1}\n{"id": 2}\n{"id": 3}\n'
      );
      const objects = await readJsonlObjects<{ id: number }>(testFile);
      expect(objects).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it("skips invalid JSON lines", async () => {
      await fs.promises.writeFile(
        testFile,
        '{"id": 1}\ninvalid\n{"id": 3}\n'
      );
      const objects = await readJsonlObjects<{ id: number }>(testFile);
      expect(objects).toEqual([{ id: 1 }, { id: 3 }]);
    });

    it("returns empty array for empty file", async () => {
      await fs.promises.writeFile(testFile, "");
      const objects = await readJsonlObjects<unknown>(testFile);
      expect(objects).toEqual([]);
    });
  });

  describe("getLastJsonlObject", () => {
    it("returns last valid JSON object", async () => {
      await fs.promises.writeFile(
        testFile,
        '{"id": 1}\n{"id": 2}\n{"id": 3}\n'
      );
      const last = await getLastJsonlObject<{ id: number }>(testFile);
      expect(last).toEqual({ id: 3 });
    });

    it("skips trailing invalid lines", async () => {
      await fs.promises.writeFile(
        testFile,
        '{"id": 1}\n{"id": 2}\ninvalid\n'
      );
      const last = await getLastJsonlObject<{ id: number }>(testFile);
      expect(last).toEqual({ id: 2 });
    });

    it("returns null for file with no valid JSON", async () => {
      await fs.promises.writeFile(testFile, "invalid\nalso invalid\n");
      const last = await getLastJsonlObject<unknown>(testFile);
      expect(last).toBeNull();
    });

    it("returns null for empty file", async () => {
      await fs.promises.writeFile(testFile, "");
      const last = await getLastJsonlObject<unknown>(testFile);
      expect(last).toBeNull();
    });
  });

  describe("tailJsonlObjects", () => {
    it("returns last n objects", async () => {
      await fs.promises.writeFile(
        testFile,
        '{"id": 1}\n{"id": 2}\n{"id": 3}\n{"id": 4}\n{"id": 5}\n'
      );
      const tail = await tailJsonlObjects<{ id: number }>(testFile, 3);
      expect(tail).toEqual([{ id: 3 }, { id: 4 }, { id: 5 }]);
    });

    it("returns all objects if n > count", async () => {
      await fs.promises.writeFile(testFile, '{"id": 1}\n{"id": 2}\n');
      const tail = await tailJsonlObjects<{ id: number }>(testFile, 5);
      expect(tail).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("skips invalid JSON in tail", async () => {
      await fs.promises.writeFile(
        testFile,
        '{"id": 1}\n{"id": 2}\ninvalid\n{"id": 4}\n'
      );
      const tail = await tailJsonlObjects<{ id: number }>(testFile, 3);
      // Last 3 lines: {"id": 2}, invalid, {"id": 4}
      // Only valid ones returned
      expect(tail).toEqual([{ id: 2 }, { id: 4 }]);
    });

    it("returns empty array for n = 0", async () => {
      await fs.promises.writeFile(testFile, '{"id": 1}\n{"id": 2}\n');
      const tail = await tailJsonlObjects<{ id: number }>(testFile, 0);
      expect(tail).toEqual([]);
    });
  });
});
