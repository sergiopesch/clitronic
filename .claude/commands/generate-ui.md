# /generate-ui

Generate a structured UI response schema from a user query. Returns valid JSON matching Clitronic's response format.

## Usage

```
/generate-ui <user query>
```

## Behavior

1. Analyze the user query to determine **intent** (what they want to do)
2. Map the intent to the appropriate **UI type** (card, diagram, calculation, chart, checklist, text)
3. Determine the **behavior** (static, expandable, interactive, animated)
4. Generate the structured **data** payload
5. Return ONLY valid JSON — no markdown wrapping, no explanation

## Output Schema

```json
{
  "intent": "string — the detected user intent",
  "ui_type": "card | calculation | diagram | chart | parts_list | checklist | text",
  "behavior": "static | expandable | interactive | animated",
  "data": {
    // Shape depends on ui_type — see examples below
  }
}
```

## Examples

### Component lookup
Query: "Tell me about resistors"

```json
{
  "intent": "lookup_component",
  "ui_type": "card",
  "behavior": "expandable",
  "data": {
    "component": "resistor",
    "title": "Resistor",
    "category": "passive",
    "description": "Limits current flow in a circuit.",
    "specs": [
      { "label": "Resistance", "value": "220 ohm (typical for LED)" },
      { "label": "Power Rating", "value": "0.25 W" }
    ],
    "expandable": {
      "pinout": "Two terminals, non-polarized.",
      "tips": "Read color bands left to right."
    }
  }
}
```

### Calculation
Query: "What resistor for a red LED on 5V?"

```json
{
  "intent": "calculate_resistor",
  "ui_type": "calculation",
  "behavior": "animated",
  "data": {
    "title": "LED Resistor Calculation",
    "formula": "R = (Vsupply - Vforward) / I",
    "inputs": {
      "supply_voltage": { "value": 5, "unit": "V" },
      "forward_voltage": { "value": 2, "unit": "V" },
      "desired_current": { "value": 15, "unit": "mA" }
    },
    "result": {
      "exact": { "value": 200, "unit": "ohm" },
      "recommended": { "value": 220, "unit": "ohm" },
      "note": "Rounded up to nearest standard value."
    }
  }
}
```

### Debug checklist
Query: "My Arduino LED won't turn on"

```json
{
  "intent": "debug_circuit",
  "ui_type": "checklist",
  "behavior": "interactive",
  "data": {
    "title": "Arduino LED Debug Checklist",
    "platform": "arduino",
    "checks": [
      { "label": "LED polarity correct (long leg = anode)", "priority": "high" },
      { "label": "Resistor in series, not bypassed", "priority": "high" },
      { "label": "Code targets the correct pin", "priority": "medium" },
      { "label": "Common ground connected", "priority": "medium" }
    ],
    "quick_test": "Load a minimal blink sketch on pin 13 to isolate wiring from code."
  }
}
```

## Rules

- Always return valid JSON — parseable by `JSON.parse()`
- Use the electronics knowledge base in `lib/data/components.ts` for component data
- For calculations, always show the formula and both exact and standard values
- Intent names should be snake_case
- Do not include markdown, explanations, or wrapper text in the output
