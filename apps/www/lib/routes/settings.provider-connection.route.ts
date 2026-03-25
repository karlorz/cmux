/**
 * @deprecated Legacy provider connection testing route.
 *
 * For new integrations, use the Provider Control Plane API:
 *   POST /api/provider-control-plane/connect
 *   POST /api/provider-control-plane/disconnect
 *
 * The control plane handles credential storage and connection validation
 * consistently across all providers.
 *
 * This route is kept for backwards compatibility during the migration.
 */

import { getUserFromRequest } from "@/lib/utils/auth";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { normalizeProviderBaseUrlForRawFetch } from "@cmux/shared";
import { isAllowedBaseUrl } from "./settings.helpers";

const ProviderConnectionResult = z
  .object({
    success: z.boolean(),
    message: z.string(),
    details: z
      .object({
        statusCode: z.number().optional(),
        responseTime: z.number().optional(),
        endpoint: z.string(),
        modelsFound: z.number().optional(),
        provider: z.string().optional(),
      })
      .optional(),
  })
  .openapi("ProviderConnectionResult");

const PROVIDER_CONFIGS = {
  anthropic: {
    defaultBaseUrl: "https://api.anthropic.com",
    modelsEndpoint: "/v1/models",
    headers: (apiKey: string) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
  },
  openai: {
    defaultBaseUrl: "https://api.openai.com",
    modelsEndpoint: "/v1/models",
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
  google: {
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    modelsEndpoint: "/v1beta/models",
    headers: (_apiKey: string) => ({}),
    queryParams: (apiKey: string) => ({ key: apiKey }),
  },
  mistral: {
    defaultBaseUrl: "https://api.mistral.ai",
    modelsEndpoint: "/v1/models",
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
  together: {
    defaultBaseUrl: "https://api.together.xyz",
    modelsEndpoint: "/v1/models",
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
  groq: {
    defaultBaseUrl: "https://api.groq.com/openai",
    modelsEndpoint: "/v1/models",
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
} as const;

const TestProviderConnectionBody = z
  .object({
    provider: z.enum([
      "anthropic",
      "openai",
      "google",
      "mistral",
      "together",
      "groq",
    ]),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().min(1),
  })
  .openapi("TestProviderConnectionBody");

export const settingsProviderConnectionRouter = new OpenAPIHono();

settingsProviderConnectionRouter.openapi(
  createRoute({
    method: "post",
    path: "/settings/test-provider-connection",
    tags: ["Settings"],
    summary:
      "Test provider connection (OpenAI, Google, Mistral, Together, Groq, Anthropic)",
    request: {
      body: {
        content: {
          "application/json": {
            schema: TestProviderConnectionBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Connection test result",
        content: {
          "application/json": {
            schema: ProviderConnectionResult,
          },
        },
      },
      401: {
        description: "Unauthorized",
      },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.json(
        {
          success: false,
          message: "Unauthorized",
        },
        401,
      );
    }

    const { provider, baseUrl, apiKey } = c.req.valid("json");
    const config = PROVIDER_CONFIGS[provider];
    const normalizedBaseUrl = normalizeProviderBaseUrlForRawFetch(
      provider,
      baseUrl ?? config.defaultBaseUrl
    );

    const urlValidation = isAllowedBaseUrl(normalizedBaseUrl);
    if (!urlValidation.allowed) {
      return c.json({
        success: false,
        message: `Invalid base URL: ${urlValidation.reason}`,
        details: {
          endpoint: normalizedBaseUrl,
          provider,
        },
      });
    }

    let endpoint = `${normalizedBaseUrl}${config.modelsEndpoint}`;
    const queryParams =
      "queryParams" in config && config.queryParams
        ? config.queryParams(apiKey)
        : undefined;
    if (queryParams) {
      endpoint = `${endpoint}?${new URLSearchParams(queryParams).toString()}`;
    }

    const startTime = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          ...config.headers(apiKey),
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });

      const responseTime = Date.now() - startTime;
      const maskedEndpoint = endpoint.replace(/key=[^&]+/, "key=***");

      if (response.ok) {
        let modelsCount = 0;
        try {
          const data = await response.json();
          if (Array.isArray(data?.data)) {
            modelsCount = data.data.length;
          } else if (Array.isArray(data?.models)) {
            modelsCount = data.models.length;
          } else if (Array.isArray(data)) {
            modelsCount = data.length;
          }
        } catch {
          // Non-JSON success is still valid.
        }

        return c.json({
          success: true,
          message: `Connection successful - ${provider} endpoint validated`,
          details: {
            statusCode: response.status,
            responseTime,
            endpoint: maskedEndpoint,
            modelsFound: modelsCount,
            provider,
          },
        });
      }

      const errorMessages: Record<number, string> = {
        401: "Authentication failed - check your API key",
        403: "Permission denied - API key may lack required permissions",
        404: "Endpoint not found - check your base URL",
        429: "Rate limited - too many requests",
        500: "Server error - endpoint returned an internal error",
        502: "Bad gateway - proxy or endpoint issue",
        503: "Service unavailable - endpoint is temporarily down",
      };

      return c.json({
        success: false,
        message:
          errorMessages[response.status] || `API error: HTTP ${response.status}`,
        details: {
          statusCode: response.status,
          responseTime,
          endpoint: maskedEndpoint,
          provider,
        },
      });
    } catch (error) {
      console.error("[settings] Provider connection test failed:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({
        success: false,
        message: `Connection failed: ${message}`,
        details: {
          endpoint: endpoint.replace(/key=[^&]+/, "key=***"),
          responseTime: Date.now() - startTime,
          provider,
        },
      });
    }
  },
);
