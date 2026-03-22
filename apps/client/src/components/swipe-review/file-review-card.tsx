import { useMemo, useState, type PointerEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  Clock,
  FileCode,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ReviewDecision = "pending" | "approved" | "changes_requested" | "skipped";

interface HighlightedLine {
  lineNumber: number;
  content: string;
  score: number;
}

interface FileReviewCardProps {
  filePath: string;
  decision: ReviewDecision;
  riskScore?: number;
  teamSlugOrId: string;
  topHighlightedLines?: HighlightedLine[];
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeDown?: () => void;
}

function getRiskLevel(score?: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (score === undefined) {
    return {
      label: "Unknown",
      color: "text-neutral-500",
      bgColor: "bg-neutral-100 dark:bg-neutral-800",
    };
  }
  if (score <= 2) {
    return {
      label: "Low Risk",
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900",
    };
  }
  if (score <= 5) {
    return {
      label: "Medium Risk",
      color: "text-yellow-600",
      bgColor: "bg-yellow-100 dark:bg-yellow-900",
    };
  }
  if (score <= 7) {
    return {
      label: "High Risk",
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900",
    };
  }
  return {
    label: "Critical",
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900",
  };
}

function getDecisionBadge(decision: ReviewDecision) {
  switch (decision) {
    case "approved":
      return (
        <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
          <CheckCircle2 className="w-3 h-3" />
          Approved
        </span>
      );
    case "changes_requested":
      return (
        <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
          <AlertCircle className="w-3 h-3" />
          Changes Requested
        </span>
      );
    case "skipped":
      return (
        <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          <SkipForward className="w-3 h-3" />
          Skipped
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          <Clock className="w-3 h-3" />
          Pending Review
        </span>
      );
  }
}

function getFileExtension(path: string): string {
  const parts = path.split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}

function getFileLanguage(ext: string): string {
  const langMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript React",
    js: "JavaScript",
    jsx: "JavaScript React",
    py: "Python",
    rs: "Rust",
    go: "Go",
    rb: "Ruby",
    java: "Java",
    kt: "Kotlin",
    swift: "Swift",
    c: "C",
    cpp: "C++",
    h: "C Header",
    hpp: "C++ Header",
    css: "CSS",
    scss: "SCSS",
    less: "Less",
    html: "HTML",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    sql: "SQL",
    sh: "Shell",
    bash: "Bash",
    zsh: "Zsh",
  };
  return langMap[ext.toLowerCase()] || ext.toUpperCase();
}

const SWIPE_THRESHOLD = 100; // pixels

