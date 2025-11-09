/**
 * PostHog event names for Anthropic API tracking
 */
export const ANTHROPIC_EVENTS = {
  MESSAGE_COMPLETED: "anthropic_message_completed",
  MESSAGE_STREAMED: "anthropic_message_streamed",
} as const;

/**
 * Property keys for Anthropic analytics events
 */
export const ANTHROPIC_PROPERTIES = {
  // Token counts
  INPUT_TOKENS: "input_tokens",
  OUTPUT_TOKENS: "output_tokens",
  CACHE_CREATION_INPUT_TOKENS: "cache_creation_input_tokens",
  CACHE_READ_INPUT_TOKENS: "cache_read_input_tokens",

  // Request metadata
  MODEL: "model",
  IS_STREAMING: "is_streaming",
  MAX_TOKENS: "max_tokens",

  // Response metadata
  STOP_REASON: "stop_reason",
  RESPONSE_STATUS: "response_status",

  // Authentication
  AUTH_TYPE: "auth_type", // "oauth", "api_key", or "backend"
} as const;
