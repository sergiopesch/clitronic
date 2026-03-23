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
 * Brave delivers better product images; Wikimedia is free and always available.
 * Returns the best match or null.
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
    url.searchParams.set('q', `${query} electronics component`);
    url.searchParams.set('count', '5');
    url.searchParams.set('safesearch', 'strict');

    const res = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as BraveImageResponse;
    const results = data.results;

    if (!results?.length) return null;

    // Pick the best result — prefer ones with thumbnails and reasonable dimensions
    for (const img of results) {
      const imageUrl = img.thumbnail?.src ?? img.properties?.url;
      if (!imageUrl) continue;

      // Skip tiny images and SVGs
      if (imageUrl.endsWith('.svg')) continue;
      if (img.properties?.width && img.properties.width < 100) continue;

      return {
        url: img.properties?.url ?? imageUrl,
        thumbnail: img.thumbnail?.src,
        attribution: img.source ?? 'Brave Search',
        source: 'brave',
      };
    }

    return null;
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
    url.searchParams.set('gsrsearch', `${query} electronics`);
    url.searchParams.set('gsrlimit', '5');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|extmetadata');
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

    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      const imageUrl = info.thumburl ?? info.url;
      if (!imageUrl) continue;

      // Skip SVGs and tiny files
      if (imageUrl.endsWith('.svg') || imageUrl.endsWith('.SVG')) continue;

      return {
        url: imageUrl,
        attribution: info.extmetadata?.Artist?.value
          ? stripHtml(info.extmetadata.Artist.value)
          : 'Wikimedia Commons',
        source: 'wikimedia',
      };
    }

    return null;
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
  imageinfo?: {
    url?: string;
    thumburl?: string;
    extmetadata?: {
      Artist?: { value: string };
    };
  }[];
}
