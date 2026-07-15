export function isTrustedBrowserRequest(req: Request): boolean {
  const fetchSite = req.headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return false;

  const origin = req.headers.get('origin');
  if (origin === null) return true;
  if (origin === 'null') return false;

  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}
