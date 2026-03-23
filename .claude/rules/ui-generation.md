# UI Generation Rules

## The Pipeline

```
User query → Intent detection → Mode decision → Structured JSON → UI Renderer → Animated Component
```

## Intent → Component Mapping

| Intent | Component | Animation | Default State |
|--------|-----------|-----------|---------------|
| `spec_card` | `specCard` | slideUp | collapsed |
| `comparison_card` | `comparisonCard` | slideUp | open |
| `explanation_card` | `explanationCard` | fadeIn | open |
| `hybrid_card` | `explanationCard` | fadeIn | open |
| `recommendation_card` | `recommendationCard` | slideUp | collapsed |
| `troubleshooting_card` | `troubleshootingCard` | expand | open |
| `calculation_card` | `calculationCard` | slideUp | open |
| `quick_answer` | (text mode) | none | n/a |

## Mode Decision (CRITICAL)

Ask these questions in order:

1. Is the response multi-attribute? → UI
2. Is it comparative? → UI
3. Is it structured data? → UI
4. Is it visual by nature? → UI
5. Is it one sentence or conversational? → Text
6. Uncertain? → **UI** (default bias)

## Component Data Shapes

### specCard
```json
{
  "title": "string",
  "subtitle": "string | null",
  "keySpecs": [{ "label": "string", "value": "string" }],
  "optionalDetails": [{ "label": "string", "value": "string" }]
}
```

### comparisonCard
```json
{
  "items": ["string", "string"],
  "attributes": [{ "name": "string", "values": ["string", "string"] }],
  "keyDifferences": ["string"]
}
```

### explanationCard
```json
{
  "title": "string",
  "summary": "string",
  "keyPoints": ["string"]
}
```

### recommendationCard
```json
{
  "items": [{ "name": "string", "reason": "string" }],
  "highlights": ["string"]
}
```

### troubleshootingCard
```json
{
  "issue": "string",
  "steps": [{ "label": "string", "detail": "string" }],
  "tips": ["string"]
}
```

### calculationCard
```json
{
  "title": "string",
  "formula": "string",
  "inputs": [{ "label": "string", "value": "string" }],
  "result": { "label": "string", "value": "string", "note": "string | null" }
}
```

## Animation Standards

- All UI responses animate in. Text responses do not.
- Duration: 200ms
- Easing: ease-out
- Stagger between siblings: 80ms
- Enter pattern: opacity 0→1, translateY 8px→0
- Respect `prefers-reduced-motion`

## Color Usage in Cards

- **Cyan/accent**: titles, active elements, primary values
- **Emerald/success**: safe values, recommended choices, completed steps
- **Amber/warning**: cautions, inferred values, things to verify
- **Rose/error**: dangers, missing info, failures
- Text hierarchy: `text-primary` for values, `text-secondary` for labels, `text-muted` for hints
