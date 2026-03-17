import type { SkillCandidate, SkillStatus } from "./useOrchestrationRules";
import { SKILL_STATUS_BADGE_STYLES } from "./orchestration-rules-styles";

interface SkillsListProps {
  candidates: SkillCandidate[];
  emptyMessage: string;
}

export function SkillsList({ candidates, emptyMessage }: SkillsListProps) {
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {skill.title}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SKILL_STATUS_BADGE_STYLES[skill.status as SkillStatus] ?? SKILL_STATUS_BADGE_STYLES.candidate}`}>
              {skill.status}
            </span>
            <span className="text-[11px] text-neutral-400">
              {skill.recurrenceCount}x recurrence
            </span>
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
