/**
 * JWT task-run authentication utilities for www routes.
 *
 * Allows agents to call www APIs using their task-run JWT instead of Stack Auth.
 * This enables head agents to spawn sub-agents without user browser session.
 */

import { jwtVerify } from "jose";
import { z } from "zod";
import { env } from "./www-env";

const TaskRunJwtPayloadSchema = z.object({
  taskRunId: z.string().min(1),
  teamId: z.string().min(1),
  userId: z.string().min(1),
});

export type TaskRunJwtPayload = z.infer<typeof TaskRunJwtPayloadSchema>;

/**
 * Verify a task-run JWT and extract the payload.
 *
 * @param token - The JWT token to verify
 * @returns The validated payload with taskRunId, teamId, and userId, or null if invalid
 */
export async function verifyTaskRunJwt(
  token: string
): Promise<TaskRunJwtPayload | null> {
  try {
    const secret = env.CMUX_TASK_RUN_JWT_SECRET;
    if (!secret) {
      console.error("[jwt-task-run] CMUX_TASK_RUN_JWT_SECRET not configured");
      return null;
    }

    const secretKey = new TextEncoder().encode(secret);
    const verification = await jwtVerify(token, secretKey);
    const parsed = TaskRunJwtPayloadSchema.safeParse(verification.payload);

    if (!parsed.success) {
      console.error("[jwt-task-run] Invalid JWT payload:", parsed.error);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error("[jwt-task-run] JWT verification failed:", error);
    return null;
  }
}

/**
 * Extract task-run JWT from request headers.
 *
 * Checks both x-cmux-token and X-Task-Run-JWT headers.
 *
 * @param request - The incoming request
 * @returns The JWT string or null if not present
 */
export function extractTaskRunJwtFromRequest(request: Request): string | null {
  const headers = request.headers;

  // Check x-cmux-token first (standard header)
  const cmuxToken = headers.get("x-cmux-token");
  if (cmuxToken && cmuxToken.length > 0) {
    return cmuxToken;
  }

  // Fallback to X-Task-Run-JWT
  const taskRunJwt = headers.get("x-task-run-jwt");
  if (taskRunJwt && taskRunJwt.length > 0) {
    return taskRunJwt;
  }

  return null;
}
