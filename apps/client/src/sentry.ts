import type { Integration } from "@sentry/types";
import {
  ELECTRON_SENTRY_DSN,
  SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
  SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  SENTRY_TRACES_SAMPLE_RATE,
  WEB_SENTRY_DSN,
} from "../sentry.config";
import { isElectron } from "./lib/electron";

declare global {
  interface Window {
    __cmuxTriggerSentryError?: () => void;
  }
}

let initPromise: Promise<void> | null = null;

export function initSentry(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (isElectron) {
        const Sentry = await import("@sentry/electron/renderer");
        const integrations: Integration[] = [];

        if (typeof Sentry.browserTracingIntegration === "function") {
          integrations.push(Sentry.browserTracingIntegration());
        }
        if (typeof Sentry.replayIntegration === "function") {
          integrations.push(Sentry.replayIntegration());
        }

        Sentry.init({
          dsn: ELECTRON_SENTRY_DSN,
          integrations,
          tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
          replaysSessionSampleRate: SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
          replaysOnErrorSampleRate: SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
          sendDefaultPii: true,
        });

        Sentry.setTag("runtime", "electron-renderer");
        exposeTestHook(() => {
          Sentry.captureException(
            new Error("cmux electron renderer Sentry test error")
          );
          window.setTimeout(() => {
            throw new Error("cmux electron renderer unhandled Sentry test error");
          }, 0);
        });
      } else {
        const Sentry = await import("@sentry/react");
        const integrations: Integration[] = [];

        if (typeof Sentry.browserTracingIntegration === "function") {
          integrations.push(Sentry.browserTracingIntegration());
        }
        if (typeof Sentry.replayIntegration === "function") {
          integrations.push(Sentry.replayIntegration());
        }

        Sentry.init({
          dsn: WEB_SENTRY_DSN,
          integrations,
          tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
          replaysSessionSampleRate: SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
          replaysOnErrorSampleRate: SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
          sendDefaultPii: true,
        });

        Sentry.setTag("runtime", "web");
        exposeTestHook(() => {
          Sentry.captureException(new Error("cmux web Sentry test error"));
          window.setTimeout(() => {
            throw new Error("cmux web unhandled Sentry test error");
          }, 0);
        });
      }
    } catch (error) {
      console.error("[Sentry] Failed to initialize", error);
    }
  })();

  return initPromise;
}

function exposeTestHook(trigger: () => void): void {
  if (typeof window === "undefined") return;
  if (import.meta.env.MODE === "production") return;

  window.__cmuxTriggerSentryError = trigger;
}
