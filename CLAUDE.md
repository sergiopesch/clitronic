# Clitronic - Development Guide

## Project Overview

Clitronic is an AI-powered hardware companion for electronics enthusiasts. It uses Claude API (via Vercel AI SDK) to provide conversational assistance with electronic components, circuits, and calculations.

## Architecture

- **Web app**: Next.js 15 (App Router) with React 19 + Tailwind CSS
- **AI**: Claude Sonnet via `@ai-sdk/anthropic` + Vercel AI SDK v5
- **CLI**: Standalone Node.js CLI using `@anthropic-ai/sdk` directly
- **Data**: TypeScript module with 16 electronic components (ported from interactive-component-explorer)

## Key Files

- `app/api/chat/route.ts` - Streaming chat API endpoint
- `lib/ai/system-prompt.ts` - Electronics companion persona
- `lib/ai/tools.ts` - Claude tool definitions (lookup, search, calculate)
- `lib/data/components.ts` - Component knowledge base (16 components)
- `lib/data/search.ts` - Component search/lookup logic
- `components/chat/` - Chat UI components
- `components/terminal/` - Terminal panel (xterm-style)
- `cli/` - CLI package (Commander.js)

## Commands

```bash
# Web app
npm run dev      # Start dev server
npm run build    # Build for production

# CLI (from cli/ directory)
cd cli && npm install
npx tsx bin/clitronic.ts chat          # Interactive chat
npx tsx bin/clitronic.ts ask "question" # One-shot question
npx tsx bin/clitronic.ts identify img.jpg # Identify component
npx tsx bin/clitronic.ts info resistor  # Component info
npx tsx bin/clitronic.ts list           # List all components
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for both web and CLI

## AI SDK Notes

- Using AI SDK v5 (npm `ai` v6) which uses `UIMessage` with `parts` array
- Tools use `inputSchema` with `zodSchema()` wrapper (not `parameters`)
- Chat transport uses `DefaultChatTransport` (not `api` prop)
- Response streaming uses `toUIMessageStreamResponse()`
