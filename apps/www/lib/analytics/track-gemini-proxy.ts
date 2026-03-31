import { captureServerPosthogEvent } from "@/lib/analytics/posthog-server";

// Source identifies which product/feature is making the API call
export type GeminiProxySource = "cmux" | "gemini-cli";

type GeminiProxyEvent = {
  // Core identifiers
  teamId: string;
  userId: string;
  userEmail?: string;
  taskRunId: string;

  // Source/product identifier
  source: GeminiProxySource;

  // Request metadata
  model: string;
  stream: boolean;

  // Response metadata
  responseStatus: number;
  latencyMs: number;

  // Token usage (from Gemini response.usageMetadata)
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /** Cached content tokens */
  cachedContentTokenCount?: number;

  // Error info (if applicable)
  errorType?: string;
};

// Map source to span name for PostHog AI analytics
function getSpanName(source: GeminiProxySource): string {
  switch (source) {
    case "cmux":
      return "gemini-cmux";
    case "gemini-cli":
      return "gemini-cli-cmux";
  }
}

export async function trackGeminiProxyRequest(
  event: GeminiProxyEvent
): Promise<void> {
  // Use PostHog's $ai_generation event for LLM analytics
  // See: https://posthog.com/docs/ai-engineering/observability
  await captureServerPosthogEvent({
    distinctId: event.userId,
    event: "$ai_generation",
    properties: {
      // PostHog AI properties
      $ai_model: event.model,
      $ai_provider: "gemini",
      $ai_input_tokens: event.promptTokenCount,
      $ai_output_tokens: event.candidatesTokenCount,
      $ai_latency: event.latencyMs / 1000, // PostHog expects seconds
      $ai_http_status: event.responseStatus,
      $ai_is_error: event.responseStatus >= 400,
      $ai_error: event.errorType,
      $ai_stream: event.stream,
      $ai_trace_id: event.taskRunId,
      $ai_span_name: getSpanName(event.source),

      // Gemini-specific token details
      gemini_cached_content_tokens: event.cachedContentTokenCount,

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
