import { createHmac } from 'node:crypto';
import OpenAI from 'openai';
import { OPENAI_CHAT_MAX_RETRIES, OPENAI_CHAT_TIMEOUT_MS } from './openai-config';

const PLACEHOLDER_API_KEYS = new Set([
  'your_openai_api_key_here',
  'your-openai-api-key-here',
  'replace_me',
  'replace-me',
]);

type OpenAIEnvironment = Readonly<Record<string, string | undefined>>;

export class OpenAIConfigurationError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured.');
    this.name = 'OpenAIConfigurationError';
  }
}

/**
 * Resolve the server credential at request time so a rotated deployment secret
 * is picked up without rebuilding the OpenAI client bundle.
 */
export function getOpenAIApiKey(env: OpenAIEnvironment = process.env): string {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey || PLACEHOLDER_API_KEYS.has(apiKey.toLowerCase())) {
    throw new OpenAIConfigurationError();
  }
  return apiKey;
}

export function createOpenAIClient(env: OpenAIEnvironment = process.env): OpenAI {
  return new OpenAI({
    apiKey: getOpenAIApiKey(env),
    timeout: OPENAI_CHAT_TIMEOUT_MS,
    maxRetries: OPENAI_CHAT_MAX_RETRIES,
  });
}

export function getOpenAIServiceFailure(
  error: unknown
): { status: number; message: string } | null {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return { status: 504, message: 'OpenAI took too long to respond. Please try again.' };
  }
  if (error instanceof OpenAI.APIError && error.status === 429) {
    return { status: 429, message: 'OpenAI is temporarily rate-limited. Please wait a moment.' };
  }
  if (
    error instanceof OpenAI.APIConnectionError ||
    (error instanceof OpenAI.APIError && typeof error.status === 'number' && error.status >= 500)
  ) {
    return { status: 502, message: 'OpenAI is temporarily unavailable. Please try again.' };
  }
  return null;
}

/**
 * Bind browser Realtime tokens to a stable pseudonymous safety identifier.
 * A keyed HMAC prevents enumeration of the small IPv4 address space.
 */
export function createOpenAISafetyIdentifier(
  clientIdentifier: string,
  env: OpenAIEnvironment = process.env
): string {
  const secret = env.OPENAI_SAFETY_ID_SECRET?.trim() || getOpenAIApiKey(env);
  return createHmac('sha256', secret)
    .update(clientIdentifier.trim() || 'unknown')
    .digest('hex');
}

export function isOpenAICredentialError(error: unknown): boolean {
  return error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403);
}
