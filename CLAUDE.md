# Clitronic - Development Guide

## Project Overview

Clitronic is an AI-powered terminal companion for electronics enthusiasts. It features a keyboard-driven terminal interface with consistent cyan/blue branding, powered by Claude API.

## Architecture

```
clitronic/
├── app/                    # Next.js 15 App Router
│   ├── api/chat/          # Streaming chat API endpoint
│   └── page.tsx           # Terminal interface entry point
├── cli/                    # Self-contained CLI package
│   ├── bin/               # CLI entry point
│   ├── src/commands/      # Command implementations
│   └── src/data/          # Local copy of component data
├── components/
│   ├── api-key/           # API key provider and modal
│   └── terminal/          # Rich terminal interface
└── lib/
    ├── ai/                # System prompt & tool definitions
    └── data/              # Component knowledge base (16 components)
```

### Key Design Decisions

- **Web app**: Next.js 15 (App Router) + React 19 + Tailwind CSS
- **Terminal UI**: Keyboard-driven with electronics-themed ASCII art
- **Branding**: Consistent cyan/blue color scheme throughout
- **API Key**: Bring Your Own Key (BYOK) - stored in localStorage only
- **CLI**: Standalone package using `@anthropic-ai/sdk` directly

## Key Files

### Web App

- `app/page.tsx` - Renders the RichTerminal component
- `app/api/chat/route.ts` - Streaming chat API (accepts API key via header)
- `components/terminal/rich-terminal.tsx` - **Main UI**: multimodal terminal with voice, camera, upload
- `components/api-key/` - API key provider, modal, and context
- `lib/ai/system-prompt.ts` - Electronics companion persona
- `lib/ai/tools.ts` - Claude tool definitions (lookup, search, calculate)
- `lib/data/components.ts` - Component knowledge base (16 components)

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

- `ANTHROPIC_API_KEY` - Required for CLI; web app uses BYOK via header

## AI Integration

### Web (Vercel AI SDK v5)

- Uses `@ai-sdk/anthropic` with `streamText()`
- API key passed via `x-api-key` header from client
- Tools defined with `zodSchema()` wrapper
- Response streaming via `toUIMessageStreamResponse()`
- Model: `claude-sonnet-4-20250514`

### CLI (Direct Anthropic SDK)

- Uses `@anthropic-ai/sdk` with `messages.stream()`
- Lazy client initialization (API key checked on first use)
- Streaming text output with chalk coloring
- Model: `claude-sonnet-4-20250514`

## Terminal Features

### Commands

- `help` - Show available commands with ASCII box
- `list [category]` - List components (passive, active, input, output)
- `info <component>` - Component details
- `identify` - Upload image for component identification
- `key` - Set or update Anthropic API key
- `clear` - Clear terminal

### Image Upload

- Triggered via `identify` command
- Images sent as base64 data URLs to API
- Claude analyzes and identifies components

### UI Elements

- Circuit-themed ASCII art header
- Status bar showing connection state
- Command history with ↑↓ navigation
- Consistent cyan/blue color scheme

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
