import { NextResponse } from 'next/server';
import { extractClientIp } from '@/app/api/chat/client-ip';
import { checkRateLimit } from '@/app/api/chat/rate-limit';
import { isTrustedBrowserRequest } from '@/app/api/request-security';
import {
  OPENAI_SPEECH_MAX_CHARACTERS,
  OPENAI_SPEECH_MODEL,
  OPENAI_SPEECH_VOICE,
} from '@/lib/ai/openai-config';
import {
  createOpenAIClient,
  createOpenAISafetyIdentifier,
  getOpenAIServiceFailure,
  isOpenAICredentialError,
  OpenAIConfigurationError,
} from '@/lib/ai/openai-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BODY_BYTES = 4 * 1024;

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return NextResponse.json(payload, {
    status,
    headers: RESPONSE_HEADERS,
  });
}

function cancelledResponse(): Response {
  return new Response(null, {
    status: 499,
    headers: RESPONSE_HEADERS,
  });
}

async function readSpeechText(
  req: Request
): Promise<{ text: string; error?: never } | { text?: never; error: Response }> {
  const mediaType = req.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return {
      error: jsonResponse({ error: 'Content-Type must be application/json.' }, 415),
    };
  }

  const declaredLength = req.headers.get('content-length');
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_REQUEST_BODY_BYTES) {
      return { error: jsonResponse({ error: 'Request body is too large.' }, 413) };
    }
  }

  if (!req.body) {
    return { error: jsonResponse({ error: 'Invalid JSON request.' }, 400) };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel('request body too large');
        } catch {
          // The byte boundary is already enforced if the source cannot be cancelled.
        }
        return { error: jsonResponse({ error: 'Request body is too large.' }, 413) };
      }
      chunks.push(value);
    }
  } catch (error) {
    if (req.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { error: cancelledResponse() };
    }
    return { error: jsonResponse({ error: 'Invalid JSON request.' }, 400) };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 ||
      !Object.hasOwn(parsed, 'text')
    ) {
      throw new Error('request body must only contain text');
    }

    const text = (parsed as { text?: unknown }).text;
    if (
      typeof text !== 'string' ||
      text.trim().length === 0 ||
      Array.from(text).length > OPENAI_SPEECH_MAX_CHARACTERS
    ) {
      return {
        error: jsonResponse(
          {
            error: `Text must contain between 1 and ${OPENAI_SPEECH_MAX_CHARACTERS} characters.`,
          },
          400
        ),
      };
    }

    return { text };
  } catch {
    return { error: jsonResponse({ error: 'Invalid JSON request.' }, 400) };
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!isTrustedBrowserRequest(req)) {
    return jsonResponse({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  const ip = extractClientIp(req.headers);
  const rateCheck = checkRateLimit(ip, {
    scope: 'speech',
    minuteLimit: 20,
    dailyLimit: 120,
  });
  if (rateCheck.limited) {
    return jsonResponse({ error: 'Too many speech requests. Please wait a moment.' }, 429);
  }

  const parsedRequest = await readSpeechText(req);
  if (parsedRequest.error) return parsedRequest.error;

  try {
    const speech = await createOpenAIClient().audio.speech.create(
      {
        input: parsedRequest.text,
        model: OPENAI_SPEECH_MODEL,
        voice: OPENAI_SPEECH_VOICE,
        response_format: 'mp3',
        stream_format: 'audio',
      },
      {
        headers: {
          'OpenAI-Safety-Identifier': createOpenAISafetyIdentifier(ip),
        },
        signal: req.signal,
      }
    );

    if (!speech.body) {
      return jsonResponse({ error: 'OpenAI returned an invalid speech response.' }, 502);
    }

    return new Response(speech.body, {
      status: 200,
      headers: {
        ...RESPONSE_HEADERS,
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error) {
    if (
      req.signal.aborted ||
      (error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'APIUserAbortError'))
    ) {
      return cancelledResponse();
    }
    if (error instanceof OpenAIConfigurationError) {
      return jsonResponse({ error: 'OPENAI_API_KEY is not configured.' }, 503);
    }
    if (isOpenAICredentialError(error)) {
      return jsonResponse({ error: 'OpenAI rejected the configured server credential.' }, 502);
    }

    const serviceFailure = getOpenAIServiceFailure(error);
    if (serviceFailure) {
      return jsonResponse({ error: serviceFailure.message }, serviceFailure.status);
    }
    return jsonResponse({ error: 'Failed to generate speech. Please try again.' }, 500);
  }
}
