import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SegmentedTabs } from "@/components/mcp/McpFormSections";
import { useTheme } from "@/components/theme/use-theme";
import { api } from "@cmux/convex/api";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Editor } from "@monaco-editor/react";
import { AlertCircle, Check, FileCode2, Loader2, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface AgentConfigsSectionProps {
  teamSlugOrId: string;
}

type AgentType = "claude" | "codex";
type Scope = "global" | "workspace";

const AGENT_OPTIONS = [
  { value: "claude" as const, label: "Claude Code" },
  { value: "codex" as const, label: "Codex CLI" },
];

const SCOPE_OPTIONS = [
  { value: "global" as const, label: "Global" },
  { value: "workspace" as const, label: "Workspace" },
];

const DEFAULT_CLAUDE_CONFIG = JSON.stringify(
  {
    mcpServers: {},
    permissions: { allow: [], deny: [] },
    settings: {},
  },
  null,
  2,
);

const DEFAULT_CODEX_CONFIG = `# Custom Codex configuration
# Merged with cmux defaults at sandbox startup

[projects."/root/workspace"]
trust_level = "trusted"

# Add custom settings below
`;

function getDefaultConfig(agentType: AgentType): string {
  return agentType === "claude" ? DEFAULT_CLAUDE_CONFIG : DEFAULT_CODEX_CONFIG;
}

function getLanguage(agentType: AgentType): string {
  return agentType === "claude" ? "json" : "ini";
}

export function AgentConfigsSection({ teamSlugOrId }: AgentConfigsSectionProps) {
  const convex = useConvex();
  const { resolvedTheme } = useTheme();
  const [activeAgent, setActiveAgent] = useState<AgentType>("claude");
  const [activeScope, setActiveScope] = useState<Scope>("global");
  const [configText, setConfigText] = useState<string>("");
  const [originalConfigText, setOriginalConfigText] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const queryKey = useMemo(
    () => ({ teamSlugOrId, agentType: activeAgent, scope: activeScope }),
    [teamSlugOrId, activeAgent, activeScope],
  );

  const { data: config, refetch, isLoading, error, isFetching } = useQuery({
    ...convexQuery(api.agentConfigs.get, queryKey),
    retry: false,
    staleTime: 5000, // Cache for 5 seconds to prevent rapid refetches
    gcTime: 10000, // Keep data in cache for 10 seconds
  });

  // Track last error to persist it across query key changes
  const [lastError, setLastError] = useState<Error | null>(null);

  // Log and persist errors for debugging
  useEffect(() => {
    if (error) {
      console.error("Failed to fetch agent config:", error);
      setLastError(error);
    } else if (!isLoading && !isFetching && config !== undefined && lastError !== null) {
      // Clear error only on successful fetch (guard prevents no-op updates)
      setLastError(null);
    }
  }, [error, isLoading, isFetching, config, lastError]);

  // Use persisted error or current error
  const displayError = error ?? lastError;

  const upsertMutation = useMutation({
    mutationFn: async (rawConfig: string) => {
      return await convex.mutation(api.agentConfigs.upsert, {
        teamSlugOrId,
        agentType: activeAgent,
        scope: activeScope,
        rawConfig,
      });
    },
    onSuccess: async () => {
      await refetch();
    },
  });

  // Track which agent/scope combo we've loaded for
  const [loadedKey, setLoadedKey] = useState<string>("");
  const currentKey = useMemo(() => `${activeAgent}-${activeScope}`, [activeAgent, activeScope]);

  // Initialize editor content when config loads for current key
  useEffect(() => {
    // Wait for query to settle
    if (isLoading || isFetching) {
      return;
    }

    // Only initialize if we haven't loaded this key yet
    if (loadedKey === currentKey) {
      return;
    }

    const loadedConfig = config?.rawConfig ?? getDefaultConfig(activeAgent);
    setConfigText(loadedConfig);
    setOriginalConfigText(loadedConfig);
    setLoadedKey(currentKey);
    setLastError(null); // Clear any stale error
  }, [config, isLoading, isFetching, activeAgent, activeScope, loadedKey, currentKey]);

  const hasChanges = configText !== originalConfigText;

  const validationResult = useMemo(() => {
    if (activeAgent === "claude") {
      try {
        const parsed = JSON.parse(configText);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return { isValid: false, error: "Config must be a JSON object" };
        }
        return { isValid: true };
      } catch (err) {
        return {
          isValid: false,
          error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // Basic TOML validation
    const lines = configText.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;

      if (line.startsWith("[") && !line.endsWith("]")) {
        const withoutComment = line.split("#")[0].trim();
        if (!withoutComment.endsWith("]")) {
          return { isValid: false, error: `Line ${i + 1}: Unclosed section header` };
        }
      }
    }

    return { isValid: true };
  }, [configText, activeAgent]);

  const handleSave = useCallback(async () => {
    if (!validationResult.isValid) {
      toast.error(validationResult.error ?? "Invalid config");
      return;
    }

    setIsSaving(true);
    try {
      const result = await upsertMutation.mutateAsync(configText);
      if (result.isValid) {
        toast.success("Config saved");
        setOriginalConfigText(configText);
      } else {
        toast.error(result.validationError ?? "Validation failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save config";
      toast.error(message);
      console.error("Failed to save agent config:", error);
    } finally {
      setIsSaving(false);
    }
  }, [configText, validationResult, upsertMutation]);

  const handleReset = useCallback(() => {
    setConfigText(getDefaultConfig(activeAgent));
  }, [activeAgent]);

  const handleRevert = useCallback(() => {
    setConfigText(originalConfigText);
  }, [originalConfigText]);

  const agentOptions = useMemo(
    () =>
      AGENT_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    [],
  );

  const scopeOptions = useMemo(
    () =>
      SCOPE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    [],
  );

  const editorTheme = resolvedTheme === "dark" ? "vs-dark" : "vs";
  const editorLanguage = getLanguage(activeAgent);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-medium text-neutral-900 dark:text-neutral-100">
              Agent Configs
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Edit raw configuration files for Claude Code and Codex CLI. Custom configs are merged with cmux defaults at sandbox startup.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <SegmentedTabs
                value={activeAgent}
                onChange={(value) => setActiveAgent(value as AgentType)}
                options={agentOptions}
              />
              <SegmentedTabs
                value={activeScope}
                onChange={(value) => setActiveScope(value as Scope)}
                options={scopeOptions}
              />
            </div>

            <div className="flex items-center gap-2">
              {validationResult.isValid ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-500/20 dark:text-green-400">
                  <Check className="size-3" />
                  Valid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-500/20 dark:text-red-400">
                  <AlertCircle className="size-3" />
                  Invalid
                </span>
              )}
            </div>
          </div>
        </div>

        {!validationResult.isValid && validationResult.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {validationResult.error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
            <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <FileCode2 className="size-4" />
              <span>
                {activeAgent === "claude" ? ".claude.json" : "config.toml"}
              </span>
              <span className="text-xs">
                ({activeScope === "global" ? "All workspaces" : "Workspace-specific"})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevert}
                disabled={!hasChanges || isLoading}
                title="Revert changes"
              >
                <RotateCcw className="size-4" />
                Revert
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isLoading}
                title="Reset to default"
              >
                Reset
              </Button>
            </div>
          </div>

          {displayError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-red-500 dark:text-red-400">
              <AlertCircle className="size-5" />
              <span className="text-sm">Failed to load config</span>
              <span className="text-xs text-neutral-500">{displayError.message}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setLastError(null); void refetch(); }}
              >
                Retry
              </Button>
            </div>
          ) : isLoading || loadedKey !== currentKey ? (
            <div className="flex items-center justify-center py-24 text-neutral-500 dark:text-neutral-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <div className="h-[400px]">
              <Editor
                height="100%"
                language={editorLanguage}
                theme={editorTheme}
                value={configText}
                onChange={(value) => setConfigText(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  tabSize: 2,
                  padding: { top: 12, bottom: 12 },
                  renderLineHighlight: "line",
                  automaticLayout: true,
                }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {activeAgent === "claude"
              ? "Claude Code config is merged with MCP servers and policy rules."
              : "Codex config is merged with default settings including workspace trust."}
          </p>
          <Button
            onClick={() => void handleSave()}
            disabled={!hasChanges || !validationResult.isValid || isSaving || isLoading}
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
