import { describe, expect, it } from "vitest";
import { isValidConvexId, isConvexIdValidationError } from "./cmux_http_helpers";

describe("isValidConvexId", () => {
  describe("valid IDs", () => {
    it("accepts simple alphanumeric IDs", () => {
      expect(isValidConvexId("abc123")).toBe(true);
    });

    it("accepts IDs starting with letter", () => {
      expect(isValidConvexId("a")).toBe(true);
      expect(isValidConvexId("z")).toBe(true);
    });

    it("accepts IDs with mixed case", () => {
      expect(isValidConvexId("AbC123")).toBe(true);
      expect(isValidConvexId("ABC")).toBe(true);
    });

    it("accepts longer IDs", () => {
      expect(isValidConvexId("jd7abc123xyz456")).toBe(true);
    });
  });

  describe("invalid IDs", () => {
    it("rejects IDs starting with number", () => {
      expect(isValidConvexId("123abc")).toBe(false);
    });

    it("rejects IDs with special characters", () => {
      expect(isValidConvexId("abc-123")).toBe(false);
      expect(isValidConvexId("abc_123")).toBe(false);
      expect(isValidConvexId("abc.123")).toBe(false);
    });

    it("rejects IDs with spaces", () => {
      expect(isValidConvexId("abc 123")).toBe(false);
      expect(isValidConvexId(" abc")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidConvexId("")).toBe(false);
    });

    it("rejects IDs with unicode", () => {
      expect(isValidConvexId("abc™")).toBe(false);
      expect(isValidConvexId("café")).toBe(false);
    });
  });
});

describe("isConvexIdValidationError", () => {
  describe("identifies validation errors", () => {
    it("detects 'Invalid ID' error message", () => {
      const error = new Error("Invalid ID: xyz123");
      expect(isConvexIdValidationError(error)).toBe(true);
    });

    it("detects 'not a valid ID' error message", () => {
      const error = new Error("abc is not a valid ID");
      expect(isConvexIdValidationError(error)).toBe(true);
    });

    it("handles string errors", () => {
      expect(isConvexIdValidationError("Invalid ID provided")).toBe(true);
    });
  });

  describe("non-validation errors", () => {
    it("returns false for unrelated errors", () => {
      const error = new Error("Network timeout");
      expect(isConvexIdValidationError(error)).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isConvexIdValidationError(null)).toBe(false);
      expect(isConvexIdValidationError(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isConvexIdValidationError("")).toBe(false);
    });

    it("returns false for generic errors", () => {
      expect(isConvexIdValidationError(new Error("Something went wrong"))).toBe(false);
    });
  });
});
