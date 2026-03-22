import { describe, expect, it } from "vitest";
import { typedZid } from "./typed-zid";

describe("typedZid", () => {
  describe("schema creation", () => {
    it("creates a zod schema for a table name", () => {
      const schema = typedZid("taskRuns");
      expect(schema).toBeDefined();
      expect(typeof schema.parse).toBe("function");
    });

    it("creates different schemas for different tables", () => {
      const tasksSchema = typedZid("taskRuns");
      const teamsSchema = typedZid("teams");
      // Both are valid schemas
      expect(tasksSchema).toBeDefined();
      expect(teamsSchema).toBeDefined();
    });
  });

  describe("parsing", () => {
    it("accepts string input and returns typed Id", () => {
      const schema = typedZid("taskRuns");
      const result = schema.parse("abc123");
      expect(result).toBe("abc123");
    });

    it("transforms string to Id type", () => {
      const schema = typedZid("teams");
      const result = schema.parse("team_xyz");
      // The result should be the string, typed as Id<"teams">
      expect(typeof result).toBe("string");
      expect(result).toBe("team_xyz");
    });

    it("rejects non-string input", () => {
      const schema = typedZid("taskRuns");
      expect(() => schema.parse(123)).toThrow();
      expect(() => schema.parse(null)).toThrow();
      expect(() => schema.parse(undefined)).toThrow();
      expect(() => schema.parse({})).toThrow();
    });
  });

  describe("safeParse", () => {
    it("returns success for valid string", () => {
      const schema = typedZid("taskRuns");
      const result = schema.safeParse("valid_id");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("valid_id");
      }
    });

    it("returns failure for invalid input", () => {
      const schema = typedZid("taskRuns");
      const result = schema.safeParse(42);
      expect(result.success).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("accepts empty string", () => {
      const schema = typedZid("taskRuns");
      const result = schema.parse("");
      expect(result).toBe("");
    });

    it("accepts strings with special characters", () => {
      const schema = typedZid("taskRuns");
      const result = schema.parse("id_with-special.chars");
      expect(result).toBe("id_with-special.chars");
    });

    it("accepts Convex-style IDs", () => {
      const schema = typedZid("taskRuns");
      // Convex IDs look like: "k971nc4jfvs5hj4w6z4w0v3z7n6xp9hy"
      const result = schema.parse("k971nc4jfvs5hj4w6z4w0v3z7n6xp9hy");
      expect(result).toBe("k971nc4jfvs5hj4w6z4w0v3z7n6xp9hy");
    });
  });
});
