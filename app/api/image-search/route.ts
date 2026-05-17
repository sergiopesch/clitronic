import { NextResponse } from 'next/server';
import { extractClientIp } from '../chat/client-ip';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '../chat/rate-limit';
import { searchImages } from './service';

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

  const payload = await searchImages({
    query: rawQuery,
    caption: rawCaption || undefined,
    description: rawDescription || undefined,
    excludeUrls: rawExclude,
    requestedCount,
    braveKey: process.env.BRAVE_API_KEY,
  });

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
    },
  });
}
