# Clitronic

**AI-powered terminal companion for electronics and robotics**

A beautiful terminal interface that helps you understand electronic components, circuits, and calculations. Keyboard-driven, multimodal, powered by Claude AI.

## Quick Start

```bash
# Clone and install
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
npm install

# Run the web app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — if you have Claude Code installed, click "Use Claude Code Credentials" to authenticate instantly.

## Features

### Terminal Commands

- `help` — Show all available commands
- `list [category]` — List components (passive, active, input, output)
- `info <component>` — Component details (e.g., `info led`)
- `identify` — Upload an image to identify a component
- `key` — Set or update your API key
- `clear` — Clear the terminal

### Voice Mode

**Hold spacebar** to record, release to send.

- Visual indicator shows recording (pulsing red) and transcribing
- Audio chimes for start/end feedback
- Transcribed text auto-populates the input field
- Requires OpenAI API key for Whisper transcription

### Image Analysis

- **Drag & drop** images directly into the terminal
- **Paste** images from clipboard (Cmd/Ctrl+V)
- **Upload** via `identify` command
- Claude identifies components, decodes markings and color codes

### Claude Code Integration

One-click authentication for Claude Code users:

1. Click "Use Claude Code Credentials" button
2. Reads credentials from macOS Keychain or `~/.claude/.credentials.json`
3. Status bar shows "● claude code" when connected

### AI Capabilities

- **Component Identification** — Identify components from photos, decode markings and color codes
- **Knowledge Base** — Detailed info on 16 common electronic components
- **Calculations** — Ohm's law, voltage dividers, current limiting, and more
- **Circuit Help** — Wiring examples, pinouts, and practical tips

### Terminal Experience

- Electronics-themed ASCII art
- Consistent cyan/blue branding
- Markdown rendering with syntax highlighting
- Command history (↑↓ arrow keys)
- Copy buttons on code blocks
- Text selection and copying

## Authentication

### Option 1: Claude Code (Recommended)

If you have [Claude Code](https://claude.ai/code) installed and authenticated:

1. Type `key` in the terminal
2. Click "Use Claude Code Credentials"
3. Done! Your existing credentials are used automatically.

### Option 2: Manual API Key

1. Type `key` in the terminal
2. Enter your Anthropic API key (starts with `sk-ant-`)
3. Key is stored in browser localStorage

### Option 3: Environment Variable

Create `.env.local` for server-side configuration:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-openai-key  # Optional: for voice mode
```

## Security

Your API keys are:

- Stored only in your browser's localStorage (manual entry)
- Or read from your local Claude Code credentials (one-click auth)
- Never sent to or stored on our servers
- Sent directly to Anthropic/OpenAI APIs over HTTPS

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
│   │   ├── check-key/     # API key validation
│   │   ├── claude-code-auth/  # Claude Code credentials
│   │   └── speech-to-text/    # Voice transcription
│   └── page.tsx           # Terminal interface
├── cli/                    # Standalone CLI package
├── components/
│   ├── api-key/           # API key management
│   ├── terminal/          # Rich terminal interface
│   └── voice/             # Voice mode indicator
├── hooks/                  # React hooks
│   ├── useLongPress.ts    # Spacebar detection
│   └── useVoiceRecording.ts  # Audio capture
└── lib/
    ├── ai/                # System prompt & tools
    ├── auth/              # Claude Code credentials
    ├── data/              # Component knowledge base
    └── utils/             # Audio utilities
```

**Technologies:**

- **Web**: Next.js 15, React 19, Tailwind CSS
- **AI**: Claude Sonnet via Vercel AI SDK v5
- **Voice**: OpenAI Whisper, Web Audio API, MediaRecorder
- **CLI**: Commander.js, @anthropic-ai/sdk

## Requirements

- Node.js 20+
- Anthropic API key ([get one here](https://console.anthropic.com/)) or Claude Code installed
- OpenAI API key (optional, for voice mode)
- Browser with MediaRecorder support (for voice mode)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No* | Claude API key for chat |
| `OPENAI_API_KEY` | No | OpenAI API key for voice mode |

*Not required if using Claude Code authentication or browser-based API key entry.

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
