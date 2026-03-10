import { describe, expect, it } from "vitest";
import { getResponseErrorMessage } from "./httpError";

describe("getResponseErrorMessage", () => {
  it("returns message from JSON body when present", async () => {
    const response = new Response(JSON.stringify({ message: "Bad request" }), {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json" },
    });

    await expect(getResponseErrorMessage(response)).resolves.toBe("Bad request");
  });

  it("returns error from JSON body when message is absent", async () => {
    const response = new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      statusText: "Forbidden",
      headers: { "Content-Type": "application/json" },
    });

    await expect(getResponseErrorMessage(response)).resolves.toBe("Forbidden");
  });

  it("falls back to status text when JSON body is null", async () => {
    const response = new Response("null", {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json" },
    });

    await expect(getResponseErrorMessage(response)).resolves.toBe("Internal Server Error");
  });

  it("returns plain-text response bodies when JSON parsing fails", async () => {
    const response = new Response("not-json", {
      status: 500,
      statusText: "",
      headers: { "Content-Type": "application/json" },
    });

    await expect(getResponseErrorMessage(response)).resolves.toBe("not-json");
  });

  it("returns a JSON string body when present", async () => {
    const response = new Response(JSON.stringify("Plain failure"), {
      status: 500,
      statusText: "Internal Server Error",
      headers: { "Content-Type": "application/json" },
    });

    await expect(getResponseErrorMessage(response)).resolves.toBe("Plain failure");
  });

  it("falls back to unknown error when the body cannot be read and status text is empty", async () => {
    const response = new Response(null, {
      status: 500,
      statusText: "",
    });

    Object.defineProperty(response, "text", {
      value: () => Promise.reject(new Error("body unavailable")),
    });

    await expect(getResponseErrorMessage(response)).resolves.toBe("Unknown error");
  });
});
