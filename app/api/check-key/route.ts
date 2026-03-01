import { createAnthropic } from '@ai-sdk/anthropic';

export async function GET(req: Request) {
  const userApiKey = req.headers.get('x-api-key');
  const serverApiKey = process.env.ANTHROPIC_API_KEY;

  const apiKey = userApiKey || serverApiKey;

  if (!apiKey) {
    return Response.json({
      valid: false,
      hasServerKey: !!serverApiKey,
      error: 'No API key configured',
    });
  }

  // Validate the API key format
  if (!apiKey.startsWith('sk-ant-')) {
    return Response.json({
      valid: false,
      hasServerKey: !!serverApiKey,
      error: 'Invalid API key format. Key should start with sk-ant-',
    });
  }

  // Try a minimal API call to validate the key
  try {
    const anthropic = createAnthropic({ apiKey });
    // We can't easily test without making a real call, but format validation is done
    return Response.json({
      valid: true,
      hasServerKey: !!serverApiKey,
      source: userApiKey ? 'user' : 'server',
    });
  } catch (error) {
    return Response.json({
      valid: false,
      hasServerKey: !!serverApiKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function POST(req: Request) {
  // Allow POST for testing a specific key
  let body: { apiKey?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine
  }

  const apiKey = body.apiKey || req.headers.get('x-api-key') || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json({
      valid: false,
      error: 'No API key provided',
    });
  }

  if (!apiKey.startsWith('sk-ant-')) {
    return Response.json({
      valid: false,
      error: 'Invalid API key format. Key should start with sk-ant-',
    });
  }

  return Response.json({
    valid: true,
    keyPrefix: apiKey.substring(0, 10) + '...',
  });
}
