export function getImageSourceCandidates(url: string, thumbnail?: string): string[] {
  const ordered = [thumbnail, url].filter((value): value is string => Boolean(value));
  return [...new Set(ordered)];
}

export function shouldUpgradeToFullImage(
  currentSource: string,
  fullSource: string,
  thumbnail: string | undefined,
  loaded: boolean
): boolean {
  return Boolean(loaded && thumbnail && thumbnail !== fullSource && currentSource === thumbnail);
}

export function selectUsableImageCandidates<T extends { url: string }>(
  candidates: readonly T[],
  failedUrls: ReadonlySet<string>,
  count: number
): T[] {
  const boundedCount = Math.max(0, Math.floor(count));
  return candidates.filter((candidate) => !failedUrls.has(candidate.url)).slice(0, boundedCount);
}

export function shouldRestoreLoadedThumbnail(
  currentSource: string,
  fullSource: string,
  thumbnail: string | undefined,
  thumbnailLoaded: boolean
): boolean {
  return Boolean(
    thumbnailLoaded && thumbnail && thumbnail !== fullSource && currentSource === fullSource
  );
}

export function matchImageFallbackDiagram(query: string): string | null {
  const value = query.toLowerCase();
  const has = (term: string) =>
    new RegExp(`(?:^|[^a-z0-9])${term}(?=$|[^a-z0-9])`, 'i').test(value);

  if (has('breadboard')) return 'breadboard';
  if (has('voltage') && has('divider')) return 'voltage-divider';
  if (has('led') && has('circuit')) return 'led-circuit';
  if (has('pull') && has('up')) return 'pull-up';
  if (has('pull') && has('down')) return 'pull-down';
  if (has('pwm') || /\bpulse\s+width\b/i.test(value)) return 'pwm';
  if (has('capacitor') && (has('charge') || has('rc'))) return 'capacitor-charge';
  return null;
}
