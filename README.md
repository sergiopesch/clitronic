# Clitronic

**Multimodal AI companion for electronics — speak, snap, or type**

A modern terminal interface that helps you understand electronic components, circuits, and calculations. Voice-first, camera-ready, powered by Claude AI.

## Quick Start

```bash
# Clone and install
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
npm install

# Run the web app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — click any action button and enter your API key when prompted.

## Features

### Multimodal Input

- **🎤 Voice** — Speak your questions naturally using Web Speech API
- **📷 Camera** — Point at a component and snap to identify (mobile)
- **📁 Upload** — Drag and drop or select images to identify components
- **⌨️ Type** — Classic terminal input for commands and questions

### AI Capabilities

- **Component Identification** — Identify components from photos, decode markings and color codes
- **Knowledge Base** — Detailed info on 16 common electronic components
- **Calculations** — Ohm's law, voltage dividers, current limiting, and more
- **Circuit Help** — Wiring examples, pinouts, and practical tips

### Terminal Experience

- Beautiful ASCII art logo with gradient colors
- Markdown rendering with syntax highlighting
- Command history (arrow keys)
- Color-coded output (commands, responses, errors)

## Security

Your API key is:

- Stored only in your browser's localStorage
- Never sent to or stored on our servers
- Sent directly to Anthropic's API over HTTPS
- Removable anytime (type `help` for commands)

## Usage

### Web App

```bash
npm run dev      # Development server
npm run build    # Production build
npm start        # Start production server
```

**Terminal Commands:**

- `help` — Show available commands
- `list [category]` — List components (passive, active, input, output)
- `info <component>` — Component details (e.g., `info led`)
- `clear` — Clear the terminal

Or just ask anything: _"What resistor do I need for a 5V LED?"_

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
│   ├── api/chat/          # Streaming chat API endpoint
│   └── page.tsx           # Terminal interface
├── cli/                    # Standalone CLI package
│   ├── bin/               # CLI entry point
│   └── src/               # Commands and data
├── components/
│   ├── api-key/           # API key management
│   └── terminal/          # Rich terminal with multimodal input
├── lib/
│   ├── ai/                # System prompt & tool definitions
│   └── data/              # Component knowledge base
└── types/                  # TypeScript declarations (Web Speech API)
```

**Technologies:**

- **Web**: Next.js 15, React 19, Tailwind CSS
- **AI**: Claude Sonnet via Vercel AI SDK v5
- **Voice**: Web Speech API
- **CLI**: Commander.js, @anthropic-ai/sdk

## Requirements

- Node.js 20+
- Anthropic API key ([get one here](https://console.anthropic.com/))
- Modern browser with Web Speech API support (Chrome, Edge, Safari)

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
