"use client";

import { getRandomKitty } from "@/components/kitties";
import CmuxLogoMarkAnimated from "@/components/logo/cmux-logo-mark-animated";
import { useQuery } from "@tanstack/react-query";
import { ConvexProvider } from "convex/react";
import { type ReactNode, useEffect, useState, useRef } from "react";
import { convexAuthReadyPromise } from "./convex-auth-ready";
import { convexQueryClient } from "./convex-query-client";
import clsx from "clsx";
import { authJsonQueryOptions } from "./authJsonQueryOptions";
import { stackClientApp } from "@/lib/stack";

function AuthTokenRefresher() {
  const authJsonQuery = useQuery(authJsonQueryOptions());
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const currentToken = authJsonQuery.data?.accessToken ?? null;

    // Only update if the token has actually changed
    if (currentToken !== lastTokenRef.current) {
      lastTokenRef.current = currentToken;

      // Force the Convex client to re-fetch auth
      // This is done by calling setAuth again with the same auth function
      // which causes Convex to call the function again and get the fresh token
      convexQueryClient.convexClient.setAuth(
        stackClientApp.getConvexClientAuth({ tokenStore: "cookie" }),
      );

      console.log("[AuthTokenRefresher] Token refreshed for Convex client");
    }
  }, [authJsonQuery.data?.accessToken]);

  return null;
}

function BootLoader({ children }: { children: ReactNode }) {
  const [minimumDelayPassed, setMinimumDelayPassed] = useState(false);
  const convexAuthReadyQuery = useQuery({
    queryKey: ["convexAuthReadyPromise"],
    queryFn: () => convexAuthReadyPromise,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumDelayPassed(true);
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  const isReady = convexAuthReadyQuery.data && minimumDelayPassed;
  return (
    <>
      <div
        className={clsx(
          "absolute inset-0 w-screen h-dvh flex flex-col items-center justify-center bg-white dark:bg-black z-[var(--z-global-blocking)] transition-opacity",
          isReady ? "opacity-0 pointer-events-none" : "opacity-100",
        )}
      >
        <CmuxLogoMarkAnimated height={40} duration={2.9} />
        <pre className="text-xs font-mono text-neutral-200 dark:text-neutral-800 absolute bottom-0 left-0 pl-4 pb-4">
          {getRandomKitty()}
        </pre>
      </div>
      {children}
    </>
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <BootLoader>
        <ConvexProvider client={convexQueryClient.convexClient}>
          <AuthTokenRefresher />
          {children}
        </ConvexProvider>
      </BootLoader>
    </>
  );
}
