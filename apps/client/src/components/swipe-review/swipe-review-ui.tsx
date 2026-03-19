import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  X,
  Undo2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FileReviewCard } from "./file-review-card";

type ReviewDecision = "pending" | "approved" | "changes_requested" | "skipped";

interface FileWithDecision {
  path: string;
  decision: ReviewDecision;
  riskScore?: number;
  comment?: string;
}

interface SwipeReviewUIProps {
  teamSlugOrId: string;
  sessionId?: string;
  taskRunId?: string;
}

export function SwipeReviewUI({
  teamSlugOrId,
  sessionId: initialSessionId,
  taskRunId,
}: SwipeReviewUIProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Fetch or create session
  const session = useQuery(
    api.prReviewSessions.get,
    initialSessionId
      ? {
          teamSlugOrId,
          sessionId: initialSessionId as Id<"prReviewSessions">,
        }
      : "skip"
  );

  const createSession = useMutation(api.prReviewSessions.create);
  const recordDecision = useMutation(api.prReviewSessions.recordFileDecision);
  const undoDecision = useMutation(api.prReviewSessions.undoFileDecision);
  const completeSession = useMutation(api.prReviewSessions.complete);
  const batchDecision = useMutation(api.prReviewSessions.batchDecision);

  // Parse files from heatmap data
  const files = useMemo<FileWithDecision[]>(() => {
    if (!session?.heatmapData) return [];

    try {
      const heatmap = JSON.parse(session.heatmapData);
      const heatmapFiles =
        heatmap.files?.map(
          (f: { path: string; heatmap?: { overallRiskScore?: number } }) => ({
            path: f.path,
            riskScore: f.heatmap?.overallRiskScore,
          })
        ) ?? [];

      // Merge with existing decisions
      const decisionMap = new Map(
        session.fileDecisions?.map((d) => [d.filePath, d]) ?? []
      );

      return heatmapFiles.map(
        (f: { path: string; riskScore?: number }): FileWithDecision => {
          const existing = decisionMap.get(f.path);
          return {
            path: f.path,
            decision: existing?.decision ?? "pending",
            riskScore: f.riskScore,
            comment: existing?.comment,
          };
        }
      );
    } catch {
      return [];
    }
  }, [session?.heatmapData, session?.fileDecisions]);

  const currentFile = files[currentIndex];
  const pendingFiles = files.filter((f) => f.decision === "pending");
  const approvedCount = files.filter((f) => f.decision === "approved").length;
  const changesCount = files.filter(
    (f) => f.decision === "changes_requested"
  ).length;

  // Create session if needed
  useEffect(() => {
    if (!initialSessionId && taskRunId && !isCreatingSession) {
      setIsCreatingSession(true);
      createSession({
        teamSlugOrId,
        taskRunId: taskRunId as Id<"taskRuns">,
      })
        .then((result) => {
          // Update URL with session ID
          const url = new URL(window.location.href);
          url.searchParams.set("sessionId", result.sessionId);
          window.history.replaceState({}, "", url.toString());
        })
        .catch((err) => {
          console.error("Failed to create session:", err);
          toast.error("Failed to start review session");
        })
        .finally(() => setIsCreatingSession(false));
    }
  }, [
    initialSessionId,
    taskRunId,
    createSession,
    teamSlugOrId,
    isCreatingSession,
  ]);

  // Handle decision
  const handleDecision = useCallback(
    async (decision: ReviewDecision) => {
      if (!currentFile || !initialSessionId) return;

      try {
        await recordDecision({
          teamSlugOrId,
          sessionId: initialSessionId as Id<"prReviewSessions">,
          filePath: currentFile.path,
          decision,
          riskScore: currentFile.riskScore,
        });

        // Auto-advance to next pending file
        const nextPendingIndex = files.findIndex(
          (f, i) => i > currentIndex && f.decision === "pending"
        );
        if (nextPendingIndex >= 0) {
          setCurrentIndex(nextPendingIndex);
        } else {
          // Look from beginning
          const firstPending = files.findIndex((f) => f.decision === "pending");
          if (firstPending >= 0 && firstPending !== currentIndex) {
            setCurrentIndex(firstPending);
          }
        }
      } catch (err) {
        console.error("Failed to record decision:", err);
        toast.error("Failed to record decision");
      }
    },
    [
      currentFile,
      currentIndex,
      files,
      initialSessionId,
      recordDecision,
      teamSlugOrId,
    ]
  );

  // Handle undo
  const handleUndo = useCallback(async () => {
    if (!currentFile || !initialSessionId) return;

    try {
      const result = await undoDecision({
        teamSlugOrId,
        sessionId: initialSessionId as Id<"prReviewSessions">,
        filePath: currentFile.path,
      });

      if (!result.ok) {
        toast.error(result.reason ?? "Cannot undo");
      }
    } catch (err) {
      console.error("Failed to undo:", err);
      toast.error("Failed to undo decision");
    }
  }, [currentFile, initialSessionId, teamSlugOrId, undoDecision]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case "a":
        case "ArrowRight":
          e.preventDefault();
          handleDecision("approved");
          break;
        case "x":
        case "ArrowLeft":
          e.preventDefault();
          handleDecision("changes_requested");
          break;
        case "s":
        case "ArrowDown":
          e.preventDefault();
          handleDecision("skipped");
          break;
        case "u":
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleUndo();
          }
          break;
        case "j":
          e.preventDefault();
          setCurrentIndex((i) => Math.min(i + 1, files.length - 1));
          break;
        case "k":
          e.preventDefault();
          setCurrentIndex((i) => Math.max(i - 1, 0));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDecision, handleUndo, files.length]);

  // Handle batch approve low-risk files
  const handleBatchApprove = useCallback(async () => {
    if (!initialSessionId) return;

    try {
      const result = await batchDecision({
        teamSlugOrId,
        sessionId: initialSessionId as Id<"prReviewSessions">,
        decision: "approved",
        onlyPending: true,
        maxRiskScore: 3, // Only batch approve low-risk files
      });

      toast.success(`Approved ${result.updated} low-risk files`);
    } catch (err) {
      console.error("Failed to batch approve:", err);
      toast.error("Failed to batch approve");
    }
  }, [initialSessionId, teamSlugOrId, batchDecision]);

  // Handle complete review
  const handleComplete = useCallback(async () => {
    if (!initialSessionId) return;

    try {
      await completeSession({
        teamSlugOrId,
        sessionId: initialSessionId as Id<"prReviewSessions">,
        submitToGitHub: true,
      });

      toast.success("Review completed!");
    } catch (err) {
      console.error("Failed to complete review:", err);
      toast.error("Failed to complete review");
    }
  }, [initialSessionId, teamSlugOrId, completeSession]);

  // Loading state
  if (!session && initialSessionId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  // No files to review
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-neutral-500">
        <FileText className="w-16 h-16" />
        <p className="text-lg">No files to review</p>
        <p className="text-sm">
          Start a review from a task run or PR to see files here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with progress */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Code Review</h2>
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              {approvedCount}
            </span>
            <span className="flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-red-500" />
              {changesCount}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              {pendingFiles.length} remaining
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBatchApprove}
            disabled={pendingFiles.length === 0}
          >
            <Zap className="w-4 h-4 mr-1" />
            Auto-approve low risk
          </Button>
          <Button
            size="sm"
            onClick={handleComplete}
            disabled={pendingFiles.length > 0}
          >
            Complete Review
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full bg-green-500 transition-all"
          style={{
            width: `${((files.length - pendingFiles.length) / files.length) * 100}%`,
          }}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
        {currentFile && (
          <FileReviewCard
            key={currentFile.path}
            filePath={currentFile.path}
            decision={currentFile.decision}
            riskScore={currentFile.riskScore}
            teamSlugOrId={teamSlugOrId}
          />
        )}
      </div>

      {/* Decision buttons */}
      <div className="flex items-center justify-center gap-6 p-6 border-t border-neutral-200 dark:border-neutral-800">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-sm text-neutral-500 min-w-[60px] text-center">
            {currentIndex + 1} / {files.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setCurrentIndex((i) => Math.min(i + 1, files.length - 1))
            }
            disabled={currentIndex === files.length - 1}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Main action buttons */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="lg"
            className={cn(
              "w-28 h-16 flex flex-col items-center gap-1",
              "border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950",
              currentFile?.decision === "changes_requested" &&
                "bg-red-100 dark:bg-red-900"
            )}
            onClick={() => handleDecision("changes_requested")}
          >
            <X className="w-6 h-6 text-red-500" />
            <span className="text-xs text-neutral-500">X / Left</span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="w-20 h-12 flex flex-col items-center gap-1"
            onClick={() => handleDecision("skipped")}
          >
            <SkipForward className="w-5 h-5 text-neutral-400" />
            <span className="text-xs text-neutral-500">S</span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className={cn(
              "w-28 h-16 flex flex-col items-center gap-1",
              "border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950",
              currentFile?.decision === "approved" &&
                "bg-green-100 dark:bg-green-900"
            )}
            onClick={() => handleDecision("approved")}
          >
            <Check className="w-6 h-6 text-green-500" />
            <span className="text-xs text-neutral-500">A / Right</span>
          </Button>
        </div>

        {/* Undo */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-5 h-5" />
        </Button>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="flex items-center justify-center gap-6 py-2 text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-900">
        <span>
          <kbd className="px-1 bg-neutral-200 dark:bg-neutral-700 rounded">
            A
          </kbd>{" "}
          or{" "}
          <kbd className="px-1 bg-neutral-200 dark:bg-neutral-700 rounded">
            Right
          </kbd>{" "}
          Approve
        </span>
        <span>
          <kbd className="px-1 bg-neutral-200 dark:bg-neutral-700 rounded">
            X
          </kbd>{" "}
          or{" "}
          <kbd className="px-1 bg-neutral-200 dark:bg-neutral-700 rounded">
            Left
          </kbd>{" "}
          Request Changes
        </span>
        <span>
          <kbd className="px-1 bg-neutral-200 dark:bg-neutral-700 rounded">
            S
          </kbd>{" "}
          Skip
        </span>
        <span>
          <kbd className="px-1 bg-neutral-200 dark:bg-neutral-700 rounded">
            J
          </kbd>
          /
          <kbd className="px-1 bg-neutral-200 dark:bg-neutral-700 rounded">
            K
          </kbd>{" "}
          Navigate
        </span>
        <span>
          <kbd className="px-1 bg-neutral-200 dark:bg-neutral-700 rounded">
            Ctrl+Z
          </kbd>{" "}
          Undo
        </span>
      </div>
    </div>
  );
}
