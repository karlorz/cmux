import { describe, expect, it } from "vitest";
import {
  codeReviewCallbackSuccessSchema,
  codeReviewCallbackErrorSchema,
  codeReviewCallbackSchema,
  codeReviewFileCallbackSchema,
} from "./callback-schemas";

describe("codeReviewCallbackSuccessSchema", () => {
  it("parses valid success payload", () => {
    const payload = {
      status: "success",
      jobId: "job_123",
      sandboxInstanceId: "sandbox_456",
      codeReviewOutput: { result: "pass" },
    };
    const result = codeReviewCallbackSuccessSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects payload with wrong status", () => {
    const payload = {
      status: "error",
      jobId: "job_123",
      sandboxInstanceId: "sandbox_456",
      codeReviewOutput: {},
    };
    const result = codeReviewCallbackSuccessSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects payload missing required fields", () => {
    const payload = {
      status: "success",
      jobId: "job_123",
    };
    const result = codeReviewCallbackSuccessSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("codeReviewCallbackErrorSchema", () => {
  it("parses valid error payload", () => {
    const payload = {
      status: "error",
      jobId: "job_123",
      sandboxInstanceId: "sandbox_456",
      errorCode: "TIMEOUT",
      errorDetail: "Operation timed out",
    };
    const result = codeReviewCallbackErrorSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("parses error payload with optional fields missing", () => {
    const payload = {
      status: "error",
      jobId: "job_123",
    };
    const result = codeReviewCallbackErrorSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects payload with wrong status", () => {
    const payload = {
      status: "success",
      jobId: "job_123",
    };
    const result = codeReviewCallbackErrorSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("codeReviewCallbackSchema (union)", () => {
  it("parses success payload", () => {
    const payload = {
      status: "success",
      jobId: "job_123",
      sandboxInstanceId: "sandbox_456",
      codeReviewOutput: { files: [] },
    };
    const result = codeReviewCallbackSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("parses error payload", () => {
    const payload = {
      status: "error",
      jobId: "job_123",
      errorCode: "FAILED",
    };
    const result = codeReviewCallbackSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const payload = {
      status: "pending",
      jobId: "job_123",
    };
    const result = codeReviewCallbackSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("codeReviewFileCallbackSchema", () => {
  it("parses valid file callback", () => {
    const payload = {
      jobId: "job_123",
      sandboxInstanceId: "sandbox_456",
      filePath: "src/test.ts",
      commitRef: "abc123",
      codexReviewOutput: { comments: [] },
    };
    const result = codeReviewFileCallbackSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("parses payload with optional fields missing", () => {
    const payload = {
      jobId: "job_123",
      filePath: "src/test.ts",
      codexReviewOutput: null,
    };
    const result = codeReviewFileCallbackSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects payload missing required jobId", () => {
    const payload = {
      filePath: "src/test.ts",
      codexReviewOutput: {},
    };
    const result = codeReviewFileCallbackSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects payload missing required filePath", () => {
    const payload = {
      jobId: "job_123",
      codexReviewOutput: {},
    };
    const result = codeReviewFileCallbackSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
