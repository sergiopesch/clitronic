import { extractSignalWords } from './query';
import { scoreResult } from './scoring';
import type { ImageIntent, ScoredImage } from './types';

export async function searchParallel(
  query: string,
  braveKey: string | undefined,
  intent: ImageIntent,
  contextText: string
): Promise<ScoredImage[]> {
  const contextWords = extractSignalWords(contextText);
  const searches: Promise<ScoredImage[]>[] = [];

  if (braveKey) searches.push(searchBrave(query, braveKey, intent, contextWords));
  searches.push(searchWikimedia(query, intent, contextWords));

  const results = await Promise.all(searches);
  return mergeAndRank(...results);
}

export function mergeAndRank(...groups: ScoredImage[][]): ScoredImage[] {
  const seen = new Set<string>();
  const merged: ScoredImage[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.source}:${item.url}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged.sort((a, b) => b.score - a.score);
}

async function searchBrave(
  query: string,
  apiKey: string,
  intent: ImageIntent,
  contextWords: string[]
): Promise<ScoredImage[]> {
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

    if (!res.ok) return [];

    const data = (await res.json()) as BraveImageResponse;
    const results = data.results;
    if (!results?.length) return [];

    const ranked: ScoredImage[] = [];
    for (const img of results) {
      const trustedImageUrl = img.thumbnail?.src?.trim();
      if (!trustedImageUrl) continue;
      if (trustedImageUrl.endsWith('.svg')) continue;
      if (/\.(gif|webp)(\?|$)/i.test(trustedImageUrl)) continue;
      if (/\/(sprite|icon|logo)\b/i.test(trustedImageUrl)) continue;

      const width = img.properties?.width ?? 0;
      if (width > 0 && width < 150) continue;

      ranked.push({
        url: trustedImageUrl,
        thumbnail: trustedImageUrl,
        attribution: img.source ?? 'Brave Search',
        source: 'brave',
        score: scoreResult(
          query,
          img.title ?? '',
          img.properties?.width,
          img.properties?.height,
          contextWords,
          intent
        ),
      });
    }

    return ranked.sort((a, b) => b.score - a.score).slice(0, 12);
  } catch {
    return [];
  }
}

async function searchWikimedia(
  query: string,
  intent: ImageIntent,
  contextWords: string[]
): Promise<ScoredImage[]> {
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

    if (!res.ok) return [];

    const data = (await res.json()) as WikimediaResponse;
    const pages = data.query?.pages;
    if (!pages) return [];

    const ranked: ScoredImage[] = [];
    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      const imageUrl = info.url ?? info.thumburl;
      if (!imageUrl) continue;
      if (imageUrl.endsWith('.svg') || imageUrl.endsWith('.SVG')) continue;
      if (/\.(gif|webp)(\?|$)/i.test(imageUrl)) continue;
      if (info.width && info.width < 150) continue;

      const title = (page.title ?? '').replace(/^File:/i, '');
      ranked.push({
        url: imageUrl,
        thumbnail: info.thumburl,
        attribution: info.extmetadata?.Artist?.value
          ? stripHtml(info.extmetadata.Artist.value)
          : 'Wikimedia Commons',
        source: 'wikimedia',
        score: scoreResult(query, title, info.width, undefined, contextWords, intent),
      });
    }

    return ranked.sort((a, b) => b.score - a.score).slice(0, 12);
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

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
