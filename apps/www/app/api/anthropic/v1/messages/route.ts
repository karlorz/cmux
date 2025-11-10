import { captureServerPosthogEvent } from "@/lib/analytics/posthog-server";
import { env } from "@/lib/utils/www-env";
import { verifyTaskRunToken, type TaskRunTokenPayload } from "@cmux/shared";
import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const TEMPORARY_DISABLE_AUTH = true;

const hardCodedApiKey = "sk_placeholder_cmux_anthropic_api_key";

type AnalyticsContext = {
  tokenPayload: TaskRunTokenPayload | null;
  messagesCount: number;
  model?: string;
  stream: boolean;
  isOAuthToken: boolean;
  usedOriginalApiKey: boolean;
};

type UsageResult = {
  inputTokens?: number;
  outputTokens?: number;
  status: number;
  errorMessage?: string;
};

type StreamingUsageAccumulator = {
  inputTokens?: number;
  deltaOutputTokens: number;
  initialOutputTokens?: number;
};

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
  let tokenPayload: TaskRunTokenPayload | null = null;
  if (!TEMPORARY_DISABLE_AUTH) {
    try {
      tokenPayload = await requireTaskRunToken(request);
    } catch (authError) {
      console.error("[anthropic proxy] Auth error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    tokenPayload = await getOptionalTaskRunTokenPayload(request);
  }

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

  let analyticsContext: AnalyticsContext | null = null;

  try {
    const body = await request.json();
    const streamRequested = Boolean(
      (body as { stream?: boolean }).stream ?? false
    );
    analyticsContext = {
      tokenPayload,
      messagesCount: getMessagesCount(body),
      model:
        typeof (body as { model?: unknown }).model === "string"
          ? (body as { model: string }).model
          : undefined,
      stream: streamRequested,
      isOAuthToken,
      usedOriginalApiKey: useOriginalApiKey,
    };

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

    if (!useOriginalApiKey && beta === "true") {
      headers["anthropic-beta"] = "messages-2023-12-15";
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

    if (streamRequested && response.ok) {
      const streamingAnalyticsContext =
        analyticsContext ??
        createFallbackAnalyticsContext(tokenPayload, {
          isOAuthToken,
          usedOriginalApiKey: useOriginalApiKey,
        });
      return createAnthropicStreamResponse(
        response,
        streamingAnalyticsContext
      );
    }

    const data = await response.json();
    const usageFromResponse = extractUsageFromResponse(data);

    if (!response.ok) {
      console.error("[anthropic proxy] Anthropic error:", data);
      const analyticsPayload =
        analyticsContext ??
        createFallbackAnalyticsContext(tokenPayload, {
          isOAuthToken,
          usedOriginalApiKey: useOriginalApiKey,
        });
      void trackAnthropicUsage(analyticsPayload, {
        status: response.status,
        inputTokens: usageFromResponse.inputTokens,
        outputTokens: usageFromResponse.outputTokens,
        errorMessage: extractErrorMessage(data),
      });
      return NextResponse.json(data, { status: response.status });
    }

    if (analyticsContext) {
      void trackAnthropicUsage(analyticsContext, {
        status: response.status,
        inputTokens: usageFromResponse.inputTokens,
        outputTokens: usageFromResponse.outputTokens,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[anthropic proxy] Error:", error);
    const fallbackContext =
      analyticsContext ??
      createFallbackAnalyticsContext(tokenPayload, {
        isOAuthToken,
        usedOriginalApiKey: useOriginalApiKey,
      });
    void trackAnthropicUsage(fallbackContext, {
      status: 500,
      errorMessage:
        error instanceof Error ? error.message : "Failed to proxy request",
    });
    return NextResponse.json(
      { error: "Failed to proxy request to Anthropic" },
      { status: 500 }
    );
  }
}

async function getOptionalTaskRunTokenPayload(
  request: NextRequest
): Promise<TaskRunTokenPayload | null> {
  const token = request.headers.get("x-cmux-token");
  if (!token) {
    return null;
  }

  try {
    return await verifyTaskRunToken(token, env.CMUX_TASK_RUN_JWT_SECRET);
  } catch (error) {
    console.warn("[anthropic proxy] Optional token verification failed:", error);
    return null;
  }
}

function getMessagesCount(body: unknown): number {
  if (
    body &&
    typeof body === "object" &&
    Array.isArray((body as { messages?: unknown }).messages)
  ) {
    return (body as { messages: unknown[] }).messages.length;
  }
  return 0;
}

function extractUsageFromResponse(data: unknown): {
  inputTokens?: number;
  outputTokens?: number;
} {
  if (!data || typeof data !== "object") {
    return {};
  }

  const record = data as Record<string, unknown>;
  const usageNode =
    record.usage ||
    (record.message &&
    typeof record.message === "object" &&
    record.message !== null
      ? (record.message as Record<string, unknown>).usage
      : undefined);

  if (!usageNode || typeof usageNode !== "object") {
    return {};
  }

  const usage = usageNode as Record<string, unknown>;

  return {
    inputTokens:
      typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
    outputTokens:
      typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
  };
}

function extractErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.error === "string") {
    return record.error;
  }

  if (
    record.error &&
    typeof record.error === "object" &&
    record.error !== null
  ) {
    const errorRecord = record.error as Record<string, unknown>;
    if (typeof errorRecord.message === "string") {
      return errorRecord.message;
    }
    if (typeof errorRecord.type === "string") {
      return errorRecord.type;
    }
  }

  return undefined;
}

async function trackAnthropicUsage(
  context: AnalyticsContext,
  result: UsageResult
): Promise<void> {
  const distinctId = context.tokenPayload?.userId ?? "anonymous";

  await captureServerPosthogEvent({
    distinctId,
    event: "anthropic_messages_proxy_usage",
    properties: {
      team_id: context.tokenPayload?.teamId ?? null,
      task_run_id: context.tokenPayload?.taskRunId ?? null,
      messages_count: context.messagesCount,
      model: context.model ?? null,
      stream: context.stream,
      status_code: result.status,
      input_tokens: result.inputTokens ?? null,
      output_tokens: result.outputTokens ?? null,
      error_message: result.errorMessage ?? null,
      used_original_api_key: context.usedOriginalApiKey,
      is_oauth_token: context.isOAuthToken,
    },
  });
}

function createFallbackAnalyticsContext(
  tokenPayload: TaskRunTokenPayload | null,
  options: Pick<AnalyticsContext, "isOAuthToken" | "usedOriginalApiKey">
): AnalyticsContext {
  return {
    tokenPayload,
    messagesCount: 0,
    model: undefined,
    stream: false,
    isOAuthToken: options.isOAuthToken,
    usedOriginalApiKey: options.usedOriginalApiKey,
  };
}

function createAnthropicStreamResponse(
  response: Response,
  analyticsContext: AnalyticsContext
): Response {
  const decoder = new TextDecoder();
  const usageAccumulator: StreamingUsageAccumulator = {
    deltaOutputTokens: 0,
  };
  let analyticsSent = false;
  let sseBuffer = "";

  const finalizeAnalytics = (errorMessage?: string) => {
    if (analyticsSent) {
      return;
    }
    analyticsSent = true;

    const resolvedOutputTokens = resolveStreamingOutputTokens(usageAccumulator);

    void trackAnthropicUsage(analyticsContext, {
      status: response.status,
      inputTokens: usageAccumulator.inputTokens,
      outputTokens: resolvedOutputTokens,
      errorMessage,
    });
  };

  const processBuffer = () => {
    let boundaryIndex = sseBuffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const rawEvent = sseBuffer.slice(0, boundaryIndex).replace(/\r/g, "");
      sseBuffer = sseBuffer.slice(boundaryIndex + 2);
      if (rawEvent.trim().length > 0) {
        parseSseEvent(rawEvent, usageAccumulator);
      }
      boundaryIndex = sseBuffer.indexOf("\n\n");
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        finalizeAnalytics("Missing response body");
        controller.close();
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            sseBuffer += decoder.decode();
            if (sseBuffer.trim().length > 0) {
              sseBuffer += "\n\n";
              processBuffer();
            }
            finalizeAnalytics();
            controller.close();
            break;
          }

          if (value) {
            controller.enqueue(value);
            sseBuffer += decoder.decode(value, { stream: true });
            processBuffer();
          }
        }
      } catch (streamError) {
        console.error("[anthropic proxy] Stream error:", streamError);
        finalizeAnalytics(
          streamError instanceof Error
            ? streamError.message
            : "Unknown stream error"
        );
        controller.error(streamError);
      }
    },
    cancel(reason) {
      finalizeAnalytics(
        reason instanceof Error ? reason.message : "Stream cancelled"
      );
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

function parseSseEvent(
  rawEvent: string,
  accumulator: StreamingUsageAccumulator
): void {
  const dataLines = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return;
  }

  const payload = dataLines.join("\n");
  try {
    const parsed = JSON.parse(payload);
    updateStreamingUsageFromEvent(parsed, accumulator);
  } catch (error) {
    console.warn("[anthropic proxy] Failed to parse SSE chunk:", error);
  }
}

function updateStreamingUsageFromEvent(
  eventData: unknown,
  accumulator: StreamingUsageAccumulator
) {
  if (!eventData || typeof eventData !== "object") {
    return;
  }

  const record = eventData as Record<string, unknown>;

  if (record.message && typeof record.message === "object") {
    const usage =
      (record.message as Record<string, unknown>).usage ?? undefined;
    if (usage && typeof usage === "object") {
      const usageRecord = usage as Record<string, unknown>;
      if (typeof usageRecord.input_tokens === "number") {
        accumulator.inputTokens = usageRecord.input_tokens;
      }
      if (typeof usageRecord.output_tokens === "number") {
        accumulator.initialOutputTokens = usageRecord.output_tokens;
      }
    }
  }

  if (record.usage && typeof record.usage === "object") {
    const usageRecord = record.usage as Record<string, unknown>;
    if (typeof usageRecord.output_tokens === "number") {
      accumulator.deltaOutputTokens += usageRecord.output_tokens;
    }
  }
}

function resolveStreamingOutputTokens(
  accumulator: StreamingUsageAccumulator
): number | undefined {
  if (accumulator.deltaOutputTokens > 0) {
    return accumulator.deltaOutputTokens;
  }

  return accumulator.initialOutputTokens;
}
