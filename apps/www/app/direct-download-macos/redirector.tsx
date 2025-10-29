"use client";

import { useEffect } from "react";

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

export function DirectDownloadRedirector({
  macDownloadUrls,
  fallbackUrl,
  initialUrl,
  queryArchitecture,
}: DirectDownloadRedirectorProps) {
  useEffect(() => {
    const followUrl = (architecture: MacArchitecture | null) => {
      const target = pickMacDownloadUrl(macDownloadUrls, fallbackUrl, architecture);
      window.location.replace(target);
    };

    const forcedArchitecture = queryArchitecture;

    if (forcedArchitecture) {
      followUrl(forcedArchitecture);
      return;
    }

    const synchronousHint = getNavigatorArchitectureHint();

    if (synchronousHint) {
      followUrl(synchronousHint);
      return;
    }

    let isMounted = true;

    const run = async () => {
      try {
        const detectedArchitecture = await detectClientMacArchitecture();

        if (!isMounted) {
          return;
        }

        if (detectedArchitecture) {
          followUrl(detectedArchitecture);
          return;
        }

        followUrl(null);
      } catch (error) {
        console.warn("macOS download redirect failed, using fallback", error);
        followUrl(null);
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [fallbackUrl, macDownloadUrls, queryArchitecture]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.location.replace(initialUrl);
    }, 2000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [initialUrl]);

  return null;
}
