import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * WHY a class-based ErrorBoundary?
 * React 18 does not yet support useErrorBoundary hook for rendering fallbacks.
 * Class components with getDerivedStateFromError() remain the only way to
 * catch render-phase errors (not async errors) and show a fallback UI.
 * Hooks work for imperative errors; class components for render errors.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // In production: report to Sentry/Datadog
    console.error("React render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} className="text-danger" />
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-2">Something went wrong</h3>
          <p className="text-sm text-text-secondary mb-4">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-primary mx-auto"
          >
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }
}
