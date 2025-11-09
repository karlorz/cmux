import { verifyTaskRunToken, type TaskRunTokenPayload } from "@cmux/shared";
import { env } from "@/lib/utils/www-env";
import { NextRequest, NextResponse } from "next/server";
import { captureServerPosthogEvent } from "@/lib/analytics/posthog-server";
import {
  ANTHROPIC_EVENTS,
  ANTHROPIC_PROPERTIES,
} from "@/lib/analytics/anthropic-events";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const TEMPORARY_DISABLE_AUTH = true;

const hardCodedApiKey = "sk_placeholder_cmux_anthropic_api_key";

async function requireTaskRunToken(
  request: NextRequest
): Promise<TaskRunTokenPayload> {
  const token = request.headers.get("x-cmux-token");
  if (!token) {
    throw new Error("Missing CMUX token");
  }

  return verifyTaskRunToken(token, env.CMUX_TASK_RUN_JWT_SECRET);
}

function getIsOAuthToken(token: string) {
  return token.includes("sk-ant-oat");
}

function getUserIdFromRequest(request: NextRequest): string {
  // Try to get user ID from CMUX token if available
  const cmuxToken = request.headers.get("x-cmux-token");
  if (cmuxToken) {
    try {
      // Extract user ID from JWT payload without full verification
      // Format: header.payload.signature
      const payloadBase64 = cmuxToken.split(".")[1];
      if (payloadBase64) {
        const payload = JSON.parse(
          Buffer.from(payloadBase64, "base64").toString()
        );
        if (payload.userId) {
          return `user_${payload.userId}`;
        }
      }
    } catch {
      // Fall through to other methods
    }
  }

  // Try API key hash as identifier
  const xApiKey = request.headers.get("x-api-key");
  const authorization = request.headers.get("authorization");
  const apiKey = xApiKey || authorization;

  if (apiKey && apiKey !== hardCodedApiKey) {
    // Use last 8 characters of API key as identifier
    const keyIdentifier = apiKey.slice(-8);
    return `apikey_${keyIdentifier}`;
  }

  // Fallback to IP-based identifier
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return `ip_${ip}`;
}

function getAuthType(
  useOriginalApiKey: boolean,
  isOAuthToken: boolean
): string {
  if (isOAuthToken) return "oauth";
  if (useOriginalApiKey) return "api_key";
  return "backend";
}

