# UI Generation Rules

## The Pipeline

```
User query → 3-step intent detection → Mode decision → Structured JSON → UI Renderer → Animated Component
```

## 3-Step Intent Detection Engine

1. **What is the user asking FOR?** Signal words + question shape → component
2. **Could a visual make this BETTER?** Yes → ui mode. One sentence → text mode.
3. **Pick the MOST VISUAL component that fits.** Diagram > explanation. Chart > list. Wiring guide > paragraph.

## Intent → Component Mapping

| Signal | Component | Animation | Default State |
|--------|-----------|-----------|---------------|
| Specs/features of a thing | `specCard` | slideUp | collapsed |
| Two+ things side by side | `comparisonCard` | slideUp | open |
| How something works / concepts | `explanationCard` | fadeIn | open |
| Visual/diagram/schematic/waveform | `imageBlock` (diagram) | fadeIn | open |
| Show me a real component/board | `imageBlock` (photo) | fadeIn | open |
| What should I use/buy/build | `recommendationCard` | slideUp | collapsed |
| Not working / broken / debug | `troubleshootingCard` | expand | open |
| Numeric answer with formula | `calculationCard` | slideUp | open |
| Pin layout of a chip/board | `pinoutCard` | slideUp | open |
| Numeric values to compare visually | `chartCard` | slideUp | open |
| How to wire/connect/assemble | `wiringCard` | expand | open |
| Greeting or trivial one-liner | (text mode) | none | n/a |

## Mode Decision (CRITICAL)

1. Multi-attribute, comparative, visual, or structured? → **UI**
2. Simple, one sentence, conversational? → **Text**
3. Uncertain? → **UI** (default bias)

## Component Data Shapes

### specCard
```json
{ "title": "str", "subtitle?": "str", "keySpecs": [{"label":"str","value":"str"}], "optionalDetails?": [{"label":"str","value":"str"}] }
```

### comparisonCard
```json
{ "items": ["str","str"], "attributes": [{"name":"str","values":["str","str"]}], "keyDifferences": ["str"], "useCases?": [{"item":"str","useCase":"str"}] }
```

### explanationCard
```json
{ "title": "str", "summary": "str", "keyPoints": ["str"] }
```

### imageBlock
```json
{ "imageMode": "diagram|photo", "diagramType?": "str", "labels?": {"k":"v"}, "searchQuery?": "str", "caption": "str", "description?": "str", "notes?": ["str"] }
```
- **diagram mode**: diagramType = breadboard | voltage-divider | led-circuit | pull-up | pull-down | pwm | capacitor-charge
- **photo mode**: searchQuery = descriptive term for real product/component image search

### recommendationCard
```json
{ "items": [{"name":"str","reason":"str"}], "highlights": ["str"] }
```

### troubleshootingCard
```json
{ "issue": "str", "steps": [{"label":"str","detail":"str"}], "tips": ["str"] }
```

### calculationCard
```json
{ "title": "str", "formula": "str", "inputs": [{"label":"str","value":"str"}], "result": {"label":"str","value":"str","note?":"str"} }
```

### pinoutCard
```json
{ "component": "str", "description?": "str", "pins": [{"number":1,"label":"str","type":"power|ground|digital|analog|other"}] }
```
Pins in physical order. First half = left side, second half = right side (reversed).

### chartCard
```json
{ "title": "str", "subtitle?": "str", "bars": [{"label":"str","value":0,"unit?":"str","color?":"accent|success|warning|error"}] }
```

### wiringCard
```json
{ "title": "str", "description?": "str", "steps": [{"from":"str","to":"str","wire?":"str","note?":"str"}], "warnings?": ["str"] }
```

## Animation Standards

- All UI responses animate in. Text responses do not.
- Duration: 200ms ease-out
- Stagger between siblings: 80ms
- Enter: opacity 0→1, translateY 8px→0, blur
- Respect `prefers-reduced-motion`

## Color Usage in Cards

- **Cyan/accent**: titles, active elements, primary values
- **Emerald/success**: safe values, recommended choices, completed steps
- **Amber/warning**: cautions, inferred values, things to verify
- **Rose/error**: dangers, missing info, failures
- Text hierarchy: `text-primary` for values, `text-secondary` for labels, `text-muted` for hints

## Image Search Pipeline

When `imageBlock` with `imageMode: "photo"` is rendered:
1. Component shows shimmer loading placeholder
2. Fetches `/api/image-search?q={searchQuery}`
3. API tries Brave Search first (if `BRAVE_API_KEY` set), then Wikimedia Commons
4. Image fades in on load, or graceful fallback if not found
