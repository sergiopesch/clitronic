# Clitronic

**Workbench-first electronics studio with adaptive teaching windows**

Clitronic is evolving from an AI terminal companion into a **workbench-first web studio** for electronics learning and experimentation.

The command bar is still the spine, but the interface now sketches a bigger idea:

- commands create intent
- the workspace reacts visually
- teacher windows open when they are useful
- simulation, inspection, and learning sit side by side

This first refactor is not full circuit simulation yet. It is a **product prototype** that makes the concept visible and testable.

## Core product idea

Clitronic should feel like:

> a great electronics teacher standing beside you, noticing what you are building, and opening the right view at the right moment.

Instead of choosing between CLI or GUI, Clitronic combines both:

- **CLI / command layer** for speed, precision, and intent
- **adaptive web workspace** for spatial understanding and guidance
- **teaching windows** for explanation, warnings, and next steps
- **simulation surfaces** for behaviour, graphs, and debugging

## What the current prototype demonstrates

The web app now includes:

- a **workbench-first** layout
- a command bar (terminal-style input)
- an optional **Console** view (for history/debug)
- a collapsible **Windows** section (Teacher / Inspector / Graph / Topology)
- suggested next commands
- dynamic state changes for commands like:
  - `build ...`
  - `simulate`
  - `explain ...`
  - `focus ...`

Example flow:

```bash
build a simple led circuit with a 9v battery
simulate
explain why the led is dim
focus graph
```

The goal of this prototype is to prove the **interaction model**, not final simulation fidelity.

## Existing capabilities

### Commands

- `help` — Show available commands
- `auth` — Connect Claude Code or OpenAI Codex
- `build <idea>` — Open adaptive teaching windows for a circuit idea
- `simulate` — Switch workspace into simulation mode
- `explain <question>` — Ask the teacher layer about the active circuit
- `focus <panel>` — Emphasise a panel such as teacher, graph, or inspector
- `list [category]` — List components
- `info <component>` — Component details
- `identify` — Upload image to identify a component
- `clear` — Reset the terminal and workspace

## Demo mode (no user credentials)

For a public demo, it should be possible to try Clitronic **without entering any credentials**.

Recommended product posture:

1. **Demo mode** (default): the server routes requests to a hosted **open-source model** so first-time users can interact instantly.
2. **Bring-your-own-provider**: users can then connect Claude/OpenAI/etc for higher capability.

Status: **planned** (not fully wired yet).

Implementation note (recommended): keep the server-side chat layer compatible with an **OpenAI-compatible base URL** (Ollama/vLLM/etc), so the demo model is a configuration choice, not a forked codepath.

### Voice Mode

**Hold spacebar** to record, release to transcribe, then **Enter to send**.

### Image Analysis

- drag and drop images
- paste from clipboard
- upload via `identify`

## Why this direction matters

Most electronics tools optimise for one of two things:

- schematic accuracy
- intuitive understanding

Clitronic is aiming for something broader:

- **intent expressed by command**
- **state shown visually**
- **understanding surfaced contextually**

That gives us a path toward:

- multimodality
- adaptive teaching
- 3D workbench thinking
- signal and simulation views
- eventually richer circuit construction and co-simulation

## Quick Start

```bash
git clone https://github.com/sergiopesch/clitronic.git
cd clitronic
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If a provider is available it auto-connects; otherwise run `auth` and choose `Claude Code` or `OpenAI Codex`.

## Usage

### Web App

```bash
npm run dev
npm run build
npm start
```

Then try commands such as:

```bash
build a simple led circuit with a 9v battery
simulate
explain why the led is dim
focus inspector
```

### CLI

The standalone CLI package still exists and can continue to inform the command language.

```bash
cd cli && npm install
npm run start -- chat
npm run start -- ask "What resistor do I need for a 5V LED?"
npm run start -- info resistor
npm run start -- list
```

## Architecture

```text
clitronic/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── chat/           # Streaming AI responses
│   │   ├── auth/providers/ # Provider availability
│   │   └── speech-to-text/ # Voice transcription
│   └── page.tsx            # Main command-first studio
├── cli/                    # Standalone CLI package
├── components/
│   ├── api-key/           # Provider selection UI
│   ├── studio/            # Workbench visuals (previews)
│   ├── terminal/          # Command bar + console
│   └── voice/             # Voice mode indicator
├── hooks/                  # Recording and long-press hooks
└── lib/
    ├── ai/                # System prompt + tools
    ├── auth/              # Provider auth resolution
    ├── data/              # Component knowledge base
    └── utils/             # Audio/image helpers
```

## Product direction after this prototype

The next meaningful steps are:

1. introduce a real circuit document/state model
2. map commands to structured state changes rather than prompt inference alone
3. add a proper 2D topology view
4. add a true 3D workbench pass
5. open windows from simulation events, not just command parsing
6. make the teacher layer explain actual circuit state and failures

## Tech stack

- **Web**: Next.js 16, React 19, Tailwind CSS
- **AI**: Claude Sonnet via Vercel AI SDK v5
- **Voice**: OpenAI speech-to-text + browser recording APIs
- **CLI**: Commander.js

## Development

````bash
npm run dev
npm run build
npm run lint
npm run type-check
npm run format
npm run validate

### CI note

CI runs `npm run validate` (type-check + lint + prettier check). If CI fails, run:

```bash
npm run format
npm run validate
````

```

## License

MIT
```
