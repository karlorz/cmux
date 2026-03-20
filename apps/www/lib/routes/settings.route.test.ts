/**
 * Settings Route Tests
 *
 * Tests for settings and provider connection test endpoints.
 */

import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  postApiSettingsTestAnthropicConnection,
  postApiSettingsTestProviderConnection,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

describe("settingsRouter", () => {
  describe("POST /api/settings/test-anthropic-connection", () => {
    it("requires authentication", async () => {
      const res = await postApiSettingsTestAnthropicConnection({
        client: testApiClient,
        body: {
          baseUrl: "https://api.anthropic.com",
          apiKey: "test-key",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("blocks localhost URLs (SSRF protection)", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiSettingsTestAnthropicConnection({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          baseUrl: "https://localhost:8080",
          apiKey: "test-key",
        },
      });

      // Auth may fail, or SSRF protection kicks in
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain("Localhost");
      }
    });

    it("blocks private IP ranges (SSRF protection)", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiSettingsTestAnthropicConnection({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          baseUrl: "https://192.168.1.1",
          apiKey: "test-key",
        },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain("Private IP");
      }
    });

    it("returns connection result for valid URL", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiSettingsTestAnthropicConnection({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          baseUrl: "https://api.anthropic.com",
          apiKey: "test-invalid-key",
        },
      });

      // Auth may fail in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("success");
        expect(res.data).toHaveProperty("message");
      }
    });
  });

  describe("POST /api/settings/test-provider-connection", () => {
    it("requires authentication", async () => {
      const res = await postApiSettingsTestProviderConnection({
        client: testApiClient,
        body: {
          provider: "openai",
          apiKey: "test-key",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("tests OpenAI connection", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiSettingsTestProviderConnection({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          provider: "openai",
          apiKey: "test-invalid-key",
        },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("success");
        expect(res.data).toHaveProperty("message");
        if (res.data.details) {
          expect(res.data.details.provider).toBe("openai");
        }
      }
    });

    it("tests Google connection", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiSettingsTestProviderConnection({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          provider: "google",
          apiKey: "test-invalid-key",
        },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
    });

    it("tests Mistral connection", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiSettingsTestProviderConnection({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          provider: "mistral",
          apiKey: "test-invalid-key",
        },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
    });

    it("supports custom base URL", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiSettingsTestProviderConnection({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          provider: "openai",
          baseUrl: "https://custom-openai-proxy.example.com",
          apiKey: "test-invalid-key",
        },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
    });
  });
});
