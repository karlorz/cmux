import { describe, expect, it } from "vitest";
import { ErrorSchema, ValidationErrorSchema } from "./error.schema";

describe("ErrorSchema", () => {
  it("validates a complete error object", () => {
    const valid = {
      code: 400,
      message: "Bad Request",
      details: { field: "email", issue: "Invalid" },
    };

    const result = ErrorSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates error without details", () => {
    const valid = {
      code: 500,
      message: "Internal Server Error",
    };

    const result = ErrorSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects missing code", () => {
    const invalid = {
      message: "Bad Request",
    };

    const result = ErrorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects missing message", () => {
    const invalid = {
      code: 400,
    };

    const result = ErrorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects non-number code", () => {
    const invalid = {
      code: "400",
      message: "Bad Request",
    };

    const result = ErrorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("accepts any record as details", () => {
    const valid = {
      code: 400,
      message: "Error",
      details: {
        nested: { deep: "value" },
        array: [1, 2, 3],
        number: 42,
      },
    };

    const result = ErrorSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe("ValidationErrorSchema", () => {
  it("validates a complete validation error", () => {
    const valid = {
      code: 422,
      message: "Validation Error",
      errors: [
        { path: ["email"], message: "Invalid email" },
        { path: ["user", "name"], message: "Required" },
      ],
    };

    const result = ValidationErrorSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects wrong code (must be 422)", () => {
    const invalid = {
      code: 400,
      message: "Validation Error",
      errors: [],
    };

    const result = ValidationErrorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("validates errors with numeric path elements", () => {
    const valid = {
      code: 422,
      message: "Validation Error",
      errors: [{ path: ["items", 0, "quantity"], message: "Must be positive" }],
    };

    const result = ValidationErrorSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts empty errors array", () => {
    const valid = {
      code: 422,
      message: "Validation Error",
      errors: [],
    };

    const result = ValidationErrorSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects errors missing path", () => {
    const invalid = {
      code: 422,
      message: "Validation Error",
      errors: [{ message: "Invalid" }],
    };

    const result = ValidationErrorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects errors missing message", () => {
    const invalid = {
      code: 422,
      message: "Validation Error",
      errors: [{ path: ["field"] }],
    };

    const result = ValidationErrorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
