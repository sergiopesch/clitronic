'use client';

import type { ReactNode } from 'react';

export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="border-border bg-surface-2/70 text-text-muted inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-mono text-[10px]">
      {children}
    </span>
  );
}

export function DisclosureToggle({
  expanded,
  hiddenCount,
  itemSingular,
  itemPlural,
  onClick,
}: {
  expanded: boolean;
  hiddenCount: number;
  itemSingular: string;
  itemPlural: string;
  onClick: () => void;
}) {
  if (hiddenCount <= 0) return null;

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
      className="border-border text-accent hover:bg-surface-2/50 flex w-full items-center justify-center gap-1.5 border-t px-4 py-2.5 text-[11px] font-medium transition sm:px-5 sm:text-xs"
    >
      {expanded
        ? `Show fewer ${itemPlural}`
        : `Show ${hiddenCount} more ${hiddenCount === 1 ? itemSingular : itemPlural}`}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
      >
        <polyline points="3,4.5 6,7.5 9,4.5" />
      </svg>
    </button>
  );
}

export function CardHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  meta,
  action,
  className = '',
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-border border-b px-4 py-3.5 sm:px-5 sm:py-4 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon}
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-accent/75 text-[10px] tracking-wider uppercase">{eyebrow}</div>
            )}
            <h3 className="text-text-primary text-[15px] leading-snug font-semibold break-words sm:text-lg">
              {title}
            </h3>
            {subtitle && (
              <p className="text-text-muted mt-1 text-[12px] leading-relaxed sm:text-sm">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {(meta || action) && (
          <div className="flex shrink-0 items-center gap-2 self-start sm:pt-0.5">
            {meta}
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
