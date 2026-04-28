# UI/UX Polish Notes

This document captures the current product-facing interaction patterns for Clitronic so future changes preserve the same UX direction.

## Product Direction

Clitronic is a voice-first electronics assistant for workshop use. The interface should feel like an active instrument panel, not a chat transcript. Voice, text, and structured visual cards are all entry points into the same workflow.

## Current Interaction Model

- The welcome screen offers push-to-talk, typed prompts, and example electronics questions.
- The active session keeps text input and voice controls in a bottom control band.
- The primary voice button starts capture while idle and cancels/stops active capture, processing, or speech states.
- The mute button controls the user's microphone track. It does not mute assistant playback.
- Live user and assistant transcript strips keep voice turns observable.
- Recent turns reopen previous structured responses locally when possible.
- Follow-up chips are generated from the current card type and submit ordinary text prompts.

## Card System

Structured cards should keep a consistent scan pattern:

- Use `CardHeader` from `components/ui/card-layout.tsx` for titled cards.
- Use `CountBadge` for compact metadata such as pins, checks, steps, options, or specs.
- Keep copy actions in the header or result section when the copied content is concrete.
- Keep safety callouts above long or collapsible content.
- Use progressive disclosure for long procedural content instead of forcing tall mobile cards.

Current long-content rule:

- Wiring cards show the first five steps by default.
- Troubleshooting cards show the first five checks by default.
- The full data remains available through the disclosure toggle.
- Copy actions still copy the full wiring sequence.

## Safety Presentation

Safety guidance is part of the product experience. It should be visible, specific, and consistent without changing the response schema.

- `SafetyCallout` surfaces existing safety-relevant text from card data.
- Wiring warnings remain fully visible and are not collapsed.
- For mains electrical, fire, battery, structural, and code-compliance topics, responses should stay planning-oriented and recommend licensed professionals where appropriate.

## Accessibility And Motion

- Interactive controls should have explicit button semantics, labels, and disabled states.
- Keyboard focus must remain visible.
- Motion-heavy text and transcript effects should respect reduced-motion preferences.
- Mobile layouts should avoid horizontal overflow except where deliberate, such as follow-up chip scrolling.

## README Hero Asset

The README hero image lives at `public/readme-hero.png`.

Generation prompt summary:

> Dark, high-contrast product visual for a voice-first electronics assistant, with an abstract microphone orb, live transcript strip, and electronics response cards. No readable text, no logos, no people, no watermarks.
