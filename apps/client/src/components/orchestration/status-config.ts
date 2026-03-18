import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Pause,
  Play,
} from "lucide-react";

export type TaskStatus = "pending" | "assigned" | "running" | "completed" | "failed" | "cancelled";

export const STATUS_CONFIG: Record<TaskStatus, { icon: React.ElementType; color: string; label: string; bgColor: string }> = {
  pending: { icon: Clock, color: "text-neutral-500", bgColor: "bg-neutral-100 dark:bg-neutral-800", label: "Pending" },
  assigned: { icon: Play, color: "text-blue-500", bgColor: "bg-blue-50 dark:bg-blue-900/20", label: "Assigned" },
  running: { icon: Loader2, color: "text-blue-500", bgColor: "bg-blue-100 dark:bg-blue-900/30", label: "Running" },
  completed: { icon: CheckCircle2, color: "text-green-500", bgColor: "bg-green-100 dark:bg-green-900/30", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-500", bgColor: "bg-red-100 dark:bg-red-900/30", label: "Failed" },
  cancelled: { icon: Pause, color: "text-neutral-400", bgColor: "bg-neutral-100 dark:bg-neutral-800", label: "Cancelled" },
};

/** Extended color config for graph/card rendering with bg, border, and dot classes. */
export const STATUS_GRAPH_COLORS: Record<TaskStatus, { bg: string; border: string; dot: string }> = {
  pending: { bg: "bg-neutral-50 dark:bg-neutral-800/50", border: "border-neutral-300 dark:border-neutral-600", dot: "bg-neutral-400" },
  assigned: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700", dot: "bg-blue-500" },
  running: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-400 dark:border-blue-600", dot: "bg-blue-500 animate-pulse" },
  completed: { bg: "bg-green-50 dark:bg-green-900/15", border: "border-green-300 dark:border-green-700", dot: "bg-green-500" },
  failed: { bg: "bg-red-50 dark:bg-red-900/15", border: "border-red-300 dark:border-red-700", dot: "bg-red-500" },
  cancelled: { bg: "bg-neutral-100 dark:bg-neutral-800", border: "border-neutral-300 dark:border-neutral-600", dot: "bg-neutral-400" },
};
