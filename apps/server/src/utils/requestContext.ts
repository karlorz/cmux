import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthTokenSource } from "./stackAuthState";

export interface RequestContext {
  authToken?: string;
  authHeaderJson?: string;
  tokenSource?: AuthTokenSource;
}

export interface RunWithAuthOptions {
  tokenSource?: AuthTokenSource;
  authHeaderJson?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithAuth<T>(
  authToken: string | null | undefined,
  authHeaderJson: string | null | undefined,
  fn: () => T,
  options?: RunWithAuthOptions
): T {
  return storage.run(
    {
      authToken: authToken ?? undefined,
      authHeaderJson:
        (options?.authHeaderJson ?? authHeaderJson) ?? undefined,
      tokenSource: options?.tokenSource,
    },
    fn
  );
}

export function runWithAuthToken<T>(
  authToken: string | null | undefined,
  fn: () => T,
  options?: RunWithAuthOptions
): T {
  return runWithAuth(authToken, options?.authHeaderJson, fn, options);
}

export function getAuthToken(): string | undefined {
  const ctx = storage.getStore();
  return ctx?.tokenSource?.getAccessToken() ?? ctx?.authToken;
}

export function getAuthHeaderJson(): string | undefined {
  const ctx = storage.getStore();
  return ctx?.tokenSource?.getAuthHeaderJson() ?? ctx?.authHeaderJson;
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
