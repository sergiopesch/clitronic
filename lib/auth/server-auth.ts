import {
  checkCredentialsAvailable,
  getAccessToken,
  ClaudeCodeCredentialsError,
} from '@/lib/auth/claude-code-credentials';
import {
  checkCodexCredentialsAvailable,
  getCodexAccessToken,
  CodexCredentialsError,
} from '@/lib/auth/codex-credentials';

export type AuthProviderId = 'claude-code' | 'openai-codex';

export interface AuthProviderAvailability {
  id: AuthProviderId;
  name: string;
  available: boolean;
  reason?: string;
  source?: string;
}

export interface ResolvedAnthropicAuth {
  method: 'apiKey' | 'authToken';
  token: string;
  source: 'env-api-key' | 'env-auth-token' | 'claude-code';
}

export interface ResolvedOpenAIAuth {
  token: string;
  source:
    | 'request-header'
    | 'env-api-key'
    | 'env-access-token'
    | 'codex-api-key'
    | 'codex-access-token';
}

function envValue(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseAuthProvider(provider: string | null | undefined): AuthProviderId | null {
  if (provider === 'claude-code' || provider === 'openai-codex') {
    return provider;
  }

  return null;
}

async function getClaudeProviderAvailability(): Promise<AuthProviderAvailability> {
  if (envValue('ANTHROPIC_API_KEY')) {
    return {
      id: 'claude-code',
      name: 'Claude Code',
      available: true,
      source: 'env-api-key',
    };
  }

  if (envValue('ANTHROPIC_AUTH_TOKEN')) {
    return {
      id: 'claude-code',
      name: 'Claude Code',
      available: true,
      source: 'env-auth-token',
    };
  }

  const check = await checkCredentialsAvailable();
  if (check.available) {
    return {
      id: 'claude-code',
      name: 'Claude Code',
      available: true,
      source: 'claude-code',
    };
  }

  return {
    id: 'claude-code',
    name: 'Claude Code',
    available: false,
    reason: check.reason,
  };
}

async function getCodexProviderAvailability(): Promise<AuthProviderAvailability> {
  if (envValue('OPENAI_API_KEY')) {
    return {
      id: 'openai-codex',
      name: 'OpenAI Codex',
      available: true,
      source: 'env-api-key',
    };
  }

  if (envValue('OPENAI_ACCESS_TOKEN')) {
    return {
      id: 'openai-codex',
      name: 'OpenAI Codex',
      available: true,
      source: 'env-access-token',
    };
  }

  const check = await checkCodexCredentialsAvailable();
  if (check.available) {
    return {
      id: 'openai-codex',
      name: 'OpenAI Codex',
      available: true,
      source: check.source === 'api-key' ? 'codex-api-key' : 'codex-access-token',
    };
  }

  return {
    id: 'openai-codex',
    name: 'OpenAI Codex',
    available: false,
    reason: check.reason,
  };
}

export async function getAuthProviderAvailability(): Promise<AuthProviderAvailability[]> {
  const [claude, codex] = await Promise.all([
    getClaudeProviderAvailability(),
    getCodexProviderAvailability(),
  ]);

  return [claude, codex];
}

export async function resolveAnthropicAuth(): Promise<ResolvedAnthropicAuth> {
  const envApiKey = envValue('ANTHROPIC_API_KEY');
  if (envApiKey) {
    return {
      method: 'apiKey',
      token: envApiKey,
      source: 'env-api-key',
    };
  }

  const envAuthToken = envValue('ANTHROPIC_AUTH_TOKEN');
  if (envAuthToken) {
    return {
      method: 'authToken',
      token: envAuthToken,
      source: 'env-auth-token',
    };
  }

  try {
    const token = await getAccessToken();
    return {
      method: 'authToken',
      token,
      source: 'claude-code',
    };
  } catch (error) {
    if (error instanceof ClaudeCodeCredentialsError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

export async function resolveOpenAIAuth(headerToken?: string | null): Promise<ResolvedOpenAIAuth> {
  const requestToken = headerToken?.trim();
  if (requestToken) {
    return {
      token: requestToken,
      source: 'request-header',
    };
  }

  const envApiKey = envValue('OPENAI_API_KEY');
  if (envApiKey) {
    return {
      token: envApiKey,
      source: 'env-api-key',
    };
  }

  const envAccessToken = envValue('OPENAI_ACCESS_TOKEN');
  if (envAccessToken) {
    return {
      token: envAccessToken,
      source: 'env-access-token',
    };
  }

  try {
    const codexToken = await getCodexAccessToken();
    const codexCheck = await checkCodexCredentialsAvailable();
    const source: ResolvedOpenAIAuth['source'] =
      codexCheck.available && codexCheck.source === 'api-key'
        ? 'codex-api-key'
        : 'codex-access-token';

    return {
      token: codexToken,
      source,
    };
  } catch (error) {
    if (error instanceof CodexCredentialsError) {
      throw new Error(error.message);
    }
    throw error;
  }
}
