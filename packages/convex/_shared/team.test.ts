import { describe, expect, it } from "vitest";
import { isUuid } from "./team";

describe("team utilities", () => {
  describe("isUuid", () => {
    describe("valid UUIDs", () => {
      it("accepts valid UUID v4", () => {
        expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
      });

      it("accepts valid UUID v1", () => {
        expect(isUuid("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
      });

      it("accepts valid UUID v3", () => {
        expect(isUuid("a3bb189e-8bf9-3888-9912-ace4e6543002")).toBe(true);
      });

      it("accepts valid UUID v5", () => {
        expect(isUuid("886313e1-3b8a-5372-9b90-0c9aee199e5d")).toBe(true);
      });

      it("accepts uppercase UUIDs", () => {
        expect(isUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
      });

      it("accepts mixed case UUIDs", () => {
        expect(isUuid("550e8400-E29B-41d4-A716-446655440000")).toBe(true);
      });
    });

    describe("invalid formats", () => {
      it("rejects empty string", () => {
        expect(isUuid("")).toBe(false);
      });

      it("rejects non-UUID strings", () => {
        expect(isUuid("not-a-uuid")).toBe(false);
        expect(isUuid("hello-world")).toBe(false);
      });

      it("rejects UUID without hyphens", () => {
        expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
      });

      it("rejects UUID with extra characters", () => {
        expect(isUuid("550e8400-e29b-41d4-a716-446655440000x")).toBe(false);
        expect(isUuid("x550e8400-e29b-41d4-a716-446655440000")).toBe(false);
      });

      it("rejects UUID with wrong segment lengths", () => {
        // First segment too short
        expect(isUuid("550e840-e29b-41d4-a716-446655440000")).toBe(false);
        // Last segment too long
        expect(isUuid("550e8400-e29b-41d4-a716-4466554400001")).toBe(false);
      });

      it("rejects UUID with invalid version digit", () => {
        // Version must be 1-5 (third segment first char)
        expect(isUuid("550e8400-e29b-01d4-a716-446655440000")).toBe(false);
        expect(isUuid("550e8400-e29b-61d4-a716-446655440000")).toBe(false);
        expect(isUuid("550e8400-e29b-71d4-a716-446655440000")).toBe(false);
      });

      it("rejects UUID with invalid variant digit", () => {
        // Variant must be 8, 9, a, or b (fourth segment first char)
        expect(isUuid("550e8400-e29b-41d4-0716-446655440000")).toBe(false);
        expect(isUuid("550e8400-e29b-41d4-c716-446655440000")).toBe(false);
        expect(isUuid("550e8400-e29b-41d4-d716-446655440000")).toBe(false);
        expect(isUuid("550e8400-e29b-41d4-e716-446655440000")).toBe(false);
        expect(isUuid("550e8400-e29b-41d4-f716-446655440000")).toBe(false);
      });

      it("rejects UUID with non-hex characters", () => {
        expect(isUuid("550g8400-e29b-41d4-a716-446655440000")).toBe(false);
        expect(isUuid("550e8400-e29b-41d4-a716-44665544000z")).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("rejects null-like strings", () => {
        expect(isUuid("null")).toBe(false);
        expect(isUuid("undefined")).toBe(false);
      });

      it("rejects team slug format", () => {
        expect(isUuid("my-team-slug")).toBe(false);
        expect(isUuid("team_123")).toBe(false);
      });

      it("rejects Convex ID format", () => {
        expect(isUuid("k971nc4jfvs5hj4w6z4w0v3z7n6xp9hy")).toBe(false);
      });

      it("rejects UUID-like but wrong length", () => {
        // Too short
        expect(isUuid("550e8400-e29b-41d4-a716")).toBe(false);
        // Too long (extra segment)
        expect(isUuid("550e8400-e29b-41d4-a716-446655440000-extra")).toBe(false);
      });

      it("accepts all valid variant digits for UUID v4", () => {
        // Variant digits 8, 9, a, b should all work
        expect(isUuid("550e8400-e29b-41d4-8716-446655440000")).toBe(true);
        expect(isUuid("550e8400-e29b-41d4-9716-446655440000")).toBe(true);
        expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
        expect(isUuid("550e8400-e29b-41d4-b716-446655440000")).toBe(true);
      });
    });
  });
});
