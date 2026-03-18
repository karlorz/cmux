/**
 * Retry utilities for E2B client operations
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Exponential backoff factor (default: 2) */
  backoffFactor?: number;
  /** Whether to add jitter to delays (default: true) */
  jitter?: boolean;
  /** Function to determine if an error is retryable (default: isRetryableError) */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for retry events */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitter: true,
};

/**
 * Default function to determine if an error is retryable.
 * Retries on network errors, rate limits, and transient server errors.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up') ||
      message.includes('fetch failed')
    ) {
      return true;
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }

    // Transient server errors (5xx)
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('internal server error') ||
      message.includes('bad gateway') ||
      message.includes('service unavailable') ||
      message.includes('gateway timeout')
    ) {
      return true;
    }
  }

  // Check for HTTP status codes in error objects
  if (error && typeof error === 'object') {
    const statusCode = (error as { status?: number; statusCode?: number }).status ??
                       (error as { status?: number; statusCode?: number }).statusCode;
    if (statusCode !== undefined) {
      // Retry on rate limits and server errors
      if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Calculate delay for a given retry attempt with exponential backoff
 */
export function calculateDelay(
  attempt: number,
  options: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable'>>
): number {
  const baseDelay = options.initialDelayMs * Math.pow(options.backoffFactor, attempt - 1);
  const cappedDelay = Math.min(baseDelay, options.maxDelayMs);

  if (options.jitter) {
    // Add random jitter (±25%)
    const jitterFactor = 0.75 + Math.random() * 0.5;
    return Math.floor(cappedDelay * jitterFactor);
  }

  return cappedDelay;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const isRetryable = options.isRetryable ?? isRetryableError;

  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we've exhausted retries
      if (attempt > opts.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryable(error)) {
        break;
      }

      // Calculate delay and wait
      const delayMs = calculateDelay(attempt, opts);

      // Notify retry callback
      if (options.onRetry) {
        options.onRetry(attempt, error, delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Create a retryable version of an async function
 */
export function makeRetryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}

/**
 * Retry options preset for E2B sandbox operations
 */
export const E2B_SANDBOX_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitter: true,
};

/**
 * Retry options preset for E2B command execution
 */
export const E2B_EXEC_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
  jitter: true,
};
