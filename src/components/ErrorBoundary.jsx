import React from 'react';

/* Catches render errors in children. Shows a recoverable error card with
 * the error message so one bad row/section can't kill the whole app.
 *
 * Optional `resetKey` prop: when it changes between renders, the boundary
 * auto-clears its error state. Useful for wrapping per-tab so switching
 * tabs effectively "retries" and doesn't leave stale error UI. */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    /* eslint-disable no-console */
    console.error('ErrorBoundary caught:', error, info);
    /* eslint-enable no-console */
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-2 p-5 border border-red-200 dark:border-red-900 rounded-lg bg-red-50 dark:bg-red-950/30">
          <div className="font-semibold text-red-800 dark:text-red-300 mb-2">
            Something went wrong
          </div>
          <div className="text-[13px] text-gray-600 dark:text-slate-400 mb-3 font-mono break-words">
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="text-xs px-3 py-1.5 font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
