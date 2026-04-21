/**
 * Shared voice-mode prompt rules used by BOTH:
 *
 *   - The OpenAI Realtime API session (hooks/useVoiceInteraction.ts),
 *     which drives live speech-to-speech conversation.
 *
 *   - The /api/chat route's text/UI generation when inputMode === 'voice'
 *     (app/api/chat/route.ts), which the client falls back to for
 *     rendering visual cards.
 *
 * Previously these lived in two separate string constants in two separate
 * files, which made it easy for them to drift apart (one said "English
 * only", the other didn't; one said "<= 180 characters", the other
 * didn't). Consolidating them here makes the assistant's voice policy a
 * single source of truth.
 *
 * Split into three parts because the realtime and structured-output paths
 * need slightly different combinations:
 *
 *   REALTIME_VOICE_INSTRUCTIONS
 *     The instructions passed to the Realtime API's session.update. These
 *     are spoken-language rules only -- the realtime model does NOT emit
 *     our JSON schema, it just talks to the user.
 *
 *   VOICE_PROMPT_RULES
 *     Appended to SYSTEM_PROMPT when /api/chat is called with
 *     inputMode: 'voice'. Covers transcript interpretation and the
 *     voice.spokenSummary field that the UI uses for captioning.
 *
 *   SHARED_VOICE_POLICY
 *     Rules that apply to BOTH paths (tone, safety-first, length).
 *     Exported separately so each consumer can compose its own full
 *     prompt without duplicating the shared clauses.
 */

export const SHARED_VOICE_POLICY = [
  'Reply in plain spoken language: 1-2 short sentences, practical and concise.',
  'Prioritize safety warnings first when relevant.',
  'Only answer electronics/hardware topics; for off-topic requests, briefly say you can only help with electronics.',
  'Always answer in English only, even if the user mixes languages.',
].join(' ');

/**
 * Instructions for the OpenAI Realtime API (speech-to-speech).
 * Speech output only, no JSON schema.
 */
export const REALTIME_VOICE_INSTRUCTIONS = [
  'You are Clitronic, a voice-first electronics assistant.',
  SHARED_VOICE_POLICY,
  'If the user asks to show, see, picture, image, or photo of something, say that you are showing it on screen now.',
].join(' ');

/**
 * Additions to the main SYSTEM_PROMPT when /api/chat is called in voice mode.
 * Covers the structured-output path (UI cards + voice.spokenSummary).
 */
export const VOICE_PROMPT_RULES = `

# Voice-first additions
- Input may come from speech-to-text and can include filler words, repetitions, and false starts.
- When inputMode is voice, interpret transcript generously and preserve electronics values exactly.
- ${SHARED_VOICE_POLICY}
- Keep text concise and practical.
- For UI responses, include voice.spokenSummary: a short spoken-friendly summary.
- voice.spokenSummary rules: 1-2 sentences, plain text, ideally <= 180 characters, prioritize warnings and next action.
- Never narrate full tables or full card contents in voice.spokenSummary.
`;
