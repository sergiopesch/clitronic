import { IMAGE_CONFIDENCE_THRESHOLD, isProxyableImageUrl } from '@/lib/images/image-url-policy';

export type ImageSearchSource = 'brave' | 'wikimedia';

const MAX_IMAGE_CANDIDATES = 12;
const MAX_METADATA_CHARS = 500;

export interface ImageSearchCandidate {
  url: string;
  thumbnail?: string;
  attribution?: string;
  source?: ImageSearchSource;
  score?: number;
}

type NonEmptyCandidates = readonly [ImageSearchCandidate, ...ImageSearchCandidate[]];

interface ImageSearchResultBase {
  queryUsed?: string;
}

export interface ReadyImageSearchResult extends ImageSearchResultBase {
  status: 'ready';
  confident: true;
  candidates: NonEmptyCandidates;
}

export interface PossibleImageSearchResult extends ImageSearchResultBase {
  status: 'possible';
  confident: false;
  candidates: NonEmptyCandidates;
}

export interface EmptyImageSearchResult extends ImageSearchResultBase {
  status: 'empty';
  confident: false;
  candidates: readonly [];
}

export type ImageSearchResult =
  | ReadyImageSearchResult
  | PossibleImageSearchResult
  | EmptyImageSearchResult;

export class ImageSearchPayloadError extends TypeError {
  override readonly name = 'ImageSearchPayloadError';
}

/**
 * Validates the wire response from `/api/image-search` and converts its legacy
 * top-level image plus optional gallery into one deduplicated candidate list.
 */
export function parseImageSearchPayload(payload: unknown): ImageSearchResult {
  const record = parseRecord(payload, 'payload');
  const confident = parseBoolean(record.confident, 'payload.confident');

  if (!Object.hasOwn(record, 'url')) {
    fail('payload.url is required');
  }

  const source = parseOptionalSource(record.source, 'payload.source');
  const topLevelUrl = record.url === null ? null : parseHttpUrl(record.url, 'payload.url', source);
  const thumbnail = parseOptionalHttpUrl(record.thumbnail, 'payload.thumbnail', source);
  const attribution = parseOptionalNonEmptyString(record.attribution, 'payload.attribution');
  const score = parseOptionalFiniteNumber(record.score, 'payload.score');
  const queryUsed = parseOptionalNonEmptyString(record.queryUsed, 'payload.queryUsed');

  if (
    topLevelUrl === null &&
    (thumbnail !== undefined ||
      attribution !== undefined ||
      source !== undefined ||
      score !== undefined)
  ) {
    fail('payload cannot include top-level image metadata when payload.url is null');
  }

  const candidates: ImageSearchCandidate[] = [];
  const candidateIndexByUrl = new Map<string, number>();

  if (topLevelUrl !== null) {
    addCandidate(
      candidates,
      candidateIndexByUrl,
      compactCandidate({ url: topLevelUrl, thumbnail, attribution, source, score })
    );
  }

  if (record.images !== undefined) {
    if (!Array.isArray(record.images)) {
      fail('payload.images must be an array when provided');
    }
    if (record.images.length > MAX_IMAGE_CANDIDATES) {
      fail(`payload.images cannot contain more than ${MAX_IMAGE_CANDIDATES} candidates`);
    }

    record.images.forEach((candidate, index) => {
      const item = parseRecord(candidate, `payload.images[${index}]`);
      const path = `payload.images[${index}]`;
      const candidateSource = parseOptionalSource(item.source, `${path}.source`);
      addCandidate(
        candidates,
        candidateIndexByUrl,
        compactCandidate({
          url: parseHttpUrl(item.url, `${path}.url`, candidateSource),
          thumbnail: parseOptionalHttpUrl(item.thumbnail, `${path}.thumbnail`, candidateSource),
          attribution: parseOptionalNonEmptyString(item.attribution, `${path}.attribution`),
          source: candidateSource,
        })
      );
    });
  }

  const resultMetadata = queryUsed === undefined ? {} : { queryUsed };

  if (candidates.length === 0) {
    if (confident) {
      fail('payload.confident cannot be true when no image candidates are present');
    }
    return { status: 'empty', confident: false, candidates: [], ...resultMetadata };
  }

  const nonEmptyCandidates = candidates as [ImageSearchCandidate, ...ImageSearchCandidate[]];
  if (confident) {
    if (topLevelUrl === null || score === undefined || score < IMAGE_CONFIDENCE_THRESHOLD) {
      fail('a confident payload requires a scored top-level image above the confidence threshold');
    }
    return {
      status: 'ready',
      confident: true,
      candidates: nonEmptyCandidates,
      ...resultMetadata,
    };
  }

  return {
    status: 'possible',
    confident: false,
    candidates: nonEmptyCandidates,
    ...resultMetadata,
  };
}

function addCandidate(
  candidates: ImageSearchCandidate[],
  candidateIndexByUrl: Map<string, number>,
  candidate: ImageSearchCandidate
): void {
  const key = dedupeUrlKey(candidate.url);
  const existingIndex = candidateIndexByUrl.get(key);
  if (existingIndex === undefined) {
    candidateIndexByUrl.set(key, candidates.length);
    candidates.push(candidate);
    return;
  }

  const existing = candidates[existingIndex]!;
  candidates[existingIndex] = compactCandidate({
    url: existing.url,
    thumbnail: existing.thumbnail ?? candidate.thumbnail,
    attribution: existing.attribution ?? candidate.attribution,
    source: existing.source ?? candidate.source,
    score: existing.score ?? candidate.score,
  });
}

function compactCandidate(candidate: ImageSearchCandidate): ImageSearchCandidate {
  return Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined)
  ) as unknown as ImageSearchCandidate;
}

function dedupeUrlKey(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  return parsed.href;
}

function parseRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail(`${path} must be a boolean`);
  }
  return value;
}

function parseHttpUrl(value: unknown, path: string, source?: ImageSearchSource): string {
  if (typeof value !== 'string' || !isProxyableImageUrl(value, source)) {
    fail(`${path} must be a proxy-supported HTTPS image URL`);
  }
  return value;
}

function parseOptionalHttpUrl(
  value: unknown,
  path: string,
  source?: ImageSearchSource
): string | undefined {
  return value === undefined ? undefined : parseHttpUrl(value, path, source);
}

function parseOptionalNonEmptyString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > MAX_METADATA_CHARS
  ) {
    fail(`${path} must be a non-empty string when provided`);
  }
  return value.trim();
}

function parseOptionalSource(value: unknown, path: string): ImageSearchSource | undefined {
  if (value === undefined) return undefined;
  if (value !== 'brave' && value !== 'wikimedia') {
    fail(`${path} must be "brave" or "wikimedia" when provided`);
  }
  return value;
}

function parseOptionalFiniteNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${path} must be a finite number when provided`);
  }
  return value;
}

function fail(message: string): never {
  throw new ImageSearchPayloadError(message);
}
