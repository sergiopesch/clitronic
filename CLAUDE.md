# Clitronic - Development Guide

## Project Overview

Clitronic is an AI-powered terminal companion for electronics enthusiasts. It features a keyboard-driven terminal interface with consistent cyan/blue branding, powered by Claude + OpenAI.

## Architecture

```
clitronic/
├── app/                    # Next.js 16 App Router
│   ├── api/
│   │   ├── chat/          # Streaming chat API endpoint
│   │   ├── auth/providers/ # Auth provider availability endpoint
│   │   ├── check-key/     # Backward-compatible auth status endpoint
│   │   ├── claude-code-auth/ # Claude Code credentials
│   │   └── speech-to-text/   # Voice transcription (Whisper)
│   └── page.tsx           # Terminal interface entry point
├── cli/                    # Self-contained CLI package
│   ├── bin/               # CLI entry point
│   ├── src/commands/      # Command implementations
│   └── src/data/          # Local copy of component data
├── components/
│   ├── api-key/           # Auth provider selection state + modal
│   ├── terminal/          # Rich terminal interface
│   └── voice/             # Voice mode indicator
├── hooks/                  # Custom React hooks
│   ├── useLongPress.ts    # Spacebar long-press detection
│   └── useVoiceRecording.ts # Browser audio capture
└── lib/
    ├── ai/                # System prompt & tool definitions
    ├── auth/              # Claude Code credentials reader
    ├── data/              # Component knowledge base (16 components)
    └── utils/             # Audio utilities
```

### Key Design Decisions

- **Web app**: Next.js 16 (App Router) + React 19 + Tailwind CSS
- **Terminal UI**: Keyboard-driven with electronics-themed ASCII art
- **Branding**: Consistent cyan/blue color scheme throughout
- **Authentication**: Provider-based auth (`claude-code` or `openai-codex`), no user API key entry
- **CLI**: Standalone package using `@anthropic-ai/sdk` directly

## Key Files

### Web App

- `app/page.tsx` - Renders the RichTerminal component
- `app/api/chat/route.ts` - Streaming chat API (uses `x-auth-provider` header)
- `components/terminal/rich-terminal.tsx` - **Main UI**: multimodal terminal with voice, camera, upload
- `components/api-key/` - Authentication provider state, modal, and context
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

- `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` - Optional server fallback for Claude provider
- `OPENAI_API_KEY` / `OPENAI_ACCESS_TOKEN` - Optional server fallback for OpenAI provider + voice

## Authentication

Users authenticate with the `auth` command in the terminal and choose:

1. `Claude Code` (local Claude credentials or server Anthropic env fallback)
2. `OpenAI Codex` (local Codex credentials or server OpenAI env fallback)

If no provider is selected and one is available, the client auto-selects the first available provider.

The browser stores only the selected provider id, not raw tokens.

## AI Integration

### Web (Vercel AI SDK v5)

- Uses `@ai-sdk/anthropic` with `streamText()`
- Provider selected via `x-auth-provider` header from client
- Tools defined with `zodSchema()` wrapper
- Response streaming via plain text stream
- Model: `claude-sonnet-4-20250514`

### CLI (Direct Anthropic SDK)

- Uses `@anthropic-ai/sdk` with `messages.stream()`
- Lazy client initialization (credentials checked on first use)
- Streaming text output with chalk coloring
- Model: `claude-sonnet-4-20250514`

## Terminal Features

### Commands

- `help` - Show available commands with ASCII box
- `auth` - Connect Claude Code or OpenAI Codex
- `list [category]` - List components (passive, active, input, output)
- `info <component>` - Component details
- `identify` - Upload image for component identification
- `clear` - Clear terminal

### Image Upload

Multiple ways to upload images:

- **Drag & drop** - Drop image directly into terminal
- **Paste** - Cmd/Ctrl+V to paste from clipboard
- **Upload** - Type `identify` to open file picker

Features:

- Images auto-resized before upload (max 1024px width)
- Sent as base64 data URLs to API
- Claude identifies components, decodes markings and color codes

### Voice Mode

**Activation**: Hold spacebar to record, release to send

**Requirements**:

- Browser with MediaRecorder support (Chrome, Firefox, Safari)
- Microphone permission
- OpenAI Codex auth or OpenAI server credentials (for Whisper transcription)

**Features**:

- Visual indicator shows recording (pulsing red) and transcribing (spinner)
- Audio chimes for start/end feedback
- Auto-populates input with transcribed text

**Implementation**:

- `useLongPress` hook detects spacebar hold (200ms threshold)
- `useVoiceRecording` hook captures audio via MediaRecorder
- Audio sent to `/api/speech-to-text` (OpenAI Whisper)
- Chimes generated programmatically with Web Audio API

### UI Elements

- Circuit-themed ASCII art header
- Classic retro terminal layout with modern spacing and contrast
- Header status chips showing connection state and voice mode availability
- Centered authentication modal with provider status and refresh action
- Safe-area-aware footer and touch-friendly controls on mobile
- Command history with ↑↓ navigation
- Consistent cyan/blue color scheme
- Copy buttons on code blocks
- Full text selection support
- Markdown rendering with syntax highlighting

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
