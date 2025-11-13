import { AsyncLocalStorage } from "node:async_hooks";
import type { StackTokenManager } from "./stackTokens";

export interface RequestContext {
  authToken?: string;
  authHeaderJson?: string;
  stackTokens?: StackTokenManager;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithAuth<T>(
  authToken: string | null | undefined,
  authHeaderJson: string | null | undefined,
  fn: () => T,
  options?: { stackTokens?: StackTokenManager }
): T {
  return storage.run(
    {
      authToken: authToken ?? undefined,
      authHeaderJson: authHeaderJson ?? undefined,
      stackTokens: options?.stackTokens,
    },
    fn
  );
}

export function runWithAuthToken<T>(
  authToken: string | null | undefined,
  fn: () => T
): T {
  return runWithAuth(authToken, undefined, fn);
}

export function getAuthToken(): string | undefined {
  const ctx = storage.getStore();
  return ctx?.stackTokens?.getAccessToken() ?? ctx?.authToken;
}

export function getAuthHeaderJson(): string | undefined {
  const ctx = storage.getStore();
  return ctx?.stackTokens?.getAuthHeaderJson() ?? ctx?.authHeaderJson;
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getStackTokenManager(): StackTokenManager | undefined {
  return storage.getStore()?.stackTokens;
}
