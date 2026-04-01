import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";
import { jsonResponse } from "../_shared/http-utils";
import { capturePosthogEvent, drainPosthogEvents } from "../_shared/posthog";
import {
  CLOUDFLARE_OPENAI_BASE_URL,
  CMUX_OPENAI_PROXY_PLACEHOLDER_API_KEY,
  normalizeOpenAIBaseUrl,
} from "@cmux/shared/convex-safe";

const hardCodedApiKey = CMUX_OPENAI_PROXY_PLACEHOLDER_API_KEY;

// Context window sizes per model for usage tracking
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "o1": 200000,
  "o1-mini": 128000,
  "o1-pro": 200000,
  "o3": 200000,
  "o3-mini": 200000,
  "codex-mini": 200000,
  "gpt-5.1-codex-mini": 200000,
  "gpt-5.4": 200000,
  "gpt-5.4-xhigh": 200000,
};

function getModelContextWindow(modelApiId: string): number | undefined {
  // Try exact match first
  if (MODEL_CONTEXT_WINDOWS[modelApiId]) {
    return MODEL_CONTEXT_WINDOWS[modelApiId];
  }
  // Try partial match for versioned models
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (modelApiId.includes(key)) {
      return value;
    }
  }
  return undefined;
}

// Temporarily disable auth for testing - should be false in production
const TEMPORARY_DISABLE_AUTH = true;

function getBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

function getSource(req: Request): string {
  return req.headers.get("x-cmux-source") || "unknown";
}

function hasUserApiKey(apiKey: string | null): boolean {
  if (!apiKey) return false;
  if (apiKey === hardCodedApiKey) return false;
  // OpenAI keys typically start with sk-
  return apiKey.startsWith("sk-");
}

type OpenAIPayloadSummary = {
  model?: string;
  maxTokens?: number;
  stream?: boolean;
  temperature?: number;
  messageCount: number;
  toolsCount: number;
};

function summarizeOpenAIPayload(body: Record<string, unknown>): OpenAIPayloadSummary {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools) ? body.tools : [];

  return {
    model: typeof body.model === "string" ? body.model : undefined,
    maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
    stream: typeof body.stream === "boolean" ? body.stream : undefined,
    temperature: typeof body.temperature === "number" ? body.temperature : undefined,
    messageCount: messages.length,
    toolsCount: tools.length,
  };
}

function trackOpenAIProxyRequest(params: {
  teamId: string;
  userId: string;
  taskRunId: string;
  source: string;
  model: string;
  stream: boolean;
  responseStatus: number;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  errorType?: string;
}) {
  capturePosthogEvent({
    distinctId: params.teamId,
    event: "$ai_generation",
    properties: {
      $ai_provider: "openai",
      $ai_model: params.model,
      $ai_is_error: params.responseStatus >= 400,
      $ai_latency_ms: params.latencyMs,
      $ai_http_status: params.responseStatus,
      $ai_input_tokens: params.promptTokens,
      $ai_output_tokens: params.completionTokens,
      $ai_stream: params.stream,
      cmux_user_id: params.userId,
      cmux_task_run_id: params.taskRunId,
      cmux_source: params.source,
      cmux_error_type: params.errorType,
    },
  });
}

/**
 * Handle response from upstream, preserving streaming if needed.
 */
