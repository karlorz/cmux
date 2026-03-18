import { describe, expect, it } from "vitest";
import { sanitizeTmuxSessionName } from "./sanitizeTmuxSessionName";

describe("sanitizeTmuxSessionName", () => {
  describe("preserves valid characters", () => {
    it("keeps alphanumeric characters", () => {
      expect(sanitizeTmuxSessionName("abc123")).toBe("abc123");
    });

    it("keeps hyphens", () => {
      expect(sanitizeTmuxSessionName("my-session")).toBe("my-session");
    });

    it("keeps underscores", () => {
      expect(sanitizeTmuxSessionName("my_session")).toBe("my_session");
    });

    it("keeps mixed valid characters", () => {
      expect(sanitizeTmuxSessionName("my-session_123")).toBe("my-session_123");
    });
  });

  describe("replaces invalid characters with underscores", () => {
    it("replaces periods", () => {
      expect(sanitizeTmuxSessionName("session.name")).toBe("session_name");
    });

    it("replaces colons", () => {
      expect(sanitizeTmuxSessionName("session:name")).toBe("session_name");
    });

    it("replaces spaces", () => {
      expect(sanitizeTmuxSessionName("session name")).toBe("session_name");
    });

    it("replaces slashes", () => {
      expect(sanitizeTmuxSessionName("path/to/session")).toBe("path_to_session");
    });

    it("replaces multiple invalid characters", () => {
      expect(sanitizeTmuxSessionName("my.session:with spaces/path")).toBe(
        "my_session_with_spaces_path"
      );
    });

    it("replaces special characters", () => {
      expect(sanitizeTmuxSessionName("session@#$%")).toBe("session____");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(sanitizeTmuxSessionName("")).toBe("");
    });

    it("handles string of only invalid characters", () => {
      expect(sanitizeTmuxSessionName("...")).toBe("___");
    });

    it("handles unicode characters", () => {
      expect(sanitizeTmuxSessionName("session\u2605")).toBe("session_");
    });

    it("handles long strings", () => {
      const longName = "a".repeat(100) + ".test";
      const expected = "a".repeat(100) + "_test";
      expect(sanitizeTmuxSessionName(longName)).toBe(expected);
    });
  });
});
