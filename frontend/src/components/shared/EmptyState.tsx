import React from "react";
import { LucideIcon, Sparkles } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`p-8 lg:p-12 text-center rounded-bento border border-dashed border-border bg-surface-muted/40 flex flex-col items-center justify-center space-y-3 ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center justify-center text-content-muted">
        <Icon className="w-7 h-7 text-primary/70 stroke-[1.5]" />
      </div>

      <div className="max-w-md space-y-1">
        <h4 className="font-heading font-bold text-sm text-content-primary tracking-tight">
          {title}
        </h4>
        <p className="text-xs text-content-muted leading-relaxed">
          {description}
        </p>
      </div>

      {(actionText || secondaryActionText) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          {actionText && onAction && (
            <button
              onClick={onAction}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {actionText}
            </button>
          )}

          {secondaryActionText && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-content-secondary hover:text-content-primary text-xs font-semibold rounded-xl border border-border shadow-2xs transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>{secondaryActionText}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
