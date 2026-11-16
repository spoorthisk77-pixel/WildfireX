import React from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

export function LoadingState({ message = 'Loading data from WildfireX API...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-[#DCE2DC] bg-white px-6 py-16 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#1B4332]" />
      <p className="mt-3 text-sm font-medium text-[#2A332E]">{message}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load module data',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#E5B8B4] bg-[#FDF6F6] p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#B42318]" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#7A1811]">{title}</h3>
          <p className="mt-1 text-sm text-[#6B2620]">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center rounded-md border border-[#B42318]/30 bg-white px-3 py-1.5 text-xs font-medium text-[#7A1811] hover:bg-[#FCECEB] transition-colors"
            >
              Retry Request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#DCE2DC] bg-white px-6 py-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[#EFF2EE] text-[#4B5851]">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-[#151B18]">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-lg text-sm leading-relaxed text-[#4B5851]">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center rounded-md bg-[#1B4332] px-4 py-2 text-xs font-medium text-white hover:bg-[#143326] transition-colors whitespace-nowrap shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
