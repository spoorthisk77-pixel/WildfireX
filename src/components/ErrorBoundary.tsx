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
        <div className="rounded-lg border border-[#E5B8B4] bg-[#FDF6F6] p-6 my-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#B42318] shrink-0 mt-0.5" />
            <div className="space-y-3">
              <h2 className="font-display text-base font-semibold text-[#7A1811]">
                Module Interface Recovered from Error
              </h2>
              <p className="text-sm text-[#6B2620]">{this.state.message}</p>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#B42318]/30 bg-white px-3.5 py-1.5 text-xs font-medium text-[#7A1811] hover:bg-[#FCECEB]"
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