function handleResponse(response: Response, isStreaming: boolean): Response {
  const headers = new Headers();
  headers.set("Content-Type", response.headers.get("Content-Type") || "application/json");
  headers.set("Cache-Control", "no-cache");
  headers.set("Connection", "keep-alive");

  if (isStreaming && response.body) {
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

/**
 * OpenAI API proxy handler.
 *
 * Routes requests based on API key:
 * 1. User's own OpenAI key -> Cloudflare AI Gateway (direct)
 * 2. Platform credits (placeholder key) -> cmux's OpenAI org key
 */
export const openaiProxy = httpAction(async (ctx, req) => {
  const startTime = Date.now();
  const source = getSource(req);
  const authorizationHeader = req.headers.get("authorization");
  const providedApiKey = getBearerToken(authorizationHeader);

  // Extract auth for tracking
  const workerAuth = await getWorkerAuth(req, {
    loggerPrefix: "[openai-proxy]",
  });

  const trackEvent = (
    model: string,
    stream: boolean,
    responseStatus: number,
    options?: {
      promptTokens?: number;
      completionTokens?: number;
      errorType?: string;
    }
  ) => {
    trackOpenAIProxyRequest({
      teamId: workerAuth?.payload.teamId ?? "unknown",
      userId: workerAuth?.payload.userId ?? "unknown",
      taskRunId: workerAuth?.payload.taskRunId ?? "unknown",
      source,
      model,
      stream,
      responseStatus,
      latencyMs: Date.now() - startTime,
      ...options,
    });
  };

  if (!TEMPORARY_DISABLE_AUTH && !workerAuth) {
    console.error("[openai-proxy] Auth error: Missing or invalid token");
    trackEvent("unknown", false, 401, { errorType: "unauthorized" });
    await drainPosthogEvents();
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    // Check for user's custom base URL
    let userCustomBaseUrl: string | undefined;
    if (workerAuth?.payload.teamId && workerAuth?.payload.userId) {
      const userBaseUrlEntry = await ctx.runQuery(
        internal.apiKeys.getByEnvVarInternal,
        {
          teamId: workerAuth.payload.teamId,
          userId: workerAuth.payload.userId,
          envVar: "OPENAI_BASE_URL",
        }
      );
      if (userBaseUrlEntry?.value?.trim()) {
        userCustomBaseUrl = userBaseUrlEntry.value.trim();
      }
    }

    const hasOfficialOpenAIKey = hasUserApiKey(providedApiKey);
    const hasCustomUrlWithAnyKey =
      !!userCustomBaseUrl &&
      providedApiKey !== null &&
      providedApiKey !== hardCodedApiKey;
    const useUserPath = hasOfficialOpenAIKey || hasCustomUrlWithAnyKey;

    const body = await req.json();
    const requestedModel = body.model ?? "unknown";
    const isStreaming = body.stream ?? false;
    const payloadSummary = summarizeOpenAIPayload(body);

    if (useUserPath) {
      // User key path: custom URL (if present), otherwise direct to Cloudflare
      const rawBaseUrl = normalizeOpenAIBaseUrl(
        userCustomBaseUrl || CLOUDFLARE_OPENAI_BASE_URL
      ).forRawFetch;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "accept-encoding": "identity",
      };

      if (providedApiKey) {
        headers["authorization"] = `Bearer ${providedApiKey}`;
      }

      console.log("[openai-proxy] User key request:", {
        requestedModel,
        usingCustomBaseUrl: !!userCustomBaseUrl,
        stream: isStreaming,
        messageCount: payloadSummary.messageCount,
        toolsCount: payloadSummary.toolsCount,
      });

      const response = await fetch(`${rawBaseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      // Track non-streaming responses with token usage
      if (!isStreaming) {
        const responseData = await response.clone().json().catch(() => null);
        const promptTokens = responseData?.usage?.prompt_tokens;
        const completionTokens = responseData?.usage?.completion_tokens;
        trackEvent(requestedModel, false, response.status, {
          promptTokens,
          completionTokens,
          errorType: response.ok ? undefined : responseData?.error?.type,
        });
        await drainPosthogEvents();

        // Update context usage in Convex - fire and forget
        if (promptTokens && completionTokens && workerAuth?.payload.taskRunId) {
          ctx
            .runMutation(internal.taskRuns.updateContextUsage, {
              id: workerAuth.payload.taskRunId as any,
              inputTokens: promptTokens,
              outputTokens: completionTokens,
              contextWindow: getModelContextWindow(requestedModel),
              provider: "openai",
            })
            .catch(() => {}); // Ignore errors to not block response
        }
      } else {
        trackEvent(requestedModel, true, response.status);
        await drainPosthogEvents();
      }

      return handleResponse(response, isStreaming);
    }

    // Platform credits path: use cmux's OpenAI org key
    const platformApiKey = process.env.OPENAI_API_KEY;
    if (!platformApiKey) {
      console.error("[openai-proxy] No platform OpenAI API key configured");
      trackEvent(requestedModel, isStreaming, 503, {
        errorType: "no_platform_key",
      });
      await drainPosthogEvents();
      return jsonResponse(
        { error: "Platform OpenAI API key not configured" },
        503
      );
    }

    // Use AI Gateway if configured, otherwise direct to OpenAI
    const effectiveGatewayBaseUrl = process.env.AIGATEWAY_OPENAI_BASE_URL;
    const targetBaseUrl = effectiveGatewayBaseUrl
      ? normalizeOpenAIBaseUrl(effectiveGatewayBaseUrl).forRawFetch
      : "https://api.openai.com";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      authorization: `Bearer ${platformApiKey}`,
      "accept-encoding": "identity",
    };

    console.log("[openai-proxy] Platform credits request:", {
      requestedModel,
      usingAiGateway: !!effectiveGatewayBaseUrl,
      stream: isStreaming,
      messageCount: payloadSummary.messageCount,
      toolsCount: payloadSummary.toolsCount,
    });

    const response = await fetch(`${targetBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // Track response
    if (!isStreaming) {
      const responseData = await response.clone().json().catch(() => null);
      const promptTokens = responseData?.usage?.prompt_tokens;
      const completionTokens = responseData?.usage?.completion_tokens;
      trackEvent(requestedModel, false, response.status, {
        promptTokens,
        completionTokens,
        errorType: response.ok ? undefined : responseData?.error?.type,
      });
      await drainPosthogEvents();

      if (promptTokens && completionTokens && workerAuth?.payload.taskRunId) {
        ctx
          .runMutation(internal.taskRuns.updateContextUsage, {
            id: workerAuth.payload.taskRunId as any,
            inputTokens: promptTokens,
            outputTokens: completionTokens,
            contextWindow: getModelContextWindow(requestedModel),
            provider: "openai",
          })
          .catch(() => {});
      }
    } else {
      trackEvent(requestedModel, true, response.status);
      await drainPosthogEvents();
    }

    return handleResponse(response, isStreaming);
  } catch (error) {
    console.error("[openai-proxy] Proxy error:", error);
    trackEvent("unknown", false, 500, { errorType: "proxy_error" });
    await drainPosthogEvents();
    return jsonResponse(
      { error: "Internal proxy error", details: String(error) },
      500
    );
  }
});
