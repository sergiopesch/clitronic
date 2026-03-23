# Clitronic

## What This Is

A dynamic UI engine for electronics enthusiasts. NOT a traditional chat app.

```
User input → LLM → Structured JSON → UI Renderer → Animated Components
```

## Stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **Backend**: Next.js API routes
- **LLM**: OpenAI (`gpt-4o-mini` for speed)
- **Image Search**: Brave Search API (primary) + Wikimedia Commons (fallback)
- **No database. No authentication. No persistence.**

## MVP Constraints

- Keep everything simple, fast, and stateless
- No external component libraries
- No heavy dependencies
- Optimise for speed and clarity

## Critical Rule: Structured Output ALWAYS

Every LLM response MUST return a JSON object. Two valid modes:

### UI Mode (default)

Used when visualisation adds value. Returns a structured card.

### Text Mode (fallback)

Used ONLY when the answer is short, conversational, or no visual improves clarity.

## Response Schema

```json
{
  "intent": "<string>",
  "mode": "ui | text",
  "ui": {
    "type": "card | chart | image | text",
    "component": "<component-name>",
    "data": {}
  },
  "text": "<string | null>",
  "behavior": {
    "animation": "fadeIn | slideUp | expand",
    "state": "open | collapsed"
  }
}
```

### Rules

- ALWAYS return valid JSON
- NEVER return raw text outside JSON
- `mode: "text"` → fill `text`, set `ui` to null
- `mode: "ui"` → fill `ui`, keep `text` minimal or null

## Intent Detection (3-Step Adaptive Engine)

The LLM uses signal words and question shape — not hardcoded examples:

1. **What is the user asking FOR?** → map to component
2. **Could a visual make this BETTER?** → yes = ui mode, one sentence = text
3. **Pick the MOST VISUAL component that fits** → diagram > explanation, chart > list

### Intent → Component Mapping

| Signal                    | Component             | Animation | Default State |
| ------------------------- | --------------------- | --------- | ------------- |
| Specs/features of a thing | `specCard`            | slideUp   | collapsed     |
| Two+ things side by side  | `comparisonCard`      | slideUp   | open          |
| How something works       | `explanationCard`     | fadeIn    | open          |
| Visual/diagram/schematic  | `imageBlock`          | fadeIn    | open          |
| What should I use/buy     | `recommendationCard`  | slideUp   | collapsed     |
| Not working/debug         | `troubleshootingCard` | expand    | open          |
| Numeric answer + formula  | `calculationCard`     | slideUp   | open          |
| Pin layout of chip/board  | `pinoutCard`          | slideUp   | open          |
| Numeric values to compare | `chartCard`           | slideUp   | open          |
| How to wire/connect       | `wiringCard`          | expand    | open          |
| Greeting / one-liner      | text mode             | none      | n/a           |

**Default bias: UI mode.**

## UI Components (10 total)

### Spec Card

`component: "specCard"` — title, subtitle?, keySpecs[], optionalDetails[]

### Comparison Card

`component: "comparisonCard"` — items[], attributes[], keyDifferences[], useCases?[]

### Explanation Card

`component: "explanationCard"` — title, summary, keyPoints[]

### Image Block (dual-mode)

`component: "imageBlock"` — imageMode: "diagram" | "photo"

- **diagram**: built-in SVG (breadboard, voltage-divider, led-circuit, pull-up/down, pwm, capacitor-charge)
- **photo**: fetches real images via `/api/image-search` (Brave → Wikimedia fallback)

### Recommendation Card

`component: "recommendationCard"` — items[], highlights[]

### Troubleshooting Card

`component: "troubleshootingCard"` — issue, steps[], tips[]

### Calculation Card

`component: "calculationCard"` — title, formula, inputs[], result{}

### Pinout Card

`component: "pinoutCard"` — component, description?, pins[] (SVG IC layout with color-coded pin types)

### Chart Card

`component: "chartCard"` — title, subtitle?, bars[] (horizontal bar chart with animated fills)

### Wiring Card

`component: "wiringCard"` — title, description?, steps[], warnings?[]

## Image Search Pipeline

```
User asks to see a component → LLM returns imageBlock with imageMode: "photo"
→ Client fetches /api/image-search?q={searchQuery}
→ Brave Search (if BRAVE_API_KEY set) → Wikimedia Commons (fallback)
→ Image fades in with shimmer loading state
```

**Env vars**: `OPENAI_API_KEY` (required), `BRAVE_API_KEY` (optional, upgrades image search)

## API Tuning

- Model: `gpt-4o-mini`
- Temperature: 0.4
- Max tokens: 800
- Context window: last 10 messages, 2000 chars each
- Response format: `json_object`

## UI Philosophy

Apple UI + Tesla UI + AI-native system.

- Single-response focused (only latest interaction visible, centered)
- Components appear with CSS keyframe animations (card-enter with blur+scale)
- Thinking state: glowing orb animation
- Text responses: typewriter effect with blinking cursor
- Dark-only design
- Prefer visual clarity over verbosity

## Animation Rules

- UI mode: animation REQUIRED
- Default duration: 200ms ease-out
- Stagger siblings: 50-100ms
- Enter: `opacity-0 → 1` + `translate-y-2 → 0` + blur
- Respect `prefers-reduced-motion`

## Design Tokens (globals.css)

- Surfaces: `surface-0` through `surface-4`
- Text: `text-primary`, `text-secondary`, `text-muted`
- Accent: `accent`, `accent-dim`, `accent-muted`
- Semantic: `success`, `warning`, `error`
- Borders: `border`, `border-accent`
- Use `font-mono` for technical values

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run validate     # Type check + lint + format check
```

## Architecture

```
app/
├── api/chat/route.ts           # OpenAI structured output endpoint
├── api/image-search/route.ts   # Multi-provider image search (Brave + Wikimedia)
├── globals.css                 # Design tokens + keyframe animations
├── layout.tsx                  # Root layout
└── page.tsx                    # Entry → LocalConsole
components/
├── console/local-console.tsx   # Single-response focused UI
├── ui/                         # Structured UI card components
│   ├── ui-renderer.tsx         # Routes JSON → component
│   ├── animations.tsx          # AnimateIn + StaggerChildren
│   ├── spec-card.tsx
│   ├── comparison-card.tsx
│   ├── explanation-card.tsx
│   ├── image-block.tsx         # Dual-mode: SVG diagrams + web photos
│   ├── recommendation-card.tsx
│   ├── troubleshooting-card.tsx
│   ├── calculation-card.tsx
│   ├── pinout-card.tsx         # SVG IC pin layout
│   ├── chart-card.tsx          # Horizontal bar chart
│   ├── wiring-card.tsx         # Step-by-step wiring guide
│   └── text-response.tsx       # Typewriter effect
lib/
├── ai/system-prompt.ts         # Compact ~1.2k token prompt with 3-step engine
└── ai/response-schema.ts       # TypeScript types for all components
```
