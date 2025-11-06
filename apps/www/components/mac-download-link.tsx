"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";

import type { MacArchitecture, MacDownloadUrls } from "@/lib/releases";
import {
  detectClientMacArchitecture,
  getNavigatorArchitectureHint,
  pickMacDownloadUrl,
} from "@/lib/utils/mac-architecture";
import { captureClientPosthogEvent } from "@/lib/analytics/posthog-client";

type MacDownloadLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "popover"
> & {
  urls: MacDownloadUrls;
  fallbackUrl: string;
  autoDetect?: boolean;
  architecture?: MacArchitecture;
  tracking?: {
    eventName: string;
    properties?: Record<string, unknown>;
  };
};

export function MacDownloadLink({
  urls,
  fallbackUrl,
  autoDetect = false,
  architecture,
  tracking,
  ...anchorProps
}: MacDownloadLinkProps) {
  const { onClick, ...restAnchorProps } = anchorProps;

  const sanitizedUrls = useMemo<MacDownloadUrls>(
    () => ({
      universal:
        typeof urls.universal === "string" && urls.universal.trim() !== ""
          ? urls.universal
          : null,
      arm64:
        typeof urls.arm64 === "string" && urls.arm64.trim() !== ""
          ? urls.arm64
          : null,
      x64:
        typeof urls.x64 === "string" && urls.x64.trim() !== ""
          ? urls.x64
          : null,
    }),
    [urls.arm64, urls.universal, urls.x64],
  );

  const autoDefaultUrl = useMemo(
    () => pickMacDownloadUrl(sanitizedUrls, fallbackUrl, null),
    [fallbackUrl, sanitizedUrls],
  );

  const explicitDefaultUrl = useMemo(() => {
    if (architecture) {
      return pickMacDownloadUrl(sanitizedUrls, fallbackUrl, architecture);
    }

    if (autoDetect) {
      const detected = getNavigatorArchitectureHint();

      if (detected) {
        return pickMacDownloadUrl(sanitizedUrls, fallbackUrl, detected);
      }
    }

    return autoDefaultUrl;
  }, [architecture, autoDefaultUrl, autoDetect, fallbackUrl, sanitizedUrls]);

  const [href, setHref] = useState<string>(explicitDefaultUrl);

  useEffect(() => {
    setHref(explicitDefaultUrl);
  }, [explicitDefaultUrl]);

  const resolvedTarget = useMemo(() => {
    if (href === fallbackUrl) {
      return "fallback";
    }

    if (href === sanitizedUrls.universal) {
      return "universal";
    }

    if (href === sanitizedUrls.arm64) {
      return "arm64";
    }

    if (href === sanitizedUrls.x64) {
      return "x64";
    }

    return "unknown";
  }, [fallbackUrl, href, sanitizedUrls.arm64, sanitizedUrls.universal, sanitizedUrls.x64]);

  useEffect(() => {
    if (!autoDetect) {
      return;
    }

    const synchronousHint = getNavigatorArchitectureHint();

    if (synchronousHint) {
      setHref(pickMacDownloadUrl(sanitizedUrls, fallbackUrl, synchronousHint));
    }

    let isMounted = true;

    const run = async () => {
      const detectedArchitecture = await detectClientMacArchitecture();

      if (!isMounted || !detectedArchitecture) {
        return;
      }

      setHref(pickMacDownloadUrl(sanitizedUrls, fallbackUrl, detectedArchitecture));
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [autoDetect, fallbackUrl, sanitizedUrls]);

  const handleTracking = useCallback(() => {
    if (!tracking) {
      return;
    }

    captureClientPosthogEvent({
      event: tracking.eventName,
      properties: {
        ...tracking.properties,
        auto_detect: autoDetect,
        requested_architecture: architecture ?? null,
        resolved_target: resolvedTarget,
        href,
      },
    });
  }, [architecture, autoDetect, href, resolvedTarget, tracking]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);

      if (event.defaultPrevented) {
        return;
      }

      handleTracking();
    },
    [handleTracking, onClick],
  );

  return <a {...restAnchorProps} href={href} onClick={handleClick} />;
}
