import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export type CodexCredentialsErrorCode =
  | 'CREDENTIALS_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'ACCESS_TOKEN_MISSING';

export class CodexCredentialsError extends Error {
  public readonly code: CodexCredentialsErrorCode;

  constructor(message: string, code: CodexCredentialsErrorCode) {
    super(message);
    this.name = 'CodexCredentialsError';
    this.code = code;
  }
}

interface CodexAuthFile {
  auth_mode?: unknown;
  OPENAI_API_KEY?: unknown;
  tokens?: {
    access_token?: unknown;
  };
}

const CODEX_AUTH_PATH = '.codex/auth.json';

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractApiKey(openAiApiKeyField: unknown): string | null {
  const direct = nonEmptyString(openAiApiKeyField);
  if (direct) return direct;

  if (!openAiApiKeyField || typeof openAiApiKeyField !== 'object') {
    return null;
  }

  const record = openAiApiKeyField as Record<string, unknown>;
  const candidates = ['apiKey', 'api_key', 'value', 'key', 'token'];

  for (const candidate of candidates) {
    const value = nonEmptyString(record[candidate]);
    if (value) return value;
  }

  return null;
}

async function readCodexAuthFile(): Promise<CodexAuthFile> {
  const authPath = path.join(os.homedir(), CODEX_AUTH_PATH);

  let content: string;
  try {
    content = await fs.readFile(authPath, 'utf-8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        throw new CodexCredentialsError('Codex auth file not found', 'CREDENTIALS_NOT_FOUND');
      }
    }
    throw error;
  }

  try {
    return JSON.parse(content) as CodexAuthFile;
  } catch {
    throw new CodexCredentialsError('Failed to parse Codex auth file', 'PARSE_ERROR');
  }
}

export async function checkCodexCredentialsAvailable(): Promise<
  | { available: true; authMode: string; source: 'api-key' | 'access-token' }
  | { available: false; reason: string }
> {
  try {
    const auth = await readCodexAuthFile();
    const authMode = nonEmptyString(auth.auth_mode) ?? 'unknown';

    const apiKey = extractApiKey(auth.OPENAI_API_KEY);
    if (apiKey) {
      return { available: true, authMode, source: 'api-key' };
    }

    const accessToken = nonEmptyString(auth.tokens?.access_token);
    if (accessToken) {
      return { available: true, authMode, source: 'access-token' };
    }

    return {
      available: false,
      reason: 'Codex credentials are present but no usable token was found',
    };
  } catch (error) {
    if (error instanceof CodexCredentialsError) {
      return { available: false, reason: error.message };
    }

    return {
      available: false,
      reason: 'Unexpected error checking Codex credentials',
    };
  }
}

export async function getCodexAccessToken(): Promise<string> {
  const auth = await readCodexAuthFile();

  const apiKey = extractApiKey(auth.OPENAI_API_KEY);
  if (apiKey) return apiKey;

  const accessToken = nonEmptyString(auth.tokens?.access_token);
  if (accessToken) return accessToken;

  throw new CodexCredentialsError(
    'Codex credentials do not contain an access token',
    'ACCESS_TOKEN_MISSING'
  );
}
