import { useState, useCallback, useEffect } from "react";
import { ConfigEditor, type ConfigLanguage } from "./ConfigEditor";
import { validateConfig } from "@/lib/codemirror/config-extensions";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, Copy, Download, Edit2, Eye } from "lucide-react";
import { toast } from "sonner";

export type ConfigAgent = "claude" | "codex" | "opencode";

const AGENT_CONFIG_INFO: Record<
  ConfigAgent,
  {
    label: string;
    language: ConfigLanguage;
    fileName: string;
  }
> = {
  claude: {
    label: "Claude",
    language: "json",
    fileName: "~/.claude.json",
  },
  codex: {
    label: "Codex",
    language: "toml",
    fileName: "~/.codex/config.toml",
  },
  opencode: {
    label: "OpenCode",
    language: "json",
    fileName: "~/.config/opencode/opencode.json",
  },
};

export interface ConfigEditorPanelProps {
  /** The agent whose config is being edited */
  agent: ConfigAgent;
  /** The config content */
  value: string;
  /** Callback when content changes (required for edit mode) */
  onChange?: (value: string) => void;
  /** Callback to save to cloud storage */
  onSaveToCloud?: (content: string) => Promise<void>;
  /** Callback to export to local file (Electron only) */
  onExportToLocal?: (content: string) => Promise<{ ok: boolean; error?: string }>;
  /** Whether local export is available (Electron mode) */
  canExportToLocal?: boolean;
  /** Start in edit mode */
  initialEditMode?: boolean;
  /** Title for the panel */
  title?: string;
  /** Description text */
  description?: string;
  /** Minimum height */
  minHeight?: string;
  /** Maximum height */
  maxHeight?: string;
}

/**
 * A panel wrapper for ConfigEditor with edit/preview modes and save controls.
 */
export function ConfigEditorPanel({
  agent,
  value,
  onChange,
  onSaveToCloud,
  onExportToLocal,
  canExportToLocal = false,
  initialEditMode = false,
  title,
  description,
  minHeight = "300px",
  maxHeight = "500px",
}: ConfigEditorPanelProps) {
  const [editMode, setEditMode] = useState(initialEditMode);
  const [localValue, setLocalValue] = useState(value);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const agentInfo = AGENT_CONFIG_INFO[agent];
  const hasChanges = localValue !== value;

  // Sync local value when prop value changes (from external source)
  useEffect(() => {
    if (!editMode) {
      setLocalValue(value);
    }
  }, [value, editMode]);

  // Validate on change (debounced to avoid parsing on every keystroke)
  useEffect(() => {
    if (!editMode || !localValue) {
      setValidationError(null);
      return;
    }
    const timeout = setTimeout(() => {
      const error = validateConfig(localValue, agentInfo.language);
      setValidationError(error);
    }, 300);
    return () => clearTimeout(timeout);
  }, [localValue, editMode, agentInfo.language]);

  const handleChange = useCallback(
    (newValue: string) => {
      setLocalValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  const handleToggleEditMode = useCallback(() => {
    if (editMode && hasChanges) {
      // Warn about unsaved changes
      if (!window.confirm("You have unsaved changes. Discard them?")) {
        return;
      }
      setLocalValue(value);
    }
    setEditMode(!editMode);
  }, [editMode, hasChanges, value]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(localValue);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [localValue]);

  const handleSaveToCloud = useCallback(async () => {
    if (!onSaveToCloud || validationError) return;

    setIsSaving(true);
    try {
      await onSaveToCloud(localValue);
      toast.success("Saved to cloud");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save";
      toast.error(message);
      console.error("Failed to save to cloud:", e);
    } finally {
      setIsSaving(false);
    }
  }, [onSaveToCloud, localValue, validationError]);

  const handleExportToLocal = useCallback(async () => {
    if (!onExportToLocal || validationError) return;

    setIsExporting(true);
    try {
      const result = await onExportToLocal(localValue);
      if (result.ok) {
        toast.success(`Exported to ${agentInfo.fileName}`);
      } else {
        toast.error(result.error || "Failed to export");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to export";
      toast.error(message);
      console.error("Failed to export to local:", e);
    } finally {
      setIsExporting(false);
    }
  }, [onExportToLocal, localValue, validationError, agentInfo.fileName]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {title && (
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Edit/Preview toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleEditMode}
            className="h-8 gap-1.5"
          >
            {editMode ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                Preview
              </>
            ) : (
              <>
                <Edit2 className="h-3.5 w-3.5" />
                Edit
              </>
            )}
          </Button>
          {/* Copy button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
        </div>
      </div>

      {/* Validation error banner */}
      {validationError && editMode && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span className="break-all">{validationError}</span>
        </div>
      )}

      {/* Editor */}
      <ConfigEditor
        value={localValue}
        onChange={editMode ? handleChange : undefined}
        language={agentInfo.language}
        readOnly={!editMode}
        minHeight={minHeight}
        maxHeight={maxHeight}
        placeholder={`Enter ${agentInfo.label} config (${agentInfo.language.toUpperCase()})...`}
      />

      {/* Footer with save controls */}
      {editMode && (onSaveToCloud || canExportToLocal) && (
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
                Valid {agentInfo.language.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canExportToLocal && onExportToLocal && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportToLocal}
                disabled={isExporting || !!validationError}
                className="h-8 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                {isExporting ? "Exporting..." : "Export to Local"}
              </Button>
            )}
            {onSaveToCloud && (
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveToCloud}
                disabled={isSaving || !!validationError}
                className="h-8"
              >
                {isSaving ? "Saving..." : "Save to Cloud"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
