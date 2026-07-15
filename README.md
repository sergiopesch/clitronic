# Clitronic

Your voice-first electronics companion. Ask about circuits, components, microcontrollers, and maker hardware, then get live captions, spoken responses, and instant visual cards.

![Clitronic voice-first electronics assistant](./public/readme-hero.png)

## What It Does

Clitronic turns natural language questions into rich, animated UI cards. It is not a chatbot UI with a transcript dump. It is a dynamic UI engine for electronics with realtime voice layered on top.

```text
Mic input → Realtime transcription → Validated StructuredResponse → Cards + exact speech
```

Ask "What resistor for a red LED on 5V?" and get a calculation card with the formula, inputs, and result. Ask "Compare Arduino Uno vs Raspberry Pi Pico" and get a side-by-side comparison. Ask "Show me what a breadboard looks like" and get a real photo with attribution.

## Latest Update

- Realtime voice remains the primary interaction path, with text input available from the welcome screen and during active sessions.
- Realtime now owns microphone transport, VAD, and transcription only; one validated response owns
  cards, history, captions, and speech.
- Barge-in and turn replacement cancel stale requests and speech playback. Mic mute is input-only;
  stop and tab hiding perform full privacy teardown.
- Recent turns can reopen previous structured visual answers without another model call.
- Follow-up chips suggest useful next actions based on the rendered card type.
- Safety notes are surfaced consistently across electronics cards without weakening schema validation.
- Visual cards now share consistent headers, count badges, copy actions, and progressive disclosure for long wiring/troubleshooting lists.
- Image follow-ups like "show me one" resolve from recent context instead of collapsing into generic searches.

### 10 Visual Components

| Component                | Use Case                                |
| ------------------------ | --------------------------------------- |
| **Spec Card**            | Specs and features of a component       |
| **Comparison Card**      | Side-by-side qualitative comparison     |
| **Explanation Card**     | How something works, key concepts       |
| **Image Block**          | Real product photos or circuit diagrams |
| **Recommendation Card**  | What to buy or use                      |
| **Troubleshooting Card** | Debug steps for broken circuits         |
| **Calculation Card**     | Formulas with inputs and results        |
| **Pinout Card**          | IC pin layouts with color-coded types   |
| **Chart Card**           | Numeric comparisons as bar charts       |
| **Wiring Card**          | Step-by-step wiring instructions        |

## Stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **Structured UI generation**: OpenAI `gpt-4o-mini` with structured JSON output
- **Realtime input**: OpenAI Realtime over WebRTC with `gpt-4o-mini-transcribe`
- **Canonical speech**: exact-text OpenAI `tts-1` audio generated from the validated card response
- **Image Search**: Brave Search API + Wikimedia Commons fallback
- **Design**: Dark-only, Apple/Tesla-inspired, animation-first

No database or user authentication. Conversation cards live only in the current browser session;
demo quota metadata uses local storage, while rate limits and image caches remain process-local.

## Getting Started

```bash
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
nvm use
npm ci
```

Node `24.x` is the supported runtime for both the web app and the CLI. The repo includes `.nvmrc`, `.node-version`, and `engines.node`, so local development stays aligned with CI and Vercel.

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set `OPENAI_API_KEY` to a project-scoped key. Leave
`BRAVE_API_KEY` empty unless you use Brave image search. Keys must remain server-side: never commit
`.env.local` or use a `NEXT_PUBLIC_` prefix for either credential.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Local Voice Test

1. Start the app with `npm run dev`.
2. Open `http://localhost:3000` in a Chromium-based browser or Safari.
3. Allow microphone access when prompted.
4. Press the talk button and say something like `show me an Arduino image`.
5. Expected behavior:
   - your words appear while you are speaking
   - the assistant starts speaking back with a live on-screen word-by-word caption
   - the matching visual card appears underneath

Good smoke tests:

