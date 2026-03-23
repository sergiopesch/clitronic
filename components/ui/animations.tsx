'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AnimationType } from '@/lib/ai/response-schema';

interface AnimateInProps {
  animation: AnimationType | undefined;
  delay?: number;
  children: ReactNode;
}

export function AnimateIn({ animation, delay = 0, children }: AnimateInProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const base = 'transition-all duration-200 ease-out';

  const hidden = {
    fadeIn: 'opacity-0',
    slideUp: 'opacity-0 translate-y-2',
    expand: 'opacity-0 scale-y-95 origin-top',
  };

  const shown = {
    fadeIn: 'opacity-100',
    slideUp: 'opacity-100 translate-y-0',
    expand: 'opacity-100 scale-y-100',
  };

  const type = animation ?? 'fadeIn';

  return (
    <div
      ref={ref}
      className={`${base} ${visible ? shown[type] : hidden[type]}`}
    >
      {children}
    </div>
  );
}

interface StaggerChildrenProps {
  animation: AnimationType | undefined;
  stagger?: number;
  children: ReactNode[];
}

export function StaggerChildren({ animation, stagger = 80, children }: StaggerChildrenProps) {
  return (
    <>
      {children.map((child, i) => (
        <AnimateIn key={i} animation={animation} delay={i * stagger}>
          {child}
        </AnimateIn>
      ))}
    </>
  );
}
