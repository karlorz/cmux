import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import z from "zod";
import { ExternalLink, TerminalSquare } from "lucide-react";

import { ElectronPreviewBrowser } from "@/components/electron-preview-browser";
import { DevScriptTerminal } from "@/components/DevScriptTerminal";
import { Button } from "@/components/ui/button";
import { getTaskRunPreviewPersistKey } from "@/lib/persistent-webview-keys";
import { cn } from "@/lib/utils";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";

const paramsSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
  port: z.string(),
});

const CMUX_PROXY_REGEX = /^cmux-([^-]+)-([^-]+)-(\d+)\.cmux\.app$/i;
const MORPH_HOST_REGEX =
  /^port-(\d+)-morphvm-([^.]+)\.http\.cloud\.morph\.so$/i;

function deriveXtermBaseUrlFromCandidate(
  candidate?: string | null,
): string | null {
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    const host = url.hostname;
    const cmuxMatch = host.match(CMUX_PROXY_REGEX);
    if (cmuxMatch) {
      const [, morphId, scope] = cmuxMatch;
      return `${url.protocol}//cmux-${morphId}-${scope}-39383.cmux.app`;
    }

    const morphMatch = host.match(MORPH_HOST_REGEX);
    if (morphMatch) {
      const [, , morphId] = morphMatch;
      return `${url.protocol}//port-39383-morphvm-${morphId}.http.cloud.morph.so`;
    }

    if (host === "localhost" || host.startsWith("127.")) {
      return `${url.protocol}//${host}:39383`;
    }
  } catch {
    // ignore parse failure
  }

  return null;
}

function deriveXtermBaseUrl(args: {
  workspaceUrl?: string | null;
  vscodeUrl?: string | null;
  workerUrl?: string | null;
  previewUrl?: string | null;
}): string | null {
  const candidates = [
    args.workerUrl,
    args.workspaceUrl,
    args.vscodeUrl,
    args.previewUrl,
  ];

  for (const candidate of candidates) {
    const result = deriveXtermBaseUrlFromCandidate(candidate);
    if (result) {
      return result;
    }
  }

  return null;
}

export const Route = createFileRoute(
  "/_layout/$teamSlugOrId/task/$taskId/run/$runId/preview/$port",
)({
  component: PreviewPage,
  params: {
    parse: paramsSchema.parse,
    stringify: (params) => {
      return {
        taskId: params.taskId,
        runId: params.runId,
        port: params.port,
      };
    },
  },
});

function PreviewPage() {
  const { taskId, teamSlugOrId, runId, port } = Route.useParams();

  const taskRuns = useQuery(api.taskRuns.getByTask, {
    teamSlugOrId,
    taskId,
  });

  const selectedRun = useMemo(() => {
    return taskRuns?.find((run) => run._id === runId);
  }, [runId, taskRuns]);

  const previewUrl = useMemo(() => {
    if (!selectedRun?.networking) return null;
    const portNum = Number.parseInt(port, 10);
    const service = selectedRun.networking.find(
      (item) => item.port === portNum && item.status === "running",
    );
    return service?.url ?? null;
  }, [selectedRun, port]);

  const persistKey = useMemo(() => {
    return getTaskRunPreviewPersistKey(runId, port);
  }, [runId, port]);

  const devErrorMessage = selectedRun?.environmentError?.devError ?? null;
  const [isTerminalVisible, setIsTerminalVisible] = useState(
    () => Boolean(devErrorMessage),
  );
  const [hasUserToggledTerminal, setHasUserToggledTerminal] = useState(false);

  useEffect(() => {
    if (!devErrorMessage) {
      setHasUserToggledTerminal(false);
    }
  }, [devErrorMessage]);

  useEffect(() => {
    if (devErrorMessage && !hasUserToggledTerminal) {
      setIsTerminalVisible(true);
    }
  }, [devErrorMessage, hasUserToggledTerminal]);

  const handleToggleTerminal = useCallback(() => {
    setHasUserToggledTerminal(true);
    setIsTerminalVisible((visible) => !visible);
  }, []);

  const xtermBaseUrl = useMemo(() => {
    return deriveXtermBaseUrl({
      workspaceUrl: selectedRun?.vscode?.workspaceUrl ?? null,
      vscodeUrl: selectedRun?.vscode?.url ?? null,
      workerUrl: selectedRun?.vscode?.ports?.worker ?? null,
      previewUrl,
    });
  }, [previewUrl, selectedRun]);

  const isTerminalEnabled = Boolean(xtermBaseUrl);

  const truncatedDevError = useMemo(() => {
    if (!devErrorMessage) return null;
    return devErrorMessage.length > 160
      ? `${devErrorMessage.slice(0, 160)}…`
      : devErrorMessage;
  }, [devErrorMessage]);

  const terminalContainerClass = useMemo(() => {
    return cn(
      "flex h-full min-h-0 flex-col transition-[width,opacity] duration-200 ease-out",
      isTerminalVisible && isTerminalEnabled
        ? "pointer-events-auto w-[420px] opacity-100 border-l border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
        : "pointer-events-none w-0 opacity-0",
    );
  }, [isTerminalEnabled, isTerminalVisible]);

  const paneBorderRadius = 6;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
          <span className="font-medium">Preview port {port}</span>
          {devErrorMessage ? (
            <span
              className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-500"
              title={devErrorMessage}
            >
              Dev script error
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {previewUrl ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs text-neutral-700 hover:text-neutral-900 dark:text-neutral-200 dark:hover:text-neutral-50"
            >
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                Open in browser
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={isTerminalVisible ? "default" : "ghost"}
            size="sm"
            onClick={handleToggleTerminal}
            disabled={!isTerminalEnabled}
            className={cn(
              "h-8 px-3 text-xs",
              !isTerminalVisible && "text-neutral-700 dark:text-neutral-200",
            )}
            title={
              isTerminalEnabled
                ? isTerminalVisible
                  ? "Hide dev script terminal"
                  : "Show dev script terminal"
                : "Dev script terminal unavailable for this run"
            }
            aria-pressed={isTerminalVisible}
          >
            <TerminalSquare className="size-3.5" />
            {isTerminalVisible ? "Hide terminal" : "Show terminal"}
          </Button>
        </div>
      </div>
      {truncatedDevError ? (
        <div className="border-b border-neutral-200 bg-red-500/5 px-3 py-2 text-xs text-red-500 dark:border-neutral-800 dark:bg-red-500/10">
          {truncatedDevError}
        </div>
      ) : null}
      <div className="flex flex-1 min-h-0">
        <div className="flex min-w-0 flex-1">
          {previewUrl ? (
            <ElectronPreviewBrowser
              persistKey={persistKey}
              src={previewUrl}
              borderRadius={paneBorderRadius}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="text-center">
                <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {selectedRun
                    ? `Port ${port} is not available for this run`
                    : "Loading..."}
                </p>
                {selectedRun?.networking && selectedRun.networking.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs text-neutral-400 dark:text-neutral-500">
                      Available ports:
                    </p>
                    <div className="flex justify-center gap-2">
                      {selectedRun.networking
                        .filter((item) => item.status === "running")
                        .map((service) => (
                          <span
                            key={service.port}
                            className="rounded px-2 py-1 text-xs bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                          >
                            {service.port}
                          </span>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <div className={terminalContainerClass} aria-hidden={!(isTerminalVisible && isTerminalEnabled)}>
          {xtermBaseUrl ? (
            <DevScriptTerminal
              baseUrl={xtermBaseUrl}
              isVisible={isTerminalVisible && isTerminalEnabled}
              className="flex-1"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