- `show me an Arduino image`
- `tell me about the ESP32` then `show me one`
- `compare Arduino Uno vs Raspberry Pi Pico`
- `my LED is not blinking`

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run validate     # Type check + lint + format check
npm test             # Runtime schema/normalization tests
npm run audit:prod   # Audit production dependencies
npm run release:check # Complete deterministic web + CLI release gate
bash autoresearch/run_quality_experiment.sh  # Credentialed quality gate for model/search changes
npm run scaffold:component -- --name "Signal Meter" --kind chart
```

The quality runner reads exported process variables rather than loading `.env.local`; see the
[AutoResearch guide](./docs/autoresearch-quality-loop.md). Security disclosures and credential
handling are covered in [SECURITY.md](SECURITY.md).

## Provider Split

The web app and CLI intentionally use different providers today.

- **Web app**: OpenAI for structured UI generation, realtime voice, and transcription
- **CLI**: Anthropic for terminal chat and image-identify flows

That split is deliberate rather than accidental:

- the web app depends on OpenAI Realtime plus the JSON-card response contract
- the CLI is optimized for streaming terminal responses and local image inspection

If you want to use the CLI as well:

```bash
cd cli
nvm use
npm ci
export ANTHROPIC_API_KEY=your_key_here
npm run start -- --help
```

## Architecture

```text
app/
├── api/chat/route.ts           # LLM endpoint orchestration
├── api/chat/response-normalizer.ts # Shape rescue + component normalization
├── api/chat/response-validator.ts  # Compatibility export for the shared response contract
├── api/chat/security.ts        # Input sanitization + injection detection
├── api/chat/rate-limit.ts      # In-memory per-IP limiter with cleanup
├── api/image-search/route.ts   # Thin HTTP wrapper over image-search service
├── api/image-proxy/route.ts    # Safe image proxy for remote image tiles
├── api/realtime/session/route.ts # OpenAI Realtime session bootstrap
├── api/speech/route.ts          # Bounded exact-text TTS adapter
├── globals.css                 # Design tokens + keyframe animations
└── page.tsx                    # Entry point
components/
├── console/local-console.tsx   # Client entry wrapper
├── console/conversation-shell.tsx # Voice-first shell and card stage
├── voice/voice-transcript-strip.tsx # Live user/assistant captions
└── ui/                         # 10 visual card components + renderer
    ├── ui-renderer.tsx         # Routes JSON → component via registry map
    ├── animations.tsx          # AnimateIn wrapper
    ├── card-layout.tsx         # Shared card headers, count badges, disclosure controls
    ├── copy-button.tsx         # Clipboard actions for formulas/results/steps
    ├── safety-callout.tsx      # Consistent safety note presentation
    ├── spec-card.tsx
    ├── comparison-card.tsx
    ├── explanation-card.tsx
    ├── image-block.tsx         # Dual-mode: SVG diagrams + web photos
    ├── recommendation-card.tsx
    ├── troubleshooting-card.tsx
    ├── calculation-card.tsx
    ├── pinout-card.tsx         # SVG IC pin layout
    ├── chart-card.tsx          # Horizontal bar chart
    ├── wiring-card.tsx         # Step-by-step wiring guide
    └── text-response.tsx       # Word-by-word spoken-text fallback
