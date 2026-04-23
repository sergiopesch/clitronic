import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_TIMEOUT_MS = 5000;
const MIN_IMAGE_BYTES = 128;
const TRUSTED_IMAGE_HOSTS = ['upload.wikimedia.org'];
const TRUSTED_IMAGE_HOST_SUFFIXES = ['.search.brave.com'];

export async function GET(req: Request) {
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
    const upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Upstream fetch failed.' }, { status: 502 });
    }

    const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase();
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength < MIN_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image payload too small.' }, { status: 502 });
    }

    const fallbackType = inferImageTypeFromPath(target.pathname);
    const resolvedType = upstreamType.startsWith('image/')
      ? upstreamType
      : fallbackType
        ? `image/${fallbackType}`
        : null;

    if (!resolvedType) {
      return NextResponse.json({ error: 'Unsupported image content type.' }, { status: 415 });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': resolvedType,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to proxy image.' }, { status: 502 });
  }
}

function inferImageTypeFromPath(pathname: string): string | null {
  const lower = pathname.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpeg';
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.webp')) return 'webp';
  if (lower.endsWith('.gif')) return 'gif';
  if (lower.endsWith('.avif')) return 'avif';
  return null;
}

export function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

export function isTrustedImageHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;

  return (
    TRUSTED_IMAGE_HOSTS.includes(normalized) ||
    TRUSTED_IMAGE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
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
    const ipv4MappedMatch = normalized.match(/^::ffff(?::0{1,4})?:(\d+\.\d+\.\d+\.\d+)$/i);
    if (ipv4MappedMatch?.[1]) {
      return isPrivateOrReservedAddress(ipv4MappedMatch[1]);
    }

    const segments = parseIpv6Segments(normalized);
    if (!segments) return true;
    const numeric = ipv6SegmentsToBigInt(segments);

    if (numeric === 0n) return true;
    if (numeric === 1n) return true;
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
  if (!['http:', 'https:'].includes(url.protocol)) return false;
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
