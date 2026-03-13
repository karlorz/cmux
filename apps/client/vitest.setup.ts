/**
 * Vitest setup file for apps/client
 *
 * This runs BEFORE any test files are loaded, which is critical because
 * @t3-oss/env-core validates environment variables at import time.
 *
 * Without this setup, tests that import client-env.ts will fail with
 * "Invalid environment variables" errors.
 */

// Polyfill ResizeObserver for jsdom tests (used by persistentIframeManager)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe() {
      // no-op for tests
    }
    unobserve() {
      // no-op for tests
    }
    disconnect() {
      // no-op for tests
    }
  };
}

// Set required environment variables before any module loads
process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.com/convex";
process.env.NEXT_PUBLIC_STACK_PROJECT_ID = "test-stack-project";
process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY = "test-stack-key";
process.env.NEXT_PUBLIC_WWW_ORIGIN = "https://www.example.com";
process.env.NEXT_PUBLIC_SERVER_ORIGIN = "https://server.example.com";
