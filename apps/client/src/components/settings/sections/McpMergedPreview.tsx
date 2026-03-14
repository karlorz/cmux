import { useState, useCallback, useEffect } from "react";
import {
  getMcpPreviewScopeDescription,
  getWebPreviewInjectedServersDescription,
} from "@cmux/shared";
import { SegmentedTabs } from "@/components/mcp/McpFormSections";
import { SettingSection } from "@/components/settings/SettingSection";
import { ConfigEditor } from "@/components/config-editor/ConfigEditor";
import { validateConfig, type ConfigLanguage } from "@/lib/codemirror/config-extensions";
import { Button } from "@/components/ui/button";
import type { Scope } from "@/lib/mcp-form-helpers";
import type { HostMcpFileResult, HostMcpWriteResult } from "@/types/electron";
import type { McpPreviewAgent } from "./mcp-preview-helpers";
import { getElectronBridge, isElectron } from "@/lib/electron";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Edit2,
  Eye,
  RotateCcw,
} from "lucide-react";

const PREVIEW_AGENT_METADATA = {
  claude: {
    label: "Claude",
    hostConfigFileName: "~/.claude.json",
    language: "json" as ConfigLanguage,
  },
  codex: {
    label: "Codex",
    hostConfigFileName: "~/.codex/config.toml",
    language: "toml" as ConfigLanguage,
  },
  opencode: {
    label: "OpenCode",
    hostConfigFileName: "~/.config/opencode/opencode.json",
    language: "json" as ConfigLanguage,
  },
} satisfies Record<
  McpPreviewAgent,
  {
    label: string;
    hostConfigFileName: string;
    language: ConfigLanguage;
  }
>;

const PREVIEW_AGENT_OPTIONS = (["claude", "codex", "opencode"] as const).map((agent) => ({
  value: agent,
  label: PREVIEW_AGENT_METADATA[agent].label,
}));

function getHostConfigDescription(
  agent: McpPreviewAgent,
  hostConfig: HostMcpFileResult | null,
): string {
  const { hostConfigFileName } = PREVIEW_AGENT_METADATA[agent];

  if (hostConfig?.ok) {
    return `Using local ${hostConfigFileName} as the base host config.`;
  }

  return `Local ${hostConfigFileName} was not found, so this preview starts from an empty host config.`;
}


export interface McpMergedPreviewProps {
  activeAgent: McpPreviewAgent;
  onActiveAgentChange: (agent: McpPreviewAgent) => void;
  previewText: string;
  claudeHostConfig: HostMcpFileResult | null;
  codexHostConfig: HostMcpFileResult | null;
  opencodeHostConfig?: HostMcpFileResult | null;
  scope: Scope;
  workspaceProjectFullName?: string;
  workspaceProjects?: string[];
  selectedWorkspaceProject?: string;
  onWorkspaceProjectChange?: (projectFullName: string) => void;
  webMode?: boolean;
  /** Callback to refresh host configs after a write */
  onRefreshHostConfigs?: () => void;
}