hooks/
├── useConversationState.ts     # Structured response fetch + history context
├── usePrefersReducedMotion.ts  # Motion preference hook for accessible animation
└── useVoiceInteraction.ts      # Transcription transport, turn ownership, exact speech playback
lib/
├── ai/component-registry.ts    # Single source of truth for component names/aliases/types
├── ai/openai-config.ts         # Shared OpenAI model + realtime config
├── ai/openai-server.ts         # Server-only API key resolution and client factory
├── ai/response-contract.ts     # Shared server/browser Zod decoder
├── ai/response-schema.ts       # TypeScript response contracts
├── ai/voice-presentation.ts    # Bounded deterministic card-to-speech projection
├── ai/rate-limit.ts            # Shared rate-limit constants/messages
├── ai/system-prompt.ts         # Intent detection + response formatting
└── ai/transcript-utils.ts      # Light cleanup for speech transcripts
```

## UI And UX Notes

The current app experience is optimized around a voice-first workshop workflow:

- the welcome screen supports either push-to-talk or typed prompts
- the bottom control band keeps text input, voice capture, and mic mute in one predictable place
- active voice states use explicit cancel/stop behavior instead of separate competing controls
- response cards use shared headers via `components/ui/card-layout.tsx`
- long wiring and troubleshooting cards show the first five steps/checks, then allow expansion
- safety callouts remain visible above collapsed content
- calculation and wiring cards include copy actions for formulas, results, and steps

See [docs/ui-ux-polish.md](./docs/ui-ux-polish.md) for the interaction patterns and design constraints behind the current card system.

## How It Works

1. **Realtime session bootstrap**: the browser requests a 60-second ephemeral client secret from
   `/api/realtime/session`. Only server-side routes can read `OPENAI_API_KEY`; the browser receives
   the scoped Realtime secret, never the standard project key.
2. **Realtime transcription**: the browser negotiates a transcription-only WebRTC session and
   streams mic audio. VAD emits item-correlated turns; Realtime never generates an assistant answer.
3. **Live captions**: partial transcripts update the UI while the user is still speaking.
4. **Turn finalization**: once the transcript is finalized, the cleaned utterance is sent to `/api/chat`.
5. **Structured response generation**: the chat route normalizes and validates the model output,
   with fast-path handling for explicit photo requests.
6. **Client contract gate**: the browser decodes successful JSON through the same Zod contract
   before intent inspection, usage accounting, rendering, history, or speech.
7. **Atomic presentation**: `UIRenderer` projects the validated payload into a card while
   `/api/speech` synthesizes the exact bounded summary derived from that same payload.
8. **Turn ownership**: Realtime `item_id` values and abort controllers prevent stale transcripts,
   requests, or audio from committing after barge-in or replacement.
9. **Context-aware visuals**: compact assistant summaries preserve image/component context so
   follow-ups like `show me one` still resolve correctly.
10. **Separated image engine**: component and multi-object scene queries use distinct retrieval
    profiles; untrusted provider payloads pass a shared contract and proxy policy before the card
    can cache or render them.

See [docs/engine-architecture.md](./docs/engine-architecture.md) for the interaction-engine
invariants, failure boundaries, and verification strategy.

### Adding or Updating Components

Use this order to avoid drift:

1. Update `lib/ai/component-registry.ts` (name, alias, type, detection signature)
2. Update `lib/ai/response-schema.ts` data contract
3. Update `lib/ai/response-contract.ts` component data schema
4. Update `components/ui/ui-renderer.tsx` renderer mapping
5. Update `lib/ai/system-prompt.ts` component guidance

#### Scaffolding Helper

Use the scaffolding script to generate a new UI component file and a guided integration checklist:

```bash
npm run scaffold:component -- --name "Signal Meter" --kind chart
```

- `--name` supports spaces, kebab-case, snake_case, or PascalCase.
- `--kind` must be one of: `card`, `chart`, `image`.
- The script creates `components/ui/<name>-card.tsx` and prints the exact follow-up edits required across registry/schema/validator/renderer/prompt.

## Environment Variables

| Variable                        | Required | Description                                             |
| ------------------------------- | -------- | ------------------------------------------------------- |
| `OPENAI_API_KEY`                | Yes      | Server-only OpenAI project API key                      |
| `OPENAI_SAFETY_ID_SECRET`       | No       | Stable server-only HMAC key for Realtime safety IDs     |
| `BRAVE_API_KEY`                 | No       | Brave Search API key; blank uses Wikimedia only         |
| `DAILY_RATE_LIMIT`              | No       | Daily chat requests per IP (default: 20)                |
| `REALTIME_SESSION_MINUTE_LIMIT` | No       | Realtime client-secret requests per IP/minute (12)      |
| `REALTIME_SESSION_DAILY_LIMIT`  | No       | Realtime client-secret requests per IP/day (120)        |
| `IMAGE_SEARCH_MINUTE_LIMIT`     | No       | Image-search requests per IP/minute (30)                |
| `IMAGE_SEARCH_DAILY_LIMIT`      | No       | Image-search requests per IP/day (300)                  |
| `IMAGE_PROXY_MINUTE_LIMIT`      | No       | Remote image proxy requests per IP/minute (120)         |
| `IMAGE_PROXY_DAILY_LIMIT`       | No       | Remote image proxy requests per IP/day (default: 1,000) |

Rate limits are in-memory, per process, and intended as demo controls. They are not durable across
multiple serverless instances. See [deployment and key rotation](./docs/deployment.md) before making
the app publicly reachable.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for upcoming work beyond the shipped realtime voice flow, including richer multi-card responses and circuit simulation.

## License

MIT