export async function POST(request: NextRequest) {
  if (!TEMPORARY_DISABLE_AUTH) {
    try {
      await requireTaskRunToken(request);
    } catch (authError) {
      console.error("[anthropic proxy] Auth error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const beta = searchParams.get("beta");

    const xApiKeyHeader = request.headers.get("x-api-key");
    const authorizationHeader = request.headers.get("authorization");
    const isOAuthToken = getIsOAuthToken(
      xApiKeyHeader || authorizationHeader || ""
    );
    const useOriginalApiKey =
      !isOAuthToken &&
      xApiKeyHeader !== hardCodedApiKey &&
      authorizationHeader !== hardCodedApiKey;
    const body = await request.json();

    // Build headers
    const headers: Record<string, string> =
      useOriginalApiKey && !TEMPORARY_DISABLE_AUTH
        ? (() => {
            const filtered = new Headers(request.headers);
            return Object.fromEntries(filtered);
          })()
        : {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          };

    // Add beta header if beta param is present
    if (!useOriginalApiKey) {
      if (beta === "true") {
        headers["anthropic-beta"] = "messages-2023-12-15";
      }
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    console.log(
      "[anthropic proxy] Anthropic response status:",
      response.status
    );

    // Handle streaming responses
    if (body.stream && response.ok) {
      const userId = getUserIdFromRequest(request);
      const authType = getAuthType(useOriginalApiKey, isOAuthToken);

      // Track usage from streaming responses
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationInputTokens = 0;
      let cacheReadInputTokens = 0;
      let stopReason: string | undefined;

      // Create a TransformStream to pass through the SSE data and collect analytics
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // Stream complete - capture analytics
                captureServerPosthogEvent({
                  distinctId: userId,
                  event: ANTHROPIC_EVENTS.MESSAGE_STREAMED,
                  properties: {
                    [ANTHROPIC_PROPERTIES.INPUT_TOKENS]: inputTokens,
                    [ANTHROPIC_PROPERTIES.OUTPUT_TOKENS]: outputTokens,
                    [ANTHROPIC_PROPERTIES.CACHE_CREATION_INPUT_TOKENS]:
                      cacheCreationInputTokens,
                    [ANTHROPIC_PROPERTIES.CACHE_READ_INPUT_TOKENS]:
                      cacheReadInputTokens,
                    [ANTHROPIC_PROPERTIES.MODEL]: body.model,
                    [ANTHROPIC_PROPERTIES.IS_STREAMING]: true,
                    [ANTHROPIC_PROPERTIES.MAX_TOKENS]: body.max_tokens,
                    [ANTHROPIC_PROPERTIES.STOP_REASON]: stopReason,
                    [ANTHROPIC_PROPERTIES.RESPONSE_STATUS]: response.status,
                    [ANTHROPIC_PROPERTIES.AUTH_TYPE]: authType,
                  },
                }).catch((error) => {
                  console.error(
                    "[anthropic proxy] Failed to track streaming analytics:",
                    error
                  );
                });

                controller.close();
                break;
              }

              // Pass through the data
              controller.enqueue(value);

              // Parse SSE events to extract usage information
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6);
                  if (data === "[DONE]") continue;

                  try {
                    const event = JSON.parse(data);

                    // Extract usage from message_start event
                    if (event.type === "message_start" && event.message?.usage) {
                      inputTokens = event.message.usage.input_tokens ?? 0;
                      cacheCreationInputTokens =
                        event.message.usage.cache_creation_input_tokens ?? 0;
                      cacheReadInputTokens =
                        event.message.usage.cache_read_input_tokens ?? 0;
                    }

                    // Extract usage from message_delta event (contains output tokens)
                    if (event.type === "message_delta") {
                      if (event.usage?.output_tokens) {
                        outputTokens = event.usage.output_tokens;
                      }
                      if (event.delta?.stop_reason) {
                        stopReason = event.delta.stop_reason;
                      }
                    }
                  } catch {
                    // Skip malformed JSON
                  }
                }
              }
            }
          } catch (error) {
            console.error("[anthropic proxy] Stream error:", error);
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Handle non-streaming responses
    const data = await response.json();

    if (!response.ok) {
      console.error("[anthropic proxy] Anthropic error:", data);
      return NextResponse.json(data, { status: response.status });
    }

    // Track analytics for successful non-streaming responses
    const userId = getUserIdFromRequest(request);
    const authType = getAuthType(useOriginalApiKey, isOAuthToken);

    captureServerPosthogEvent({
      distinctId: userId,
      event: ANTHROPIC_EVENTS.MESSAGE_COMPLETED,
      properties: {
        [ANTHROPIC_PROPERTIES.INPUT_TOKENS]: data.usage?.input_tokens ?? 0,
        [ANTHROPIC_PROPERTIES.OUTPUT_TOKENS]: data.usage?.output_tokens ?? 0,
        [ANTHROPIC_PROPERTIES.CACHE_CREATION_INPUT_TOKENS]:
          data.usage?.cache_creation_input_tokens ?? 0,
        [ANTHROPIC_PROPERTIES.CACHE_READ_INPUT_TOKENS]:
          data.usage?.cache_read_input_tokens ?? 0,
        [ANTHROPIC_PROPERTIES.MODEL]: body.model,
        [ANTHROPIC_PROPERTIES.IS_STREAMING]: false,
        [ANTHROPIC_PROPERTIES.MAX_TOKENS]: body.max_tokens,
        [ANTHROPIC_PROPERTIES.STOP_REASON]: data.stop_reason,
        [ANTHROPIC_PROPERTIES.RESPONSE_STATUS]: response.status,
        [ANTHROPIC_PROPERTIES.AUTH_TYPE]: authType,
      },
    }).catch((error) => {
      console.error("[anthropic proxy] Failed to track analytics:", error);
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[anthropic proxy] Error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request to Anthropic" },
      { status: 500 }
    );
  }
}
