/**
 * A2A Protocol - Agent-to-Agent Communication
 *
 * Implements a REST/JSON-compatible version of Google's A2A protocol for
 * cross-CLI agent coordination. This enables cmux agents to communicate
 * with agents running in other environments (Gemini CLI, Cursor, etc.).
 *
 * Protocol design:
 * - Agent Card: Describes an agent's capabilities and endpoints
 * - Tasks: Request-response pattern for delegating work
 * - Messages: Streaming pattern for real-time updates
 * - Artifacts: Exchanging files and outputs
 *
 * @see https://google.github.io/a2a-protocol/ for reference spec
 */

// =============================================================================
// Agent Card - Agent Discovery and Capabilities
// =============================================================================

/**
 * Describes an agent's identity, capabilities, and how to communicate with it.
 * This is the foundation for agent discovery in multi-agent systems.
 */
export interface A2AAgentCard {
  /** Unique agent identifier (e.g., "claude/opus-4.5", "codex/gpt-5.1") */
  agentId: string;
  /** Human-readable name */
  name: string;
  /** Agent description */
  description?: string;
  /** Semantic version of the agent */
  version: string;
  /** Protocol version supported */
  protocolVersion: "1.0";
  /** Base URL for A2A endpoints */
  endpoint: string;
  /** Supported capabilities */
  capabilities: A2ACapabilities;
  /** Authentication requirements */
  authentication?: A2AAuthentication;
  /** Agent metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Capabilities an agent supports.
 */
export interface A2ACapabilities {
  /** Can receive and execute tasks */
  tasks: boolean;
  /** Can stream messages */
  streaming: boolean;
  /** Can exchange artifacts (files) */
  artifacts: boolean;
  /** Can provide status updates */
  status: boolean;
  /** Supported input modalities */
  inputModalities?: ("text" | "image" | "audio" | "file")[];
  /** Supported output modalities */
  outputModalities?: ("text" | "image" | "audio" | "file")[];
  /** Skills/tools the agent can use */
  skills?: string[];
}

/**
 * Authentication configuration for an agent.
 */
export interface A2AAuthentication {
  /** Authentication schemes supported */
  schemes: ("bearer" | "api_key" | "oauth2" | "none")[];
  /** OAuth2 configuration if applicable */
  oauth2?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
}

// =============================================================================
// Task Protocol - Request-Response Pattern
// =============================================================================

/**
 * A task request sent to an agent.
 */
export interface A2ATaskRequest {
  /** Unique task ID */
  taskId: string;
  /** Requesting agent's ID */
  fromAgent: string;
  /** Target agent's ID */
  toAgent: string;
  /** Task prompt/instruction */
  prompt: string;
  /** Task type hint */
  taskType?: "code" | "review" | "test" | "research" | "general";
  /** Input artifacts (file references) */
  inputArtifacts?: A2AArtifactRef[];
  /** Priority (0 = highest) */
  priority?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Correlation ID for tracking */
  correlationId?: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Request timestamp */
  timestamp: string;
}

/**
 * A task response from an agent.
 */
export interface A2ATaskResponse {
  /** Original task ID */
  taskId: string;
  /** Responding agent's ID */
  fromAgent: string;
  /** Task status */
  status: "accepted" | "rejected" | "completed" | "failed" | "cancelled";
  /** Result summary */
  result?: string;
  /** Output artifacts produced */
  outputArtifacts?: A2AArtifactRef[];
  /** Error details if failed */
  error?: A2AError;
  /** Correlation ID from request */
  correlationId?: string;
  /** Response timestamp */
  timestamp: string;
  /** Execution duration in ms */
  durationMs?: number;
}

/**
 * Task status update (for long-running tasks).
 */
export interface A2ATaskStatus {
  /** Task ID */
  taskId: string;
  /** Current status */
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  /** Progress percentage (0-100) */
  progress?: number;
  /** Status message */
  message?: string;
  /** Timestamp */
  timestamp: string;
}

// =============================================================================
// Message Protocol - Streaming Pattern
// =============================================================================

/**
 * A message in a streaming conversation between agents.
 */
export interface A2AMessage {
  /** Unique message ID */
  messageId: string;
  /** Sending agent */
  fromAgent: string;
  /** Receiving agent(s) - "*" for broadcast */
  toAgent: string | string[];
  /** Message content */
  content: A2AMessageContent;
  /** Message type */
  type: "text" | "artifact" | "status" | "error" | "handoff";
  /** Reply to message ID */
  replyTo?: string;
  /** Correlation ID */
  correlationId?: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Message content variants.
 */
export type A2AMessageContent =
  | { type: "text"; text: string }
  | { type: "artifact"; artifact: A2AArtifactRef }
  | { type: "status"; status: string; progress?: number }
  | { type: "error"; error: A2AError }
  | { type: "handoff"; taskId: string; context: Record<string, unknown> };

// =============================================================================
// Artifacts - File Exchange
// =============================================================================

/**
 * Reference to an artifact (file/output).
 */
export interface A2AArtifactRef {
  /** Unique artifact ID */
  artifactId: string;
  /** Artifact type */
  type: "file" | "diff" | "image" | "log" | "data";
  /** MIME type */
  mimeType: string;
  /** File name */
  name: string;
  /** Size in bytes */
  size?: number;
  /** URL to fetch artifact */
  url?: string;
  /** Inline content (base64 for binary, plain for text) */
  content?: string;
  /** Content hash for integrity */
  hash?: string;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Standard error format.
 */
export interface A2AError {
  /** Error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Retryable flag */
  retryable?: boolean;
}

// Standard error codes
export const A2A_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TASK_TIMEOUT: "TASK_TIMEOUT",
  TASK_CANCELLED: "TASK_CANCELLED",
  CAPABILITY_NOT_SUPPORTED: "CAPABILITY_NOT_SUPPORTED",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

// =============================================================================
// Registry - Agent Discovery
// =============================================================================

/**
 * Agent registry for discovery.
 */
export interface A2ARegistry {
  /** Registry version */
  version: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Registered agents */
  agents: A2AAgentCard[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique ID for A2A entities.
 */
export function generateA2AId(prefix: "task" | "msg" | "art"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Create a task request.
 */
export function createTaskRequest(
  fromAgent: string,
  toAgent: string,
  prompt: string,
  options?: Partial<Omit<A2ATaskRequest, "taskId" | "fromAgent" | "toAgent" | "prompt" | "timestamp">>
): A2ATaskRequest {
  return {
    taskId: generateA2AId("task"),
    fromAgent,
    toAgent,
    prompt,
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * Create a task response.
 */
export function createTaskResponse(
  taskId: string,
  fromAgent: string,
  status: A2ATaskResponse["status"],
  options?: Partial<Omit<A2ATaskResponse, "taskId" | "fromAgent" | "status" | "timestamp">>
): A2ATaskResponse {
  return {
    taskId,
    fromAgent,
    status,
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * Create a message.
 */
export function createMessage(
  fromAgent: string,
  toAgent: string | string[],
  content: A2AMessageContent,
  options?: Partial<Omit<A2AMessage, "messageId" | "fromAgent" | "toAgent" | "content" | "timestamp">>
): A2AMessage {
  return {
    messageId: generateA2AId("msg"),
    fromAgent,
    toAgent,
    content,
    type: content.type === "text" ? "text" :
          content.type === "artifact" ? "artifact" :
          content.type === "status" ? "status" :
          content.type === "error" ? "error" : "handoff",
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * Create a cmux agent card.
 */
export function createCmuxAgentCard(
  agentId: string,
  endpoint: string,
  options?: Partial<Omit<A2AAgentCard, "agentId" | "endpoint" | "protocolVersion">>
): A2AAgentCard {
  const [provider, model] = agentId.split("/");
  return {
    agentId,
    name: options?.name ?? `cmux ${provider} agent (${model})`,
    version: options?.version ?? "1.0.0",
    protocolVersion: "1.0",
    endpoint,
    capabilities: options?.capabilities ?? {
      tasks: true,
      streaming: true,
      artifacts: true,
      status: true,
      inputModalities: ["text", "file"],
      outputModalities: ["text", "file"],
    },
    ...options,
  };
}

/**
 * Validate an agent card.
 */
export function validateAgentCard(card: unknown): card is A2AAgentCard {
  if (!card || typeof card !== "object") return false;
  const c = card as Record<string, unknown>;
  return (
    typeof c.agentId === "string" &&
    typeof c.name === "string" &&
    typeof c.version === "string" &&
    c.protocolVersion === "1.0" &&
    typeof c.endpoint === "string" &&
    typeof c.capabilities === "object" &&
    c.capabilities !== null
  );
}

/**
 * Convert cmux mailbox message to A2A message format.
 */
export function mailboxToA2AMessage(
  mailboxMsg: {
    id: string;
    from: string;
    to: string;
    type?: string;
    message: string;
    timestamp: string;
    correlationId?: string;
    replyTo?: string;
  }
): A2AMessage {
  return {
    messageId: mailboxMsg.id,
    fromAgent: mailboxMsg.from,
    toAgent: mailboxMsg.to,
    content: { type: "text", text: mailboxMsg.message },
    type: mailboxMsg.type === "handoff" ? "handoff" :
          mailboxMsg.type === "status" ? "status" : "text",
    replyTo: mailboxMsg.replyTo,
    correlationId: mailboxMsg.correlationId,
    timestamp: mailboxMsg.timestamp,
  };
}

/**
 * Convert A2A message to cmux mailbox format.
 */
export function a2aToMailboxMessage(
  a2aMsg: A2AMessage
): {
  id: string;
  from: string;
  to: string;
  type: "handoff" | "request" | "status" | "response";
  message: string;
  timestamp: string;
  correlationId?: string;
  replyTo?: string;
} {
  const message = a2aMsg.content.type === "text" ? a2aMsg.content.text :
                  a2aMsg.content.type === "status" ? a2aMsg.content.status :
                  a2aMsg.content.type === "error" ? a2aMsg.content.error.message :
                  JSON.stringify(a2aMsg.content);

  // Handle array toAgent - take first recipient or "*" if empty
  const toRecipient = Array.isArray(a2aMsg.toAgent)
    ? (a2aMsg.toAgent[0] ?? "*")
    : a2aMsg.toAgent;

  return {
    id: a2aMsg.messageId,
    from: a2aMsg.fromAgent,
    to: toRecipient,
    type: a2aMsg.type === "handoff" ? "handoff" :
          a2aMsg.type === "status" ? "status" :
          a2aMsg.type === "error" ? "response" : "request",
    message,
    timestamp: a2aMsg.timestamp,
    correlationId: a2aMsg.correlationId,
    replyTo: a2aMsg.replyTo,
  };
}
