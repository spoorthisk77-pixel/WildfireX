import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected interface rendering error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-white p-6 my-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-slate-900">
                Interface Recovered from Unexpected Error
              </h2>
              <p className="text-sm text-slate-600">{this.state.message}</p>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reload View</span>
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
