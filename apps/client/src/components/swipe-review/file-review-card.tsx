import { useMemo } from "react";
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

interface FileReviewCardProps {
  filePath: string;
  decision: ReviewDecision;
  riskScore?: number;
  teamSlugOrId: string;
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

export function FileReviewCard({
  filePath,
  decision,
  riskScore,
}: FileReviewCardProps) {
  const risk = useMemo(() => getRiskLevel(riskScore), [riskScore]);
  const ext = getFileExtension(filePath);
  const language = getFileLanguage(ext);
  const fileName = filePath.split("/").pop() || filePath;
  const directory = filePath.includes("/")
    ? filePath.substring(0, filePath.lastIndexOf("/"))
    : "";

  return (
    <div
      className={cn(
        "w-full max-w-2xl rounded-xl border shadow-lg overflow-hidden",
        "bg-white dark:bg-neutral-900",
        "border-neutral-200 dark:border-neutral-700",
        decision === "approved" && "ring-2 ring-green-500",
        decision === "changes_requested" && "ring-2 ring-red-500"
      )}
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
