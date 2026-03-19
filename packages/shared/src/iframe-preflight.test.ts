import { describe, expect, it } from "vitest";
import {
  isIframePreflightServerPhase,
  isIframePreflightPhasePayload,
  isIframePreflightResult,
} from "./iframe-preflight";

describe("isIframePreflightServerPhase", () => {
  describe("valid phases", () => {
    const validPhases = [
      "resuming",
      "resume_retry",
      "resumed",
      "already_ready",
      "ready",
      "resume_failed",
      "resume_forbidden",
      "instance_not_found",
      "preflight_failed",
      "error",
    ];

    it.each(validPhases)("returns true for '%s'", (phase) => {
      expect(isIframePreflightServerPhase(phase)).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("returns false for unknown string", () => {
      expect(isIframePreflightServerPhase("unknown_phase")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isIframePreflightServerPhase("")).toBe(false);
    });

    it("returns false for number", () => {
      expect(isIframePreflightServerPhase(42)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isIframePreflightServerPhase(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isIframePreflightServerPhase(undefined)).toBe(false);
    });

    it("returns false for object", () => {
      expect(isIframePreflightServerPhase({ phase: "ready" })).toBe(false);
    });
  });
});

describe("isIframePreflightPhasePayload", () => {
  describe("valid payloads", () => {
    it("accepts payload with valid phase", () => {
      expect(isIframePreflightPhasePayload({ phase: "ready" })).toBe(true);
    });

    it("accepts payload with extra properties", () => {
      expect(
        isIframePreflightPhasePayload({
          phase: "resuming",
          attempt: 1,
          message: "Starting resume",
        })
      ).toBe(true);
    });

    it("accepts all valid phases", () => {
      expect(isIframePreflightPhasePayload({ phase: "error" })).toBe(true);
      expect(isIframePreflightPhasePayload({ phase: "resumed" })).toBe(true);
      expect(
        isIframePreflightPhasePayload({ phase: "instance_not_found" })
      ).toBe(true);
    });
  });

  describe("invalid payloads", () => {
    it("rejects payload with invalid phase", () => {
      expect(isIframePreflightPhasePayload({ phase: "invalid" })).toBe(false);
    });

    it("rejects payload without phase", () => {
      expect(isIframePreflightPhasePayload({ other: "data" })).toBe(false);
    });

    it("rejects non-object values", () => {
      expect(isIframePreflightPhasePayload("ready")).toBe(false);
      expect(isIframePreflightPhasePayload(null)).toBe(false);
      expect(isIframePreflightPhasePayload(undefined)).toBe(false);
      expect(isIframePreflightPhasePayload(123)).toBe(false);
    });

    it("rejects array", () => {
      expect(isIframePreflightPhasePayload(["ready"])).toBe(false);
    });
  });
});

describe("isIframePreflightResult", () => {
  describe("valid results", () => {
    it("accepts successful result", () => {
      expect(
        isIframePreflightResult({
          ok: true,
          status: 200,
          method: "HEAD",
        })
      ).toBe(true);
    });

    it("accepts failed result with error", () => {
      expect(
        isIframePreflightResult({
          ok: false,
          status: 500,
          method: "GET",
          error: "Server error",
        })
      ).toBe(true);
    });

    it("accepts result with null status", () => {
      expect(
        isIframePreflightResult({
          ok: false,
          status: null,
          method: null,
          error: "Network error",
        })
      ).toBe(true);
    });

    it("accepts result without error field", () => {
      expect(
        isIframePreflightResult({
          ok: true,
          status: 204,
          method: "HEAD",
        })
      ).toBe(true);
    });

    it("accepts result with undefined error", () => {
      expect(
        isIframePreflightResult({
          ok: true,
          status: 200,
          method: "GET",
          error: undefined,
        })
      ).toBe(true);
    });
  });

  describe("invalid results", () => {
    it("rejects missing ok field", () => {
      expect(
        isIframePreflightResult({
          status: 200,
          method: "HEAD",
        })
      ).toBe(false);
    });

    it("rejects non-boolean ok field", () => {
      expect(
        isIframePreflightResult({
          ok: "true",
          status: 200,
          method: "HEAD",
        })
      ).toBe(false);
    });

    it("rejects non-number, non-null status", () => {
      expect(
        isIframePreflightResult({
          ok: true,
          status: "200",
          method: "HEAD",
        })
      ).toBe(false);
    });

    it("rejects invalid method", () => {
      expect(
        isIframePreflightResult({
          ok: true,
          status: 200,
          method: "POST",
        })
      ).toBe(false);
    });

    it("rejects non-string error", () => {
      expect(
        isIframePreflightResult({
          ok: false,
          status: 500,
          method: "GET",
          error: 123,
        })
      ).toBe(false);
    });

    it("rejects non-object values", () => {
      expect(isIframePreflightResult(null)).toBe(false);
      expect(isIframePreflightResult(undefined)).toBe(false);
      expect(isIframePreflightResult("result")).toBe(false);
    });
  });
});
