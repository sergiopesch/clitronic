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

const ANTHROPIC_API_KEY_ENV_NAMES = ['ANTHROPIC_API_KEY', 'anthropic_api_key', 'ANTHROPIC_KEY'];
const ANTHROPIC_AUTH_TOKEN_ENV_NAMES = ['ANTHROPIC_AUTH_TOKEN', 'anthropic_auth_token'];
const OPENAI_API_KEY_ENV_NAMES = ['OPENAI_API_KEY', 'openai_api_key', 'OPENAI_KEY'];
const OPENAI_ACCESS_TOKEN_ENV_NAMES = ['OPENAI_ACCESS_TOKEN', 'openai_access_token'];

function envValue(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function envValueAny(names: readonly string[]): string | null {
  for (const name of names) {
    const value = envValue(name);
    if (value) return value;
  }
  return null;
}

function isHostedRuntime(): boolean {
  return process.env.VERCEL === '1' || process.env.AWS_EXECUTION_ENV !== undefined;
}

export function parseAuthProvider(provider: string | null | undefined): AuthProviderId | null {
  if (provider === 'claude-code' || provider === 'openai-codex') {
    return provider;
  }

  return null;
}

async function getClaudeProviderAvailability(): Promise<AuthProviderAvailability> {
  if (envValueAny(ANTHROPIC_API_KEY_ENV_NAMES)) {
    return {
      id: 'claude-code',
      name: 'Claude Code',
      available: true,
      source: 'env-api-key',
    };
  }

  if (envValueAny(ANTHROPIC_AUTH_TOKEN_ENV_NAMES)) {
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
    reason: isHostedRuntime() ? 'No server Anthropic credentials configured' : check.reason,
  };
}

async function getCodexProviderAvailability(): Promise<AuthProviderAvailability> {
  if (envValueAny(OPENAI_API_KEY_ENV_NAMES)) {
    return {
      id: 'openai-codex',
      name: 'OpenAI Codex',
      available: true,
      source: 'env-api-key',
    };
  }

  if (envValueAny(OPENAI_ACCESS_TOKEN_ENV_NAMES)) {
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
    reason: isHostedRuntime() ? 'No server OpenAI credentials configured' : check.reason,
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
  const envApiKey = envValueAny(ANTHROPIC_API_KEY_ENV_NAMES);
  if (envApiKey) {
    return {
      method: 'apiKey',
      token: envApiKey,
      source: 'env-api-key',
    };
  }

  const envAuthToken = envValueAny(ANTHROPIC_AUTH_TOKEN_ENV_NAMES);
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

  const envApiKey = envValueAny(OPENAI_API_KEY_ENV_NAMES);
  if (envApiKey) {
    return {
      token: envApiKey,
      source: 'env-api-key',
    };
  }

  const envAccessToken = envValueAny(OPENAI_ACCESS_TOKEN_ENV_NAMES);
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
