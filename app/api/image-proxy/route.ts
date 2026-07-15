import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { NextResponse } from 'next/server';
import { extractClientIp } from '../chat/client-ip';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '../chat/rate-limit';
import { isTrustedBrowserRequest } from '../request-security';
import { isProxyableImageUrl, isTrustedImageHostname } from '@/lib/images/image-url-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_TIMEOUT_MS = 5000;
const MIN_IMAGE_BYTES = 128;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DECLARED_RASTER_MIME_TYPES = new Set([
  'application/octet-stream',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

function noStoreJson(payload: unknown, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(req: Request) {
  if (!isTrustedBrowserRequest(req)) {
    return noStoreJson({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  const ip = extractClientIp(req.headers);
  const rateCheck = checkRateLimit(ip, RATE_LIMIT_PRESETS.imageProxy);
  if (rateCheck.limited) {
    return noStoreJson({ error: 'Too many image requests. Please wait a moment.' }, 429);
  }

  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get('url')?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter.' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url.' }, { status: 400 });
  }

  if (!(await isAllowedRemoteUrl(target))) {
    return NextResponse.json({ error: 'Blocked url.' }, { status: 400 });
  }

  try {
    const timeoutSignal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
    const upstream = await fetch(target.toString(), {
      signal: AbortSignal.any([req.signal, timeoutSignal]),
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.1',
      },
      cache: 'no-store',
      redirect: 'error',
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Upstream fetch failed.' }, { status: 502 });
    }

    const upstreamType = (upstream.headers.get('content-type') || '')
      .split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (upstreamType && !DECLARED_RASTER_MIME_TYPES.has(upstreamType)) {
      await upstream.body?.cancel();
      return NextResponse.json({ error: 'Unsupported image content type.' }, { status: 415 });
    }
    const contentLength = Number(upstream.headers.get('content-length') || '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      await upstream.body?.cancel().catch(() => {});
      return NextResponse.json({ error: 'Image payload too large.' }, { status: 413 });
    }

    const bytes = await readImageBytes(upstream);
    if (!bytes) {
      return NextResponse.json({ error: 'Image payload too large.' }, { status: 413 });
    }

    if (bytes.byteLength < MIN_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image payload too small.' }, { status: 502 });
    }

    const resolvedType = detectRasterImageMimeType(bytes);
    if (!resolvedType) {
      return NextResponse.json({ error: 'Unsupported image content type.' }, { status: 415 });
    }
    const normalizedUpstreamType = upstreamType === 'image/jpg' ? 'image/jpeg' : upstreamType;
    if (
      normalizedUpstreamType &&
      normalizedUpstreamType !== 'application/octet-stream' &&
      normalizedUpstreamType !== resolvedType
    ) {
      return NextResponse.json(
        { error: 'Image content did not match its declared type.' },
        { status: 415 }
      );
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': resolvedType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
      },
    });
  } catch {
    if (req.signal.aborted) {
      return new Response(null, { status: 499, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: 'Failed to proxy image.' }, { status: 502 });
  }
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectRasterImageMimeType(input: ArrayBuffer | Uint8Array): string | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) {
    return 'image/gif';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brands = ascii(bytes, 8, Math.min(bytes.length - 8, 56));
    if (brands.includes('avif') || brands.includes('avis')) return 'image/avif';
  }
  return null;
}

async function readImageBytes(response: Response): Promise<ArrayBuffer | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = await response.arrayBuffer();
    return bytes.byteLength > MAX_IMAGE_BYTES ? null : bytes;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined.buffer;
}

export function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

export function isTrustedImageHost(hostname: string): boolean {
  return isTrustedImageHostname(normalizeHostname(hostname));
}

function parseIpv4Octets(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return octets;
}

