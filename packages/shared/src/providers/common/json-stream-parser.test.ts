import { describe, expect, it, vi } from "vitest";
import { createJsonStreamParser } from "./json-stream-parser";

describe("createJsonStreamParser", () => {
  describe("single object parsing", () => {
    it("parses a complete object in one chunk", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"a":1}');
      expect(onObject).toHaveBeenCalledTimes(1);
      expect(onObject).toHaveBeenCalledWith({ a: 1 });
    });

    it("parses complex object", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"name":"test","value":42,"nested":{"x":true}}');
      expect(onObject).toHaveBeenCalledWith({
        name: "test",
        value: 42,
        nested: { x: true },
      });
    });
  });

  describe("multiple objects parsing", () => {
    it("parses concatenated objects in one chunk", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"a":1}{"b":2}{"c":3}');
      expect(onObject).toHaveBeenCalledTimes(3);
      expect(onObject).toHaveBeenNthCalledWith(1, { a: 1 });
      expect(onObject).toHaveBeenNthCalledWith(2, { b: 2 });
      expect(onObject).toHaveBeenNthCalledWith(3, { c: 3 });
    });

    it("handles whitespace between objects", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"a":1}  \n  {"b":2}');
      expect(onObject).toHaveBeenCalledTimes(2);
    });
  });

  describe("streaming chunks", () => {
    it("handles object split across two chunks", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"na');
      parser('me":"test"}');
      expect(onObject).toHaveBeenCalledTimes(1);
      expect(onObject).toHaveBeenCalledWith({ name: "test" });
    });

    it("handles object split across many chunks", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser("{");
      parser('"');
      parser("key");
      parser('"');
      parser(":");
      parser("123");
      parser("}");
      expect(onObject).toHaveBeenCalledWith({ key: 123 });
    });

    it("parses multiple objects across chunks", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"a":1}{"b":');
      parser("2}");
      parser('{"c":3}');
      expect(onObject).toHaveBeenCalledTimes(3);
    });
  });

  describe("nested objects", () => {
    it("handles nested objects correctly", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"outer":{"inner":{"deep":1}}}');
      expect(onObject).toHaveBeenCalledWith({
        outer: { inner: { deep: 1 } },
      });
    });

    it("handles array of objects", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"items":[{"id":1},{"id":2}]}');
      expect(onObject).toHaveBeenCalledWith({
        items: [{ id: 1 }, { id: 2 }],
      });
    });
  });

  describe("string handling", () => {
    it("preserves strings with braces inside", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"json":"{nested}"}');
      expect(onObject).toHaveBeenCalledWith({ json: "{nested}" });
    });

    it("handles escaped quotes in strings", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"msg":"say \\"hello\\""}');
      expect(onObject).toHaveBeenCalledWith({ msg: 'say "hello"' });
    });

    it("handles escaped backslashes", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"path":"C:\\\\Users"}');
      expect(onObject).toHaveBeenCalledWith({ path: "C:\\Users" });
    });

    it("handles strings split across chunks", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"text":"hello ');
      parser('world"}');
      expect(onObject).toHaveBeenCalledWith({ text: "hello world" });
    });
  });

  describe("edge cases", () => {
    it("ignores leading garbage", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('some garbage {"a":1}');
      expect(onObject).toHaveBeenCalledTimes(1);
      expect(onObject).toHaveBeenCalledWith({ a: 1 });
    });

    it("ignores trailing garbage", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser('{"a":1} trailing stuff');
      expect(onObject).toHaveBeenCalledTimes(1);
    });

    it("handles empty chunks", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser("");
      parser('{"a":1}');
      parser("");
      expect(onObject).toHaveBeenCalledTimes(1);
    });

    it("silently ignores malformed JSON", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser("{broken}");
      parser('{"valid":1}');
      expect(onObject).toHaveBeenCalledTimes(1);
      expect(onObject).toHaveBeenCalledWith({ valid: 1 });
    });

    it("handles empty object", () => {
      const onObject = vi.fn();
      const parser = createJsonStreamParser(onObject);
      parser("{}");
      expect(onObject).toHaveBeenCalledWith({});
    });
  });
});
