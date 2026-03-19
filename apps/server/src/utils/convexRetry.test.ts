import { describe, expect, it, vi } from "vitest";
import { retryOnOptimisticConcurrency } from "./convexRetry";

describe("retryOnOptimisticConcurrency", () => {
  describe("success cases", () => {
    it("returns result on first try success", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      const result = await retryOnOptimisticConcurrency(fn);
      expect(result).toBe("result");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("returns result after retry on OCC error", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ code: "OptimisticConcurrencyControlFailure" })
        .mockResolvedValue("success");
      const result = await retryOnOptimisticConcurrency(fn, {
        baseDelayMs: 1,
        maxDelayMs: 10,
      });
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("succeeds after multiple OCC errors", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ code: "OptimisticConcurrencyControlFailure" })
        .mockRejectedValueOnce({ code: "OptimisticConcurrencyControlFailure" })
        .mockResolvedValue("done");
      const result = await retryOnOptimisticConcurrency(fn, {
        baseDelayMs: 1,
        maxDelayMs: 10,
      });
      expect(result).toBe("done");
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe("failure cases", () => {
    it("throws non-OCC errors immediately", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("Database error"));
      await expect(retryOnOptimisticConcurrency(fn)).rejects.toThrow(
        "Database error"
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws after exhausting retries", async () => {
      const error = { code: "OptimisticConcurrencyControlFailure" };
      const fn = vi.fn().mockRejectedValue(error);
      await expect(
        retryOnOptimisticConcurrency(fn, {
          retries: 2,
          baseDelayMs: 1,
          maxDelayMs: 10,
        })
      ).rejects.toMatchObject(error);
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe("OCC error detection", () => {
    it("detects error with code property", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ code: "OptimisticConcurrencyControlFailure" })
        .mockResolvedValue("ok");
      await retryOnOptimisticConcurrency(fn, { baseDelayMs: 1 });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("detects error with JSON message containing code", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({
          message: JSON.stringify({
            code: "OptimisticConcurrencyControlFailure",
          }),
        })
        .mockResolvedValue("ok");
      await retryOnOptimisticConcurrency(fn, { baseDelayMs: 1 });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("detects error with OCC substring in message", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({
          message:
            "Convex failed: OptimisticConcurrencyControlFailure occurred",
        })
        .mockResolvedValue("ok");
      await retryOnOptimisticConcurrency(fn, { baseDelayMs: 1 });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("does not retry on unrelated error codes", async () => {
      const fn = vi.fn().mockRejectedValue({ code: "SomeOtherError" });
      await expect(retryOnOptimisticConcurrency(fn)).rejects.toMatchObject({
        code: "SomeOtherError",
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("does not retry on non-JSON message without OCC", async () => {
      const fn = vi.fn().mockRejectedValue({
        message: "Something went wrong",
      });
      await expect(retryOnOptimisticConcurrency(fn)).rejects.toMatchObject({
        message: "Something went wrong",
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("options", () => {
    it("uses default retries of 5", async () => {
      const error = { code: "OptimisticConcurrencyControlFailure" };
      const fn = vi.fn().mockRejectedValue(error);
      await expect(
        retryOnOptimisticConcurrency(fn, { baseDelayMs: 1 })
      ).rejects.toMatchObject(error);
      expect(fn).toHaveBeenCalledTimes(6); // initial + 5 retries
    });

    it("respects custom retries option", async () => {
      const error = { code: "OptimisticConcurrencyControlFailure" };
      const fn = vi.fn().mockRejectedValue(error);
      await expect(
        retryOnOptimisticConcurrency(fn, { retries: 1, baseDelayMs: 1 })
      ).rejects.toMatchObject(error);
      expect(fn).toHaveBeenCalledTimes(2); // initial + 1 retry
    });
  });
});
