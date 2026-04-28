# Roadmap

## Current State (v0.2)

Voice-first electronics companion with:

- realtime microphone input via OpenAI Realtime
- live user captions while speaking
- assistant speech mirrored on-screen word by word
- structured UI cards for explanations, troubleshooting, images, comparisons, wiring, charts, and calculations
- typed prompt fallback on the welcome screen and during active sessions
- context-aware follow-up chips and local reopening of previous visual answers
- consistent card headers, safety callouts, copy actions, and progressive disclosure for long procedural cards
- context-aware image follow-ups like `show me one`
- multi-provider image search with Brave + Wikimedia fallback

---

## Recently Shipped — UI/UX Polish

The current pass refined the app from a working voice demo into a more complete workshop tool.

### Landed

- Text composer added alongside voice interaction.
- Mic mute now controls local microphone capture rather than assistant audio playback.
- Recent turns can reopen previous structured card responses locally.
- Follow-up actions adapt to the current response card type.
- Safety callouts are standardized across card types.
- Cards share a consistent header/count/action system.
- Wiring and troubleshooting cards collapse long step lists after the first five items while keeping warnings visible.

### Follow-up polish ideas

- browser-level screenshot coverage for representative card states
- richer empty/error states for unavailable voice or exhausted daily quota
- export/share actions for useful visual cards

## Previously Shipped — Realtime Voice

Clitronic can now be used hands-free while soldering, wiring, or probing a board.

### Landed

- Push-to-talk voice input with OpenAI Realtime
- Live transcription while the user is speaking
- Spoken assistant responses with matching on-screen captions
- Voice summaries for structured cards
- Visual state transitions for listening, processing, and speaking
- Visible text fallback when a card is not rendered

### Follow-up polish ideas

- tighter sync between spoken audio timing and the on-screen word reveal
- local/dev tooling for easier browser-level voice regression testing
- optional text input fallback for unsupported browsers or silent environments

## v0.3 — Complex Context with Rich Visuals

Deeper understanding of multi-turn conversations with richer image and diagram capabilities.

### v0.3 Goals

- Multi-card responses: a single query can produce multiple related cards (e.g., wiring card + pinout card + warning)
- Contextual image generation: AI-generated circuit diagrams tailored to the exact question, not just predefined SVGs
- Composite views: combine a photo of a component with an overlay of pin labels or wiring highlights
- Project memory: track components the user has mentioned across turns ("you're using an ESP32 with a DHT22, so...")
- Smart follow-ups: suggest the next logical question based on what was discussed

### v0.3 Technical Approach

- Expand response schema to support `cards: []` array for multi-card responses
- Integrate an image generation model (e.g., DALL-E, Stable Diffusion) for custom circuit diagrams
- Canvas-based overlay renderer for annotated component images
- Session-level context extraction: parse mentioned components, voltages, and connections into a structured "project state"
- New `suggestions` field in response schema for follow-up prompts

### v0.3 Key Decisions

- How many cards per response before it feels cluttered (likely 2-3 max)
- Generated diagrams vs. expanded SVG library (generated is more flexible, SVG is faster)
- Where to store project state (client-side vs. server-side session)

---

## v0.4 — Circuit Simulation

Go beyond static answers. Let users simulate circuits directly in the browser.

### v0.4 Goals

- Interactive circuit simulator embedded in responses
- Drag-and-drop component placement on a virtual breadboard
- Real-time voltage/current visualization across nodes
- "What if" mode: change a resistor value and see the effect instantly
- Export simulation as shareable link or image

### v0.4 Technical Approach

- SPICE-based simulation engine compiled to WebAssembly (e.g., ngspice-wasm or custom)
- Canvas/WebGL renderer for circuit visualization with animated current flow
- LLM generates netlist from natural language ("simulate a voltage divider with 10k and 5k resistors at 12V")
- New `simulation` component type in response schema with netlist, component positions, and initial conditions
- Bidirectional: user modifications to the simulation feed back as context for follow-up questions

### v0.4 Key Decisions

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
