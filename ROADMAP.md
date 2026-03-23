# Roadmap

## Current State (v0.1)

Text-in, visual-out electronics companion with 10 UI components, conversation history with timeline navigation, and multi-provider image search.

---

## v0.2 — Realtime Voice

Talk to Clitronic instead of typing. Ask questions hands-free while soldering or wiring.

### Goals

- Push-to-talk voice input using Web Speech API or Whisper
- Streaming TTS responses for key information (values, steps, warnings)
- Voice-optimized response mode: shorter text, spoken summaries of visual cards
- Visual indicator showing listening/processing/speaking states
- Fallback to text input on unsupported browsers

### Technical Approach

- OpenAI Realtime API or Whisper for speech-to-text
- OpenAI TTS or Web Speech API for text-to-speech
- New `voice` field in response schema for spoken summaries
- Audio context management (pause TTS on new input, handle interruptions)

### Key Decisions

- Push-to-talk vs always-listening (PTT preferred for noise tolerance in workshops)
- Whether voice responses should narrate full card content or just key values
- Latency budget: voice round-trip should feel conversational (<2s)

---

## v0.3 — Complex Context with Rich Visuals

Deeper understanding of multi-turn conversations with richer image and diagram capabilities.

### Goals

- Multi-card responses: a single query can produce multiple related cards (e.g., wiring card + pinout card + warning)
- Contextual image generation: AI-generated circuit diagrams tailored to the exact question, not just predefined SVGs
- Composite views: combine a photo of a component with an overlay of pin labels or wiring highlights
- Project memory: track components the user has mentioned across turns ("you're using an ESP32 with a DHT22, so...")
- Smart follow-ups: suggest the next logical question based on what was discussed

### Technical Approach

- Expand response schema to support `cards: []` array for multi-card responses
- Integrate an image generation model (e.g., DALL-E, Stable Diffusion) for custom circuit diagrams
- Canvas-based overlay renderer for annotated component images
- Session-level context extraction: parse mentioned components, voltages, and connections into a structured "project state"
- New `suggestions` field in response schema for follow-up prompts

### Key Decisions

- How many cards per response before it feels cluttered (likely 2-3 max)
- Generated diagrams vs. expanded SVG library (generated is more flexible, SVG is faster)
- Where to store project state (client-side vs. server-side session)

---

## v0.4 — Circuit Simulation

Go beyond static answers. Let users simulate circuits directly in the browser.

### Goals

- Interactive circuit simulator embedded in responses
- Drag-and-drop component placement on a virtual breadboard
- Real-time voltage/current visualization across nodes
- "What if" mode: change a resistor value and see the effect instantly
- Export simulation as shareable link or image

### Technical Approach

- SPICE-based simulation engine compiled to WebAssembly (e.g., ngspice-wasm or custom)
- Canvas/WebGL renderer for circuit visualization with animated current flow
- LLM generates netlist from natural language ("simulate a voltage divider with 10k and 5k resistors at 12V")
- New `simulation` component type in response schema with netlist, component positions, and initial conditions
- Bidirectional: user modifications to the simulation feed back as context for follow-up questions

### Key Decisions

- Scope of simulation: DC only vs. AC/transient analysis
- Component library size at launch (resistors, capacitors, LEDs, transistors, op-amps as minimum)
- Whether to use an existing open-source simulator or build a lightweight custom one
- Performance budget: simulation must update in <100ms for interactive feel

---

## Future Ideas (Unscheduled)

- **PCB Layout Preview**: Generate simple PCB layouts from wiring descriptions
- **Component Search + Purchase Links**: "Where can I buy this?" with real-time stock/pricing
- **Collaborative Mode**: Share a session with someone for pair debugging
- **Offline Mode**: Cache common responses and diagrams for use without internet
- **Mobile App**: Native wrapper with camera input for identifying components
- **Learning Paths**: Guided sequences ("Learn Arduino in 10 questions")
