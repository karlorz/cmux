import { useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { X, RotateCcw, GripVertical, MessageSquare, Code2, TerminalSquare, Globe2, GitCompare, Plus, Grid2x2, Columns2, Rows2, PanelLeft, PanelRight, PanelTop, PanelBottom } from "lucide-react";
import clsx from "clsx";
import type { PanelConfig, PanelType, LayoutMode, PanelPosition } from "@/lib/panel-config";
import { PANEL_LABELS, DEFAULT_PANEL_CONFIG, LAYOUT_LABELS, LAYOUT_DESCRIPTIONS, getActivePanelPositions } from "@/lib/panel-config";

interface PanelConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: PanelConfig;
  onChange: (config: PanelConfig) => void;
}

const PANEL_ICONS_MAP: Record<PanelType, LucideIcon> = {
  chat: MessageSquare,
  workspace: Code2,
  terminal: TerminalSquare,
  browser: Globe2,
  gitDiff: GitCompare,
};

const LAYOUT_ICONS_MAP: Record<LayoutMode, LucideIcon> = {
  "four-panel": Grid2x2,
  "two-horizontal": Columns2,
  "two-vertical": Rows2,
  "three-left": PanelLeft,
  "three-right": PanelRight,
  "three-top": PanelTop,
  "three-bottom": PanelBottom,
};

export function PanelConfigModal({ isOpen, onClose, config, onChange }: PanelConfigModalProps) {
  const [draggedType, setDraggedType] = useState<PanelType | null>(null);
  const [draggedFrom, setDraggedFrom] = useState<PanelPosition | null>(null);

  if (!isOpen) return null;

  const activePanelPositions = getActivePanelPositions(config.layoutMode);

  const handleDragStart = (type: PanelType, position: PanelPosition) => {
    setDraggedType(type);
    setDraggedFrom(position);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetPosition: PanelPosition) => {
    if (!draggedType || !draggedFrom) return;

    // Swap the panels
    const newConfig = { ...config };
    const targetType = config[targetPosition];
    newConfig[targetPosition] = draggedType;
    newConfig[draggedFrom] = targetType;

    onChange(newConfig);
    setDraggedType(null);
    setDraggedFrom(null);
  };

  const handleReset = () => {
    onChange(DEFAULT_PANEL_CONFIG);
  };

  const handleLayoutModeChange = (layoutMode: LayoutMode) => {
    onChange({ ...config, layoutMode });
  };

  const renderPanel = (position: PanelPosition, label: string) => {
    const isActive = activePanelPositions.includes(position);
    if (!isActive) {
      return (
        <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-neutral-200 bg-neutral-100 opacity-50 dark:border-neutral-800 dark:bg-neutral-950">
          <span className="text-xs text-neutral-400 dark:text-neutral-600">Inactive</span>
        </div>
      );
    }

    const panelType = config[position];
    const panelLabel = panelType ? PANEL_LABELS[panelType] : "Empty";
    const PanelIcon = panelType ? PANEL_ICONS_MAP[panelType] : Plus;
    const isDragging = draggedFrom === position;
    const isDraggable = Boolean(panelType);

    const handlePanelDragStart = () => {
      if (!panelType) {
        return;
      }
      handleDragStart(panelType, position);
    };

    return (
      <div
        draggable={isDraggable}
        onDragStart={isDraggable ? handlePanelDragStart : undefined}
        onDragOver={handleDragOver}
        onDrop={() => handleDrop(position)}
        onDragEnd={() => {
          setDraggedType(null);
          setDraggedFrom(null);
        }}
        className={clsx(
          "group relative flex h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-all",
          isDraggable ? "cursor-move" : "cursor-default",
          isDragging
            ? "border-neutral-400 bg-neutral-100/50 opacity-50 dark:border-neutral-600 dark:bg-neutral-800/50"
            : "border-neutral-300 bg-neutral-50 hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800",
        )}
      >
        <GripVertical
          className={clsx(
            "absolute top-2 left-2 size-4 text-neutral-400 transition-opacity dark:text-neutral-500",
            isDraggable ? "opacity-100" : "opacity-0"
          )}
        />
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {label}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div
            className={clsx(
              "flex size-10 items-center justify-center rounded-full",
              panelType
                ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                : "bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
            )}
          >
            <PanelIcon className="size-5" />
          </div>
          <span
            className={clsx(
              "text-sm font-medium",
              panelType ? "text-neutral-800 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400"
            )}
          >
            {panelLabel}
          </span>
        </div>
      </div>
    );
  };

  const modalContent = (
    <div className="fixed inset-0 z-[var(--z-global-blocking)] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-lg border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Panel Layout Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-white"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Description */}
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
          Choose a layout mode and drag and drop panels to customize your workspace. Your configuration will be saved automatically.
        </p>

        {/* Layout Mode Selection */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">
            Layout Mode
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(LAYOUT_LABELS) as LayoutMode[]).map((layoutMode) => {
              const LayoutIcon = LAYOUT_ICONS_MAP[layoutMode];
              const isSelected = config.layoutMode === layoutMode;
              return (
                <button
                  key={layoutMode}
                  type="button"
                  onClick={() => handleLayoutModeChange(layoutMode)}
                  className={clsx(
                    "flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all",
                    isSelected
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
                  )}
                  title={LAYOUT_DESCRIPTIONS[layoutMode]}
                >
                  <LayoutIcon className="size-5" />
                  <span className="text-xs font-medium text-center leading-tight">
                    {LAYOUT_LABELS[layoutMode].replace(/\s*\(.*?\)\s*/g, "")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid Preview */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">
            Panel Configuration
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {renderPanel("topLeft", "Top Left")}
            {renderPanel("topRight", "Top Right")}
            {renderPanel("bottomLeft", "Bottom Left")}
            {renderPanel("bottomRight", "Bottom Right")}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <RotateCcw className="size-4" />
            Reset to Default
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}
