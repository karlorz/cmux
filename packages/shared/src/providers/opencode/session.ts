/**
 * Utilities for managing OpenCode HTTP session
 */

const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_PORT = 4096;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 60;

export interface OpencodeSessionOptions {
  hostname?: string;
  port?: number;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

export interface OpencodeSessionResponse {
  ready: boolean;
  [key: string]: unknown;
}

/**
 * Poll the /session endpoint until it's ready
 * @returns Promise that resolves when session is ready
 * @throws Error if max attempts exceeded or fetch fails
 */
export async function pollOpencodeSession(
  options: OpencodeSessionOptions = {}
): Promise<void> {
  const {
    hostname = DEFAULT_HOSTNAME,
    port = DEFAULT_PORT,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = options;

  const sessionUrl = `http://${hostname}:${port}/session`;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await fetch(sessionUrl);

      if (!response.ok) {
        // If we get a connection error, wait and retry
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      const data = (await response.json()) as OpencodeSessionResponse;

      // Check if session is ready
      if (data.ready === true) {
        return;
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      // Connection error - server might not be up yet
      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw new Error(
    `OpenCode session not ready after ${maxAttempts} attempts (${(maxAttempts * pollIntervalMs) / 1000}s)`
  );
}

/**
 * Submit a prompt to the OpenCode TUI
 * @param prompt The prompt text to submit
 * @param options Session options
 * @returns Promise that resolves when prompt is submitted
 */
export async function submitOpencodePrompt(
  prompt: string,
  options: OpencodeSessionOptions = {}
): Promise<void> {
  const {
    hostname = DEFAULT_HOSTNAME,
    port = DEFAULT_PORT,
  } = options;

  const submitUrl = `http://${hostname}:${port}/tui/submit-prompt`;

  const response = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to submit OpenCode prompt: ${response.status} ${response.statusText}`
    );
  }
}
