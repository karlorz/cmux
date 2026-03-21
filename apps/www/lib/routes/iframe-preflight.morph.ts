import { env } from "@/lib/utils/www-env";
import type { MorphInstanceInfo, SendPhaseFn } from "@cmux/shared";
import { MorphCloudClient } from "morphcloud";

const MAX_RESUME_ATTEMPTS = 3;
const RESUME_RETRY_DELAY_MS = 1_000;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("HTTP 404");
}

type MorphInstance = Awaited<
  ReturnType<MorphCloudClient["instances"]["get"]>
>;

type AuthorizationResult =
  | { authorized: true }
  | { authorized: false; reason: string };

interface AttemptResumeOptions {
  authorizeInstance?: (
    instance: MorphInstance,
  ) => Promise<AuthorizationResult>;
  onResumed?: (instanceId: string, instance: MorphInstance) => Promise<void>;
}

export async function attemptResumeIfNeeded(
  instanceInfo: MorphInstanceInfo,
  sendPhase: SendPhaseFn,
  options?: AttemptResumeOptions,
): Promise<
  "already_ready" | "resumed" | "failed" | "not_found" | "forbidden"
> {
  const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });

  let instance;
  try {
    instance = await client.instances.get({
      instanceId: instanceInfo.instanceId,
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      await sendPhase("instance_not_found", {
        instanceId: instanceInfo.instanceId,
      });
      return "not_found";
    }

    console.error("[iframe-preflight] Failed to look up Morph instance:", error);
    await sendPhase("resume_failed", {
      instanceId: instanceInfo.instanceId,
      error: error instanceof Error ? error.message : "Unknown error",
      stage: "lookup",
    });
    return "failed";
  }

  if (options?.authorizeInstance) {
    try {
      const authorization = await options.authorizeInstance(instance);
      if (!authorization.authorized) {
        await sendPhase("resume_forbidden", {
          instanceId: instanceInfo.instanceId,
          reason: authorization.reason,
        });
        return "forbidden";
      }
    } catch (error) {
      console.error("[iframe-preflight] Failed to authorize Morph instance:", error);
      await sendPhase("resume_failed", {
        instanceId: instanceInfo.instanceId,
        error: error instanceof Error ? error.message : "Unknown error",
        stage: "authorize",
      });
      return "failed";
    }
  }

  if (instance.status === "ready") {
    try {
      const httpServices = instance.networking?.httpServices ?? [];
      const firstService = httpServices[0];
      if (firstService?.url) {
        const probeResponse = await fetch(firstService.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        }).catch((error) => {
          console.error(
            "[iframe-preflight] Failed to probe ready Morph instance:",
            error,
          );
          return null;
        });

        if (!probeResponse || !probeResponse.ok) {
          const refreshedInstance = await client.instances.get({
            instanceId: instanceInfo.instanceId,
          });
          if (refreshedInstance.status !== "ready") {
            instance = refreshedInstance;
          }
        }
      }
    } catch (error) {
      console.error(
        "[iframe-preflight] Failed to verify ready Morph instance status:",
        error,
      );
      try {
        const refreshedInstance = await client.instances.get({
          instanceId: instanceInfo.instanceId,
        });
        if (refreshedInstance.status !== "ready") {
          instance = refreshedInstance;
        }
      } catch (refreshError) {
        console.error(
          "[iframe-preflight] Failed to refresh Morph instance status:",
          refreshError,
        );
      }
    }

    if (instance.status === "ready") {
      await sendPhase("already_ready", {
        instanceId: instanceInfo.instanceId,
      });
      return "already_ready";
    }
  }

  await sendPhase("resuming", {
    instanceId: instanceInfo.instanceId,
    status: instance.status,
  });

  for (let attempt = 1; attempt <= MAX_RESUME_ATTEMPTS; attempt += 1) {
    try {
      await instance.resume();
      await sendPhase("resumed", {
        instanceId: instanceInfo.instanceId,
        attempt,
      });
      if (options?.onResumed) {
        try {
          await options.onResumed(instanceInfo.instanceId, instance);
        } catch (recordError) {
          console.error(
            "[iframe-preflight] Failed to record resume activity:",
            recordError,
          );
        }
      }
      return "resumed";
    } catch (error) {
      console.error("[iframe-preflight] Failed to resume Morph instance:", error);
      if (attempt >= MAX_RESUME_ATTEMPTS) {
        await sendPhase("resume_failed", {
          instanceId: instanceInfo.instanceId,
          attempt,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return "failed";
      }

      await sendPhase("resume_retry", {
        instanceId: instanceInfo.instanceId,
        attempt,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      await wait(RESUME_RETRY_DELAY_MS * attempt);
    }
  }

  await sendPhase("resume_failed", {
    instanceId: instanceInfo.instanceId,
  });
  return "failed";
}
