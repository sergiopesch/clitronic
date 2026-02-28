'use client';

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

interface ApiKeyContextType {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  isConfigured: boolean;
  clearApiKey: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | null>(null);

const STORAGE_KEY = 'clitronic_api_key';

// Custom hook for localStorage with SSR support
function useLocalStorageKey() {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener('storage', callback);
    // Also listen for custom events for same-tab updates
    window.addEventListener('local-storage-update', callback);
    return () => {
      window.removeEventListener('storage', callback);
      window.removeEventListener('local-storage-update', callback);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    return localStorage.getItem(STORAGE_KEY);
  }, []);

  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const apiKey = useLocalStorageKey();

  const setApiKey = useCallback((key: string | null) => {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    // Dispatch custom event to trigger re-render in same tab
    window.dispatchEvent(new Event('local-storage-update'));
  }, []);

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('local-storage-update'));
  }, []);

  return (
    <ApiKeyContext.Provider
      value={{
        apiKey,
        setApiKey,
        isConfigured: !!apiKey,
        clearApiKey,
      }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const context = useContext(ApiKeyContext);
  if (!context) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return context;
}
