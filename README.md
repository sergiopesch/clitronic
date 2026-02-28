# Clitronic

**AI-powered hardware companion for electronics enthusiasts**

An intelligent assistant that helps you understand electronic components, circuits, and calculations. Built with Claude AI, available as both a web app and CLI.

## Quick Start

```bash
# Clone and install
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
npm install

# Run the web app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter your API key in the app.

## Features

- **Bring Your Own Key** - Use your own Anthropic API key, stored securely in your browser
- **Component Knowledge Base** - Information on 16 common electronic components
- **AI-Powered Chat** - Ask questions about electronics in natural language
- **Component Lookup** - Quick access to specs, pinouts, and datasheets
- **Circuit Examples** - Practical wiring examples for each component
- **Image Identification** - Upload photos to identify components
- **Calculations** - Help with Ohm's law, voltage dividers, and more

## Security

Your API key is:

- Stored only in your browser's localStorage
- Never sent to or stored on our servers
- Sent directly to Anthropic's API over HTTPS
- Removable anytime from the settings

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
│   └── page.tsx           # Main chat interface
├── cli/                    # Standalone CLI package
│   ├── bin/               # CLI entry point
│   └── src/commands/      # Command implementations
├── components/            # React components
│   ├── api-key/           # API key management
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
