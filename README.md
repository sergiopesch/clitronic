# Clitronic

Your electronics companion. Ask anything about circuits, components, microcontrollers, and maker hardware — get instant visual answers.

## What It Does

Clitronic turns natural language questions into rich, animated UI cards. It's not a chatbot — it's a dynamic UI engine for electronics.

```
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
```

## Architecture

```
app/
├── api/chat/route.ts           # LLM endpoint with structured output validation
├── api/image-search/route.ts   # Multi-provider image search (Brave + Wikimedia)
├── globals.css                 # Design tokens + keyframe animations
└── page.tsx                    # Entry point
components/
├── console/local-console.tsx   # Main UI with conversation timeline
└── ui/                         # 10 visual card components + renderer
    ├── ui-renderer.tsx         # Routes JSON → component
    ├── animations.tsx          # AnimateIn + StaggerChildren
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
├── ai/system-prompt.ts         # Intent detection + response formatting
└── ai/response-schema.ts       # TypeScript types for all components
```

## How It Works

1. **Intent Detection**: 3-step engine classifies queries by signal words and question shape
2. **Response Validation**: Server-side normalization handles multiple LLM output shapes, component name aliases, and content-based detection as fallback
3. **Client Rendering**: `UIRenderer` routes structured JSON to the correct animated component
4. **Conversation Context**: Compact history summaries keep the LLM aware of what was discussed, preventing false off-topic flags on follow-ups

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
