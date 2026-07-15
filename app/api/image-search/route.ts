import { NextResponse } from 'next/server';
import { extractClientIp } from '../chat/client-ip';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '../chat/rate-limit';
import { isTrustedBrowserRequest } from '../request-security';
import { searchImages } from './service';
import { parseImageSearchPayload } from '@/lib/images/image-search-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUERY_LENGTH = 240;
const MAX_CONTEXT_LENGTH = 500;
const MAX_EXCLUDE_URL_LENGTH = 600;
const MAX_EXCLUDE_URLS = 12;

function trimToLimit(value: string | undefined, limit: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, limit);
}

export async function GET(req: Request) {
  if (!isTrustedBrowserRequest(req)) {
    return NextResponse.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const ip = extractClientIp(req.headers);
  const rateCheck = checkRateLimit(ip, RATE_LIMIT_PRESETS.imageSearch);
  if (rateCheck.limited) {
    return NextResponse.json(
      { error: 'Too many image searches. Please wait a moment.' },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawQuery = trimToLimit(searchParams.get('q') ?? undefined, MAX_QUERY_LENGTH);
  const rawCaption = trimToLimit(searchParams.get('caption') ?? undefined, MAX_CONTEXT_LENGTH);
  const rawDescription = trimToLimit(
    searchParams.get('description') ?? undefined,
    MAX_CONTEXT_LENGTH
  );
  const rawExclude = searchParams
    .getAll('exclude')
    .slice(0, MAX_EXCLUDE_URLS)
    .map((value) => value.trim().slice(0, MAX_EXCLUDE_URL_LENGTH))
    .filter(Boolean);
  const requestedCountRaw = Number(searchParams.get('count') || '1');
  const requestedCount = Number.isFinite(requestedCountRaw)
    ? Math.min(Math.max(Math.floor(requestedCountRaw), 1), 6)
    : 1;

  if (!rawQuery) {
    return NextResponse.json({ error: 'Missing query parameter.' }, { status: 400 });
  }

  let payload: Awaited<ReturnType<typeof searchImages>>;
  try {
    payload = await searchImages({
      query: rawQuery,
      caption: rawCaption || undefined,
      description: rawDescription || undefined,
      excludeUrls: rawExclude,
      requestedCount,
      braveKey: process.env.BRAVE_API_KEY,
      signal: req.signal,
    });
  } catch {
    if (req.signal.aborted) {
      return new Response(null, { status: 499, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(
      { error: 'Image search failed.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    parseImageSearchPayload(payload);
  } catch {
    return NextResponse.json(
      { error: 'Image search returned an invalid result.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': payload.confident
        ? 'public, max-age=300, stale-while-revalidate=900'
        : 'no-store',
    },
  });
}