export function FileReviewCard({
  filePath,
  decision,
  riskScore,
  topHighlightedLines,
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
}: FileReviewCardProps) {
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });

  const risk = useMemo(() => getRiskLevel(riskScore), [riskScore]);
  const ext = getFileExtension(filePath);
  const language = getFileLanguage(ext);
  const fileName = filePath.split("/").pop() || filePath;
  const directory = filePath.includes("/")
    ? filePath.substring(0, filePath.lastIndexOf("/"))
    : "";

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setDragStartX(e.clientX);
    setDragStartY(e.clientY);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStartX === null || dragStartY === null) return;
    setDragDelta({
      x: e.clientX - dragStartX,
      y: e.clientY - dragStartY,
    });
  };

  const handlePointerUp = () => {
    const absX = Math.abs(dragDelta.x);
    const absY = Math.abs(dragDelta.y);

    // Determine dominant direction
    if (absX > SWIPE_THRESHOLD && absX > absY) {
      if (dragDelta.x > 0) {
        onSwipeRight?.();
      } else {
        onSwipeLeft?.();
      }
    } else if (absY > SWIPE_THRESHOLD && absY > absX && dragDelta.y > 0) {
      onSwipeDown?.();
    }

    setDragStartX(null);
    setDragStartY(null);
    setDragDelta({ x: 0, y: 0 });
  };

  const handlePointerCancel = () => {
    setDragStartX(null);
    setDragStartY(null);
    setDragDelta({ x: 0, y: 0 });
  };

  // Visual feedback colors based on swipe direction
  const getSwipeOverlay = () => {
    const absX = Math.abs(dragDelta.x);
    if (absX < 30) return null;

    const opacity = Math.min((absX - 30) / 100, 0.3);
    if (dragDelta.x > 0) {
      return `rgba(34, 197, 94, ${opacity})`; // green for approve
    }
    return `rgba(239, 68, 68, ${opacity})`; // red for changes
  };

  return (
    <div
      className={cn(
        "w-full max-w-2xl rounded-xl border shadow-lg overflow-hidden",
        "bg-white dark:bg-neutral-900",
        "border-neutral-200 dark:border-neutral-700",
        decision === "approved" && "ring-2 ring-green-500",
        decision === "changes_requested" && "ring-2 ring-red-500",
        "touch-none select-none cursor-grab",
        dragStartX !== null && "cursor-grabbing"
      )}
      style={{
        transform: `translateX(${dragDelta.x}px) rotate(${dragDelta.x * 0.02}deg)`,
        transition: dragStartX === null ? "transform 0.2s ease-out" : "none",
        backgroundColor: getSwipeOverlay() ?? undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800">
            <FileCode className="w-6 h-6 text-neutral-600 dark:text-neutral-400" />
          </div>
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
              {fileName}
            </h3>
            {directory && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {directory}
              </p>
            )}
          </div>
        </div>
        {getDecisionBadge(decision)}
      </div>

      {/* Risk indicator */}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className={cn("w-5 h-5", risk.color)} />
            <span className={cn("font-medium", risk.color)}>{risk.label}</span>
          </div>
          {riskScore !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">Risk Score</span>
              <span
                className={cn(
                  "text-lg font-bold px-2 py-0.5 rounded",
                  risk.bgColor,
                  risk.color
                )}
              >
                {riskScore.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Risk bar */}
        <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              riskScore === undefined && "bg-neutral-400",
              riskScore !== undefined && riskScore <= 2 && "bg-green-500",
              riskScore !== undefined &&
                riskScore > 2 &&
                riskScore <= 5 &&
                "bg-yellow-500",
              riskScore !== undefined &&
                riskScore > 5 &&
                riskScore <= 7 &&
                "bg-orange-500",
              riskScore !== undefined && riskScore > 7 && "bg-red-500"
            )}
            style={{ width: `${(riskScore ?? 0) * 10}%` }}
          />
        </div>

        {/* File info */}
        <div className="flex items-center gap-4 pt-2 text-sm text-neutral-500">
          <span className="px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800">
            {language}
          </span>
          {riskScore !== undefined && riskScore > 5 && (
            <span className="flex items-center gap-1 text-orange-600">
              <AlertTriangle className="w-4 h-4" />
              Needs careful review
            </span>
          )}
        </div>

        {/* Diff preview - top highlighted lines */}
        {topHighlightedLines && topHighlightedLines.length > 0 && (
          <div className="mt-4 rounded-lg bg-neutral-950 p-3 font-mono text-xs overflow-hidden">
            <div className="text-neutral-400 mb-2 text-[10px] uppercase tracking-wide">
              Top changes to review
            </div>
            {topHighlightedLines.slice(0, 5).map((line) => (
              <div
                key={`${line.lineNumber}-${line.content.slice(0, 20)}`}
                className="flex gap-3 py-0.5 hover:bg-neutral-800/50"
              >
                <span className="text-neutral-500 w-8 text-right shrink-0">
                  {line.lineNumber}
                </span>
                <span
                  className={cn(
                    "flex-1 truncate",
                    line.score >= 7
                      ? "text-red-400"
                      : line.score >= 5
                        ? "text-orange-400"
                        : "text-neutral-200"
                  )}
                >
                  {line.content || " "}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Swipe hints */}
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 text-sm text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="text-red-500">Swipe Left</span> to request changes
        </span>
        <span className="flex items-center gap-1">
          <span className="text-green-500">Swipe Right</span> to approve
        </span>
      </div>
    </div>
  );
}
