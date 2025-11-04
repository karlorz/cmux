import { verifyTaskRunToken, type TaskRunTokenPayload } from "@cmux/shared";
import { env } from "@/lib/utils/www-env";
import { trackModelUsage } from "@/lib/utils/posthog";
import { NextRequest, NextResponse } from "next/server";

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

export async function POST(request: NextRequest) {
  let taskRunPayload: TaskRunTokenPayload | null = null;

  if (!TEMPORARY_DISABLE_AUTH) {
    try {
      taskRunPayload = await requireTaskRunToken(request);
    } catch (authError) {
      console.error("[anthropic proxy] Auth error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startTime = Date.now();

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
      // Create a TransformStream to pass through the SSE data
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                break;
              }
              controller.enqueue(value);
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

      // Track failed API call
      trackModelUsage({
        model: body.model || "unknown",
        provider: "anthropic",
        teamId: taskRunPayload?.teamId,
        userId: taskRunPayload?.userId,
        taskRunId: taskRunPayload?.taskRunId,
        streaming: false,
        responseTimeMs: Date.now() - startTime,
        success: false,
        errorType: data.error?.type || "unknown_error",
      }).catch((error) => {
        console.error("[anthropic proxy] Failed to track error event", error);
      });

      return NextResponse.json(data, { status: response.status });
    }

    // Track successful API call
    trackModelUsage({
      model: body.model || data.model || "unknown",
      provider: "anthropic",
      teamId: taskRunPayload?.teamId,
      userId: taskRunPayload?.userId,
      taskRunId: taskRunPayload?.taskRunId,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      totalTokens:
        (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      streaming: false,
      responseTimeMs: Date.now() - startTime,
      success: true,
    }).catch((error) => {
      console.error("[anthropic proxy] Failed to track success event", error);
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[anthropic proxy] Error:", error);

    // Track proxy error
    trackModelUsage({
      model: "unknown",
      provider: "anthropic",
      teamId: taskRunPayload?.teamId,
      userId: taskRunPayload?.userId,
      taskRunId: taskRunPayload?.taskRunId,
      streaming: false,
      responseTimeMs: Date.now() - startTime,
      success: false,
      errorType: "proxy_error",
    }).catch((trackError) => {
      console.error("[anthropic proxy] Failed to track proxy error", trackError);
    });

    return NextResponse.json(
      { error: "Failed to proxy request to Anthropic" },
      { status: 500 }
    );
  }
}
