import { NextResponse } from 'next/server';
import { searchImages } from './service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawQuery = searchParams.get('q')?.trim();
  const rawCaption = searchParams.get('caption')?.trim();
  const rawDescription = searchParams.get('description')?.trim();
  const rawExclude = searchParams.getAll('exclude');
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
