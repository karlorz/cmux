import { env } from "@/lib/utils/www-env";
import { requireStackServerAppJs } from "./stack-with-fallback";

export interface DataVaultOperationOptions {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

const DEFAULT_OPTIONS: Required<DataVaultOperationOptions> = {
  retries: 3,
  retryDelay: 1000,
  timeout: 10000,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an operation with a timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Retry an operation with exponential backoff
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: Required<DataVaultOperationOptions>
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await withTimeout(
        operation(),
        options.timeout,
        operationName
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < options.retries) {
        const delay = options.retryDelay * Math.pow(2, attempt);
        console.warn(
          `[DataVault] ${operationName} failed (attempt ${attempt + 1}/${options.retries + 1}), retrying in ${delay}ms:`,
          lastError.message
        );
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `[DataVault] ${operationName} failed after ${options.retries + 1} attempts: ${lastError?.message}`
  );
}

/**
 * Safely get a value from DataVault with retry logic
 * Returns null if the operation fails after all retries
 */
export async function safeGetDataVaultValue(
  storeName: string,
  key: string,
  options: DataVaultOperationOptions = {}
): Promise<string | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const stackServerAppJs = requireStackServerAppJs();

    return await retryOperation(
      async () => {
        const store = await stackServerAppJs.getDataVaultStore(storeName);
        const value = await store.getValue(key, {
          secret: env.STACK_DATA_VAULT_SECRET,
        });
        return value ?? null;
      },
      `getDataVaultValue(${storeName}, ${key})`,
      opts
    );
  } catch (error) {
    console.error(
      `[DataVault] Failed to get value from store "${storeName}" with key "${key}":`,
      error
    );
    return null;
  }
}

/**
 * Safely set a value in DataVault with retry logic
 * Returns true if successful, false otherwise
 */
export async function safeSetDataVaultValue(
  storeName: string,
  key: string,
  value: string,
  options: DataVaultOperationOptions = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const stackServerAppJs = requireStackServerAppJs();

    await retryOperation(
      async () => {
        const store = await stackServerAppJs.getDataVaultStore(storeName);
        await store.setValue(key, value, {
          secret: env.STACK_DATA_VAULT_SECRET,
        });
      },
      `setDataVaultValue(${storeName}, ${key})`,
      opts
    );
    return true;
  } catch (error) {
    console.error(
      `[DataVault] Failed to set value in store "${storeName}" with key "${key}":`,
      error
    );
    return false;
  }
}

/**
 * Safely delete a value from DataVault with retry logic
 * Returns true if successful, false otherwise
 */
export async function safeDeleteDataVaultValue(
  storeName: string,
  key: string,
  options: DataVaultOperationOptions = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const stackServerAppJs = requireStackServerAppJs();

    await retryOperation(
      async () => {
        const store = await stackServerAppJs.getDataVaultStore(storeName);
        await store.deleteValue(key);
      },
      `deleteDataVaultValue(${storeName}, ${key})`,
      opts
    );
    return true;
  } catch (error) {
    console.error(
      `[DataVault] Failed to delete value from store "${storeName}" with key "${key}":`,
      error
    );
    return false;
  }
}

/**
 * Check if DataVault is available by attempting a quick health check
 */
export async function isDataVaultAvailable(): Promise<boolean> {
  try {
    const stackServerAppJs = requireStackServerAppJs();
    const store = await withTimeout(
      stackServerAppJs.getDataVaultStore("cmux-health-check"),
      5000,
      "DataVault health check"
    );
    return !!store;
  } catch (error) {
    console.error("[DataVault] Health check failed:", error);
    return false;
  }
}
