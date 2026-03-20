import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton for SessionActivityCard - shows 6 stat items
 */
export function SessionActivityCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-neutral-200 dark:border-neutral-800 p-4", className)}>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for FileChangeHeatmap - shows directory groups with file bars
 */
export function FileChangeHeatmapSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-neutral-200 dark:border-neutral-800 p-4", className)}>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, groupIndex) => (
          <div key={groupIndex} className="space-y-1">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="ml-6 space-y-1">
              {Array.from({ length: 3 }).map((_, fileIndex) => (
                <div key={fileIndex} className="flex items-center gap-2">
                  <Skeleton className="size-3.5" />
                  <Skeleton className="h-3 flex-1 max-w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for SessionTimeline - shows timeline events
 */
export function SessionTimelineSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-neutral-200 dark:border-neutral-800 p-4", className)}>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="relative flex gap-3">
            {/* Timeline line */}
            {i < 3 && (
              <div className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-0.5 bg-neutral-200 dark:bg-neutral-700" />
            )}
            {/* Icon placeholder */}
            <Skeleton className="relative z-10 size-8 shrink-0 rounded-full" />
            {/* Content */}
            <div className="flex-1 space-y-1 pb-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for ActivityStream - shows activity event list
 */
export function ActivityStreamSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3 w-full max-w-md" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
