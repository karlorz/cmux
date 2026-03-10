import { describe, expect, it } from "vitest";
import { isConvexIdValidationError, isValidConvexId } from "./cmux_http_helpers";

describe("cmux_http Convex ID helpers", () => {
  it("accepts Convex-shaped IDs and rejects invalid task/task-run path IDs", () => {
    expect(isValidConvexId("abc123")).toBe(true);
    expect(isValidConvexId("A1b2C3")).toBe(true);
    expect(isValidConvexId("invalid_task_id")).toBe(false);
    expect(isValidConvexId("invalid-task-id")).toBe(false);
    expect(isValidConvexId("123abc")).toBe(false);
    expect(isValidConvexId("")).toBe(false);
  });

  it("detects Convex validation error messages that should map to 404", () => {
    expect(isConvexIdValidationError(new Error("Invalid ID"))).toBe(true);
    expect(
      isConvexIdValidationError(
        new Error("ArgumentValidationError: Value is not a valid ID for table tasks"),
      ),
    ).toBe(true);
    expect(isConvexIdValidationError(new Error("Task not found"))).toBe(false);
    expect(isConvexIdValidationError("Unhandled failure")).toBe(false);
  });
});
