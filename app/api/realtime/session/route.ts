import { NextResponse } from 'next/server';
import {
  OPENAI_REALTIME_CLIENT_SECRET_CONFIG,
  OPENAI_REALTIME_CLIENT_SECRETS_URL,
  OPENAI_REALTIME_SESSION_TIMEOUT_MS,
} from '@/lib/ai/openai-config';
import { extractClientIp } from '@/app/api/chat/client-ip';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/app/api/chat/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ip = extractClientIp(req.headers);
  const rateCheck = checkRateLimit(ip, RATE_LIMIT_PRESETS.realtimeSession);
  if (rateCheck.limited) {
    return NextResponse.json(
      { error: 'Too many voice sessions. Please wait a moment.' },
      { status: 429 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 500 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_REALTIME_SESSION_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(OPENAI_REALTIME_CLIENT_SECRET_CONFIG),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Failed to create realtime session: ${text}` },
        { status: response.status }
      );
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Realtime session request failed: ${error.message}`
            : 'Realtime session request failed.',
      },
      { status: 500 }
    );
  }
}
