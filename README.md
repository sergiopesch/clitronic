# Clitronic

**AI-powered hardware companion for electronics enthusiasts**

An intelligent assistant that helps you understand electronic components, circuits, and calculations. Built with Claude AI, available as both a web app and CLI.

## Quick Start

```bash
# Clone and install
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
npm install

# Set your API key
cp .env.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY

# Run the web app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start chatting.

## Features

- **Component Knowledge Base** - Information on 16 common electronic components (resistors, capacitors, LEDs, transistors, etc.)
- **AI-Powered Chat** - Ask questions about electronics in natural language
- **Component Lookup** - Quick access to specs, pinouts, and datasheets
- **Circuit Examples** - Practical wiring examples for each component
- **Image Identification** - Upload photos to identify components (CLI)
- **Calculations** - Help with Ohm's law, voltage dividers, and more

## Usage

### Web App

```bash
npm run dev      # Development server
npm run build    # Production build
npm start        # Start production server
```

### CLI

```bash
cd cli && npm install

# Interactive chat
npx tsx bin/clitronic.ts chat

# One-shot question
npx tsx bin/clitronic.ts ask "What resistor do I need for a 5V LED?"

# Identify a component from an image
npx tsx bin/clitronic.ts identify component.jpg

# Get component info
npx tsx bin/clitronic.ts info resistor

# List all known components
npx tsx bin/clitronic.ts list
```

## Architecture

```
clitronic/
├── app/                    # Next.js App Router
│   ├── api/chat/          # Streaming chat API endpoint
│   └── page.tsx           # Main chat interface
├── cli/                    # Standalone CLI package
│   ├── bin/               # CLI entry point
│   └── src/commands/      # Command implementations
├── components/            # React components
│   ├── chat/              # Chat UI components
│   └── terminal/          # Terminal-style panel
└── lib/
    ├── ai/                # System prompt & tool definitions
    └── data/              # Component knowledge base
```

**Key Technologies:**
- **Web**: Next.js 15, React 19, Tailwind CSS
- **AI**: Claude Sonnet via Vercel AI SDK v5
- **CLI**: Commander.js, @anthropic-ai/sdk

## Requirements

- Node.js 20+
- Anthropic API key ([get one here](https://console.anthropic.com/))

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
