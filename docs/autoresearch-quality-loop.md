# AutoResearch Quality Loop

Clitronic is measured with an AutoResearch loop before optimization. The loop focuses on practical electronics, maker, workshop, smart-home, and visual-inspiration tasks.

## Verified Architecture

- `/api/chat` is called from `hooks/useConversationState.ts` with `fetch('/api/chat')`, `POST`, JSON headers, and a body containing `messages`, `inputMode`, and optional `transcriptMeta`.
- `app/api/chat/route.ts` builds the OpenAI chat-completions request with `OPENAI_CHAT_MODEL`, a JSON Schema response format, the system prompt from `lib/ai/system-prompt.ts`, recent sanitized messages, `temperature: 0.2`, and `OPENAI_CHAT_MAX_TOKENS`.
- `lib/ai/system-prompt.ts` controls component selection through intent rules and component data shapes. It instructs the model to choose `imageBlock`, `recommendationCard`, `wiringCard`, `troubleshootingCard`, and other visual-card components based on question shape.
- Photo requests are detected in `app/api/chat/route.ts` by `maybeBuildPhotoFallback`. Explicit
  image/photo language and a narrow set of named real technical scenes can return an `imageBlock`
  without an LLM call. For scene requests, the matched physical-scene phrase is removed before the
  remainder is checked so wiring, diagram, circuit, pinout, and instructional intent keeps
  structured-answer precedence.
- Image search queries are preprocessed in `app/api/image-search/query.ts` by stripping request
  filler, adding electronics context for broad terms, adding board qualifiers for common
  microcontrollers, and routing multi-object environments through `getSceneProfile` before focused
  component profiles.
- Image intent is detected in `detectImageIntent` using domain terms for boards, sensors, actuators, passives, tools, connectors, power, displays, and chips. Curated profiles can override intent and preferred queries.
- Image candidates are searched through Brave when `BRAVE_API_KEY` is present plus Wikimedia fallback. `app/api/image-search/scoring.ts` scores candidates using query/title overlap, electronics terms, dimensions, intent-specific terms, and penalties for low-signal or diagram-like titles. `mergeAndRank` deduplicates and sorts.
- Image results are rendered by `components/ui/image-block.tsx`. Photo mode fetches `/api/image-search`, tracks recently seen URLs per query, renders one or more proxied image tiles, and falls back to a built-in diagram or error card if no useful image loads.
- Existing validation commands are `npm run validate`, `npm test`, and `npm run build`.

## Running

The standalone runner reads exported process variables; Next.js-style `.env.local` loading does not
happen automatically. From a trusted local checkout, load the file without placing a key in shell
history:

```bash
set -a
. ./.env.local
set +a
```

Run:

```bash
bash autoresearch/run_quality_experiment.sh
```

`OPENAI_API_KEY` is mandatory for the model-backed harness and judge. `BRAVE_API_KEY` changes image
search behavior, so keep it consistent when comparing runs. The 41-task run is billable; the judge
defaults to `gpt-5.5` unless `AUTORESEARCH_JUDGE_MODEL` is set. CI runs deterministic validation,
tests, builds, and audits, but does not run this credentialed evaluation.

The runner:

- runs `npm run validate`
- runs `npm test`
- runs `npm run build` unless `AUTORESEARCH_SKIP_BUILD=1`
- invokes the real `/api/chat` route handler directly for the eval set
- invokes the real image-search service for `imageBlock` photo queries
- sets `CLITRONIC_AUTORESEARCH=1` so `/api/chat` includes non-user-visible diagnostics in eval responses
- writes run outputs under `autoresearch/runs/<timestamp>/`
- writes `autoresearch/latest_score.json`
- appends `autoresearch/results.jsonl`

If a scored run misses the absolute pass threshold, the scorer exits nonzero after writing its
artifacts. That is distinct from the best accepted relative score. Generated `runs/` artifacts are
gitignored; the committed comparison evidence is `accepted_score.json`, `accepted_run.txt`, and
`QUALITY_RESEARCH_LOG.md`.

## Diagnostics

During AutoResearch runs only, chat responses include an internal `_autoresearch` block. Normal production responses do not include it.

The diagnostics distinguish:

- whether raw model output was present
- whether raw model output parsed as JSON
- normalized mode and component
- whether the normalized model output validated
- validator issue paths/messages
- fallback kind: `none`, `forced_photo`, `parse_fallback`, `render_fallback`, `recovered_text`, or `error`
- final public response mode/component

This matters because final public responses may validate only because a fallback was returned after invalid model output.

## Baseline Discipline

The baseline is measurement only. Do not optimize prompts, image search, rendering, schema validation, or model selection before the first baseline is recorded.
