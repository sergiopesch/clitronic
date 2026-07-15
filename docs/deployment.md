# Deployment and Key Rotation

Clitronic is a Next.js app targeting Node `24.x`. Vercel can use framework auto-detection with the
repository root, `npm ci`, and `npm run build`. For another Node host, run `npm ci`, `npm run build`,
then `npm start` behind HTTPS.

## Environment Setup

Configure `OPENAI_API_KEY` as a server-only project secret in every active environment. Set a long,
random `OPENAI_SAFETY_ID_SECRET` to keep Realtime safety identifiers stable across API-key rotations;
when omitted, the OpenAI API key is used as the HMAC key. Configure `BRAVE_API_KEY` only when Brave
image search is wanted. Preview and production should use distinct credentials and separate usage
limits where possible.

Microphone access requires HTTPS outside localhost. Browser clients must also be able to establish a
WebRTC connection to OpenAI. The browser never receives the standard key: it requests a 60-second,
non-cacheable client secret from `/api/realtime/session`. Because the app has no accounts, that
server request binds the token to a keyed pseudonymous HMAC of the best available client IP for
OpenAI safety monitoring; the raw IP is not forwarded in that header.

## Rotate an OpenAI Key

1. Create a replacement key in the intended OpenAI project. Do not revoke the active key yet.
2. Replace `OPENAI_API_KEY` in `.env.local` or each hosting environment's secret store.
3. Restart the local server or redeploy every affected environment. Environment changes do not alter
   an already-running process.
4. Smoke-test one text request and one voice session. Confirm the transcription-only session reaches
   listening, returns captions, renders one card, and plays the matching exact-text response through
   `/api/speech`.
5. Revoke the old key and review project usage. Roll back the deployment or restore the old secret
   only if it is still valid and the replacement fails.

If a key is suspected to be exposed, revoke it immediately and perform the remaining steps with a
new key.

## Release Checklist

- `npm run release:check` (web and CLI audits, validation, tests, and production build)
- text, transcription-only voice, exact TTS, Wikimedia fallback, and rate-limit smoke tests in preview
- confirm `OPENAI_API_KEY` is absent from client bundles and logs
- monitor hosting errors and OpenAI usage after promotion

## Production Release and Rollback

`main` currently auto-deploys to [clitronic.vercel.app](https://clitronic.vercel.app). GitHub and
Vercel do not currently enforce an environment approval or required-check gate, and a Vercel
deployment can become public before GitHub CI finishes. Treat the local Node 24.13 release check as
mandatory until those repository protections are enabled.

1. Run `nvm use` and `npm run release:check` from a synchronized `main` checkout.
2. Push or merge the reviewed commit, then monitor both the GitHub `CI` workflow and the Vercel
   production deployment through completion.
3. Smoke-test the canonical URL for one deterministic calculation, one structured answer, one image
   request, and—using a permission-enabled device—one transcription/TTS turn.
4. If CI, deployment, or smoke verification fails, stop further promotion and use Vercel to restore
   the last known-good production deployment while the fault is corrected in a new commit. Do not
   rotate or revoke a still-required provider key as part of application rollback.

The built-in rate limiter is process-local and unauthenticated. Add a shared rate-limit store, access
control, budgets, and operational alerts before treating the app as a public production service.
On generic Node hosting, terminate traffic at a trusted reverse proxy that strips client-supplied
`X-Forwarded-For` and `X-Real-IP` values before setting its own canonical client address. Without
that boundary, forwarding headers are only best-effort abuse signals and can be spoofed.

Realtime client secrets are bearer credentials and can be reused until their short expiry. The
built-in mint rate limit therefore does not enforce a one-session budget. Before public production,
require authentication and shared usage budgets or move session creation behind a server-mediated
Realtime call flow; also monitor and cap project spend at the provider level.
