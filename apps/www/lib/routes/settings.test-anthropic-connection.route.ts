import { getUserFromRequest } from "@/lib/utils/auth";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { isAllowedBaseUrl } from "./settings.helpers";

const TestAnthropicConnectionBody = z
  .object({
    baseUrl: z.string().url(),
    apiKey: z.string().min(1),
  })
  .openapi("TestAnthropicConnectionBody");

const TestAnthropicConnectionResult = z
  .object({
    success: z.boolean(),
    message: z.string(),
    details: z
      .object({
        statusCode: z.number().optional(),
        responseTime: z.number().optional(),
        endpoint: z.string(),
        modelsFound: z.number().optional(),
      })
      .optional(),
  })
  .openapi("TestAnthropicConnectionResult");

export const settingsTestAnthropicConnectionRouter = new OpenAPIHono();

settingsTestAnthropicConnectionRouter.openapi(
  createRoute({
    method: "post",
    path: "/settings/test-anthropic-connection",
    tags: ["Settings"],
    summary: "Test Anthropic base URL and API key connectivity",
    request: {
      body: {
        content: {
          "application/json": {
            schema: TestAnthropicConnectionBody,
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
            schema: TestAnthropicConnectionResult,
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

    const { baseUrl, apiKey } = c.req.valid("json");
    const normalizedBaseUrl = baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "");

    const urlValidation = isAllowedBaseUrl(normalizedBaseUrl);
    if (!urlValidation.allowed) {
      return c.json({
        success: false,
        message: `Invalid base URL: ${urlValidation.reason}`,
        details: {
          endpoint: normalizedBaseUrl,
        },
      });
    }

    const endpoint = `${normalizedBaseUrl}/v1/models`;
    const startTime = Date.now();

    try {
      const authHeaders: Array<Record<string, string>> = [
        { Authorization: `Bearer ${apiKey}` },
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      ];

      const errorMessages: Record<number, string> = {
        401: "Authentication failed - check your API key",
        403: "Permission denied - API key may lack required permissions",
        404: "Endpoint not found - check your base URL",
        429: "Rate limited - too many requests",
        500: "Server error - endpoint returned an internal error",
        502: "Bad gateway - proxy or endpoint issue",
        503: "Service unavailable - endpoint is temporarily down",
      };

      let lastNetworkError: Error | null = null;
      let sawUnauthorized = false;

      for (const headers of authHeaders) {
        let response: Response;
        try {
          response = await fetch(endpoint, {
            method: "GET",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(10000),
          });
        } catch (fetchError) {
          lastNetworkError =
            fetchError instanceof Error
              ? fetchError
              : new Error(String(fetchError));
          continue;
        }

        if (response.ok) {
          let modelsCount = 0;
          try {
            const data = await response.json();
            modelsCount = Array.isArray(data?.data) ? data.data.length : 0;
          } catch {
            // Treat non-JSON success responses as a valid connection.
          }

          return c.json({
            success: true,
            message: "Connection successful - endpoint and API key validated",
            details: {
              statusCode: response.status,
              responseTime: Date.now() - startTime,
              endpoint,
              modelsFound: modelsCount,
            },
          });
        }

        if (response.status === 401) {
          sawUnauthorized = true;
          continue;
        }

        return c.json({
          success: false,
          message:
            errorMessages[response.status] || `API error: HTTP ${response.status}`,
          details: {
            statusCode: response.status,
            responseTime: Date.now() - startTime,
            endpoint,
          },
        });
      }

      if (lastNetworkError && !sawUnauthorized) {
        return c.json({
          success: false,
          message: `Connection failed - endpoint unreachable: ${lastNetworkError.message}`,
          details: {
            responseTime: Date.now() - startTime,
            endpoint,
          },
        });
      }

      return c.json({
        success: false,
        message: "Authentication failed - check your API key",
        details: {
          statusCode: 401,
          responseTime: Date.now() - startTime,
          endpoint,
        },
      });
    } catch (error) {
      console.error("[settings] Anthropic connection test failed:", error);
      return c.json({
        success: false,
        message: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
        details: {
          endpoint,
        },
      });
    }
  },
);
