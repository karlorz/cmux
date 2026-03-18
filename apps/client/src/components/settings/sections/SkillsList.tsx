import { Check, X, Loader2 } from "lucide-react";
import type { SkillCandidate, SkillStatus } from "./useOrchestrationRules";
import { SKILL_STATUS_BADGE_STYLES } from "./orchestration-rules-styles";

interface SkillsListProps {
  candidates: SkillCandidate[];
  emptyMessage: string;
  onUpdateStatus?: (skillId: string, status: "approved" | "rejected") => void;
  isUpdating?: boolean;
}

export function SkillsList({ candidates, emptyMessage, onUpdateStatus, isUpdating }: SkillsListProps) {
  if (candidates.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-neutral-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {candidates.map((skill) => (
        <div key={skill._id} className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                {skill.title}
              </span>
              <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SKILL_STATUS_BADGE_STYLES[skill.status as SkillStatus] ?? SKILL_STATUS_BADGE_STYLES.candidate}`}>
                {skill.status}
              </span>
              <span className="shrink-0 text-[11px] text-neutral-400">
                {skill.recurrenceCount}x
              </span>
            </div>
            {onUpdateStatus && skill.status === "candidate" && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onUpdateStatus(skill._id, "approved")}
                  disabled={isUpdating}
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-900/20"
                  title="Approve"
                >
                  {isUpdating ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStatus(skill._id, "rejected")}
                  disabled={isUpdating}
                  className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                  title="Reject"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
            {skill.summary}
          </p>
          {skill.patternKey && (
            <span className="mt-1 inline-block text-[10px] font-mono text-neutral-400">
              {skill.patternKey}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
