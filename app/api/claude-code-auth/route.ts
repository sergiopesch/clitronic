import {
  checkCredentialsAvailable,
  getAccessToken,
  ClaudeCodeCredentialsError,
} from '@/lib/auth/claude-code-credentials';

/**
 * GET /api/claude-code-auth
 * Check if Claude Code credentials are available
 */
export async function GET() {
  try {
    const result = await checkCredentialsAvailable();

    if (result.available) {
      return Response.json({
        available: true,
        expiresAt: result.expiresAt,
      });
    }

    return Response.json({
      available: false,
      reason: result.reason,
    });
  } catch (error) {
    if (error instanceof ClaudeCodeCredentialsError) {
      return Response.json({
        available: false,
        reason: error.message,
      });
    }

    console.error('Unexpected error checking Claude Code credentials:', error);
    return Response.json(
      {
        available: false,
        reason: 'Unexpected error checking credentials',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/claude-code-auth
 * Retrieve the Claude Code access token
 */
export async function POST() {
  try {
    const token = await getAccessToken();

    return Response.json({
      success: true,
      token,
    });
  } catch (error) {
    if (error instanceof ClaudeCodeCredentialsError) {
      // Map specific error codes to appropriate responses
      const errorCode = error.code;

      switch (errorCode) {
        case 'NOT_INSTALLED':
          return Response.json(
            {
              success: false,
              error: 'Claude Code is not installed',
            },
            { status: 404 }
          );

        case 'CREDENTIALS_NOT_FOUND':
          return Response.json(
            {
              success: false,
              error: 'Claude Code credentials file not found',
            },
            { status: 404 }
          );

        case 'TOKEN_EXPIRED':
          return Response.json(
            {
              success: false,
              error: 'Token has expired',
              expiresAt: error.expiresAt,
            },
            { status: 401 }
          );

        case 'KEYCHAIN_ACCESS_DENIED':
          return Response.json(
            {
              success: false,
              error: 'Keychain access denied. Please grant permission to access Claude Code credentials.',
            },
            { status: 403 }
          );

        default:
          return Response.json(
            {
              success: false,
              error: error.message,
            },
            { status: 500 }
          );
      }
    }

    console.error('Unexpected error retrieving Claude Code token:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
