'use client';

import { type ReactNode } from 'react';
import { ApiKeyProvider, ApiKeyIndicator } from './api-key';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ApiKeyProvider>
      {children}
      <ApiKeyIndicator />
    </ApiKeyProvider>
  );
}
