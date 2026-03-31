# Clitronic

Your electronics companion. Ask anything about circuits, components, microcontrollers, and maker hardware — get instant visual answers.

## What It Does

Clitronic turns natural language questions into rich, animated UI cards. It's not a chatbot — it's a dynamic UI engine for electronics.

```text
User input → LLM → Structured JSON → UI Renderer → Animated Components
```

Ask "What resistor for a red LED on 5V?" and get a calculation card with the formula, inputs, and result. Ask "Compare Arduino Uno vs Raspberry Pi Pico" and get a side-by-side comparison. Ask "Show me what a breadboard looks like" and get a real photo with attribution.

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
- **LLM**: OpenAI `gpt-4o-mini` with structured JSON output
- **Image Search**: Brave Search API + Wikimedia Commons fallback
- **Design**: Dark-only, Apple/Tesla-inspired, animation-first

No database. No auth. No persistence. Fast and stateless.

## Getting Started

```bash
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
npm install
```

Create `.env.local`:

```bash
OPENAI_API_KEY=your_key_here
BRAVE_API_KEY=your_key_here  # optional, upgrades image search
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run validate     # Type check + lint + format check
npm test             # Runtime schema/normalization tests
npm run scaffold:component -- --name "Signal Meter" --kind chart
```

## Architecture

```text
app/
├── api/chat/route.ts           # LLM endpoint orchestration
├── api/chat/response-normalizer.ts # Shape rescue + component normalization
├── api/chat/response-validator.ts  # Strict runtime response validation (zod)
├── api/chat/security.ts        # Input sanitization + injection detection
├── api/chat/rate-limit.ts      # In-memory per-IP limiter with cleanup
├── api/image-search/route.ts   # Multi-provider image search (Brave + Wikimedia)
├── globals.css                 # Design tokens + keyframe animations
└── page.tsx                    # Entry point
components/
├── console/local-console.tsx   # Main UI with conversation timeline
└── ui/                         # 10 visual card components + renderer
    ├── ui-renderer.tsx         # Routes JSON → component via registry map
    ├── animations.tsx          # AnimateIn wrapper
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
    └── text-response.tsx       # Typewriter effect
lib/
├── ai/component-registry.ts    # Single source of truth for component names/aliases/types
├── ai/response-schema.ts       # TypeScript response contracts
├── ai/rate-limit.ts            # Shared rate-limit constants/messages
└── ai/system-prompt.ts         # Intent detection + response formatting
```

## How It Works

1. **Intent Detection**: 3-step engine classifies queries by signal words and question shape
2. **Response Normalization**: Server-side normalizer handles multiple LLM output shapes, alias mapping, and signature-based fallback detection
3. **Response Validation**: Strict runtime schema validation guarantees component-safe payloads before returning to client
4. **Client Rendering**: `UIRenderer` routes structured JSON to the correct animated component
5. **Conversation Context**: Compact history summaries keep the LLM aware of what was discussed, preventing false off-topic flags on follow-ups

### Adding or Updating Components

Use this order to avoid drift:

1. Update `lib/ai/component-registry.ts` (name, alias, type, detection signature)
2. Update `lib/ai/response-schema.ts` data contract
3. Update `app/api/chat/response-validator.ts` component data schema
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

| Variable           | Required | Description                                  |
| ------------------ | -------- | -------------------------------------------- |
| `OPENAI_API_KEY`   | Yes      | OpenAI API key                               |
| `BRAVE_API_KEY`    | No       | Brave Search API key (upgrades image search) |
| `DAILY_RATE_LIMIT` | No       | Daily requests per IP (default: 20)          |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for planned features: realtime voice, rich visuals with AI-generated diagrams, and circuit simulation.

## License

MIT
