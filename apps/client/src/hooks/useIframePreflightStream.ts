import { useEffect, useRef, useState } from "react";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";

export type IframePreflightState =
  | { status: "idle" }
  | { status: "loading"; message?: string }
  | { status: "resuming"; message?: string }
  | { status: "ready"; message?: string }
  | { status: "error"; message: string }
  | { status: "instance_not_found"; message?: string };

interface UseIframePreflightStreamOptions {
  url: string;
  enabled?: boolean;
  onReady?: () => void;
  onError?: (error: string) => void;
}

interface StreamEvent {
  type: "loading" | "resuming" | "ready" | "error" | "instance_not_found";
  message?: string;
}

export function useIframePreflightStream({
  url,
  enabled = true,
  onReady,
  onError,
}: UseIframePreflightStreamOptions): IframePreflightState {
  const [state, setState] = useState<IframePreflightState>({ status: "idle" });
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUrlRef = useRef<string>("");
  const lastStateRef = useRef<IframePreflightState>({ status: "idle" });

  useEffect(() => {
    if (!enabled || !url) {
      setState({ status: "idle" });
      return;
    }

    // If the URL hasn't changed, don't restart
    if (url === lastUrlRef.current && state.status !== "idle") {
      return;
    }

    lastUrlRef.current = url;

    // Cancel any ongoing request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({ status: "loading", message: "Initializing..." });

    const runPreflight = async () => {
      try {
        const searchParams = new URLSearchParams({ url });
        const response = await fetch(
          `${WWW_ORIGIN}/api/iframe/preflight-stream?${searchParams.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok) {
          setState({
            status: "error",
            message: `Preflight request failed (status ${response.status})`,
          });
          onError?.(
            `Preflight request failed (status ${response.status})`,
          );
          return;
        }

        if (!response.body) {
          setState({
            status: "error",
            message: "Response body is null",
          });
          onError?.("Response body is null");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (controller.signal.aborted) {
            reader.cancel();
            return;
          }

          if (done) {
            break;
          }

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (controller.signal.aborted) {
              return;
            }

            // SSE format: "data: <json>"
            if (line.startsWith("data: ")) {
              const data = line.slice(6); // Remove "data: " prefix
              try {
                const event = JSON.parse(data) as StreamEvent;

                switch (event.type) {
                  case "loading":
                    {
                      const newState = {
                        status: "loading" as const,
                        message: event.message,
                      };
                      setState(newState);
                      lastStateRef.current = newState;
                    }
                    break;
                  case "resuming":
                    {
                      const newState = {
                        status: "resuming" as const,
                        message: event.message,
                      };
                      setState(newState);
                      lastStateRef.current = newState;
                    }
                    break;
                  case "ready":
                    {
                      const newState = {
                        status: "ready" as const,
                        message: event.message,
                      };
                      setState(newState);
                      lastStateRef.current = newState;
                      onReady?.();
                    }
                    return; // Stop processing
                  case "error":
                    {
                      const newState = {
                        status: "error" as const,
                        message: event.message || "Unknown error occurred",
                      };
                      setState(newState);
                      lastStateRef.current = newState;
                      onError?.(event.message || "Unknown error occurred");
                    }
                    return; // Stop processing
                  case "instance_not_found":
                    {
                      const newState = {
                        status: "instance_not_found" as const,
                        message: event.message,
                      };
                      setState(newState);
                      lastStateRef.current = newState;
                      onError?.(
                        event.message || "Instance not found",
                      );
                    }
                    return; // Stop processing
                }
              } catch (parseError) {
                console.error("Failed to parse SSE event:", parseError);
              }
            }
          }
        }

        // If we reach here without a terminal state, consider it an error
        const currentStatus = lastStateRef.current.status;
        if (currentStatus === "loading" || currentStatus === "resuming") {
          const newState = {
            status: "error" as const,
            message: "Stream ended unexpectedly",
          };
          setState(newState);
          lastStateRef.current = newState;
          onError?.("Stream ended unexpectedly");
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        setState({
          status: "error",
          message: errorMessage,
        });
        onError?.(errorMessage);
      }
    };

    void runPreflight();

    return () => {
      controller.abort();
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    };
  }, [enabled, url, onReady, onError]);

  return state;
}
