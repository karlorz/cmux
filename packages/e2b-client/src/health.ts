/**
 * Health monitoring for E2B sandbox connections
 */

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResult {
  status: HealthStatus;
  latencyMs: number;
  timestamp: string;
  error?: string;
}

export interface HealthMonitorConfig {
  /** Interval between health checks in ms (default: 30000) */
  checkIntervalMs?: number;
  /** Timeout for health check in ms (default: 10000) */
  checkTimeoutMs?: number;
  /** Number of consecutive failures before marking unhealthy (default: 3) */
  unhealthyThreshold?: number;
  /** Number of consecutive successes to recover from unhealthy (default: 2) */
  recoveryThreshold?: number;
  /** Latency threshold for degraded status in ms (default: 5000) */
  degradedLatencyMs?: number;
  /** Callback when health status changes */
  onStatusChange?: (oldStatus: HealthStatus, newStatus: HealthStatus, result: HealthCheckResult) => void;
}

export interface HealthStats {
  status: HealthStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalChecks: number;
  totalFailures: number;
  averageLatencyMs: number;
  lastCheck: HealthCheckResult | null;
  uptime: number; // percentage
}

const DEFAULT_CONFIG: Required<Omit<HealthMonitorConfig, 'onStatusChange'>> = {
  checkIntervalMs: 30000,
  checkTimeoutMs: 10000,
  unhealthyThreshold: 3,
  recoveryThreshold: 2,
  degradedLatencyMs: 5000,
};

/**
 * Health monitor for E2B sandbox connections
 */
export class E2BHealthMonitor {
  private config: Required<Omit<HealthMonitorConfig, 'onStatusChange'>>;
  private onStatusChange?: HealthMonitorConfig['onStatusChange'];
  private status: HealthStatus = "healthy";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private totalChecks = 0;
  private totalFailures = 0;
  private totalLatencyMs = 0;
  private lastCheck: HealthCheckResult | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private checkFn: () => Promise<void>;

  constructor(
    checkFn: () => Promise<void>,
    config: HealthMonitorConfig = {}
  ) {
    this.checkFn = checkFn;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onStatusChange = config.onStatusChange;
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.intervalId !== null) {
      return; // Already running
    }

    // Run initial check
    this.runCheck();

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.runCheck();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Run a single health check
   */
  async runCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Health check timeout")), this.config.checkTimeoutMs);
      });

      // Race the check against timeout
      await Promise.race([this.checkFn(), timeoutPromise]);

      const latencyMs = Date.now() - startTime;
      result = {
        status: latencyMs > this.config.degradedLatencyMs ? "degraded" : "healthy",
        latencyMs,
        timestamp: new Date().toISOString(),
      };

      this.recordSuccess(result);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      result = {
        status: "unhealthy",
        latencyMs,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };

      this.recordFailure(result);
    }

    this.lastCheck = result;
    this.totalChecks++;
    this.totalLatencyMs += result.latencyMs;

    return result;
  }

  private recordSuccess(result: HealthCheckResult): void {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;

    const oldStatus = this.status;

    // Update status based on latency
    if (result.latencyMs > this.config.degradedLatencyMs) {
      this.status = "degraded";
    } else if (this.status === "unhealthy" && this.consecutiveSuccesses >= this.config.recoveryThreshold) {
      this.status = "healthy";
    } else if (this.status === "degraded" && this.consecutiveSuccesses >= this.config.recoveryThreshold) {
      this.status = "healthy";
    }

    if (oldStatus !== this.status && this.onStatusChange) {
      this.onStatusChange(oldStatus, this.status, result);
    }
  }

  private recordFailure(result: HealthCheckResult): void {
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures++;
    this.totalFailures++;

    const oldStatus = this.status;

    if (this.consecutiveFailures >= this.config.unhealthyThreshold) {
      this.status = "unhealthy";
    } else if (this.status === "healthy") {
      this.status = "degraded";
    }

    if (oldStatus !== this.status && this.onStatusChange) {
      this.onStatusChange(oldStatus, this.status, result);
    }
  }

  /**
   * Get current health status
   */
  getStatus(): HealthStatus {
    return this.status;
  }

  /**
   * Get detailed health statistics
   */
  getStats(): HealthStats {
    return {
      status: this.status,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalChecks: this.totalChecks,
      totalFailures: this.totalFailures,
      averageLatencyMs: this.totalChecks > 0 ? Math.round(this.totalLatencyMs / this.totalChecks) : 0,
      lastCheck: this.lastCheck,
      uptime: this.totalChecks > 0
        ? Math.round(((this.totalChecks - this.totalFailures) / this.totalChecks) * 100)
        : 100,
    };
  }

  /**
   * Check if service is available (healthy or degraded)
   */
  isAvailable(): boolean {
    return this.status !== "unhealthy";
  }

  /**
   * Reset health monitor state
   */
  reset(): void {
    this.status = "healthy";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.totalChecks = 0;
    this.totalFailures = 0;
    this.totalLatencyMs = 0;
    this.lastCheck = null;
  }
}

/**
 * Create a health check function for E2B API
 */
export function createE2BHealthCheck(apiKey: string): () => Promise<void> {
  return async () => {
    // Simple health check: list sandboxes (lightweight API call)
    const response = await fetch("https://api.e2b.dev/sandboxes", {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`E2B API returned ${response.status}`);
    }
  };
}
