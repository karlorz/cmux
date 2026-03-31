import { captureServerPosthogEvent } from "@/lib/analytics/posthog-server";

// Source identifies which product/feature is making the API call
export type OpenAIProxySource = "cmux" | "codex-cli";

type OpenAIProxyEvent = {
  // Core identifiers
  teamId: string;
  userId: string;
  userEmail?: string;
  taskRunId: string;

  // Source/product identifier
  source: OpenAIProxySource;

  // Request metadata
  model: string;
  stream: boolean;

  // Response metadata
  responseStatus: number;
  latencyMs: number;

  // Token usage (from OpenAI response.usage)
  promptTokens?: number;
  completionTokens?: number;
  /** Reasoning tokens for o1/o3 models */
  reasoningTokens?: number;
  /** Cached prompt tokens */
  cachedTokens?: number;

  // Error info (if applicable)
  errorType?: string;
};

// Map source to span name for PostHog AI analytics
function getSpanName(source: OpenAIProxySource): string {
  switch (source) {
    case "cmux":
      return "openai-cmux";
    case "codex-cli":
      return "codex-cli-cmux";
  }
}

export async function trackOpenAIProxyRequest(
  event: OpenAIProxyEvent
): Promise<void> {
  // Use PostHog's $ai_generation event for LLM analytics
  // See: https://posthog.com/docs/ai-engineering/observability
  await captureServerPosthogEvent({
    distinctId: event.userId,
    event: "$ai_generation",
    properties: {
      // PostHog AI properties
      $ai_model: event.model,
      $ai_provider: "openai",
      $ai_input_tokens: event.promptTokens,
      $ai_output_tokens: event.completionTokens,
      $ai_latency: event.latencyMs / 1000, // PostHog expects seconds
      $ai_http_status: event.responseStatus,
      $ai_is_error: event.responseStatus >= 400,
      $ai_error: event.errorType,
      $ai_stream: event.stream,
      $ai_trace_id: event.taskRunId,
      $ai_span_name: getSpanName(event.source),

      // OpenAI-specific token details
      openai_reasoning_tokens: event.reasoningTokens,
      openai_cached_tokens: event.cachedTokens,

      // Custom cmux properties
      cmux_source: event.source,
      cmux_team_id: event.teamId,
      cmux_task_run_id: event.taskRunId,

      // Associate user properties with this distinctId
      $set: {
        team_id: event.teamId,
        ...(event.userEmail && { email: event.userEmail }),
      },
    },
  });
}
