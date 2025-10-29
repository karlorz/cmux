"use client";

import { useEffect, useRef } from "react";

import type { MacArchitecture, MacDownloadUrls } from "@/lib/releases";
import {
  detectClientMacArchitecture,
  getNavigatorArchitectureHint,
  pickMacDownloadUrl,
} from "@/lib/utils/mac-architecture";

type DirectDownloadRedirectorProps = {
  macDownloadUrls: MacDownloadUrls;
  fallbackUrl: string;
  initialUrl: string;
  queryArchitecture: MacArchitecture | null;
};

const log = (...args: unknown[]) => {
  console.log("[cmux direct-download]", ...args);
};

export function DirectDownloadRedirector({
  macDownloadUrls,
  fallbackUrl,
  initialUrl,
  queryArchitecture,
}: DirectDownloadRedirectorProps) {
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    log("redirector mounted", {
      queryArchitecture,
      fallbackUrl,
      initialUrl,
      macDownloadUrls,
    });

    const followUrl = (
      architecture: MacArchitecture | null,
      reason: string
    ) => {
      if (hasRedirectedRef.current) {
        log("skipping navigation, download already triggered", {
          architecture: architecture ?? "unknown",
          reason,
        });
        return;
      }

      const target = pickMacDownloadUrl(
        macDownloadUrls,
        fallbackUrl,
        architecture
      );
      log("navigating to download", {
        architecture: architecture ?? "unknown",
        reason,
        target,
      });
      hasRedirectedRef.current = true;
      window.location.replace(target);
    };

    const forcedArchitecture = queryArchitecture;

    if (forcedArchitecture) {
      log("using architecture from query parameter", { forcedArchitecture });
      followUrl(forcedArchitecture, "query-parameter");
      return;
    }

    const synchronousHint = getNavigatorArchitectureHint();

    if (synchronousHint) {
      log("using synchronous navigator hint", { synchronousHint });
      followUrl(synchronousHint, "navigator-hint");
      return;
    }

    let isMounted = true;

    const run = async () => {
      try {
        const detectedArchitecture = await detectClientMacArchitecture();

        if (!isMounted) {
          log("component unmounted before async detection completed");
          return;
        }

        if (detectedArchitecture) {
          log("async detection succeeded", { detectedArchitecture });
          followUrl(detectedArchitecture, "async-detection");
          return;
        }

        log("async detection returned null, using fallback");
        followUrl(null, "async-detection-null");
      } catch (error) {
        log("async detection failed, using fallback", { error });
        followUrl(null, "async-detection-error");
      }
    };

    void run();

    return () => {
      log("redirector unmounted");
      isMounted = false;
    };
  }, [fallbackUrl, initialUrl, macDownloadUrls, queryArchitecture]);

  useEffect(() => {
    log("setting manual download timeout", { initialUrl });
    const timeout = window.setTimeout(() => {
      if (hasRedirectedRef.current) {
        log("manual download timeout skipped, redirect already triggered", {
          initialUrl,
        });
        return;
      }

      hasRedirectedRef.current = true;
      log("manual download timeout triggered", { initialUrl });
      window.location.replace(initialUrl);
    }, 2000);

    return () => {
      log("clearing manual download timeout", { initialUrl });
      window.clearTimeout(timeout);
    };
  }, [initialUrl]);

  return null;
}
