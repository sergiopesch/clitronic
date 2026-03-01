'use client';

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

type AuthSource = 'manual' | 'claude-code' | null;

interface ApiKeyContextType {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  isConfigured: boolean;
  clearApiKey: () => void;
  authSource: AuthSource;
  claudeCodeAvailable: boolean | null;
  isCheckingClaudeCode: boolean;
  useClaudeCodeAuth: () => Promise<{ success: boolean; error?: string }>;
}

const ApiKeyContext = createContext<ApiKeyContextType | null>(null);

const STORAGE_KEY = 'clitronic_api_key';
const AUTH_SOURCE_KEY = 'clitronic_auth_source';

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
  const [authSource, setAuthSourceState] = useState<AuthSource>(null);
  const [claudeCodeAvailable, setClaudeCodeAvailable] = useState<boolean | null>(null);
  const [isCheckingClaudeCode, setIsCheckingClaudeCode] = useState(false);

  // Load auth source from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(AUTH_SOURCE_KEY);
    if (stored === 'manual' || stored === 'claude-code') {
      setAuthSourceState(stored);
    }
  }, []);

  // Check Claude Code availability on mount
  useEffect(() => {
    const checkClaudeCode = async () => {
      try {
        const res = await fetch('/api/claude-code-auth');
        const data = await res.json();
        setClaudeCodeAvailable(data.available === true);
      } catch {
        setClaudeCodeAvailable(false);
      }
    };
    checkClaudeCode();
  }, []);

  const setApiKey = useCallback((key: string | null) => {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
      localStorage.setItem(AUTH_SOURCE_KEY, 'manual');
      setAuthSourceState('manual');
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(AUTH_SOURCE_KEY);
      setAuthSourceState(null);
    }
    window.dispatchEvent(new Event('local-storage-update'));
  }, []);

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AUTH_SOURCE_KEY);
    setAuthSourceState(null);
    window.dispatchEvent(new Event('local-storage-update'));
  }, []);

  const useClaudeCodeAuth = useCallback(async () => {
    setIsCheckingClaudeCode(true);
    try {
      const res = await fetch('/api/claude-code-auth', { method: 'POST' });
      const data = await res.json();

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to get Claude Code credentials' };
      }

      // Store the token
      localStorage.setItem(STORAGE_KEY, data.token);
      localStorage.setItem(AUTH_SOURCE_KEY, 'claude-code');
      setAuthSourceState('claude-code');
      window.dispatchEvent(new Event('local-storage-update'));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to authenticate',
      };
    } finally {
      setIsCheckingClaudeCode(false);
    }
  }, []);

  return (
    <ApiKeyContext.Provider
      value={{
        apiKey,
        setApiKey,
        isConfigured: !!apiKey,
        clearApiKey,
        authSource,
        claudeCodeAvailable,
        isCheckingClaudeCode,
        useClaudeCodeAuth,
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
