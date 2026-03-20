import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  /** Component name for error logging */
  name?: string;
  /** Callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component that catches JavaScript errors in child components.
 * Displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { name, onError } = this.props;
    console.error(`[ErrorBoundary${name ? `:${name}` : ""}] Caught error:`, error, errorInfo);
    onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          name={this.props.name}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Default error fallback UI
 */
export function ErrorFallback({
  error,
  name,
  onRetry,
  className,
}: {
  error?: Error | null;
  name?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/30 ${className ?? ""}`}
    >
      <AlertTriangle className="size-8 text-red-500" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          {name ? `Failed to load ${name}` : "Something went wrong"}
        </p>
        {error?.message && (
          <p className="text-xs text-red-600 dark:text-red-500">
            {error.message}
          </p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900"
        >
          <RefreshCw className="size-3" />
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Compact error fallback for inline/card components
 */
export function CompactErrorFallback({
  name,
  onRetry,
}: {
  name?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-neutral-500 dark:text-neutral-400">
      <AlertTriangle className="size-4 text-red-500" />
      <span className="text-xs">
        {name ? `Failed to load ${name}` : "Error loading content"}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          Retry
        </button>
      )}
    </div>
  );
}
