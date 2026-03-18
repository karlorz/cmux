import { describe, expect, it, mock } from "bun:test";
import {
  isRetryableError,
  calculateDelay,
  withRetry,
  makeRetryable,
  E2B_SANDBOX_RETRY_OPTIONS,
  E2B_EXEC_RETRY_OPTIONS,
} from "./retry";

describe("isRetryableError", () => {
  it("should return true for network errors", () => {
    expect(isRetryableError(new Error("network error"))).toBe(true);
    expect(isRetryableError(new Error("timeout exceeded"))).toBe(true);
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isRetryableError(new Error("socket hang up"))).toBe(true);
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
  });

  it("should return true for rate limit errors", () => {
    expect(isRetryableError(new Error("rate limit exceeded"))).toBe(true);
    expect(isRetryableError(new Error("429 Too Many Requests"))).toBe(true);
  });

  it("should return true for server errors", () => {
    expect(isRetryableError(new Error("500 Internal Server Error"))).toBe(true);
    expect(isRetryableError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
    expect(isRetryableError(new Error("504 Gateway Timeout"))).toBe(true);
  });

  it("should return true for status code objects", () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ statusCode: 429 })).toBe(true);
    expect(isRetryableError({ statusCode: 502 })).toBe(true);
  });

  it("should return false for client errors", () => {
    expect(isRetryableError(new Error("400 Bad Request"))).toBe(false);
    expect(isRetryableError(new Error("401 Unauthorized"))).toBe(false);
    expect(isRetryableError(new Error("403 Forbidden"))).toBe(false);
    expect(isRetryableError(new Error("404 Not Found"))).toBe(false);
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it("should return false for non-retryable errors", () => {
    expect(isRetryableError(new Error("invalid argument"))).toBe(false);
    expect(isRetryableError(new Error("validation failed"))).toBe(false);
    expect(isRetryableError("string error")).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe("calculateDelay", () => {
  const baseOptions = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffFactor: 2,
    jitter: false,
  };

  it("should calculate exponential backoff", () => {
    expect(calculateDelay(1, baseOptions)).toBe(1000);
    expect(calculateDelay(2, baseOptions)).toBe(2000);
    expect(calculateDelay(3, baseOptions)).toBe(4000);
    expect(calculateDelay(4, baseOptions)).toBe(8000);
  });

  it("should cap delay at maxDelayMs", () => {
    const options = { ...baseOptions, maxDelayMs: 5000 };
    expect(calculateDelay(1, options)).toBe(1000);
    expect(calculateDelay(2, options)).toBe(2000);
    expect(calculateDelay(3, options)).toBe(4000);
    expect(calculateDelay(4, options)).toBe(5000); // capped
    expect(calculateDelay(5, options)).toBe(5000); // still capped
  });

  it("should add jitter when enabled", () => {
    const options = { ...baseOptions, jitter: true };
    const delays = new Set<number>();

    // Generate multiple delays and check they vary
    for (let i = 0; i < 10; i++) {
      delays.add(calculateDelay(1, options));
    }

    // With jitter, we should get some variation
    // Delay should be between 750 and 1250 (1000 ± 25%)
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    }
  });
});

describe("withRetry", () => {
  it("should return result on first success", async () => {
    const fn = mock(() => Promise.resolve("success"));
    const result = await withRetry(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on retryable errors", async () => {
    let attempts = 0;
    const fn = mock(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(new Error("network error"));
      }
      return Promise.resolve("success");
    });

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should not retry on non-retryable errors", async () => {
    const fn = mock(() => Promise.reject(new Error("invalid argument")));

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow("invalid argument");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should throw after max retries", async () => {
    const fn = mock(() => Promise.reject(new Error("network error")));

    await expect(withRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 10,
    })).rejects.toThrow("network error");

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should call onRetry callback", async () => {
    let attempts = 0;
    const fn = mock(() => {
      attempts++;
      if (attempts < 2) {
        return Promise.reject(new Error("network error"));
      }
      return Promise.resolve("success");
    });

    const onRetry = mock(() => {});

    await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("should use custom isRetryable function", async () => {
    const fn = mock(() => Promise.reject(new Error("custom error")));
    const isRetryable = mock((error: unknown) =>
      error instanceof Error && error.message === "custom error"
    );

    await expect(withRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 10,
      isRetryable,
    })).rejects.toThrow("custom error");

    expect(fn).toHaveBeenCalledTimes(3);
    expect(isRetryable).toHaveBeenCalled();
  });
});

describe("makeRetryable", () => {
  it("should create a retryable function", async () => {
    let attempts = 0;
    const originalFn = async (x: number) => {
      attempts++;
      if (attempts < 2) {
        throw new Error("network error");
      }
      return x * 2;
    };

    const retryableFn = makeRetryable(originalFn, {
      maxRetries: 3,
      initialDelayMs: 10,
    });

    const result = await retryableFn(5);
    expect(result).toBe(10);
    expect(attempts).toBe(2);
  });

  it("should preserve function arguments", async () => {
    const originalFn = async (a: number, b: string, c: boolean) => {
      return `${a}-${b}-${c}`;
    };

    const retryableFn = makeRetryable(originalFn);
    const result = await retryableFn(42, "test", true);
    expect(result).toBe("42-test-true");
  });
});

describe("Retry option presets", () => {
  it("should have valid E2B_SANDBOX_RETRY_OPTIONS", () => {
    expect(E2B_SANDBOX_RETRY_OPTIONS.maxRetries).toBe(3);
    expect(E2B_SANDBOX_RETRY_OPTIONS.initialDelayMs).toBe(2000);
    expect(E2B_SANDBOX_RETRY_OPTIONS.maxDelayMs).toBe(30000);
    expect(E2B_SANDBOX_RETRY_OPTIONS.jitter).toBe(true);
  });

  it("should have valid E2B_EXEC_RETRY_OPTIONS", () => {
    expect(E2B_EXEC_RETRY_OPTIONS.maxRetries).toBe(2);
    expect(E2B_EXEC_RETRY_OPTIONS.initialDelayMs).toBe(1000);
    expect(E2B_EXEC_RETRY_OPTIONS.maxDelayMs).toBe(10000);
    expect(E2B_EXEC_RETRY_OPTIONS.jitter).toBe(true);
  });
});