export function McpMergedPreview({
  activeAgent,
  onActiveAgentChange,
  previewText,
  claudeHostConfig,
  codexHostConfig,
  opencodeHostConfig = null,
  scope,
  workspaceProjectFullName,
  workspaceProjects = [],
  selectedWorkspaceProject,
  onWorkspaceProjectChange,
  webMode = false,
  onRefreshHostConfigs,
}: McpMergedPreviewProps) {
  const hostConfigsByAgent = {
    claude: claudeHostConfig,
    codex: codexHostConfig,
    opencode: opencodeHostConfig,
  } satisfies Record<McpPreviewAgent, HostMcpFileResult | null>;
  const hostConfig = hostConfigsByAgent[activeAgent];
  const agentMeta = PREVIEW_AGENT_METADATA[activeAgent];

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Initialize edit content from host config when entering edit mode
  useEffect(() => {
    if (editMode) {
      // When editing, use the actual host config content, not the merged preview
      const rawContent = hostConfig?.ok ? hostConfig.content ?? "" : "";
      setEditContent(rawContent);
      setValidationError(null);
    }
  }, [editMode, hostConfig, activeAgent]);

  // Validate content on change (debounced to avoid parsing on every keystroke)
  useEffect(() => {
    if (!editMode || !editContent) {
      setValidationError(null);
      return;
    }
    const timeout = setTimeout(() => {
      const error = validateConfig(editContent, agentMeta.language);
      setValidationError(error);
    }, 300);
    return () => clearTimeout(timeout);
  }, [editMode, editContent, agentMeta.language]);

  const handleToggleEditMode = useCallback(() => {
    if (editMode && hostConfig?.ok) {
      const rawContent = hostConfig.content ?? "";
      if (editContent !== rawContent) {
        if (!window.confirm("You have unsaved changes. Discard them?")) {
          return;
        }
      }
    }
    setEditMode(!editMode);
  }, [editMode, editContent, hostConfig]);

  const handleCopy = useCallback(async () => {
    const content = editMode ? editContent : previewText;
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [editMode, editContent, previewText]);

  const handleResetContent = useCallback(() => {
    const rawContent = hostConfig?.ok ? hostConfig.content ?? "" : "";
    setEditContent(rawContent);
    setValidationError(null);
  }, [hostConfig]);

  const handleExportToLocal = useCallback(async () => {
    if (!isElectron || validationError) return;

    const bridge = getElectronBridge();
    if (!bridge?.mcpHostConfig) return;

    setIsExporting(true);
    try {
      let result: HostMcpWriteResult;
      switch (activeAgent) {
        case "claude":
          result = await bridge.mcpHostConfig.writeClaudeJson(editContent);
          break;
        case "codex":
          result = await bridge.mcpHostConfig.writeCodexToml(editContent);
          break;
        case "opencode":
          result = await bridge.mcpHostConfig.writeOpencodeJson(editContent);
          break;
        default:
          throw new Error(`Unknown agent: ${activeAgent}`);
      }

      if (result.ok) {
        toast.success(`Saved to ${agentMeta.hostConfigFileName}`);
        setEditMode(false);
        onRefreshHostConfigs?.();
      } else {
        toast.error(result.error || "Failed to save config");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save config";
      toast.error(message);
      console.error("Failed to export to local:", e);
    } finally {
      setIsExporting(false);
    }
  }, [activeAgent, editContent, validationError, agentMeta.hostConfigFileName, onRefreshHostConfigs]);

  const hasChanges = editMode && hostConfig?.ok && editContent !== (hostConfig.content ?? "");
  const canEdit = isElectron && !webMode;

  return (
    <SettingSection
      title={webMode ? "Effective preview" : "Merged preview"}
      description={webMode
        ? "This preview shows only the MCP config cmux will upload for each agent in web mode. It does not fetch or merge any local agent config files. Sensitive values are redacted, and built-in injected MCP servers are included."
        : "Desktop only. This preview combines your local host config with the MCP settings that will be uploaded into remote sandboxes."}
      headerAction={
        <div className="flex items-center gap-2">
          <SegmentedTabs
            value={activeAgent}
            onChange={onActiveAgentChange}
            options={PREVIEW_AGENT_OPTIONS}
          />
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleEditMode}
              className="h-7 gap-1.5 text-xs"
            >
              {editMode ? (
                <>
                  <Eye className="h-3 w-3" />
                  Preview
                </>
              ) : (
                <>
                  <Edit2 className="h-3 w-3" />
                  Edit
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1.5 text-xs"
          >
            <Copy className="h-3 w-3" />
            Copy
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-4">
        {scope === "workspace" && workspaceProjects.length > 1 ? (
          <div className="space-y-2">
            <label
              htmlFor="mcp-preview-workspace-project"
              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
            >
              Workspace repo
            </label>
            <select
              id="mcp-preview-workspace-project"
              value={selectedWorkspaceProject}
              onChange={(event) => onWorkspaceProjectChange?.(event.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {workspaceProjects.map((projectFullName) => (
                <option key={projectFullName} value={projectFullName}>
                  {projectFullName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {!editMode && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            <p>{getMcpPreviewScopeDescription(scope, workspaceProjectFullName)}</p>
            {webMode ? (
              <p className="mt-1">Local agent config files are not fetched or merged in web mode.</p>
            ) : <p className="mt-1">{getHostConfigDescription(activeAgent, hostConfig)}</p>}
            <p className="mt-1">Sensitive values are redacted in this preview.</p>
            {webMode && activeAgent === "claude" ? (
              <p className="mt-1">
                Claude previews also include the built-in observed live web-mode MCP entries. {getWebPreviewInjectedServersDescription(
                  "claude",
                  { includeBuiltins: true },
                )}
              </p>
            ) : null}
          </div>
        )}

        {editMode && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            <p className="font-medium">Editing {agentMeta.hostConfigFileName}</p>
            <p className="mt-1 text-xs opacity-80">
              Changes will be saved directly to your local config file. A backup will be created automatically.
            </p>
          </div>
        )}

        {/* Validation error */}
        {validationError && editMode && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="break-all text-xs">{validationError}</span>
          </div>
        )}

        {editMode ? (
          /* Edit mode with ConfigEditor */
          <ConfigEditor
            value={editContent}
            onChange={setEditContent}
            language={agentMeta.language}
            readOnly={false}
            minHeight="300px"
            maxHeight="500px"
            placeholder={`Enter ${agentMeta.label} config (${agentMeta.language.toUpperCase()})...`}
          />
        ) : (
          /* Preview mode with syntax-highlighted read-only view */
          <ConfigEditor
            value={previewText}
            language={agentMeta.language}
            readOnly={true}
            minHeight="200px"
            maxHeight="400px"
          />
        )}

        {/* Footer controls for edit mode */}
        {editMode && (
          <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 pt-3">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {hasChanges ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Unsaved changes
                </span>
              ) : validationError ? (
                <span className="text-red-600 dark:text-red-400">
                  Fix errors before saving
                </span>
              ) : (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Check className="h-3 w-3" />
                  Valid {agentMeta.language.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetContent}
                  className="h-8 gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleExportToLocal}
                disabled={isExporting || !!validationError || !hasChanges}
                className="h-8 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                {isExporting ? "Saving..." : "Save to Local"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingSection>
  );
}
