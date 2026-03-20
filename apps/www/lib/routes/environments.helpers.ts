function isConnectTimeoutError(error: Error): boolean {
  return (
    error.message.includes("fetch failed") ||
    error.message.includes("ConnectTimeoutError") ||
    (error.cause instanceof Error &&
      (error.cause.message.includes("Connect Timeout") ||
        (error.cause as NodeJS.ErrnoException).code === "UND_ERR_CONNECT_TIMEOUT"))
  );
}

export async function withMorphRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 3,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isConnectTimeoutError(lastError) || attempt === maxRetries) {
        throw lastError;
      }
      console.log(
        `[environments] ${operationName} connection timeout on attempt ${attempt}/${maxRetries}, retrying in ${attempt * 2}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

export const detectInstanceProvider = (
  instanceId: string,
): "morph" | "pve-lxc" | "pve-vm" | "other" => {
  if (instanceId.startsWith("morphvm_")) return "morph";
  if (instanceId.startsWith("pvelxc-")) {
    return "pve-lxc";
  }
  if (instanceId.startsWith("pvevm-") || instanceId.startsWith("pve_vm_")) {
    return "pve-vm";
  }
  return "other";
};
