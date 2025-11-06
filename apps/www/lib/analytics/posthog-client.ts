"use client";

import posthog from "posthog-js";

type ClientPosthogEvent = {
  event: string;
  properties?: Record<string, unknown>;
};

export function captureClientPosthogEvent({
  event,
  properties,
}: ClientPosthogEvent): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[analytics] PostHog client missing API key");
    }
    return;
  }

  posthog.capture(event, properties);
}
