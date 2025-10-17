export async function retryOnOptimisticConcurrency<T>(
  fn: () => Promise<T>,
  options?: { retries?: number; baseDelayMs?: number; maxDelayMs?: number },
): Promise<T> {
  const retries = options?.retries ?? 5;
  const baseDelay = options?.baseDelayMs ?? 50;
  const maxDelay = options?.maxDelayMs ?? 1000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!isOptimisticConcurrencyError(err) || attempt === retries) {
        throw err;
      }
      const delay = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const jitter = Math.random() * 0.3 * delay;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }

  throw new Error("retryOnOptimisticConcurrency exhausted unexpectedly");
}

function isOptimisticConcurrencyError(err: unknown): boolean {
  const anyErr = err as { message?: unknown; code?: unknown } | undefined;
  if (anyErr?.code === "OptimisticConcurrencyControlFailure") {
    return true;
  }

  const msg = anyErr?.message;
  if (typeof msg === "string") {
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.code === "OptimisticConcurrencyControlFailure") {
        return true;
      }
    } catch {
      // ignore json parse
    }
    if (msg.includes("OptimisticConcurrencyControlFailure")) {
      return true;
    }
  }
  return false;
}
