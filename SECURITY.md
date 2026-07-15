# Security Policy

## Reporting a Vulnerability

Please do not open public GitHub issues for suspected security vulnerabilities.

Use GitHub's private vulnerability reporting for this repository when available. If private reporting is not available, contact the maintainer privately through GitHub with:

- a clear description of the issue
- affected routes, components, or workflows
- reproduction steps or a proof of concept
- any suggested mitigations

I will acknowledge valid reports as quickly as practical and work toward a fix before public disclosure.

## Supported Versions

Security fixes are expected on the latest `main` branch.

Older commits, forks, and local modifications should be treated as unsupported unless they have been rebased onto current `main`.

## Secrets and Key Rotation

- Use separate, project-scoped OpenAI keys for development, preview, and production.
- Store keys only in `.env.local` or the hosting provider's server-side secret store. Never expose a
  standard key to browser code or use a `NEXT_PUBLIC_` name.
- For planned rotation, create the replacement key, update every active environment, restart or
  redeploy, smoke-test text and voice, then revoke the old key and review project usage.
- If a key may have leaked, revoke it first, replace it everywhere, redeploy, and investigate recent
  usage. Configure project budgets and alerts as an additional limit.

The browser receives only a short-lived Realtime client secret. Responses containing that secret
are marked `Cache-Control: no-store`. See [deployment and key rotation](./docs/deployment.md) for the
operational checklist.

## Public Deployment

The current app has no user authentication and uses process-local, in-memory rate limiting. Treat
those limits as demo abuse controls, not sufficient protection for a multi-instance public service.
Add durable shared limits and access control before a production launch.
