import { getUserFromRequest } from "@/lib/utils/auth";
import Anthropic from "@anthropic-ai/sdk";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

export const settingsRouter = new OpenAPIHono();

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

settingsRouter.openapi(
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
        401
      );
    }

    const { baseUrl, apiKey } = c.req.valid("json");
    const normalizedBaseUrl = baseUrl
      .replace(/\/v1\/?$/, "")
      .replace(/\/+$/, "");
    const endpoint = `${normalizedBaseUrl}/v1/models`;
    const startTime = Date.now();

    try {
      const client = new Anthropic({
        apiKey,
        baseURL: normalizedBaseUrl,
        timeout: 10000,
      });

      const models = await client.models.list({ limit: 1 });
      return c.json({
        success: true,
        message: "Connection successful - endpoint and API key validated",
        details: {
          statusCode: 200,
          responseTime: Date.now() - startTime,
          endpoint,
          modelsFound: models.data.length,
        },
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      if (error instanceof Anthropic.APIError) {
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
          message: errorMessages[error.status] || `API error: ${error.message}`,
          details: {
            statusCode: error.status,
            responseTime,
            endpoint,
          },
        });
      }

      if (error instanceof Anthropic.APIConnectionError) {
        return c.json({
          success: false,
          message: `Connection failed - endpoint unreachable: ${error.message}`,
          details: {
            endpoint,
          },
        });
      }

      return c.json({
        success: false,
        message: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
        details: {
          endpoint,
        },
      });
    }
  }
);
