import { extractSignalWords } from './query';
import { scoreResult } from './scoring';
import type { ImageIntent, ScoredImage } from './types';
import { isProxyableImageUrl } from '@/lib/images/image-url-policy';

type ProviderSearchOutcome = {
  available: boolean;
  results: ScoredImage[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ImageProvidersUnavailableError extends Error {
  override readonly name = 'ImageProvidersUnavailableError';
}

export async function searchParallel(
  query: string,
  braveKey: string | undefined,
  intent: ImageIntent,
  contextText: string,
  signal?: AbortSignal
): Promise<ScoredImage[]> {
  const contextWords = extractSignalWords(contextText);
  const searches: Promise<ProviderSearchOutcome>[] = [];

  if (braveKey) searches.push(searchBrave(query, braveKey, intent, contextWords, signal));
  searches.push(searchWikimedia(query, intent, contextWords, signal));

  const outcomes = await Promise.all(searches);
  if (outcomes.every((outcome) => !outcome.available)) {
    throw new ImageProvidersUnavailableError('Every configured image provider was unavailable.');
  }
  return mergeAndRank(...outcomes.map((outcome) => outcome.results));
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
  contextWords: string[],
  signal?: AbortSignal
): Promise<ProviderSearchOutcome> {
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
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(2000)])
        : AbortSignal.timeout(2000),
    });

    if (!res.ok) return { available: false, results: [] };

    const data: unknown = await res.json();
    if (!isRecord(data) || !Array.isArray(data.results)) {
      return { available: false, results: [] };
    }
    const results = data.results;
    if (results.length === 0) return { available: true, results: [] };

    const ranked: ScoredImage[] = [];
    for (const candidate of results) {
      if (!isRecord(candidate)) continue;
      const thumbnail = isRecord(candidate.thumbnail) ? candidate.thumbnail : null;
      const trustedImageUrl = typeof thumbnail?.src === 'string' ? thumbnail.src.trim() : undefined;
      if (!trustedImageUrl) continue;
      if (!isProxyableImageUrl(trustedImageUrl, 'brave')) continue;
      if (trustedImageUrl.endsWith('.svg')) continue;
      if (/\.(gif|webp)(\?|$)/i.test(trustedImageUrl)) continue;
      if (/\/(sprite|icon|logo)\b/i.test(trustedImageUrl)) continue;

      const properties = isRecord(candidate.properties) ? candidate.properties : null;
      const width = typeof properties?.width === 'number' ? properties.width : 0;
      const height = typeof properties?.height === 'number' ? properties.height : undefined;
      if (width > 0 && width < 150) continue;

      ranked.push({
        url: trustedImageUrl,
        thumbnail: trustedImageUrl,
        attribution:
          typeof candidate.source === 'string' ? candidate.source.slice(0, 500) : 'Brave Search',
        source: 'brave',
        score: scoreResult(
          query,
          typeof candidate.title === 'string' ? candidate.title : '',
          width,
          height,
          contextWords,
          intent
        ),
      });
    }

    return { available: true, results: ranked.sort((a, b) => b.score - a.score).slice(0, 12) };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { available: false, results: [] };
  }
}

async function searchWikimedia(
  query: string,
  intent: ImageIntent,
  contextWords: string[],
  signal?: AbortSignal
): Promise<ProviderSearchOutcome> {
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
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(2500)])
        : AbortSignal.timeout(2500),
    });

    if (!res.ok) return { available: false, results: [] };

    const data: unknown = await res.json();
    if (!isRecord(data) || Object.hasOwn(data, 'error')) {
      return { available: false, results: [] };
    }
    if (!isRecord(data.query)) {
      return Object.hasOwn(data, 'batchcomplete')
        ? { available: true, results: [] }
        : { available: false, results: [] };
    }
    const pages = data.query.pages;
    if (pages === undefined) return { available: true, results: [] };
    if (!isRecord(pages)) return { available: false, results: [] };

    const ranked: ScoredImage[] = [];
    for (const candidate of Object.values(pages)) {
      if (!isRecord(candidate) || !Array.isArray(candidate.imageinfo)) continue;
      const info = candidate.imageinfo.find(isRecord);
      if (!info) continue;

      const imageUrl = [info.url, info.thumburl].find(
        (value): value is string =>
          typeof value === 'string' && isProxyableImageUrl(value, 'wikimedia')
      );
      if (!imageUrl) continue;
      if (imageUrl.endsWith('.svg') || imageUrl.endsWith('.SVG')) continue;
      if (/\.(gif|webp)(\?|$)/i.test(imageUrl)) continue;
      const width = typeof info.width === 'number' ? info.width : undefined;
      const height = typeof info.height === 'number' ? info.height : undefined;
      if (width && width < 150) continue;

      const title = (typeof candidate.title === 'string' ? candidate.title : '').replace(
        /^File:/i,
        ''
      );
      const extmetadata = isRecord(info.extmetadata) ? info.extmetadata : null;
      const artist = isRecord(extmetadata?.Artist) ? extmetadata.Artist : null;
      const artistValue = typeof artist?.value === 'string' ? artist.value : null;
      const attribution = artistValue ? stripHtml(artistValue).slice(0, 500) : '';
      const thumbnail =
        typeof info.thumburl === 'string' && isProxyableImageUrl(info.thumburl, 'wikimedia')
          ? info.thumburl
          : undefined;
      ranked.push({
        url: imageUrl,
        thumbnail,
        attribution: attribution || 'Wikimedia Commons',
        source: 'wikimedia',
        score: scoreResult(query, title, width, height, contextWords, intent),
      });
    }

    return { available: true, results: ranked.sort((a, b) => b.score - a.score).slice(0, 12) };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { available: false, results: [] };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
