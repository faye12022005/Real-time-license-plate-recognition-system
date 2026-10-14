import React from "react";

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function BentoCard({
  children,
  className = "",
  title,
  subtitle,
  action,
  icon,
}: BentoCardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-bento p-5 lg:p-6 shadow-bento hover:shadow-bento-hover hover:border-slate-300 transition-all duration-200 flex flex-col justify-between ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="p-2 rounded-xl bg-primary-light text-primary border border-primary-border">
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h3 className="font-heading font-bold text-sm tracking-tight text-content-primary">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[11px] text-content-muted font-medium mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}
