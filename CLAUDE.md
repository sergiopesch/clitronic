# Clitronic - Development Guide

## Purpose

Clitronic is an AI-powered electronics companion that generates **structured UI responses** from natural language queries. Every AI response follows a defined schema so the frontend can render rich, interactive components — cards, diagrams, calculations, charts — instead of raw text.

The goal: an electronics enthusiast asks a question and gets a smooth, visual, useful answer.

## Tech Stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **Backend**: Next.js API routes (`app/api/`)
- **AI**: Anthropic Claude via `@ai-sdk/anthropic` + Vercel AI SDK v5
- **Styling**: Dark-only design tokens defined in `globals.css`
- **Deployment**: Vercel

## Architecture

```
clitronic/
├── app/
│   ├── api/chat/route.ts       # Streaming chat API — AI + tool-calling
│   ├── layout.tsx              # Root layout (dark mode, design tokens)
│   ├── globals.css             # Design token system
│   └── page.tsx                # Entry point → LocalConsole
├── components/
│   ├── console/
│   │   ├── local-console.tsx   # Main chat UI + header + input
│   │   └── learning-monitor.tsx # Side panel: scene, guide, inspect tabs
│   └── studio/
│       └── previews.tsx        # Circuit diagrams, topology, workbench
├── lib/
│   ├── ai/
│   │   ├── system-prompt.ts    # Electronics companion persona
│   │   └── tools.ts            # AI tool definitions (Zod + Vercel AI SDK)
│   ├── data/
│   │   ├── components.ts       # 16 electronics components knowledge base
│   │   ├── search.ts           # Component lookup + search functions
│   │   └── types.ts            # ElectronicsComponent type definitions
│   ├── circuit/                # Circuit document model + analysis
│   ├── local-llm/              # Local model runtime (guided tools, tooling)
│   └── teacher-state.ts        # Teacher state propagation for monitor
└── cli/                        # Standalone CLI package
```

## Structured UI Responses

All AI responses MUST produce structured output that the frontend can render as rich UI. The response schema:

```typescript
{
  intent: string;       // What the user is trying to do (e.g. "calculate_resistor", "lookup_component", "build_circuit")
  ui_type: string;      // How to render it (e.g. "card", "diagram", "calculation", "chart", "parts_list")
  behavior: string;     // Interaction model (e.g. "static", "expandable", "interactive", "animated")
  data: object;         // The actual content for rendering
}
```

### UI Type Priority

1. **Cards** over raw text — component info, specs, tips
2. **Calculations** over paragraphs — resistor values, Ohm's law, power
3. **Diagrams** over descriptions — circuit layouts, pinouts, wiring
4. **Charts** over tables — voltage/current relationships, power curves
5. **Parts lists** over bullet points — structured, actionable shopping lists
6. **Text** only as a last resort for conversational responses

### Animation & Feel

- All UI transitions must be smooth (fade-in, slide-up)
- Cards should appear with subtle entrance animations
- Calculation results should animate their values
- The interface should feel responsive and futuristic, not static

## Design Tokens

Defined in `app/globals.css`. Always use token classes, never hardcode colors:

- Surfaces: `surface-0` through `surface-4`
- Text: `text-primary`, `text-secondary`, `text-muted`
- Accent: `accent`, `accent-dim`, `accent-muted`
- Semantic: `success`, `warning`, `error`
- Borders: `border`, `border-accent`

## AI Integration

### Tool-Calling Architecture

The AI (Claude) decides when to use tools. Tools are defined in `lib/ai/tools.ts`:

- `lookup_component` — Component specs, pinout, datasheet info
- `search_components` — Search by category or keyword
- `calculate_resistor` — LED limiting, voltage divider, pull-up
- `ohms_law` — V/I/R/P calculations

The AI receives tool results and generates structured UI responses. The frontend renders the appropriate component based on `ui_type`.

### Server-Side Only

- API key is set server-side (`ANTHROPIC_API_KEY` env var)
- Users never provide or see API keys
- Rate limiting protects against abuse

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run validate     # Type check + lint + format check
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format with Prettier
```

## Conventions

- Use `font-mono` for technical values (resistance, voltage, pin names)
- Use semantic color tokens for status (success/warning/error)
- Keep components small and focused
- Prefer composition over configuration
- All new UI components should support the structured response schema
- Test with `npm run validate` before committing

## Component Database

16 electronics components with full specs in `lib/data/components.ts`:

**Passive**: Resistor, Capacitor, Diode
**Active**: Transistor, Relay
**Input**: Push Button, Potentiometer, Photoresistor, Temperature Sensor, Ultrasonic Sensor
**Output**: LED, RGB LED, Piezo Speaker, Servo Motor, DC Motor, LCD Display
