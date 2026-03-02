import { getAuthProviderAvailability } from '@/lib/auth/server-auth';

export const runtime = 'nodejs';

export async function GET() {
  const providers = await getAuthProviderAvailability();
  const hasAvailableProvider = providers.some((provider) => provider.available);

  return Response.json({
    valid: hasAvailableProvider,
    hasServerKey: hasAvailableProvider,
    providers,
  });
}

export async function POST() {
  // Backward-compatible response for old clients that still attempt key validation.
  return Response.json({
    valid: false,
    error: 'Manual API keys are disabled. Use "auth" to connect Claude Code or OpenAI Codex.',
  });
}
