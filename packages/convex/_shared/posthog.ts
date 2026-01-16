/**
 * PostHog analytics for Convex
 * Tracks webhook events for preview.new
 */

const POSTHOG_HOST = "https://us.i.posthog.com";

type PostHogEvent = {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
};

/**
 * Capture a PostHog event from Convex
 * Uses the PostHog capture API directly via fetch
 * API key is read from process.env.POSTHOG_API_KEY (optional - no-op if not set)
 */
export async function capturePosthogEvent(
  payload: PostHogEvent
): Promise<void> {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) {
    return;
  }

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        distinct_id: payload.distinctId,
        event: payload.event,
        properties: {
          ...payload.properties,
          $lib: "convex",
        },
      }),
    });
  } catch (error) {
    console.error(`[posthog] Failed to capture event "${payload.event}"`, error);
  }
}
