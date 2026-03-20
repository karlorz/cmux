/**
 * Alerting System for cmux Observability
 *
 * Provides typed alert definitions, severity levels, and alert creation utilities.
 * Alerts are stored in Convex and displayed via AlertBanner in the UI.
 */

export type AlertSeverity = "info" | "warning" | "error" | "critical";

export type AlertCategory =
  | "sandbox"
  | "provider"
  | "orchestration"
  | "auth"
  | "system";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  resolvedAt?: number;
  acknowledgedAt?: number;
  teamId: string;
  userId?: string;
  traceId?: string;
}

export interface AlertInput {
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  teamId: string;
  userId?: string;
  traceId?: string;
}

/**
 * Alert severity configuration for UI display
 */
export const ALERT_SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    icon: string;
  }
> = {
  info: {
    label: "Info",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    icon: "info",
  },
  warning: {
    label: "Warning",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/30",
    borderColor: "border-yellow-200 dark:border-yellow-800",
    icon: "alert-triangle",
  },
  error: {
    label: "Error",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-red-200 dark:border-red-800",
    icon: "x-circle",
  },
  critical: {
    label: "Critical",
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-100 dark:bg-red-900/40",
    borderColor: "border-red-300 dark:border-red-700",
    icon: "alert-octagon",
  },
};

/**
 * Generate a unique alert ID
 */
export function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create an alert object from input
 */
export function createAlert(input: AlertInput): Alert {
  return {
    id: generateAlertId(),
    ...input,
    createdAt: Date.now(),
  };
}

/**
 * Pre-defined alert templates for common scenarios
 */
export const AlertTemplates = {
  sandboxSpawnFailed: (
    teamId: string,
    errorMessage: string,
    metadata?: Record<string, unknown>
  ): AlertInput => ({
    severity: "error",
    category: "sandbox",
    title: "Sandbox spawn failed",
    message: errorMessage,
    teamId,
    metadata,
  }),

  sandboxTimeout: (
    teamId: string,
    sandboxId: string,
    timeoutMinutes: number
  ): AlertInput => ({
    severity: "warning",
    category: "sandbox",
    title: "Sandbox timed out",
    message: `Sandbox ${sandboxId} exceeded ${timeoutMinutes} minute timeout`,
    teamId,
    metadata: { sandboxId, timeoutMinutes },
  }),

  providerDegraded: (
    teamId: string,
    providerName: string,
    healthScore: number
  ): AlertInput => ({
    severity: "warning",
    category: "provider",
    title: `Provider degraded: ${providerName}`,
    message: `Provider health dropped to ${healthScore}%. Some operations may be slow or fail.`,
    teamId,
    metadata: { providerName, healthScore },
  }),

  providerDown: (teamId: string, providerName: string): AlertInput => ({
    severity: "critical",
    category: "provider",
    title: `Provider unavailable: ${providerName}`,
    message: `Provider ${providerName} is not responding. Tasks may fail until service is restored.`,
    teamId,
    metadata: { providerName },
  }),

  orchestrationTaskFailed: (
    teamId: string,
    taskId: string,
    errorMessage: string
  ): AlertInput => ({
    severity: "error",
    category: "orchestration",
    title: "Orchestration task failed",
    message: errorMessage,
    teamId,
    metadata: { taskId },
  }),

  authTokenExpired: (teamId: string, provider: string): AlertInput => ({
    severity: "warning",
    category: "auth",
    title: `${provider} authentication expired`,
    message: `Your ${provider} OAuth token has expired. Please re-authenticate to continue.`,
    teamId,
    metadata: { provider },
  }),

  slaViolation: (
    teamId: string,
    metric: string,
    threshold: number,
    actual: number
  ): AlertInput => ({
    severity: "warning",
    category: "system",
    title: `SLA violation: ${metric}`,
    message: `${metric} exceeded threshold. Expected: <${threshold}ms, Actual: ${actual}ms`,
    teamId,
    metadata: { metric, threshold, actual },
  }),
};
