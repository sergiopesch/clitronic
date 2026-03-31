'use client';

import type { ReactNode } from 'react';
import type { AnimationType } from '@/lib/ai/response-schema';

interface AnimateInProps {
  animation: AnimationType | undefined;
  delay?: number;
  children: ReactNode;
}

export function AnimateIn({ animation, delay = 0, children }: AnimateInProps) {
  const type = animation ?? 'fadeIn';

  const className =
    type === 'expand'
      ? 'animate-card-expand'
      : type === 'slideUp'
        ? 'animate-card-enter'
        : 'animate-fade-in-up';

  return (
    <div className={className} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
