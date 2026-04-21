/**
 * Best-effort client-IP extraction for rate-limiting purposes.
 *
 * Security notes:
 * - `x-forwarded-for` can be freely set by the client on requests that reach
 *   the app server directly (e.g. local dev, misconfigured reverse proxies),
 *   so using it alone allows trivial bypass of per-IP rate limits.
 * - On Vercel and most managed platforms, the platform-injected headers
 *   (`x-real-ip`, `x-vercel-forwarded-for`) are overwritten on ingress and
 *   therefore cannot be spoofed by the caller.
 * - We prefer the trusted platform headers, and only fall back to the
 *   left-most `x-forwarded-for` entry, since proxies append to it so the
 *   left-most value is the closest-to-client hop.
 *
 * This is a rate-limit key, not an auth or audit identity. We return
 * `'unknown'` if no header looks usable; upstream code must be OK with that.
 */
export function extractClientIp(headers: Headers): string {
  // Vercel-specific, set by the edge and not forwarded from the client.
  const vercelForwarded = headers.get('x-vercel-forwarded-for');
  if (vercelForwarded) {
    const first = vercelForwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  // Common platform-injected header; overwritten (not appended) by most
  // managed proxies, so it is safer than `x-forwarded-for`.
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  // Last-resort: use the left-most `x-forwarded-for` entry. Proxies append to
  // this header, so index 0 is closest to the origin client. Trust is only
  // as strong as the proxy chain in front of the app.
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  return 'unknown';
}
