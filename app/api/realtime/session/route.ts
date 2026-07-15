import { NextResponse } from 'next/server';
import {
  OPENAI_REALTIME_CLIENT_SECRET_CONFIG,
  OPENAI_REALTIME_CLIENT_SECRETS_URL,
  OPENAI_REALTIME_SESSION_TIMEOUT_MS,
} from '@/lib/ai/openai-config';
import {
  createOpenAISafetyIdentifier,
  getOpenAIApiKey,
  OpenAIConfigurationError,
} from '@/lib/ai/openai-server';
import { extractClientIp } from '@/app/api/chat/client-ip';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/app/api/chat/rate-limit';
import { isTrustedBrowserRequest } from '@/app/api/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: Request) {
  if (!isTrustedBrowserRequest(req)) {
    return noStoreJson({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  const ip = extractClientIp(req.headers);
  const rateCheck = checkRateLimit(ip, RATE_LIMIT_PRESETS.realtimeSession);
  if (rateCheck.limited) {
    return noStoreJson({ error: 'Too many voice sessions. Please wait a moment.' }, 429);
  }

  let apiKey: string;
  try {
    apiKey = getOpenAIApiKey();
  } catch (error) {
    if (error instanceof OpenAIConfigurationError) {
      return noStoreJson({ error: 'OPENAI_API_KEY is not configured.' }, 503);
    }
    throw error;
  }
  const safetyIdentifier = createOpenAISafetyIdentifier(ip);

  try {
    const timeoutSignal = AbortSignal.timeout(OPENAI_REALTIME_SESSION_TIMEOUT_MS);
    const response = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyIdentifier,
      },
      body: JSON.stringify(OPENAI_REALTIME_CLIENT_SECRET_CONFIG),
      signal: AbortSignal.any([req.signal, timeoutSignal]),
    });

    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) {
        return noStoreJson({ error: 'OpenAI rejected the configured server credential.' }, 502);
      }
      if (response.status === 429) {
        return noStoreJson({ error: 'OpenAI rate-limited the realtime session request.' }, 429);
      }
      return noStoreJson({ error: 'OpenAI could not create the realtime session.' }, 502);
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return noStoreJson({ error: 'OpenAI returned an invalid realtime session.' }, 502);
    }
    const value = (payload as { value?: unknown }).value;
    if (typeof value !== 'string' || value.length === 0) {
      return noStoreJson({ error: 'OpenAI returned an invalid realtime session.' }, 502);
    }
    const expiresAt = (payload as { expires_at?: unknown }).expires_at;
    return noStoreJson({
      value,
      ...(typeof expiresAt === 'number' && Number.isFinite(expiresAt)
        ? { expires_at: expiresAt }
        : {}),
    });
  } catch (error) {
    if (req.signal.aborted) {
      return new Response(null, { status: 499, headers: { 'Cache-Control': 'no-store' } });
    }
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return noStoreJson({ error: 'Realtime session request timed out.' }, 504);
    }
    return noStoreJson({ error: 'Realtime session request failed.' }, 502);
  }
}
