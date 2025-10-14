import { useState, useEffect } from "react";
import { env } from "../client-env";

export type IframePreflightStatus =
  | "loading"
  | "resuming iframe"
  | "iframe ready"
  | "failed to resume, even after retries"
  | "couldn't find instance"
  | "error";

export function useIframePreflight(url: string): IframePreflightStatus {
  const [status, setStatus] = useState<IframePreflightStatus>("loading");

  useEffect(() => {
    if (!url) {
      setStatus("loading");
      return;
    }

    setStatus("loading");

    const controller = new AbortController();

    const run = async () => {
      try {
        const response = await fetch(
          `${env.NEXT_PUBLIC_WWW_ORIGIN}/api/iframe/preflight?url=${encodeURIComponent(
            url
          )}`,
          {
            method: "GET",
            credentials: "include",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          setStatus("error");
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setStatus("error");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                if (data.status) {
                  setStatus(data.status as IframePreflightStatus);
                }
              } catch (e) {
                // ignore invalid JSON
              }
            }
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setStatus("error");
        }
      }
    };

    run();

    return () => controller.abort();
  }, [url]);

  return status;
}