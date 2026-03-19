import { describe, expect, it } from "vitest";
import { extractAttributes, chooseAttr } from "./telemetry-attributes";

describe("extractAttributes", () => {
  describe("direct attributes", () => {
    it("extracts attributes from event.attributes", () => {
      const event = {
        attributes: { key: "value", count: 42 },
      };
      expect(extractAttributes(event)).toEqual({ key: "value", count: 42 });
    });

    it("handles empty attributes object", () => {
      const event = { attributes: {} };
      expect(extractAttributes(event)).toEqual({});
    });
  });

  describe("resource.attributes", () => {
    it("extracts attributes from event.resource.attributes", () => {
      const event = {
        resource: {
          attributes: { service: "test-service" },
        },
      };
      expect(extractAttributes(event)).toEqual({ service: "test-service" });
    });

    it("ignores non-object resource", () => {
      const event = {
        resource: "not-an-object",
      };
      expect(extractAttributes(event)).toBeNull();
    });

    it("ignores resource without attributes", () => {
      const event = {
        resource: { name: "test" },
      };
      expect(extractAttributes(event)).toBeNull();
    });
  });

  describe("body.attributes", () => {
    it("extracts attributes from event.body.attributes", () => {
      const event = {
        body: {
          attributes: { message: "hello" },
        },
      };
      expect(extractAttributes(event)).toEqual({ message: "hello" });
    });

    it("ignores non-object body", () => {
      const event = {
        body: "string-body",
      };
      expect(extractAttributes(event)).toBeNull();
    });
  });

  describe("priority order", () => {
    it("prefers direct attributes over nested", () => {
      const event = {
        attributes: { from: "direct" },
        resource: { attributes: { from: "resource" } },
        body: { attributes: { from: "body" } },
      };
      expect(extractAttributes(event)).toEqual({ from: "direct" });
    });

    it("prefers resource.attributes over body.attributes", () => {
      const event = {
        resource: { attributes: { from: "resource" } },
        body: { attributes: { from: "body" } },
      };
      expect(extractAttributes(event)).toEqual({ from: "resource" });
    });
  });

  describe("edge cases", () => {
    it("returns null for null input", () => {
      expect(extractAttributes(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(extractAttributes(undefined)).toBeNull();
    });

    it("returns null for primitive input", () => {
      expect(extractAttributes("string")).toBeNull();
      expect(extractAttributes(123)).toBeNull();
      expect(extractAttributes(true)).toBeNull();
    });

    it("returns null for empty object", () => {
      expect(extractAttributes({})).toBeNull();
    });

    it("handles array input (returns null)", () => {
      expect(extractAttributes([1, 2, 3])).toBeNull();
    });

    it("ignores non-object attributes", () => {
      const event = { attributes: "string-attrs" };
      expect(extractAttributes(event)).toBeNull();
    });
  });
});

describe("chooseAttr", () => {
  const attrs = {
    "gen_ai.response.model": "gemini-pro",
    model: "legacy-model",
    "gen_ai.request.temperature": "0.7",
    count: 42,
  };

  describe("successful lookups", () => {
    it("returns first matching string attribute", () => {
      const keys = ["gen_ai.response.model", "model"];
      expect(chooseAttr(attrs, keys)).toBe("gemini-pro");
    });

    it("falls back to second key if first not found", () => {
      const keys = ["missing_key", "model"];
      expect(chooseAttr(attrs, keys)).toBe("legacy-model");
    });

    it("falls back to later keys in priority order", () => {
      const keys = ["missing1", "missing2", "gen_ai.request.temperature"];
      expect(chooseAttr(attrs, keys)).toBe("0.7");
    });
  });

  describe("no match found", () => {
    it("returns undefined when no keys match", () => {
      const keys = ["nonexistent1", "nonexistent2"];
      expect(chooseAttr(attrs, keys)).toBeUndefined();
    });

    it("returns undefined for empty keys array", () => {
      expect(chooseAttr(attrs, [])).toBeUndefined();
    });

    it("skips non-string values", () => {
      const keys = ["count", "missing"];
      expect(chooseAttr(attrs, keys)).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles empty attributes", () => {
      expect(chooseAttr({}, ["key"])).toBeUndefined();
    });

    it("handles single key array", () => {
      expect(chooseAttr(attrs, ["model"])).toBe("legacy-model");
    });

    it("returns undefined for null/undefined values", () => {
      const attrsWithNull = { key: null, key2: undefined };
      expect(
        chooseAttr(attrsWithNull as Record<string, unknown>, ["key", "key2"])
      ).toBeUndefined();
    });
  });
});
