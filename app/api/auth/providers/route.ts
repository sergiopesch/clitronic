import { getAuthProviderAvailability, parseAuthProvider } from '@/lib/auth/server-auth';

export const runtime = 'nodejs';

export async function GET() {
  const providers = await getAuthProviderAvailability();
  const recommendedProvider = providers.find((provider) => provider.available)?.id ?? null;

  return Response.json({
    providers,
    recommendedProvider,
  });
}

export async function POST(req: Request) {
  let body: { provider?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Allow empty body fallthrough to validation below.
  }

  const provider = parseAuthProvider(body.provider);
  if (!provider) {
    return Response.json(
      {
        success: false,
        error: 'Invalid provider. Use "claude-code" or "openai-codex".',
      },
      { status: 400 }
    );
  }

  const providers = await getAuthProviderAvailability();
  const selectedProvider = providers.find((candidate) => candidate.id === provider);

  if (!selectedProvider?.available) {
    return Response.json(
      {
        success: false,
        error: selectedProvider?.reason ?? 'Selected provider is not available.',
      },
      { status: 400 }
    );
  }

  return Response.json({
    success: true,
    provider,
  });
}
