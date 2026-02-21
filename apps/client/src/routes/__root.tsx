import { useTheme } from "@/components/theme/use-theme";
import type { StackClientApp } from "@stackframe/react";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";

const AUTO_UPDATE_TOAST_ID = "auto-update-toast";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  auth: StackClientApp<true, string>;
}>()({
  component: RootComponent,
  errorComponent: RootErrorComponent,
});

function ToasterWithTheme() {
  const { theme } = useTheme();
  return <Toaster richColors theme={theme} />;
}

function getUnknownErrorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
    if ("error" in error && typeof (error as { error?: unknown }).error === "string") {
      return (error as { error: string }).error;
    }
  }
  return null;
}

function isAuthError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "string") {
    const msg = error.toLowerCase();
    return (
      msg.includes("unauthorized") ||
      msg.includes("not authenticated") ||
      msg.includes("token expired") ||
      msg.includes("jwt expired") ||
      msg.includes("user not found")
    );
  }

  if (typeof error === "object") {
    const maybeAny = error as Record<string, unknown>;
    const status = maybeAny.status ?? maybeAny.statusCode;
    if (typeof status === "number") return status === 401;

    const message = getUnknownErrorMessage(error);
    if (message) return isAuthError(message);

    // Stack/Auth-ish shapes sometimes include nested errors
    if (maybeAny.cause) return isAuthError(maybeAny.cause);
  }

  return false;
}

function clearCachedStackUser(): void {
  if (typeof window === "undefined") return;
  try {
    window.cachedUser = null;
    window.userPromise = null;
  } catch {
    // ignore
  }
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const [show, setShow] = useState(import.meta.env.DEV);
  const isUnauthorized = useMemo(() => isAuthError(error), [error]);
  const message = useMemo(() => {
    const msg = getUnknownErrorMessage(error);
    if (msg) return msg;
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return null;
    }
  }, [error]);

  useEffect(() => {
    if (!isUnauthorized) return;
    if (location.pathname === "/sign-in") return;
    if (location.pathname.startsWith("/handler/")) return;

    clearCachedStackUser();

    const afterAuthReturnTo = `${location.pathname}${location.searchStr}${location.hash}`;
    void navigate({
      to: "/sign-in",
      search: {
        after_auth_return_to: afterAuthReturnTo,
      },
      replace: true,
    });
  }, [
    isUnauthorized,
    location.hash,
    location.pathname,
    location.searchStr,
    navigate,
  ]);

  if (isUnauthorized) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-black p-6">
        <div className="max-w-md text-center">
          <p className="text-neutral-900 dark:text-neutral-100 font-medium">
            Session expired
          </p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Redirecting to sign-in…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: ".75rem", maxWidth: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
        <strong style={{ fontSize: "1rem" }}>Something went wrong!</strong>
        <button
          type="button"
          style={{
            appearance: "none",
            fontSize: ".6em",
            border: "1px solid currentColor",
            padding: ".1rem .2rem",
            fontWeight: "bold",
            borderRadius: ".25rem",
          }}
          onClick={() => setShow((d) => !d)}
        >
          {show ? "Hide Error" : "Show Error"}
        </button>
        <button
          type="button"
          style={{
            marginLeft: "auto",
            appearance: "none",
            fontSize: ".6em",
            border: "1px solid currentColor",
            padding: ".1rem .2rem",
            fontWeight: "bold",
            borderRadius: ".25rem",
          }}
          onClick={() => reset?.()}
        >
          Retry
        </button>
      </div>
      <div style={{ height: ".25rem" }} />
      {show ? (
        <pre
          style={{
            fontSize: ".75em",
            border: "1px solid red",
            borderRadius: ".25rem",
            padding: ".5rem",
            color: "red",
            overflow: "auto",
            maxHeight: "60vh",
          }}
        >
          {message ? <code>{message}</code> : null}
        </pre>
      ) : null}
    </div>
  );
}

function DevTools() {
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === "i") {
        setDevToolsOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!devToolsOpen) {
    return null;
  }

  return (
    <>
      <TanStackRouterDevtools position="bottom-right" />
      <ReactQueryDevtools />
    </>
  );
}

function useAutoUpdateNotifications() {
  useEffect(() => {
    const maybeWindow = typeof window === "undefined" ? undefined : window;
    const cmux = maybeWindow?.cmux;

    const showToast = (version: string | null) => {
      const versionLabel = version ? ` (${version})` : "";

      const showRestartingToast = () => {
        toast.loading("Restarting Manaflow...", {
          id: AUTO_UPDATE_TOAST_ID,
          duration: Infinity,
          description: "Please wait while the update is being applied.",
          className: "select-none",
        });
      };

      toast("New version available", {
        id: AUTO_UPDATE_TOAST_ID,
        duration: 30000,
        description: `Restart Manaflow to apply the latest version${versionLabel}.`,
        className: "select-none",
        action: cmux?.autoUpdate
          ? {
              label: "Restart now",
              onClick: () => {
                showRestartingToast();
                void cmux.autoUpdate
                  .install()
                  .then((result) => {
                    if (result && !result.ok) {
                      const reason =
                        result.reason === "not-packaged"
                          ? "Updates can only be applied from the packaged app."
                          : "Failed to restart. Try again from the menu.";
                      toast.error(reason, { id: AUTO_UPDATE_TOAST_ID });
                    }
                  })
                  .catch((error) => {
                    console.error(
                      "Failed to trigger auto-update install",
                      error
                    );
                    toast.error("Couldn't restart. Try again from the menu.", {
                      id: AUTO_UPDATE_TOAST_ID,
                    });
                  });
              },
            }
          : undefined,
      });
    };

    if (!cmux?.on) return;

    const handler = (payload: unknown) => {
      const version =
        payload && typeof payload === "object" && "version" in payload
          ? typeof (payload as { version?: unknown }).version === "string"
            ? (payload as { version: string }).version
            : null
          : null;

      showToast(version);
    };

    const unsubscribe = cmux.on("auto-update:ready", handler);

    return () => {
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);
}

function RootComponent() {
  const location = useRouterState({
    select: (state) => state.location,
  });
  const locationKey = `${location.pathname}${JSON.stringify(location.search)}${location.hash}`;

  useAutoUpdateNotifications();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[navigation] location-changed", {
        location: locationKey,
        timestamp: new Date().toISOString(),
      });
    }
  }, [locationKey]);

  return (
    <>
      <Outlet />
      <DevTools />
      <ToasterWithTheme />
    </>
  );
}
