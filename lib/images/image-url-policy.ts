export type ProxyableImageSource = 'brave' | 'wikimedia';

export const IMAGE_CONFIDENCE_THRESHOLD = 2;
export const IMAGE_URL_MAX_CHARS = 2_048;

export function isTrustedImageHostname(hostname: string, source?: ProxyableImageSource): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!normalized) return false;

  const isWikimedia = normalized === 'upload.wikimedia.org';
  const isBrave = normalized.endsWith('.search.brave.com');
  if (source === 'wikimedia') return isWikimedia;
  if (source === 'brave') return isBrave;
  return isWikimedia || isBrave;
}

export function isProxyableImageUrl(value: string, source?: ProxyableImageSource): boolean {
  if (!value || value.length > IMAGE_URL_MAX_CHARS || value !== value.trim() || /\s/.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return Boolean(
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      isTrustedImageHostname(url.hostname, source)
    );
  } catch {
    return false;
  }
}
