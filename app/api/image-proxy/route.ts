import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_TIMEOUT_MS = 5000;
const MIN_IMAGE_BYTES = 128;

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

  if (!isAllowedRemoteUrl(target)) {
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

function isAllowedRemoteUrl(url: URL): boolean {
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (host.startsWith('10.') || host.startsWith('127.') || host.startsWith('192.168.'))
      return false;
    const second = Number(host.split('.')[1] || '0');
    if (host.startsWith('172.') && second >= 16 && second <= 31) return false;
  }
  return true;
}
