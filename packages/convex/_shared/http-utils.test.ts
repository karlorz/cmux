import { describe, expect, it } from "vitest";
import { jsonResponse, extractBearerToken } from "./http-utils";

describe("http-utils", () => {
  describe("jsonResponse", () => {
    it("creates response with JSON body", async () => {
      const response = jsonResponse({ message: "hello" });
      const body = await response.json();

      expect(body).toEqual({ message: "hello" });
    });

    it("defaults to status 200", () => {
      const response = jsonResponse({ ok: true });

      expect(response.status).toBe(200);
    });

    it("accepts custom status code", () => {
      const response = jsonResponse({ error: "not found" }, 404);

      expect(response.status).toBe(404);
    });

    it("sets Content-Type header to application/json", () => {
      const response = jsonResponse({ data: "test" });

      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("handles null body", async () => {
      const response = jsonResponse(null);
      const body = await response.json();

      expect(body).toBeNull();
    });

    it("handles array body", async () => {
      const response = jsonResponse([1, 2, 3]);
      const body = await response.json();

      expect(body).toEqual([1, 2, 3]);
    });

    it("handles string body", async () => {
      const response = jsonResponse("plain string");
      const body = await response.json();

      expect(body).toBe("plain string");
    });

    it("handles number body", async () => {
      const response = jsonResponse(42);
      const body = await response.json();

      expect(body).toBe(42);
    });

    it("handles nested objects", async () => {
      const nested = {
        user: { name: "John", details: { age: 30 } },
        tags: ["a", "b"],
      };
      const response = jsonResponse(nested);
      const body = await response.json();

      expect(body).toEqual(nested);
    });

    it("creates correct 201 created response", () => {
      const response = jsonResponse({ id: "new-123" }, 201);

      expect(response.status).toBe(201);
    });

    it("creates correct 400 bad request response", () => {
      const response = jsonResponse({ error: "Invalid input" }, 400);

      expect(response.status).toBe(400);
    });

    it("creates correct 500 internal error response", () => {
      const response = jsonResponse({ error: "Internal error" }, 500);

      expect(response.status).toBe(500);
    });
  });

  describe("extractBearerToken", () => {
    describe("valid tokens", () => {
      it("extracts token from valid Bearer header", () => {
        const token = extractBearerToken("Bearer abc123");

        expect(token).toBe("abc123");
      });

      it("handles lowercase bearer", () => {
        const token = extractBearerToken("bearer abc123");

        expect(token).toBe("abc123");
      });

      it("handles mixed case bearer", () => {
        const token = extractBearerToken("BEARER abc123");

        expect(token).toBe("abc123");
      });

      it("handles token with special characters", () => {
        const token = extractBearerToken("Bearer abc-123_456.xyz");

        expect(token).toBe("abc-123_456.xyz");
      });

      it("handles long token", () => {
        const longToken = "a".repeat(1000);
        const token = extractBearerToken(`Bearer ${longToken}`);

        expect(token).toBe(longToken);
      });

      it("handles token with multiple spaces after Bearer", () => {
        const token = extractBearerToken("Bearer   abc123");

        expect(token).toBe("abc123");
      });

      it("trims trailing whitespace from token", () => {
        const token = extractBearerToken("Bearer abc123   ");

        expect(token).toBe("abc123");
      });
    });

    describe("invalid inputs", () => {
      it("returns null for null header", () => {
        const token = extractBearerToken(null);

        expect(token).toBeNull();
      });

      it("returns null for empty string", () => {
        const token = extractBearerToken("");

        expect(token).toBeNull();
      });

      it("returns null for missing Bearer prefix", () => {
        const token = extractBearerToken("abc123");

        expect(token).toBeNull();
      });

      it("returns null for Basic auth", () => {
        const token = extractBearerToken("Basic dXNlcjpwYXNz");

        expect(token).toBeNull();
      });

      it("returns null for just 'Bearer' without token", () => {
        const token = extractBearerToken("Bearer ");

        expect(token).toBeNull();
      });

      it("returns null for Bearer with only whitespace", () => {
        const token = extractBearerToken("Bearer    ");

        expect(token).toBeNull();
      });

      it("returns null for misspelled Bearer", () => {
        const token = extractBearerToken("Beerer abc123");

        expect(token).toBeNull();
      });

      it("returns null for Bearer without space", () => {
        const token = extractBearerToken("Bearerabc123");

        expect(token).toBeNull();
      });
    });
  });
});
