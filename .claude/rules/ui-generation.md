# UI Generation Rules for Clitronic

## Core Principle

Every AI response must be renderable as a structured UI component. Never return raw unstructured text when a visual component would serve better.

## Intent Detection → UI Type Mapping

### Component Questions → Card UI

When the user asks about a specific component (resistor, LED, capacitor, etc.):

- Render as a **component card** with specs, pinout, and tips
- Include expandable datasheet section
- Behavior: `expandable` with smooth height animation
- Transition: fade-in with 200ms ease-out

### Calculations → Calculation Card UI

When the user asks to calculate something (resistor value, Ohm's law, power):

- Render as a **calculation card** with formula, inputs, and result
- Highlight the recommended/standard value
- Show the formula visually, not just as text
- Behavior: `animated` — values should count up to their final number
- Transition: slide-up with staggered delays per field (50ms between each)

### Circuit Building → Diagram + Parts List UI

When the user wants to build or wire something:

- Render a **parts list card** (structured, with quantities)
- Render a **wiring diagram** (SVG-based, color-coded)
- Render **step-by-step wiring instructions** as numbered cards
- Behavior: `interactive` — steps highlight corresponding diagram elements
- Transition: cards cascade in with 100ms stagger

### Comparisons → Chart UI

When the user compares components, values, or approaches:

- Render as a **comparison chart** or **data table**
- Use bar charts for numeric comparisons
- Use side-by-side cards for feature comparisons
- Behavior: `static` with hover highlights
- Transition: bars animate from 0 to value over 400ms

### Debugging → Checklist UI

When the user reports a problem or asks for troubleshooting:

- Render as an **interactive checklist**
- Group by likelihood (most common causes first)
- Include a "quick test" action button
- Behavior: `interactive` — checkboxes track progress
- Transition: slide-in from left, 80ms stagger

### General Questions → Text Card UI

When no specific UI type fits:

- Still wrap in a **text card** with proper heading and structure
- Use markdown rendering inside the card
- Never return a bare string
- Behavior: `static`
- Transition: fade-in 150ms

## Animation Standards

All animations use CSS transitions or Tailwind's `transition-*` utilities:

- **Default duration**: 200ms
- **Default easing**: `ease-out`
- **Stagger pattern**: 50-100ms between sibling elements
- **Enter animation**: `opacity-0 → opacity-100` + `translate-y-2 → translate-y-0`
- **No animation on user messages** — only AI responses animate in
- **Reduce motion**: respect `prefers-reduced-motion` media query

## Color Semantics in UI

- **Cyan/accent**: primary actions, active states, brand elements
- **Emerald/success**: safe values, completed checks, working circuits
- **Amber/warning**: inferred values, things to verify, cautions
- **Rose/error**: missing connections, dangerous values, failures
- **Violet**: simulation and graph-related content

## Responsive Behavior

- Cards stack vertically on mobile, grid on desktop
- Diagrams scale with container width
- Charts use responsive aspect ratios
- Learning monitor panel hides below `xl` breakpoint
