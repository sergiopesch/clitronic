import {
  detectImageIntent,
  filterExcluded,
  getCuratedProfile,
  normalizeExcludedUrlKeys,
  preprocessImageQuery,
  simplifyQuery,
  toImageCandidates,
  tuneQueryForIntent,
} from './query';
import { mergeAndRank, searchParallel } from './providers';
import { writeAutoresearchTrace } from '@/lib/autoresearch/trace';
import type { ImageSearchResponse } from './types';

const CONFIDENCE_THRESHOLD = 2;
const IMAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const IMAGE_CACHE_MAX_ENTRIES = 300;
const IMAGE_CACHE = new Map<string, { expiresAt: number; payload: ImageSearchResponse }>();

type SearchImagesInput = {
  query: string;
  caption?: string;
  description?: string;
  excludeUrls?: string[];
  requestedCount: number;
  braveKey?: string;
};

export async function searchImages({
  query: rawQuery,
  caption,
  description,
  excludeUrls = [],
  requestedCount,
  braveKey,
}: SearchImagesInput): Promise<ImageSearchResponse> {
  const contextText = [caption, description].filter(Boolean).join(' ');
  const query = preprocessImageQuery(rawQuery);
  const intentSource = `${query} ${contextText}`.trim();
  const curated = getCuratedProfile(intentSource);
  const intent = curated?.intent ?? detectImageIntent(intentSource);
  const tunedQuery = curated?.preferredQuery ?? tuneQueryForIntent(query, intent);
  writeAutoresearchTrace('image_search_query_created', {
    rawQueryLength: rawQuery.length,
    preprocessedQuery: query,
    tunedQuery,
    intent,
    curatedProfile: curated?.id ?? null,
  });
  const excludeKeys = normalizeExcludedUrlKeys(excludeUrls);
  const cacheKey = buildCacheKey(tunedQuery, intent, requestedCount, excludeKeys);

  const cached = IMAGE_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const curatedContext = curated
    ? `${contextText} ${curated.relevanceTokens.join(' ')}`.trim()
    : contextText;
  writeAutoresearchTrace('image_search_started', {
    tunedQuery,
    intent,
    requestedCount,
    excludedCount: excludeKeys.length,
    hasBraveKey: Boolean(braveKey),
  });
  const round1 = await searchParallel(tunedQuery, braveKey, intent, curatedContext);
  const round1Candidates = filterExcluded(round1, excludeKeys);
  writeAutoresearchTrace('image_candidates_ranked', {
    tunedQuery,
    intent,
    candidateCount: round1Candidates.length,
    topScore: round1Candidates[0]?.score ?? null,
  });
  const topRound1 = round1Candidates[0] ?? null;

  if (topRound1 && topRound1.score >= CONFIDENCE_THRESHOLD) {
    const payload: ImageSearchResponse = {
      ...topRound1,
      confident: true,
      queryUsed: tunedQuery,
      images: toImageCandidates(round1Candidates, requestedCount),
    };
    writeAutoresearchTrace('image_candidates_returned', {
      queryUsed: payload.queryUsed,
      confident: payload.confident,
      candidateCount: payload.images?.length ?? 0,
    });
    setImageCache(cacheKey, payload);
    return payload;
  }

  const queryWords = tunedQuery.trim().split(/\s+/);
  if ((!topRound1 || topRound1.score < CONFIDENCE_THRESHOLD) && queryWords.length > 2) {
    const retryQuery = curated?.fallbackQuery?.trim() || simplifyQuery(tunedQuery);
    if (retryQuery !== tunedQuery) {
      const round2 = await searchParallel(retryQuery, braveKey, intent, curatedContext);
      if (round2.length > 0) {
        const merged = filterExcluded(mergeAndRank(round1, round2), excludeKeys);
        const best = merged[0]!;
        const payload: ImageSearchResponse = {
          ...best,
          confident: best.score >= CONFIDENCE_THRESHOLD,
          queryUsed: best.score >= (topRound1?.score ?? -Infinity) ? retryQuery : tunedQuery,
          images: toImageCandidates(merged, requestedCount),
        };
        writeAutoresearchTrace('image_candidates_ranked', {
          tunedQuery: retryQuery,
          intent,
          candidateCount: merged.length,
          topScore: best.score,
        });
        writeAutoresearchTrace('image_candidates_returned', {
          queryUsed: payload.queryUsed,
          confident: payload.confident,
          candidateCount: payload.images?.length ?? 0,
        });
        setImageCache(cacheKey, payload);
        return payload;
      }
    }
  }

  if (topRound1) {
    const payload: ImageSearchResponse = {
      ...topRound1,
      confident: false,
      queryUsed: tunedQuery,
      images: toImageCandidates(round1Candidates, requestedCount),
    };
    writeAutoresearchTrace('image_candidates_returned', {
      queryUsed: payload.queryUsed,
      confident: payload.confident,
      candidateCount: payload.images?.length ?? 0,
    });
    setImageCache(cacheKey, payload);
    return payload;
  }

  const payload: ImageSearchResponse = { url: null, confident: false, queryUsed: tunedQuery };
  writeAutoresearchTrace('image_candidates_returned', {
    queryUsed: payload.queryUsed,
    confident: payload.confident,
    candidateCount: 0,
  });
  setImageCache(cacheKey, payload);
  return payload;
}

function buildCacheKey(
  tunedQuery: string,
  intent: string,
  requestedCount: number,
  excludeKeys: string[]
): string {
  const excludeCacheSuffix = excludeKeys.length > 0 ? `|exclude:${excludeKeys.join(',')}` : '';
  return `${tunedQuery.toLowerCase()}|${intent}|${requestedCount}${excludeCacheSuffix}`;
}

function setImageCache(key: string, payload: ImageSearchResponse) {
  const now = Date.now();
  for (const [entryKey, entryValue] of IMAGE_CACHE) {
    if (entryValue.expiresAt <= now) {
      IMAGE_CACHE.delete(entryKey);
    }
  }

  IMAGE_CACHE.set(key, { expiresAt: now + IMAGE_CACHE_TTL_MS, payload });
  while (IMAGE_CACHE.size > IMAGE_CACHE_MAX_ENTRIES) {
    const oldestKey = IMAGE_CACHE.keys().next().value;
    if (!oldestKey) break;
    IMAGE_CACHE.delete(oldestKey);
  }
}
