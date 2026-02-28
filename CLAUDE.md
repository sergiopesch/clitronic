# Clitronic - Development Guide

## Project Overview

Clitronic is an AI-powered hardware companion for electronics enthusiasts. It uses Claude API to provide conversational assistance with electronic components, circuits, and calculations.

## Architecture

```
clitronic/
├── app/                    # Next.js 15 App Router
│   ├── api/chat/          # Streaming chat API endpoint
│   └── page.tsx           # Main chat interface
├── cli/                    # Self-contained CLI package
│   ├── bin/               # CLI entry point
│   ├── src/commands/      # Command implementations
│   └── src/data/          # Local copy of component data
├── components/            # React components
│   ├── chat/              # Chat UI (input, messages, cards)
│   └── terminal/          # Terminal-style panel
└── lib/
    ├── ai/                # System prompt & tool definitions
    └── data/              # Component knowledge base (16 components)
```

### Key Design Decisions

- **Web app**: Next.js 15 (App Router) + React 19 + Tailwind CSS
- **Web AI**: Claude Sonnet via `@ai-sdk/anthropic` + Vercel AI SDK v5
- **CLI**: Standalone package using `@anthropic-ai/sdk` directly
- **CLI Data**: Self-contained data module (copied from lib/data to avoid cross-package imports)

## Key Files

### Web App

- `app/api/chat/route.ts` - Streaming chat API endpoint
- `lib/ai/system-prompt.ts` - Electronics companion persona
- `lib/ai/tools.ts` - Claude tool definitions (lookup, search, calculate, ohms_law)
- `lib/data/components.ts` - Component knowledge base (16 components)
- `lib/data/search.ts` - Component search/lookup logic
- `components/chat/` - Chat UI components
- `components/terminal/` - Terminal panel (xterm-style)

### CLI Package

- `cli/bin/clitronic.ts` - Entry point with Commander.js
- `cli/src/client.ts` - Anthropic SDK wrapper with streaming
- `cli/src/data/index.ts` - Self-contained component data + search
- `cli/src/commands/` - Command implementations (chat, ask, identify, info, list)

## Commands

```bash
# Web app (from root)
npm run dev          # Start dev server
npm run build        # Production build
npm run validate     # Type check + lint + format check

# CLI (from cli/ directory)
cd cli && npm install
npm run start -- chat              # Interactive chat
npm run start -- ask "question"    # One-shot question
npm run start -- identify img.jpg  # Identify component from image
npm run start -- info resistor     # Component info
npm run start -- list              # List all components
npm run start -- list active       # Filter by category
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for both web and CLI

## AI Integration

### Web (Vercel AI SDK v5)

- Uses `@ai-sdk/anthropic` with `streamText()`
- Tools defined with `zodSchema()` wrapper
- Chat transport uses `DefaultChatTransport`
- Response streaming via `toUIMessageStreamResponse()`
- Model: `claude-sonnet-4-20250514`

### CLI (Direct Anthropic SDK)

- Uses `@anthropic-ai/sdk` with `messages.stream()`
- Lazy client initialization (API key checked on first use)
- Streaming text output with chalk coloring
- Model: `claude-sonnet-4-20250514`

## Component Database

16 electronic components with detailed information:

**Passive**: Resistor, Capacitor, Diode
**Active**: Transistor, Relay
**Input**: Push Button, Potentiometer, Photoresistor, Temperature Sensor, Ultrasonic Sensor
**Output**: LED, RGB LED, Piezo Speaker, Servo Motor, DC Motor, LCD Display

Each component includes:

- Description and specs
- Circuit example
- Pinout diagram
- Maximum ratings
- Characteristics table
- Common part numbers
- Tips and warnings
