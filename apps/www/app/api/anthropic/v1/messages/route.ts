import { verifyTaskRunToken, type TaskRunTokenPayload } from "@cmux/shared";
import { captureServerPosthogEvent } from "@/lib/analytics/posthog-server";
import { env } from "@/lib/utils/www-env";
import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const TEMPORARY_DISABLE_AUTH = true;

const hardCodedApiKey = "sk_placeholder_cmux_anthropic_api_key";

type AnthropicMessagesBody = {
  model?: unknown;
  messages?: unknown;
  stream?: unknown;
  [key: string]: unknown;
};

type UsageMetrics = {
  inputTokens?: number;
  outputTokens?: number;
};

type AnalyticsContext = {
  tokenPayload: TaskRunTokenPayload | null;
  messageCount: number;
  model?: string;
  isStreaming: boolean;
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
    const body = (await request.json()) as AnthropicMessagesBody;
    const analyticsContext: AnalyticsContext = {
      tokenPayload,
      messageCount: getMessageCount(body.messages),
      model: typeof body.model === "string" ? body.model : undefined,
      isStreaming: Boolean(body.stream),
    };

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
            await captureAnthropicUsageEvent(analyticsContext, null);
            return;
          }

          const decoder = new TextDecoder();
          let parserBuffer = "";
          let usageFromStream: UsageMetrics | null = null;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                break;
              }
              controller.enqueue(value);
              if (value) {
                const decodedChunk = decoder.decode(value, { stream: true });
                const nextState = processSseBuffer(
                  parserBuffer + decodedChunk,
                  usageFromStream
                );
                parserBuffer = nextState.buffer;
                usageFromStream = nextState.usage;
              }
            }
          } catch (error) {
            console.error("[anthropic proxy] Stream error:", error);
            controller.error(error);
          } finally {
            try {
              const finalState = processSseBuffer(
                parserBuffer + decoder.decode(),
                usageFromStream,
                { flush: true }
              );
              usageFromStream = finalState.usage;
              await captureAnthropicUsageEvent(analyticsContext, usageFromStream);
            } catch (analyticsError) {
              console.error(
                "[anthropic proxy] Failed to track streaming usage:",
                analyticsError
              );
            }
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

    if (response.ok) {
      const usageFromResponse = extractUsageFromAnthropicPayload(data);
      await captureAnthropicUsageEvent(analyticsContext, usageFromResponse);
    }

    if (!response.ok) {
      console.error("[anthropic proxy] Anthropic error:", data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[anthropic proxy] Error:", error);
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
    console.warn(
      "[anthropic proxy] Ignoring invalid CMUX token for analytics:",
      error
    );
    return null;
  }
}

function getMessageCount(messages: unknown): number {
  if (Array.isArray(messages)) {
    return messages.length;
  }
  return 0;
}

function normalizeUsage(value: unknown): UsageMetrics | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const inputRaw = (value as Record<string, unknown>).input_tokens;
  const outputRaw = (value as Record<string, unknown>).output_tokens;

  const inputTokens = typeof inputRaw === "number" ? inputRaw : undefined;
  const outputTokens = typeof outputRaw === "number" ? outputRaw : undefined;

  if (inputTokens === undefined && outputTokens === undefined) {
    return null;
  }

  return { inputTokens, outputTokens };
}

function extractUsageFromAnthropicPayload(
  payload: unknown
): UsageMetrics | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const fromTopLevel = normalizeUsage(
    (payload as Record<string, unknown>).usage
  );
  if (fromTopLevel) {
    return fromTopLevel;
  }

  const message = (payload as Record<string, unknown>).message;
  if (message && typeof message === "object") {
    return normalizeUsage((message as Record<string, unknown>).usage);
  }

  return null;
}

async function captureAnthropicUsageEvent(
  context: AnalyticsContext,
  usage: UsageMetrics | null
): Promise<void> {
  const { tokenPayload, messageCount, model, isStreaming } = context;

  await captureServerPosthogEvent({
    distinctId: tokenPayload?.userId ?? "anonymous",
    event: "anthropic_messages_invoked",
    properties: {
      team_id: tokenPayload?.teamId ?? null,
      task_run_id: tokenPayload?.taskRunId ?? null,
      message_count: messageCount,
      model: model ?? "unknown",
      is_streaming: isStreaming,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
    },
  });
}

function processSseBuffer(
  buffer: string,
  currentUsage: UsageMetrics | null,
  options: { flush?: boolean } = {}
): { buffer: string; usage: UsageMetrics | null } {
  let workingBuffer = buffer;
  let usage = currentUsage;

  let separatorIndex = workingBuffer.indexOf("\n\n");
  while (separatorIndex !== -1) {
    const eventChunk = workingBuffer.slice(0, separatorIndex);
    workingBuffer = workingBuffer.slice(separatorIndex + 2);

    const eventUsage = extractUsageFromSseEvent(eventChunk);
    if (eventUsage) {
      usage = eventUsage;
    }

    separatorIndex = workingBuffer.indexOf("\n\n");
  }

  if (options.flush && workingBuffer.trim().length > 0) {
    const eventUsage = extractUsageFromSseEvent(workingBuffer);
    if (eventUsage) {
      usage = eventUsage;
    }
    workingBuffer = "";
  }

  return { buffer: workingBuffer, usage };
}

function extractUsageFromSseEvent(eventChunk: string): UsageMetrics | null {
  const lines = eventChunk.split(/\r?\n/);
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join("\n");
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload);
    return extractUsageFromAnthropicPayload(parsed);
  } catch {
    return null;
  }
}
