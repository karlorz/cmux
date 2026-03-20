/**
 * Distributed Tracing for cmux Observability
 *
 * Provides trace ID generation, propagation helpers, and span context utilities.
 * Trace IDs are propagated through HTTP headers and logged with all operations.
 */

/**
 * Standard header names for trace context propagation
 */
export const TRACE_HEADERS = {
  TRACE_ID: "X-Trace-Id",
  SPAN_ID: "X-Span-Id",
  PARENT_SPAN_ID: "X-Parent-Span-Id",
} as const;

/**
 * Generate a unique trace ID (128-bit, formatted as 32 hex chars)
 */
export function generateTraceId(): string {
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a unique span ID (64-bit, formatted as 16 hex chars)
 */
export function generateSpanId(): string {
  const buffer = new Uint8Array(8);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Span context for distributed tracing
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

/**
 * Create a new trace context (root span)
 */
export function createTraceContext(): SpanContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
  };
}

/**
 * Create a child span context from a parent
 */
export function createChildSpan(parent: SpanContext): SpanContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
  };
}

/**
 * Extract trace context from headers (for incoming requests)
 */
export function extractTraceContext(
  headers: Record<string, string | undefined>
): SpanContext {
  const traceId =
    headers[TRACE_HEADERS.TRACE_ID] ||
    headers[TRACE_HEADERS.TRACE_ID.toLowerCase()];
  const spanId =
    headers[TRACE_HEADERS.SPAN_ID] ||
    headers[TRACE_HEADERS.SPAN_ID.toLowerCase()];
  const parentSpanId =
    headers[TRACE_HEADERS.PARENT_SPAN_ID] ||
    headers[TRACE_HEADERS.PARENT_SPAN_ID.toLowerCase()];

  // If no trace context in headers, create a new one
  if (!traceId) {
    return createTraceContext();
  }

  return {
    traceId,
    spanId: spanId || generateSpanId(),
    parentSpanId,
  };
}

/**
 * Inject trace context into headers (for outgoing requests)
 */
export function injectTraceContext(
  ctx: SpanContext,
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    ...headers,
    [TRACE_HEADERS.TRACE_ID]: ctx.traceId,
    [TRACE_HEADERS.SPAN_ID]: ctx.spanId,
    ...(ctx.parentSpanId && {
      [TRACE_HEADERS.PARENT_SPAN_ID]: ctx.parentSpanId,
    }),
  };
}

/**
 * Span timing information
 */
export interface SpanTiming {
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

/**
 * Full span data for logging/storage
 */
export interface Span {
  context: SpanContext;
  name: string;
  timing: SpanTiming;
  status: "ok" | "error";
  attributes?: Record<string, unknown>;
  error?: string;
}

/**
 * Create a span with automatic timing
 */
export function createSpan(
  name: string,
  parentContext?: SpanContext
): Span & { end: (status?: "ok" | "error", error?: string) => Span } {
  const context = parentContext
    ? createChildSpan(parentContext)
    : createTraceContext();
  const timing: SpanTiming = { startTime: Date.now() };

  const span: Span = {
    context,
    name,
    timing,
    status: "ok",
  };

  return {
    ...span,
    end(status: "ok" | "error" = "ok", error?: string): Span {
      timing.endTime = Date.now();
      timing.durationMs = timing.endTime - timing.startTime;
      span.status = status;
      if (error) span.error = error;
      return span;
    },
  };
}

/**
 * Format span for logging
 */
export function formatSpanForLog(span: Span): string {
  const parts = [
    `[trace:${span.context.traceId.slice(0, 8)}]`,
    `[span:${span.context.spanId.slice(0, 8)}]`,
    span.name,
    span.timing.durationMs !== undefined ? `(${span.timing.durationMs}ms)` : "",
    span.status === "error" ? `ERROR: ${span.error}` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

/**
 * Async function wrapper that automatically creates and ends a span
 */
export async function withSpan<T>(
  name: string,
  fn: (ctx: SpanContext) => Promise<T>,
  parentContext?: SpanContext
): Promise<{ result: T; span: Span }> {
  const spanWithEnd = createSpan(name, parentContext);
  try {
    const result = await fn(spanWithEnd.context);
    const span = spanWithEnd.end("ok");
    return { result, span };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const span = spanWithEnd.end("error", errorMessage);
    throw Object.assign(error as Error, { span });
  }
}
