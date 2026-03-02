'use client';

import { createContext, useContext, useCallback, useState, useEffect, type ReactNode } from 'react';

type AuthSource = 'claude-code' | 'openai-codex' | null;

interface AuthProviderInfo {
  id: 'claude-code' | 'openai-codex';
  name: string;
  available: boolean;
  reason?: string;
  source?: string;
}

interface ApiKeyContextType {
  // Legacy fields kept for compatibility with older components.
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  clearApiKey: () => void;

  isConfigured: boolean;
  authSource: AuthSource;
  claudeCodeAvailable: boolean | null;
  codexAvailable: boolean | null;
  isCheckingClaudeCode: boolean;
  isCheckingAuth: boolean;
  providers: AuthProviderInfo[];
  refreshProviders: () => Promise<void>;
  connectClaudeCode: () => Promise<{ success: boolean; error?: string }>;
  connectOpenAICodex: () => Promise<{ success: boolean; error?: string }>;
}

const ApiKeyContext = createContext<ApiKeyContextType | null>(null);

const AUTH_SOURCE_KEY = 'clitronic_auth_source';
const LEGACY_API_KEY_STORAGE_KEY = 'clitronic_api_key';

function parseStoredAuthSource(value: string | null): AuthSource {
  if (value === 'claude-code' || value === 'openai-codex') {
    return value;
  }
  return null;
}

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [authSource, setAuthSourceState] = useState<AuthSource>(null);
  const [claudeCodeAvailable, setClaudeCodeAvailable] = useState<boolean | null>(null);
  const [codexAvailable, setCodexAvailable] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<AuthProviderInfo[]>([]);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  const setAuthSource = useCallback((source: AuthSource) => {
    if (source) {
      localStorage.setItem(AUTH_SOURCE_KEY, source);
    } else {
      localStorage.removeItem(AUTH_SOURCE_KEY);
    }

    // Remove legacy key material if it exists.
    localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
    setAuthSourceState(source);
    window.dispatchEvent(new Event('local-storage-update'));
  }, []);

  const refreshProviders = useCallback(async () => {
    setIsCheckingAuth(true);
    try {
      const res = await fetch('/api/auth/providers');
      const data = await res.json();
      const providerList = Array.isArray(data.providers)
        ? (data.providers as AuthProviderInfo[])
        : [];

      setProviders(providerList);

      const claude = providerList.find((provider) => provider.id === 'claude-code');
      const codex = providerList.find((provider) => provider.id === 'openai-codex');

      setClaudeCodeAvailable(claude?.available === true);
      setCodexAvailable(codex?.available === true);
    } catch {
      setProviders([]);
      setClaudeCodeAvailable(false);
      setCodexAvailable(false);
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    const storedAuthSource = parseStoredAuthSource(localStorage.getItem(AUTH_SOURCE_KEY));
    setAuthSourceState(storedAuthSource);
    void refreshProviders();
  }, [refreshProviders]);

  useEffect(() => {
    if (!authSource || providers.length === 0) return;

    const selected = providers.find((provider) => provider.id === authSource);
    if (selected && !selected.available) {
      setAuthSource(null);
    }
  }, [authSource, providers, setAuthSource]);

  const connectProvider = useCallback(
    async (provider: Exclude<AuthSource, null>) => {
      setIsCheckingAuth(true);
      try {
        const res = await fetch('/api/auth/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider }),
        });

        const data = await res.json();
        if (!data.success) {
          return {
            success: false,
            error: data.error || `Failed to connect ${provider}`,
          };
        }

        setAuthSource(provider);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to authenticate',
        };
      } finally {
        setIsCheckingAuth(false);
        await refreshProviders();
      }
    },
    [refreshProviders, setAuthSource]
  );

  const connectClaudeCode = useCallback(async () => {
    return connectProvider('claude-code');
  }, [connectProvider]);

  const connectOpenAICodex = useCallback(async () => {
    return connectProvider('openai-codex');
  }, [connectProvider]);

  const clearApiKey = useCallback(() => {
    setAuthSource(null);
  }, [setAuthSource]);

  const setApiKey = useCallback(
    (key: string | null) => {
      // Manual keys are intentionally disabled.
      if (key === null) {
        clearApiKey();
      }
    },
    [clearApiKey]
  );

  return (
    <ApiKeyContext.Provider
      value={{
        apiKey: null,
        setApiKey,
        clearApiKey,
        isConfigured: authSource !== null,
        authSource,
        claudeCodeAvailable,
        codexAvailable,
        isCheckingClaudeCode: isCheckingAuth,
        isCheckingAuth,
        providers,
        refreshProviders,
        connectClaudeCode,
        connectOpenAICodex,
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
