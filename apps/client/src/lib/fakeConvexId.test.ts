import { describe, expect, it } from "vitest";
import { isFakeConvexId, createFakeConvexId } from "./fakeConvexId";

describe("fakeConvexId", () => {
  describe("isFakeConvexId", () => {
    it("returns true for IDs with fake prefix", () => {
      expect(isFakeConvexId("fake-123")).toBe(true);
      expect(isFakeConvexId("fake-abc-def")).toBe(true);
      expect(isFakeConvexId("fake-")).toBe(true);
    });

    it("returns false for real Convex IDs", () => {
      expect(isFakeConvexId("j57abc123def")).toBe(false);
      expect(isFakeConvexId("kh7xyz456")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isFakeConvexId("")).toBe(false);
    });

    it("returns false for IDs containing 'fake' but not at start", () => {
      expect(isFakeConvexId("notfake-123")).toBe(false);
      expect(isFakeConvexId("abc-fake-123")).toBe(false);
    });

    it("is case sensitive", () => {
      expect(isFakeConvexId("FAKE-123")).toBe(false);
      expect(isFakeConvexId("Fake-123")).toBe(false);
    });
  });

  describe("createFakeConvexId", () => {
    it("creates an ID with fake prefix", () => {
      const id = createFakeConvexId();
      expect(isFakeConvexId(id)).toBe(true);
      expect(id.startsWith("fake-")).toBe(true);
    });

    it("creates unique IDs on each call", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createFakeConvexId());
      }
      expect(ids.size).toBe(100);
    });

    it("creates IDs with UUID format after prefix", () => {
      const id = createFakeConvexId();
      const uuid = id.slice("fake-".length);
      // UUID format: 8-4-4-4-12 hex chars with dashes
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });
});
