# Clitronic

**AI-powered electronics companion — dynamic UI engine**

Clitronic turns natural language electronics questions into structured, animated UI cards. Ask about circuits, components, calculations, or troubleshooting and get visual, interactive responses.

## How it works

```
User input → OpenAI (gpt-4o-mini) → Structured JSON → UI Renderer → Animated Cards
```

The LLM decides whether to render a visual card or a simple text response based on intent detection. Every response is valid JSON with a defined schema.

## Card types

- **Spec Card** — component specs, features, pinouts
- **Comparison Card** — side-by-side attribute comparison
- **Explanation Card** — structured concept breakdowns
- **Recommendation Card** — product/approach suggestions with highlights
- **Troubleshooting Card** — interactive debug checklists
- **Calculation Card** — formulas with inputs and results (Ohm's law, resistor values, etc.)

## Quick start

```bash
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
npm install
```

Create `.env.local` with your OpenAI key:

```bash
OPENAI_API_KEY=your_key_here
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Development

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run validate     # Type check + lint + format check
```

## Architecture

```text
app/
├── api/chat/route.ts           # OpenAI structured output endpoint
├── globals.css                 # Design tokens (dark-only)
├── layout.tsx                  # Root layout
└── page.tsx                    # Entry → LocalConsole
components/
├── console/local-console.tsx   # Main chat interface
└── ui/                         # Structured UI card components
    ├── ui-renderer.tsx         # Routes JSON → component
    ├── animations.tsx          # AnimateIn entrance animations
    ├── spec-card.tsx
    ├── comparison-card.tsx
    ├── explanation-card.tsx
    ├── recommendation-card.tsx
    ├── troubleshooting-card.tsx
    ├── calculation-card.tsx
    └── text-response.tsx
lib/
├── ai/system-prompt.ts         # LLM system prompt with schema rules
└── ai/response-schema.ts       # TypeScript types for response schema
cli/                            # Standalone CLI tool (separate package)
```

## Tech stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4
- **LLM**: OpenAI `gpt-4o-mini` with structured JSON output
- **No database. No auth. No persistence.** Stateless MVP.

## License

MIT
