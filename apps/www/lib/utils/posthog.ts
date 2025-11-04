import { PostHog } from "posthog-node";
import { env } from "./www-env";

let posthogClient: PostHog | null = null;

function getPostHogClient(): PostHog | null {
  if (!env.POSTHOG_API_KEY) {
    return null;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(env.POSTHOG_API_KEY, {
      host: "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogClient;
}

interface BaseEventProperties {
  teamId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Track an event in PostHog
 */
export async function trackEvent(
  eventName: string,
  properties: BaseEventProperties = {},
  distinctId?: string
): Promise<void> {
  const client = getPostHogClient();
  if (!client) {
    // PostHog not configured, skip tracking
    return;
  }

  try {
    const id = distinctId || properties.userId || properties.teamId || "anonymous";

    client.capture({
      distinctId: id,
      event: eventName,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
      },
    });

    // Ensure events are flushed immediately
    await client.flush();
  } catch (error) {
    // Log error but don't throw - tracking should never break the app
    console.error("[posthog] Failed to track event:", eventName, error);
  }
}

/**
 * Track sandbox creation
 */
export async function trackSandboxCreated(params: {
  sandboxId: string;
  teamId: string;
  userId: string;
  sandboxType: "morph" | "environment";
  environmentId?: string;
  environmentName?: string;
  morphInstanceId?: string;
  ttlMinutes?: number;
  hasDevScript?: boolean;
  hasMaintenanceScript?: boolean;
  repoCount?: number;
}): Promise<void> {
  await trackEvent("sandbox_created", params, params.userId);
}

/**
 * Track environment creation
 */
export async function trackEnvironmentCreated(params: {
  environmentId: string;
  teamId: string;
  userId: string;
  environmentName: string;
  morphSnapshotId: string;
  morphInstanceId: string;
  hasEnvVars: boolean;
  exposedPortsCount: number;
  hasDevScript: boolean;
  hasMaintenanceScript: boolean;
}): Promise<void> {
  await trackEvent("environment_created", params, params.userId);
}

/**
 * Track environment snapshot creation
 */
export async function trackEnvironmentSnapshotCreated(params: {
  environmentId: string;
  teamId: string;
  userId: string;
  snapshotVersion: number;
  morphSnapshotId: string;
  isActivated: boolean;
}): Promise<void> {
  await trackEvent("environment_snapshot_created", params, params.userId);
}

/**
 * Track model usage (LLM API calls)
 */
export async function trackModelUsage(params: {
  model: string;
  provider: "anthropic" | "openai" | "google";
  teamId?: string;
  userId?: string;
  taskRunId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  streaming?: boolean;
  responseTimeMs?: number;
  success: boolean;
  errorType?: string;
}): Promise<void> {
  await trackEvent("model_usage", params, params.userId || params.teamId);
}

/**
 * Track code review job
 */
export async function trackCodeReviewStarted(params: {
  jobId: string;
  teamId: string;
  userId: string;
  reviewType: "pr" | "comparison";
  repoFullName: string;
  prNumber?: number;
  comparison?: string;
  filesCount?: number;
}): Promise<void> {
  await trackEvent("code_review_started", params, params.userId);
}

/**
 * Track code review completion
 */
export async function trackCodeReviewCompleted(params: {
  jobId: string;
  teamId: string;
  userId: string;
  success: boolean;
  durationMs?: number;
  errorType?: string;
  filesReviewed?: number;
}): Promise<void> {
  await trackEvent("code_review_completed", params, params.userId);
}

/**
 * Track GitHub repository connection
 */
export async function trackRepoConnected(params: {
  teamId: string;
  userId: string;
  repoFullName: string;
  installationId: string;
}): Promise<void> {
  await trackEvent("repo_connected", params, params.userId);
}

/**
 * Track environment deletion
 */
export async function trackEnvironmentDeleted(params: {
  environmentId: string;
  teamId: string;
  userId: string;
  snapshotVersions: number;
}): Promise<void> {
  await trackEvent("environment_deleted", params, params.userId);
}

/**
 * Track sandbox stop/pause
 */
export async function trackSandboxStopped(params: {
  sandboxId: string;
  teamId: string;
  userId?: string;
  reason: "manual" | "ttl_expiry" | "error";
  runtimeMinutes?: number;
}): Promise<void> {
  await trackEvent("sandbox_stopped", params, params.userId || params.teamId);
}

/**
 * Shutdown the PostHog client gracefully
 */
export async function shutdownPostHog(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }
}
