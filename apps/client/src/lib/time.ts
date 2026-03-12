/**
 * Format a duration in milliseconds to a human-readable string.
 * @example formatDuration(7200000) // "2h 0m"
 * @example formatDuration(90000) // "1m"
 */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format a timestamp as time only (HH:MM).
 */
export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Format a timestamp as short date (Mon DD).
 */
export function formatShortDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatTimeAgo(input?: number | string): string {
  if (!input) return "";
  const timestamp = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(timestamp)) return "";

  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
