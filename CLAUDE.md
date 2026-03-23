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
    "type": "card | chart | text",
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

## Intent Detection

### Core Intents → Mode Mapping

| Intent | Mode | When |
|--------|------|------|
| `spec_card` | UI | Product specs, features, component details |
| `comparison_card` | UI | Comparing two or more items |
| `explanation_card` | UI | Explaining concepts with structure |
| `hybrid_card` | UI | Mix of explanation + structured info |
| `recommendation_card` | UI | Suggesting products or options |
| `troubleshooting_card` | UI | Step-by-step debugging guidance |
| `calculation_card` | UI | Resistor values, Ohm's law, power |
| `quick_answer` | Text | Simple factual or conversational reply |

**Default bias: UI mode.**

## Decision Engine

Before answering, the LLM decides:

1. Multi-attribute, comparative, visual, or structured? → **UI mode**
2. Simple, one sentence, conversational? → **Text mode**

## UI Components

### Spec Card
`component: "specCard"` — title, keySpecs[], optionalDetails (collapsible)

### Comparison Card
`component: "comparisonCard"` — items[], attributes[], keyDifferences[]

### Explanation Card
`component: "explanationCard"` — title, summary, keyPoints[]

### Recommendation Card
`component: "recommendationCard"` — items[], reason, highlights[]

### Troubleshooting Card
`component: "troubleshootingCard"` — issue, steps[], tips[]

### Calculation Card
`component: "calculationCard"` — title, formula, inputs{}, result{}

## UI Philosophy

Apple UI + Tesla UI + AI-native system.

- Futuristic and fluid
- Components appear, expand, collapse, transition smoothly
- Avoid static blocks
- Prefer visual clarity over verbosity
- Minimal but meaningful

## Animation Rules

- UI mode: animation REQUIRED, default state `collapsed`, expand if high relevance
- Text mode: no animation required, concise and clean
- Default duration: 200ms ease-out
- Stagger siblings: 50-100ms
- Enter: `opacity-0 → 1` + `translate-y-2 → 0`
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
├── globals.css                 # Design tokens
├── layout.tsx                  # Root layout
└── page.tsx                    # Entry → LocalConsole
components/
├── console/local-console.tsx   # Main chat interface
├── ui/                         # Structured UI card components
│   ├── ui-renderer.tsx         # Routes JSON → component
│   ├── spec-card.tsx
│   ├── comparison-card.tsx
│   ├── explanation-card.tsx
│   ├── recommendation-card.tsx
│   ├── troubleshooting-card.tsx
│   ├── calculation-card.tsx
│   └── text-response.tsx
lib/
├── ai/system-prompt.ts         # LLM system prompt with schema rules
└── ai/response-schema.ts       # TypeScript types for the response schema
```
