import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { formatDuration, formatTime, formatShortDate, formatTimeAgo } from "./time";

describe("time utilities", () => {
  describe("formatDuration", () => {
    it("formats zero milliseconds as 0m", () => {
      expect(formatDuration(0)).toBe("0m");
    });

    it("formats seconds only as 0m", () => {
      expect(formatDuration(30000)).toBe("0m");
      expect(formatDuration(59999)).toBe("0m");
    });

    it("formats minutes correctly", () => {
      expect(formatDuration(60000)).toBe("1m");
      expect(formatDuration(300000)).toBe("5m");
      expect(formatDuration(3540000)).toBe("59m");
    });

    it("formats hours with remaining minutes", () => {
      expect(formatDuration(3600000)).toBe("1h 0m");
      expect(formatDuration(7200000)).toBe("2h 0m");
      expect(formatDuration(5400000)).toBe("1h 30m");
    });

    it("formats multiple hours correctly", () => {
      expect(formatDuration(7260000)).toBe("2h 1m");
      expect(formatDuration(36000000)).toBe("10h 0m");
    });

    it("handles large durations", () => {
      // 24 hours
      expect(formatDuration(86400000)).toBe("24h 0m");
      // 48 hours + 30 minutes
      expect(formatDuration(174600000)).toBe("48h 30m");
    });
  });

  describe("formatTime", () => {
    it("formats ISO string to time", () => {
      // Note: Output depends on locale, so we just check it returns a string
      const result = formatTime("2026-03-22T14:30:00Z");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles midnight", () => {
      const result = formatTime("2026-03-22T00:00:00Z");
      expect(typeof result).toBe("string");
    });

    it("handles noon", () => {
      const result = formatTime("2026-03-22T12:00:00Z");
      expect(typeof result).toBe("string");
    });
  });

  describe("formatShortDate", () => {
    it("formats ISO string to short date", () => {
      // Note: Output depends on locale
      const result = formatShortDate("2026-03-22T14:30:00Z");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles January date", () => {
      const result = formatShortDate("2026-01-15T00:00:00Z");
      expect(typeof result).toBe("string");
    });

    it("handles December date", () => {
      const result = formatShortDate("2026-12-25T00:00:00Z");
      expect(typeof result).toBe("string");
    });
  });

  describe("formatTimeAgo", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-22T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe("empty/invalid input", () => {
      it("returns empty string for undefined", () => {
        expect(formatTimeAgo(undefined)).toBe("");
      });

      it("returns empty string for zero", () => {
        // 0 is falsy, so returns ""
        expect(formatTimeAgo(0)).toBe("");
      });

      it("returns empty string for invalid date string", () => {
        expect(formatTimeAgo("not-a-date")).toBe("");
      });
    });

    describe("just now", () => {
      it("returns 'just now' for current time", () => {
        const now = Date.now();
        expect(formatTimeAgo(now)).toBe("just now");
      });

      it("returns 'just now' for under 60 seconds ago", () => {
        const thirtySecondsAgo = Date.now() - 30000;
        expect(formatTimeAgo(thirtySecondsAgo)).toBe("just now");
      });

      it("returns 'just now' for 59 seconds ago", () => {
        const fiftyNineSecondsAgo = Date.now() - 59000;
        expect(formatTimeAgo(fiftyNineSecondsAgo)).toBe("just now");
      });
    });

    describe("minutes ago", () => {
      it("returns '1m ago' for exactly 1 minute", () => {
        const oneMinuteAgo = Date.now() - 60000;
        expect(formatTimeAgo(oneMinuteAgo)).toBe("1m ago");
      });

      it("returns correct minutes for various times", () => {
        expect(formatTimeAgo(Date.now() - 5 * 60000)).toBe("5m ago");
        expect(formatTimeAgo(Date.now() - 30 * 60000)).toBe("30m ago");
        expect(formatTimeAgo(Date.now() - 59 * 60000)).toBe("59m ago");
      });
    });

    describe("hours ago", () => {
      it("returns '1h ago' for exactly 1 hour", () => {
        const oneHourAgo = Date.now() - 60 * 60000;
        expect(formatTimeAgo(oneHourAgo)).toBe("1h ago");
      });

      it("returns correct hours for various times", () => {
        expect(formatTimeAgo(Date.now() - 2 * 60 * 60000)).toBe("2h ago");
        expect(formatTimeAgo(Date.now() - 12 * 60 * 60000)).toBe("12h ago");
        expect(formatTimeAgo(Date.now() - 23 * 60 * 60000)).toBe("23h ago");
      });
    });

    describe("days ago", () => {
      it("returns '1d ago' for exactly 1 day", () => {
        const oneDayAgo = Date.now() - 24 * 60 * 60000;
        expect(formatTimeAgo(oneDayAgo)).toBe("1d ago");
      });

      it("returns correct days for various times", () => {
        expect(formatTimeAgo(Date.now() - 7 * 24 * 60 * 60000)).toBe("7d ago");
        expect(formatTimeAgo(Date.now() - 14 * 24 * 60 * 60000)).toBe("14d ago");
        expect(formatTimeAgo(Date.now() - 29 * 24 * 60 * 60000)).toBe("29d ago");
      });
    });

    describe("months ago", () => {
      it("returns '1mo ago' for 30 days", () => {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60000;
        expect(formatTimeAgo(thirtyDaysAgo)).toBe("1mo ago");
      });

      it("returns correct months for various times", () => {
        expect(formatTimeAgo(Date.now() - 60 * 24 * 60 * 60000)).toBe("2mo ago");
        expect(formatTimeAgo(Date.now() - 180 * 24 * 60 * 60000)).toBe("6mo ago");
        expect(formatTimeAgo(Date.now() - 330 * 24 * 60 * 60000)).toBe("11mo ago");
      });
    });

    describe("years ago", () => {
      it("returns '1y ago' for 12 months", () => {
        const oneYearAgo = Date.now() - 365 * 24 * 60 * 60000;
        expect(formatTimeAgo(oneYearAgo)).toBe("1y ago");
      });

      it("returns correct years for various times", () => {
        expect(formatTimeAgo(Date.now() - 2 * 365 * 24 * 60 * 60000)).toBe("2y ago");
        expect(formatTimeAgo(Date.now() - 5 * 365 * 24 * 60 * 60000)).toBe("5y ago");
      });
    });

    describe("string input", () => {
      it("handles ISO string input", () => {
        // 2 hours ago
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60000).toISOString();
        expect(formatTimeAgo(twoHoursAgo)).toBe("2h ago");
      });

      it("handles date string input", () => {
        // 1 day ago
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60000).toString();
        expect(formatTimeAgo(oneDayAgo)).toBe("1d ago");
      });
    });

    describe("numeric input", () => {
      it("handles Unix timestamp in milliseconds", () => {
        const fiveMinutesAgo = Date.now() - 5 * 60000;
        expect(formatTimeAgo(fiveMinutesAgo)).toBe("5m ago");
      });
    });
  });
});
