# Clitronic

**AI-powered terminal companion for electronics and robotics ++**

A beautiful terminal interface that helps you understand electronic components, circuits, and calculations. Keyboard-driven, multimodal, powered by Claude + OpenAI.

## Quick Start

```bash
# Clone and install
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
npm install

# Run the web app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If a provider is available it auto-connects; otherwise run `auth` and choose `Claude Code` or `OpenAI Codex`.

## Features

### Terminal Commands

- `help` — Show all available commands
- `auth` — Connect Claude Code or OpenAI Codex
- `list [category]` — List components (passive, active, input, output)
- `info <component>` — Component details (e.g., `info led`)
- `identify` — Upload an image to identify a component
- `clear` — Clear the terminal

### Voice Mode

**Hold spacebar** to record, release to transcribe, then **Enter to send**.

- Works when not typing in the input field
- Hold Ctrl+Space (or Cmd+Space) when focused in input
- Visual indicator shows recording (pulsing red) and transcribing
- Audio chimes for start/end feedback
- Transcribed text appears in input field for review
- Requires OpenAI credentials (OpenAI Codex auth or server-side OpenAI env credentials)

### Image Analysis

- **Drag & drop** images directly into the terminal
- **Paste** images from clipboard (Cmd/Ctrl+V)
- **Upload** via `identify` command
- Claude identifies components, decodes markings and color codes

### AI Capabilities

- **Component Identification** — Identify components from photos, decode markings and color codes
- **Knowledge Base** — Detailed info on 16 common electronic components
- **Calculations** — Ohm's law, voltage dividers, current limiting, and more
- **Circuit Help** — Wiring examples, pinouts, and practical tips

### Terminal Experience

- Electronics-themed ASCII art
- Classic retro terminal look with modern spacing and contrast
- Clear provider/voice status chips
- Centered auth modal with provider status and refresh action
- Mobile-friendly touch targets and safe-area-aware footer
- Consistent cyan/blue branding
- Markdown rendering with syntax highlighting
- Command history (↑↓ arrow keys)
- Copy buttons on code blocks
- Text selection and copying

## Authentication

No end-user API keys required.

Users authenticate by running `auth` and selecting:

- `Claude Code` (uses local Claude Code credentials or server-side Anthropic env credentials)
- `OpenAI Codex` (uses local Codex credentials or server-side OpenAI env credentials)

If one provider is available, Clitronic auto-selects it to minimize setup friction.

Optional server-side fallback configuration:

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...          # or ANTHROPIC_AUTH_TOKEN

# OpenAI
OPENAI_API_KEY=sk-...                 # or OPENAI_ACCESS_TOKEN
```

## Security

Authentication tokens are resolved server-side from trusted sources:

- local Claude Code / Codex credential stores
- or server environment variables

The browser stores only the selected provider (`claude-code` or `openai-codex`), not raw API keys.

## Usage

### Web App

```bash
npm run dev      # Development server
npm run build    # Production build
npm start        # Start production server
```

Just ask anything: _"What resistor do I need for a 5V LED?"_

### CLI

```bash
cd cli && npm install
export ANTHROPIC_API_KEY=your_key_here

# Interactive chat
npm run start -- chat

# One-shot question
npm run start -- ask "What resistor do I need for a 5V LED?"

# Identify a component from an image
npm run start -- identify component.jpg

# Get component info (no API key needed)
npm run start -- info resistor

# List all known components (no API key needed)
npm run start -- list
```

## Architecture

```
clitronic/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── chat/          # Streaming chat API
│   │   ├── auth/providers/ # Provider availability and selection validation
│   │   ├── check-key/     # Backward-compatible auth status endpoint
│   │   ├── claude-code-auth/  # Claude Code credentials
│   │   └── speech-to-text/    # Voice transcription
│   └── page.tsx           # Terminal interface
├── cli/                    # Standalone CLI package
├── components/
│   ├── api-key/           # Auth provider selection UI
│   ├── terminal/          # Rich terminal interface
│   └── voice/             # Voice mode indicator
├── hooks/                  # React hooks
│   ├── useLongPress.ts    # Spacebar detection
│   └── useVoiceRecording.ts  # Audio capture
└── lib/
    ├── ai/                # System prompt & tools
    ├── auth/              # Claude/Codex credential resolution
    ├── data/              # Component knowledge base
    └── utils/             # Audio utilities
```

**Technologies:**

- **Web**: Next.js 16, React 19, Tailwind CSS
- **AI**: Claude Sonnet via Vercel AI SDK v5
- **Voice**: OpenAI Whisper, Web Audio API, MediaRecorder
- **CLI**: Commander.js, @anthropic-ai/sdk

## Requirements

- Node.js 20+
- Claude Code or OpenAI Codex credentials for local auth flow
- Optional server credentials via environment variables (for hosted deployments)
- Browser with MediaRecorder support (for voice mode)

## Environment Variables

| Variable               | Required | Description                                               |
| ---------------------- | -------- | --------------------------------------------------------- |
| `ANTHROPIC_API_KEY`    | No       | Anthropic API key fallback for Claude provider            |
| `ANTHROPIC_AUTH_TOKEN` | No       | Anthropic bearer token fallback for Claude provider       |
| `OPENAI_API_KEY`       | No       | OpenAI API key fallback for Codex provider and voice      |
| `OPENAI_ACCESS_TOKEN`  | No       | OpenAI bearer token fallback for Codex provider and voice |

None are required for local testing if users have Claude Code or OpenAI Codex already authenticated.

Also accepted aliases in hosted deployments: `ANTHROPIC_KEY` and `OPENAI_KEY` (plus lowercase equivalents).

## Development

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Run ESLint
npm run type-check   # TypeScript validation
npm run format       # Format with Prettier
npm run validate     # Run all checks
```

## License

MIT
