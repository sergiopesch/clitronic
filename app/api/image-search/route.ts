import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ScoredImage {
  url: string;
  thumbnail?: string;
  attribution: string;
  source: 'brave' | 'wikimedia';
  score: number;
}

/** Minimum score to consider a result "confident" (skip retry). */
const CONFIDENCE_THRESHOLD = 1;

/**
 * Smart image search with confidence scoring.
 *
 * Round 1: Search Brave + Wikimedia in parallel with exact query.
 *          If best result score >= threshold → return immediately.
 * Round 2: If no confident match, retry with a simplified query.
 *          Pick the best result across all attempts.
 *
 * Response includes `confident: boolean` so the client knows quality.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter.' }, { status: 400 });
  }

  const braveKey = process.env.BRAVE_API_KEY;

  // ── Round 1: Parallel search with exact query ──
  const round1 = await searchParallel(query, braveKey);

  if (round1 && round1.score >= CONFIDENCE_THRESHOLD) {
    return NextResponse.json({ ...round1, confident: true });
  }

  // ── Round 2: Retry if no result OR low confidence and query is multi-word ──
  const queryWords = query.trim().split(/\s+/);
  if ((!round1 || round1.score < CONFIDENCE_THRESHOLD) && queryWords.length > 2) {
    const simplified = simplifyQuery(query);
    if (simplified !== query) {
      const round2 = await searchParallel(simplified, braveKey);
      if (round2) {
        const best = betterResult(round1, round2) ?? round2;
        return NextResponse.json({ ...best, confident: best.score >= CONFIDENCE_THRESHOLD });
      }
    }
  }

  // Return round 1 result even if low confidence, or null
  if (round1) {
    return NextResponse.json({ ...round1, confident: false });
  }

  return NextResponse.json({ url: null, confident: false });
}

/* ── Parallel search across providers ── */

async function searchParallel(query: string, braveKey?: string): Promise<ScoredImage | null> {
  const searches: Promise<ScoredImage | null>[] = [];

  if (braveKey) searches.push(searchBrave(query, braveKey));
  searches.push(searchWikimedia(query));

  const results = await Promise.all(searches);
  return results.reduce<ScoredImage | null>((best, r) => betterResult(best, r), null);
}

function betterResult(a: ScoredImage | null, b: ScoredImage | null): ScoredImage | null {
  if (!a) return b;
  if (!b) return a;
  return b.score > a.score ? b : a;
}

/* ── Query simplification for retry ── */

function simplifyQuery(query: string): string {
  // Remove version numbers, qualifiers, and extra words
  return query
    .replace(/\b(v\d+|r\d+|rev\s*\d+|module|board|kit|sensor|breakout)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Scoring helpers ── */

function scoreResult(query: string, title: string, width?: number, height?: number): number {
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const titleLower = title.toLowerCase();

  // Base: how many query words appear in the title
  let score = queryWords.filter((word) => titleLower.includes(word)).length;

  // Bonus for reasonable dimensions
  const w = width ?? 0;
  const h = height ?? 0;
  if (w >= 300 && h >= 200) score += 0.5;
  const ratio = w && h ? w / h : 1;
  if (ratio > 0.5 && ratio < 2.5) score += 0.5;

  // Penalty if title contains "kit", "set", "bundle" (likely a collection, not the item)
  if (/\b(kit|set|bundle|pack|lot|collection)\b/i.test(titleLower)) {
    score -= 1;
  }

  return score;
}

/* ── Brave Image Search ── */

async function searchBrave(query: string, apiKey: string): Promise<ScoredImage | null> {
  try {
    const url = new URL('https://api.search.brave.com/res/v1/images/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '10');
    url.searchParams.set('safesearch', 'strict');

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as BraveImageResponse;
    const results = data.results;
    if (!results?.length) return null;

    let best: ScoredImage | null = null;

    for (const img of results) {
      const imageUrl = img.thumbnail?.src ?? img.properties?.url;
      if (!imageUrl) continue;
      if (imageUrl.endsWith('.svg')) continue;

      const w = img.properties?.width ?? 0;
      if (w > 0 && w < 150) continue;

      const score = scoreResult(
        query,
        img.title ?? '',
        img.properties?.width,
        img.properties?.height
      );

      if (!best || score > best.score) {
        best = {
          url: img.properties?.url ?? imageUrl,
          thumbnail: img.thumbnail?.src,
          attribution: img.source ?? 'Brave Search',
          source: 'brave',
          score,
        };
      }
    }

    return best;
  } catch {
    return null;
  }
}

/* ── Wikimedia Commons Search ── */

async function searchWikimedia(query: string): Promise<ScoredImage | null> {
  try {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('gsrsearch', query);
    url.searchParams.set('gsrlimit', '10');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|extmetadata|size');
    url.searchParams.set('iiurlwidth', '600');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(2500),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as WikimediaResponse;
    const pages = data.query?.pages;
    if (!pages) return null;

    let best: ScoredImage | null = null;

    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      const imageUrl = info.thumburl ?? info.url;
      if (!imageUrl) continue;
      if (imageUrl.endsWith('.svg') || imageUrl.endsWith('.SVG')) continue;
      if (info.width && info.width < 150) continue;

      const title = (page.title ?? '').replace(/^File:/i, '');
      const score = scoreResult(query, title, info.width);

      if (!best || score > best.score) {
        best = {
          url: imageUrl,
          attribution: info.extmetadata?.Artist?.value
            ? stripHtml(info.extmetadata.Artist.value)
            : 'Wikimedia Commons',
          source: 'wikimedia',
          score,
        };
      }
    }

    return best;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/* ── Type definitions ── */

interface BraveImageResponse {
  results?: {
    title?: string;
    thumbnail?: { src: string };
    properties?: { url?: string; width?: number; height?: number };
    source?: string;
  }[];
}

interface WikimediaResponse {
  query?: {
    pages?: Record<string, WikimediaPage>;
  };
}

interface WikimediaPage {
  title?: string;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    width?: number;
    extmetadata?: {
      Artist?: { value: string };
    };
  }[];
}
