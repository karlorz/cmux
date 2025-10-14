import { useCallback, useEffect, useRef, useState } from "react";

export type MorphResumeStatus =
  | "loading"
  | "resuming"
  | "ready"
  | "failed"
  | "not_found";

interface MorphResumeState {
  status: MorphResumeStatus;
  message?: string;
  retryCount: number;
}

interface UseMorphInstanceResumeOptions {
  instanceId: string | null;
  maxRetries?: number;
  retryDelay?: number;
}

export function useMorphInstanceResume({
  instanceId,
  maxRetries = 3,
  retryDelay = 2000,
}: UseMorphInstanceResumeOptions) {
  const [state, setState] = useState<MorphResumeState>({
    status: "loading",
    retryCount: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);

  const startResume = useCallback(async (currentInstanceId: string, attempt = 0) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setState(prev => ({ ...prev, status: "resuming", retryCount: attempt }));

      const response = await fetch(`/api/morph/resume/${currentInstanceId}`, {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              setState(prev => ({
                ...prev,
                status: data.status,
                message: data.message,
              }));

              // If we get a final status, stop processing
              if (data.status === "ready" || data.status === "failed" || data.status === "not_found") {
                return;
              }
            } catch (parseError) {
              console.warn("Failed to parse SSE data:", line, parseError);
            }
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;

      console.error("Resume stream error:", error);

      // Retry logic
      if (attempt < maxRetries) {
        setState(prev => ({
          ...prev,
          status: "resuming",
          message: `Retrying... (${attempt + 1}/${maxRetries})`,
        }));

        retryTimeoutRef.current = window.setTimeout(() => {
          startResume(currentInstanceId, attempt + 1);
        }, retryDelay);
      } else {
        setState(prev => ({
          ...prev,
          status: "failed",
          message: `Failed after ${maxRetries} retries`,
        }));
      }
    }
  }, [maxRetries, retryDelay]);

  useEffect(() => {
    if (!instanceId) {
      setState({ status: "loading", retryCount: 0 });
      return;
    }

    startResume(instanceId);
  }, [instanceId, startResume]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return state;
}