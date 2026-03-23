import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ImageResult {
  url: string;
  thumbnail?: string;
  attribution: string;
  source: 'brave' | 'wikimedia';
}

/**
 * Multi-provider image search: Brave (primary) → Wikimedia (fallback).
 * Uses the query as-is — the LLM is responsible for providing a
 * precise, descriptive search term. No generic suffixes.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter.' }, { status: 400 });
  }

  // Try Brave first if API key is configured
  const braveKey = process.env.BRAVE_API_KEY;
  if (braveKey) {
    const result = await searchBrave(query, braveKey);
    if (result) return NextResponse.json(result);
  }

  // Fallback to Wikimedia (free, no key needed)
  const result = await searchWikimedia(query);
  if (result) return NextResponse.json(result);

  return NextResponse.json({ url: null });
}

/* ── Brave Image Search ── */

async function searchBrave(query: string, apiKey: string): Promise<ImageResult | null> {
  try {
    const url = new URL('https://api.search.brave.com/res/v1/images/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '8');
    url.searchParams.set('safesearch', 'strict');

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as BraveImageResponse;
    const results = data.results;
    if (!results?.length) return null;

    // Score results by relevance to the query
    const queryWords = query.toLowerCase().split(/\s+/);
    let bestResult: (typeof results)[0] | null = null;
    let bestScore = -1;

    for (const img of results) {
      const imageUrl = img.thumbnail?.src ?? img.properties?.url;
      if (!imageUrl) continue;
      if (imageUrl.endsWith('.svg')) continue;

      const w = img.properties?.width ?? 0;
      const h = img.properties?.height ?? 0;
      if (w > 0 && w < 150) continue;

      // Score: how many query words appear in the title
      const title = (img.title ?? '').toLowerCase();
      let score = queryWords.filter((word) => title.includes(word)).length;

      // Bonus for reasonable image dimensions (not tiny, not banners)
      if (w >= 300 && h >= 200) score += 1;
      const ratio = w && h ? w / h : 1;
      if (ratio > 0.5 && ratio < 2.5) score += 1; // Not too wide/tall

      if (score > bestScore) {
        bestScore = score;
        bestResult = img;
      }
    }

    if (!bestResult) return null;

    return {
      url: bestResult.properties?.url ?? bestResult.thumbnail?.src ?? '',
      thumbnail: bestResult.thumbnail?.src,
      attribution: bestResult.source ?? 'Brave Search',
      source: 'brave',
    };
  } catch {
    return null;
  }
}

/* ── Wikimedia Commons Search ── */

async function searchWikimedia(query: string): Promise<ImageResult | null> {
  try {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrnamespace', '6');
    url.searchParams.set('gsrsearch', query);
    url.searchParams.set('gsrlimit', '8');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|extmetadata|size');
    url.searchParams.set('iiurlwidth', '600');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as WikimediaResponse;
    const pages = data.query?.pages;
    if (!pages) return null;

    // Score results by relevance
    const queryWords = query.toLowerCase().split(/\s+/);
    let bestPage: WikimediaPage | null = null;
    let bestScore = -1;

    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      const imageUrl = info.thumburl ?? info.url;
      if (!imageUrl) continue;
      if (imageUrl.endsWith('.svg') || imageUrl.endsWith('.SVG')) continue;

      // Skip tiny images
      if (info.width && info.width < 150) continue;

      // Score based on title match
      const title = (page.title ?? '').toLowerCase().replace('file:', '');
      let score = queryWords.filter((word) => title.includes(word)).length;

      // Prefer photos over diagrams/icons (larger files tend to be photos)
      if (info.width && info.width >= 400) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestPage = page;
      }
    }

    if (!bestPage) return null;

    const info = bestPage.imageinfo![0];
    return {
      url: info.thumburl ?? info.url!,
      attribution: info.extmetadata?.Artist?.value
        ? stripHtml(info.extmetadata.Artist.value)
        : 'Wikimedia Commons',
      source: 'wikimedia',
    };
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
