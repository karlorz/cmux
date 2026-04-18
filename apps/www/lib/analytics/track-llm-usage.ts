/**
 * Unified LLM usage tracking for all providers.
 *
 * This module provides a common interface for tracking token usage across
 * Anthropic, OpenAI, and Gemini providers, enabling cost analysis by task class.
 */

import { captureServerPosthogEvent } from "@/lib/analytics/posthog-server";

export type LLMProvider = "anthropic" | "openai" | "gemini";

export type LLMUsageSource =
  | "cmux"
  | "preview-new"
  | "codex-cli"
  | "gemini-cli";

export interface LLMUsageEvent {
  // Core identifiers
  teamId: string;
  userId: string;
  userEmail?: string;
  taskRunId: string;

  // Provider info
  provider: LLMProvider;
  source: LLMUsageSource;

  // Request metadata
  model: string;
  stream: boolean;

  // Response metadata
  responseStatus: number;
  latencyMs: number;

  // Unified token usage
  inputTokens?: number;
  outputTokens?: number;

  // Provider-specific cache tokens
  cacheReadTokens?: number;
  cacheWriteTokens?: number;

  // OpenAI-specific
  reasoningTokens?: number;

  // Task-class routing metadata (for cost analysis)
  taskClass?: string;
  agentSelectionSource?: string;

  // Error info
  errorType?: string;
}

// Map source to span name for PostHog AI analytics
function getSpanName(provider: LLMProvider, source: LLMUsageSource): string {
  return `${provider}-${source}`;
}

/**
 * Track LLM usage for any provider with unified schema.
 *
 * Use this for new integrations or when you need task-class metadata.
 * Provider-specific trackers (trackAnthropicProxyRequest, etc.) are
 * still available for backward compatibility.
 */
export async function trackLLMUsage(event: LLMUsageEvent): Promise<void> {
  await captureServerPosthogEvent({
    distinctId: event.userId,
    event: "$ai_generation",
    properties: {
      // PostHog AI properties
      $ai_model: event.model,
      $ai_provider: event.provider,
      $ai_input_tokens: event.inputTokens,
      $ai_output_tokens: event.outputTokens,
      $ai_latency: event.latencyMs / 1000,
      $ai_http_status: event.responseStatus,
      $ai_is_error: event.responseStatus >= 400,
      $ai_error: event.errorType,
      $ai_stream: event.stream,
      $ai_trace_id: event.taskRunId,
      $ai_span_name: getSpanName(event.provider, event.source),

      // Cache tokens (unified naming)
      $ai_cache_read_input_tokens: event.cacheReadTokens,
      $ai_cache_creation_input_tokens: event.cacheWriteTokens,

      // Provider-specific extensions
      openai_reasoning_tokens: event.reasoningTokens,

      // Task-class routing metadata for cost analysis
      cmux_task_class: event.taskClass,
      cmux_agent_selection_source: event.agentSelectionSource,

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

/**
 * Calculate estimated cost for a request based on provider pricing.
 *
 * Note: These are approximate prices and should be updated periodically.
 * For precise billing, use provider-specific usage APIs.
 */
export function estimateCost(event: LLMUsageEvent): number {
  const { provider, model, inputTokens = 0, outputTokens = 0 } = event;

  // Prices per 1M tokens (input/output)
  const pricing: Record<string, { input: number; output: number }> = {
    // Anthropic
    "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
    "claude-sonnet-4-5-20261022": { input: 3, output: 15 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
    "claude-opus-4-7": { input: 15, output: 75 },
    "claude-opus-4-6-20261022": { input: 15, output: 75 },
    // OpenAI
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "o1": { input: 15, output: 60 },
    "o1-mini": { input: 3, output: 12 },
    // Gemini
    "gemini-2.5-pro": { input: 1.25, output: 5 },
    "gemini-2.5-flash": { input: 0.075, output: 0.3 },
  };

  // Find matching pricing (try exact match, then prefix match)
  let prices = pricing[model];
  if (!prices) {
    const modelPrefix = Object.keys(pricing).find((key) =>
      model.startsWith(key)
    );
    if (modelPrefix) {
      prices = pricing[modelPrefix];
    }
  }

  if (!prices) {
    // Default fallback pricing
    switch (provider) {
      case "anthropic":
        prices = { input: 3, output: 15 };
        break;
      case "openai":
        prices = { input: 2.5, output: 10 };
        break;
      case "gemini":
        prices = { input: 1.25, output: 5 };
        break;
    }
  }

  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}