function parseIpv6Segments(value: string): number[] | null {
  const normalized = normalizeHostname(value);
  if (!normalized) return null;

  const embeddedIpv4Match = normalized.match(/^::ffff(?::0{1,4})?:(\d+\.\d+\.\d+\.\d+)$/i);
  if (embeddedIpv4Match?.[1]) {
    const ipv4Octets = parseIpv4Octets(embeddedIpv4Match[1]);
    if (!ipv4Octets) return null;
    return [
      0,
      0,
      0,
      0,
      0,
      0xffff,
      ipv4Octets[0] * 256 + ipv4Octets[1],
      ipv4Octets[2] * 256 + ipv4Octets[3],
    ];
  }

  const parts = normalized.split('::');
  if (parts.length > 2) return null;

  const expand = (part: string): string[] => (part ? part.split(':').filter(Boolean) : []);
  const head = expand(parts[0] ?? '');
  const tail = expand(parts[1] ?? '');

  const convertEmbeddedIpv4 = (segments: string[]): string[] | null => {
    if (segments.length === 0) return segments;
    const last = segments[segments.length - 1] ?? '';
    if (!last.includes('.')) return segments;

    const octets = parseIpv4Octets(last);
    if (!octets) return null;

    return [
      ...segments.slice(0, -1),
      (octets[0] * 256 + octets[1]).toString(16),
      (octets[2] * 256 + octets[3]).toString(16),
    ];
  };

  const convertedHead = convertEmbeddedIpv4(head);
  const convertedTail = convertEmbeddedIpv4(tail);
  if (!convertedHead || !convertedTail) return null;

  const missing = parts.length === 2 ? 8 - (convertedHead.length + convertedTail.length) : 0;
  if (missing < 0) return null;
  if (parts.length === 1 && convertedHead.length !== 8) return null;

  const expanded = [
    ...convertedHead,
    ...Array.from({ length: missing }, () => '0'),
    ...convertedTail,
  ];
  if (expanded.length !== 8) return null;

  const segments = expanded.map((segment) => Number.parseInt(segment, 16));
  if (segments.some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 0xffff)) {
    return null;
  }

  return segments;
}

function ipv6SegmentsToBigInt(segments: number[]): bigint {
  return segments.reduce((value, segment) => (value << 16n) + BigInt(segment), 0n);
}

function matchesIpv6Cidr(value: bigint, base: string, prefixLength: number): boolean {
  const segments = parseIpv6Segments(base);
  if (!segments) return false;

  const shift = 128n - BigInt(prefixLength);
  return value >> shift === ipv6SegmentsToBigInt(segments) >> shift;
}

export function isPrivateOrReservedAddress(value: string): boolean {
  const normalized = normalizeHostname(value);
  if (!normalized) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const octets = parseIpv4Octets(normalized);
    if (!octets) return true;
    const [a, b, c] = octets;

    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }

  if (ipVersion === 6) {
    const segments = parseIpv6Segments(normalized);
    if (!segments) return true;
    const numeric = ipv6SegmentsToBigInt(segments);

    const isIpv4Mapped =
      segments.slice(0, 5).every((segment) => segment === 0) && segments[5] === 0xffff;
    const isIpv4Translated =
      segments.slice(0, 4).every((segment) => segment === 0) &&
      segments[4] === 0xffff &&
      segments[5] === 0;
    if (isIpv4Mapped || isIpv4Translated) {
      const high = segments[6];
      const low = segments[7];
      return isPrivateOrReservedAddress(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
    }

    if (numeric === 0n) return true;
    if (numeric === 1n) return true;
    if (matchesIpv6Cidr(numeric, '100::', 64)) return true;
    if (matchesIpv6Cidr(numeric, '2001:db8::', 32)) return true;
    if (matchesIpv6Cidr(numeric, 'fc00::', 7)) return true;
    if (matchesIpv6Cidr(numeric, 'fe80::', 10)) return true;
    if (matchesIpv6Cidr(numeric, 'ff00::', 8)) return true;
    return false;
  }

  return true;
}

export function hasOnlyPublicResolvedAddresses(addresses: string[]): boolean {
  return addresses.length > 0 && addresses.every((address) => !isPrivateOrReservedAddress(address));
}

export async function isAllowedRemoteUrl(url: URL): Promise<boolean> {
  if (!isProxyableImageUrl(url.toString())) return false;
  const host = normalizeHostname(url.hostname);
  if (
    !host ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    !host.includes('.')
  ) {
    return false;
  }

  if (!isTrustedImageHost(host)) {
    return false;
  }

  if (isIP(host)) {
    return !isPrivateOrReservedAddress(host);
  }

  try {
    const resolved = await lookup(host, { all: true, verbatim: true });
    return hasOnlyPublicResolvedAddresses(resolved.map((entry) => entry.address));
  } catch {
    return false;
  }
}
