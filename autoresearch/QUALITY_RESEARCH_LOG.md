# Quality Research Log

## Realtime Voice Baseline — 2026-07-17

Run directory: `autoresearch/runs/20260717T170319Z`

This is the untouched quality baseline before the realtime voice optimization pass. No product,
prompt, model, schema, safety, or rendering changes were made before this run.

- `overall_score`: 4.34
- `answer_quality_score`: 3.89
- `image_quality_score`: 3.81
- `component_selection_score`: 4.91
- `safety_score`: 4.09
- `schema_valid_rate`: 1
- `model_parse_success_rate`: 1
- `model_validation_success_rate`: 1
- `final_response_schema_valid_rate`: 1
- All 41 tasks completed with zero task failures; validation, 165 tests, and the production build
  passed.

Measured voice-path baseline:

- A representative model-backed voice answer took 3.89 seconds before the structured response was
  available.
- The speech route began streaming a representative MP3 at 3.18 seconds and completed at 5.71
  seconds, but the client called `response.blob()` and therefore did not start playback until the
  complete file arrived.
- The resulting sequential model-plus-full-audio path was approximately 9.6 seconds after the end of
  the utterance in the sampled request, excluding turn-detection and transcription time.
- Browser reproduction also exposed an empty-transcription alert that remained visible after the
  control returned to `Ready`.

First optimization hypothesis: stream raw PCM into Web Audio as chunks arrive so playback begins at
the first audio bytes instead of after the full MP3 download, while keeping the validated structured
answer as the single source of truth.

## Realtime Voice Iteration 1 — Retained transport improvement — 2026-07-17

Verification run: `autoresearch/runs/20260717T172506Z`

Hypothesis: the speech route already streams, but converting the response to a complete Blob in the
browser prevents playback until all audio has arrived. Streaming raw PCM chunks directly into Web
Audio should remove that client-side gate without changing answer content.

Change:

- Switched the fixed `tts-1` speech response from MP3 to raw 24 kHz PCM.
- Added a boundary-safe signed 16-bit little-endian PCM decoder that preserves samples split across
  network chunks.
- Scheduled decoded chunks through the existing AudioContext with an 80 ms initial buffer.
- Kept cancellation ownership per voice turn and stopped/disconnected every queued source during
  interruption or teardown.
- Preserved the chat model, prompt, structured response schema, visual-card architecture, canonical
  spoken summary, rate limits, request security, and safety behavior.

Measured result:

- Matched route sample before: first MP3 bytes at 3.18 seconds, full transfer at 5.71 seconds, with
  playback gated on the full transfer.
- Matched route sample after: first PCM bytes at 2.95 seconds, full transfer at 5.41 seconds, with
  playback scheduled approximately 80 ms after first bytes.
- Avoidable post-answer silence reduced by approximately 2.38 seconds in the matched sample.

Verification:

- Validation, 167 tests, and the production build passed.
- All 41 tasks completed with zero task failures.
- `schema_valid_rate`, `model_parse_success_rate`, `model_validation_success_rate`, and
  `final_response_schema_valid_rate` remained 1; `render_fallback_rate` and `broken_image_rate`
  remained 0.
- The stochastic judge scored 4.32 overall, answer quality 3.87, image quality 3.81, component
  selection 4.95, and safety 4.04 versus the untouched 4.34 / 3.89 / 3.81 / 4.91 / 4.09 run. The
  evaluated chat path is unchanged by this browser/speech transport diff, so this run is recorded as
  a non-promoted operational guard rather than a new answer-quality baseline.

Decision: retained for the direct, repeatable voice latency improvement. The accepted quality
baseline remains the untouched 4.34 run.

## Realtime Voice Iteration 2 — Retained reliability improvement — 2026-07-17

Verification run: `autoresearch/runs/20260717T174034Z`

Hypothesis: empty ambient-noise VAD turns are normal recoverable transport events, but the hook
treats them as user-facing failures and leaves that alert visible even after listening stops.

Change:

- Resolved completed transcript text through one tested final-or-buffered boundary.
- Returned empty VAD turns to listening without displaying a false transcription failure.
- Cleared stale voice errors and speech warnings when the user stops the voice session.
- Kept explicit realtime transcription failure events user-visible.

Verification:

- Browser reproduction before the change displayed “I could not hear a complete request” while the
  state said `Live listening`, and retained the alert after returning to `Ready`.
- After the change, repeated silent cycles remained in `Live listening` without an alert, and Stop
  returned to `Ready` without stale error UI or console warnings.
- Validation, 168 tests, and the production build passed; all 41 quality tasks completed.
- `overall_score`: 4.35; `answer_quality_score`: 3.91; `image_quality_score`: 3.79;
  `component_selection_score`: 4.93; `safety_score`: 4.12.
- All schema/model validation rates remained 1; `render_fallback_rate` and `broken_image_rate`
  remained 0. The 0.02 image-score movement occurred on an unchanged image path, so this operational
  run is not promoted over the accepted quality baseline.

Decision: retained for the directly reproduced reliability and UX correction. The accepted quality
baseline remains the untouched 4.34 run.

## Realtime Voice Iteration 3 — Retained interruption improvement — 2026-07-17

Verification run: `autoresearch/runs/20260717T175547Z`

Hypothesis: the primary Stop control tears down the microphone and WebRTC session while an answer is
processing or speaking, so a normal interruption unnecessarily pays the full cold-start cost on the
next turn.

Change:

- Routed Stop during `processing` and `speaking` to answer/playback interruption while preserving the
  established realtime input session.
- Kept full microphone/WebRTC teardown for Stop during listening, capture, and transcription.
- Changed the active control label to `Cancel answer` or `Stop speaking` so the action is explicit.

Verification:

- Focused state and component tests passed, including the interruption-versus-session-stop boundary.
- Browser verification confirmed the listening control still performs a complete privacy stop and
  returns to `Ready` without alerts or console errors.
- Validation, 169 tests, and the production build passed.
- The model-backed judge scored 4.26 overall, but two stochastic quality tasks failed and one emitted
  an invalid final schema, so `schema_valid_rate` was 0.9756 and the scorer correctly reported
  `pass: false`. This diff does not touch the chat route, model, prompt, schema, visual cards, or
  safety path; the result is recorded without promoting it as a quality baseline.

Decision: retained as a tested operational interaction fix. The accepted quality baseline remains
the untouched 4.34 run, and the last fully valid operational run remains Iteration 2.

## Realtime Voice Iteration 4 — Retained turn-boundary improvement — 2026-07-17

Verification run: `autoresearch/runs/20260717T181222Z`

Hypothesis: waiting for 550 ms of silence after every utterance adds deterministic latency before
transcription can complete; 450 ms preserves a practical pause while removing 100 ms from every
voice turn.

Change:

- Reduced only Realtime server VAD `silence_duration_ms` from 550 to 450.
- Preserved the transcription model, input format, VAD threshold, 300 ms prefix padding,
  non-generating session behavior, chat model, prompt, schema, cards, and safety rules.
- Added a config-contract assertion for the latency-sensitive boundary.

Verification:

- Validation, 169 tests, and the production build passed.
- All schema/model validity rates remained 1; `render_fallback_rate` and `broken_image_rate`
  remained 0.
- `overall_score`: 4.31; `answer_quality_score`: 3.87; `image_quality_score`: 3.46;
  `component_selection_score`: 4.95; `safety_score`: 4.04.
- One unrelated image-quality task caused `tasks_failed: 1` and `pass: false`. The VAD-only diff
  cannot affect chat or image outputs, so this run is recorded as a non-promoted operational guard.

Decision: retained for the direct 100 ms end-of-turn latency reduction. The accepted quality
baseline remains the untouched 4.34 run.

## Deterministic Release Verification — 2026-07-15

This is a post-experiment release gate, not another scored quality iteration. It preserves the final
measured result below while recording the checks run after the route-level regression was added.

- Root validation passed.
- Root tests passed: 165/165.
- CLI type-check and tests passed: 6/6.
- Production build passed.
- Root and CLI production dependency audits reported zero vulnerabilities.
- Desktop and mobile production-browser smoke tests covered calculation, explicit photo, natural
  technical scene, mixed scene-plus-diagram routing, history reopening, responsive overflow, and
  browser console errors.
- The accepted comparative result remains 4.36 overall with 41/41 tasks complete, all schema/model
  validity rates at 1, image quality 3.80, and the historical 4.37 high-water unchanged. The
  post-boundary release run is recorded separately below.

## Operational Release Boundary Hardening — 2026-07-15

Verification run: `autoresearch/runs/20260715T225856Z`

Scope:

- Rejected contradictory `mode: "text"` payloads that also contain a visual card, preserving one
  presentation owner across rendering, history, and speech.
- Mapped aborted and failed chat request-body streams to safe, non-cacheable responses instead of
  allowing an unhandled route rejection.
- Rejected alternate IPv4-mapped loopback forms plus IPv6 discard-only and documentation ranges at
  the image-proxy DNS boundary.
- Replaced a text-answer follow-up that produced a low-signal image query with a structured key-points
  action.
- Preserved the model, system prompt, output JSON Schema, visual-card registry, and safety rules.

Verification:

- Validation, 165 tests, and the production build passed inside the credentialed run.
- All 41 tasks completed with zero task failures.
- `schema_valid_rate`, `model_parse_success_rate`, `model_validation_success_rate`, and
  `final_response_schema_valid_rate` remained 1; `render_fallback_rate` and `broken_image_rate`
  remained 0.
- `overall_score`: 4.33; `answer_quality_score`: 3.91; `image_quality_score`: 3.76;
  `component_selection_score`: 4.85; `safety_score`: 4.06.

Decision: retained as contract, transport, and proxy correctness hardening. This stochastic judge
run is not promoted over the accepted 4.37 high-water or the prior paired 4.36 answer-shaping result.

## Iteration 11 — Retained on the current engine baseline — 2026-07-15

Current-engine baseline run: `autoresearch/runs/20260715T213306Z`

Initial boundary run: `autoresearch/runs/20260715T215821Z`

Final hardened run: `autoresearch/runs/20260715T221310Z`

Hypothesis: a natural request such as “Show me real low-voltage wiring panels…” should resolve to a
visual scene even when it omits the literal words image/photo, while wiring, circuit, diagram,
pinout, and step-by-step requests must retain structured instructional precedence.

Change:

- Added a narrow real-technical-scene exception for named workshop, prototyping, network-closet,
  patch-panel, structured-media, and low-voltage-panel scenes.
- Removed the matched physical-scene phrase before checking the remainder for wiring, circuit,
  schematic, diagram, pinout, connection, step, or instruction intent.
- Added adversarial positive and negative classification tests plus a real chat-route regression.
- Preserved the model, prompt, response schema, visual-card architecture, and safety augmentation.

Verification:

- Browser reproduction before the change returned an off-topic text response for the natural scene
  request; the real route after the change returns a 200 `imageBlock` with the intended patch-panel
  scene query.
- The initial full run scored 4.34 overall with every schema/model validation rate at 1. An
  adversarial review then found a mixed scene-plus-diagram edge, which was fixed before the final
  measured run.
- Final `overall_score`: 4.36, improved from the current-engine baseline 4.34.
- Final `answer_quality_score`: 3.94, improved from 3.91.
- Final `image_quality_score`: 3.80, unchanged.
- Final `component_selection_score`: 4.90, improved from 4.87.
- Final `safety_score`: 4.10, unchanged.
- All schema/model validation rates remained 1; all 41 tasks completed with zero task failures and
  `broken_image_rate` remained 0.
- Validation, 163 tests, and the production build passed in the final measured run.

Decision: retained. The final version improves or preserves every protected dimension against the
paired current-engine baseline and fixes the browser-observed failure without weakening mixed
instructional intent. The historical 4.37 high-water score remains unchanged.

## Iteration 10 — Retained on the current engine baseline — 2026-07-15

Current-engine baseline run: `autoresearch/runs/20260715T211526Z`

Experiment run: `autoresearch/runs/20260715T213306Z`

Hypothesis: multi-object scene requests should use a narrow scene-level retrieval profile before
single-component aliases. This should stop electronics benches collapsing to jumper-wire product
searches and stop detailed network-panel requests becoming over-padded Wikimedia queries, without
changing the app model, prompt, response schema, visual-card architecture, or safety behavior.

Change:

- Added compound, boundary-aware detection for electronics-workbench and network-patch-panel scenes.
- Kept focused ESP32, jumper-wire, oscilloscope, and standalone patch-panel requests on their
  existing component paths.
- Used the retrievable Wikimedia queries `electronics workbench` and `network patch panel` while
  preserving the detailed card query/caption supplied to the user.
- Added pure classification tests plus a route-level provider wiring regression test.

Official result versus the immediately preceding current-engine run:

- `overall_score`: 4.34, improved from 4.25
- `answer_quality_score`: 3.91, improved from 3.87
- `image_quality_score`: 3.80, improved from 2.18
- `component_selection_score`: 4.87, improved from 4.84
- `safety_score`: 4.10, improved from 4.08
- `schema_valid_rate`, `model_parse_success_rate`, `model_validation_success_rate`, and
  `final_response_schema_valid_rate`: 1
- `broken_image_rate`: 0; all 41 tasks completed with zero task failures
- Validation, 161 tests, and the production build passed during the measured run.

Decision: retained. The change improves every protected dimension against the paired current-engine
baseline and replaces five empty visual cards plus one component mismatch with confident,
attributed, proxy-compatible candidates. The historical high-water score in `accepted_score.json`
remains 4.37; this run is not promoted over that stochastic reference.

Next hypothesis: improve network-scene diversity or provider resilience as a separate measured
change. Do not mix it with score-threshold, prompt, or model changes.

## Operational Interaction and Visual Engine Hardening — 2026-07-15

Pre-change run: `autoresearch/runs/20260715T203002Z`

Post-change run: `autoresearch/runs/20260715T211526Z`

Scope:

- Made Realtime a transcription/VAD transport only; `/api/chat` is the sole semantic answer owner.
- Added item-correlated turn ownership, duplicate/stale event rejection, abortable exact-text TTS,
  input-only mute behavior, nonfatal speech warnings, and monotonic privacy cleanup.
- Added deterministic card-to-speech projection with card-value consistency checks, bounded output,
  and safety-fact retention for every supported card destination.
- Added a shared image wire contract and URL policy, outage/no-match separation, cache correctness,
  retry exclusions, thumbnail restoration, semantic diagram fallbacks, provider envelope validation,
  and proxy content-signature checks.
- Preserved the model, prompt, structured JSON schema, visual-card registry, and safety constraints.

Verification:

- Validation, 160 tests, the production build, root/CLI production audits, and CLI type-check passed.
- All 41 quality tasks completed with zero task failures and all schema/model validation rates at 1.
- `overall_score`: 4.25 versus 4.28 before the operational work; `image_quality_score` improved from
  2.11 to 2.18 and `safety_score` was 4.08.

Decision: retained as operational correctness and boundary hardening, not accepted as a new
answer-quality baseline. The quality regression was not attributed to a response-shaping change;
the deterministic engine failures fixed here have direct regression coverage.

## Operational Response Contract Boundary — 2026-07-15

Pre-change run: `autoresearch/runs/20260715T194658Z`

Post-change run: `autoresearch/runs/20260715T203002Z`

Scope:

- Moved the existing Zod `StructuredResponse` contract to a client-safe shared module.
- Replaced the browser's unchecked successful-JSON cast with a decoder that runs before intent
  inspection, usage accounting, UI state, history, or voice presentation.
- Added regression coverage proving malformed and forged rate-limit payloads fail with one safe
  contract error.
- Preserved the app model, prompt, schema rules, normalized payloads, and visual-card architecture.

Verification:

- Validation, 108 tests, and the production build passed.
- All 41 quality tasks completed with zero task failures.
- `overall_score`: 4.28, unchanged.
- `image_quality_score`: 2.11, improved from 2.04.
- `safety_score`: 4.12, improved from 4.03.
- `answer_quality_score`: 3.91 versus 3.94 and `component_selection_score`: 4.94 versus 4.96;
  valid server output behavior was unchanged, and repeated no-op runs in Iterations 8 and 9
  demonstrated comparable judge/provider variance.
- `schema_valid_rate`, `model_parse_success_rate`, `model_validation_success_rate`, and
  `final_response_schema_valid_rate` all remained 1.

Decision: retained as an operational integrity boundary, not accepted as a new answer-quality
baseline. The accepted quality baseline remains unchanged.

## Iteration 9 — Rejected — 2026-07-15

Fresh baseline run: `autoresearch/runs/20260715T194658Z`

Experiment run: `autoresearch/runs/20260715T201627Z`

Hypothesis: a single extra-low-voltage boundary guard in the deterministic LED calculator would
prevent it from answering 120 V mains questions while leaving all unrelated response behavior
unchanged.

Change attempted:

- Returned control to the safety-aware response path when a parsed LED supply was at least 50 V.
- Added one focused 120 V regression test.

Official result versus the fresh baseline:

- `overall_score`: 4.26, regressed from 4.28
- `answer_quality_score`: 3.90, regressed from 3.94
- `image_quality_score`: 1.87, regressed from 2.04
- `component_selection_score`: 4.94, regressed from 4.96
- `safety_score`: 4.09, improved from 4.03
- `schema_valid_rate`: 1, unchanged
- Validation, 107 tests, and the production build passed; all 41 tasks completed with zero task
  failures.

Decision: rejected and reverted under the strict quality-loop rule. The guard did not affect the
benchmark prompts, while the judge and external image results varied materially between otherwise
equivalent runs; the artifacts are preserved as variance evidence. The accepted baseline remains
unchanged.

Next hypothesis: land response-boundary validation as an operational integrity fix so arbitrary
successful JSON cannot mutate client usage, UI, or history, without changing valid answer output.

## Iteration 8 — Rejected — 2026-07-15

Fresh baseline run: `autoresearch/runs/20260715T194658Z`

Experiment run: `autoresearch/runs/20260715T200150Z`

Hypothesis: giving mains/high-voltage classification precedence over the deterministic LED
resistor handler, carrying safety context across user turns, and power-derating deterministic
resistor recommendations would close a real unsafe-routing edge case without changing the app
model, prompt, schema, or visual-card architecture.

Change attempted:

- Routed mains/high-voltage LED questions to the existing safe-planning card before the LED
  calculator.
- Propagated prior user messages into final safety augmentation.
- Calculated resistor dissipation at the selected standard value and required at least 2× power
  derating.
- Added focused coverage for 12 V, 24 V, 120 V mains, and multi-turn 230 V requests.

Official result versus the fresh baseline:

- `overall_score`: 4.27, regressed from 4.28
- `answer_quality_score`: 3.88, regressed from 3.94
- `image_quality_score`: 2.02, regressed from 2.04
- `component_selection_score`: 4.96, unchanged
- `safety_score`: 4.11, improved from 4.03
- `schema_valid_rate`: 1, unchanged
- Validation, 109 tests, and the production build passed; all 41 tasks completed with zero task
  failures.

Decision: rejected and reverted because the official result violated the strict overall, answer,
and image non-regression requirements, despite the safety improvement. Run artifacts are retained
for diagnosis and the accepted quality baseline remains unchanged.

Next hypothesis: isolate the confirmed 120 V LED routing defect as a single boundary guard without
changing multi-turn context or low-voltage output wording, then evaluate it independently.

## Iteration 7 — Rejected as quality baseline — 2026-07-15

Baseline run: `autoresearch/runs/20260715T161326Z`

Preflight-only run: `autoresearch/runs/20260715T191145Z`

Credentialed experiment run: `autoresearch/runs/20260715T191223Z`

Scope and hypothesis: retain the existing model, prompt, schema, and visual-card architecture while
testing a very narrow photo-query filler cleanup alongside independently regression-tested
operational fixes for request cancellation, voice session ownership, response rendering, API
boundaries, accessibility, and CLI catalog safety.

Official result versus the latest baseline:

- `overall_score`: 4.26, regressed from 4.42
- `answer_quality_score`: 3.89, regressed from 4.14
- `image_quality_score`: 2.12, regressed from 2.58
- `component_selection_score`: 4.91, improved from 4.87
- `safety_score`: 4.07, regressed from 4.34
- `schema_valid_rate`: 1, unchanged
- Validation, 102 tests, and the production build passed; all 41 tasks completed with zero task
  failures.

The all-task deterministic comparison was also recorded because the baseline GPT judge completed
only 27 of 41 tasks. It showed `overall_score` 4.73 versus 4.71,
`answer_quality_score` 4.60 versus 4.59, `image_quality_score` 2.87 versus 2.87,
`component_selection_score` 5.00 versus 4.90, and `safety_score` 4.89 versus 4.88. Final schema
validity remained 1.0 and the generic-answer rate fell from 4.88% to 2.44%.

Decision: rejected as a new quality baseline because the official comparison violated the strict
non-regression rule. The photo-query wording change was reverted. The security, cancellation,
accessibility, renderer-performance, and CLI safety corrections are retained as operational fixes
with deterministic regression coverage; none changes the app model, broad system prompt, schema,
or safety boundary. The official and deterministic score artifacts are both preserved in the run
directory, and the accepted quality baseline remains unchanged.

Next hypothesis: repair judge completeness/variance or use a paired judge over identical saved
outputs before attempting another response-shaping change, then target weak project planning as a
single isolated experiment.

## Iteration 6 — Rejected — 2026-07-15

Baseline run: `autoresearch/runs/20260715T161326Z`

Experiment run: `autoresearch/runs/20260715T182859Z`

Hypothesis: scene-level image profiles with short Wikimedia queries and verified licensed fallback
anchors would prevent empty visual cards during provider rate limits without changing the model,
prompt, schema, visual-card architecture, or safety behavior.

Change attempted:

- Added focused workbench, structured-media, and ESP32 prototyping scene profiles.
- Returned a verified Wikimedia Commons anchor without retrying after an empty/rate-limited first
  provider call.
- Added regression coverage for scene-profile precedence, attribution, trusted image hosts, and
  no immediate retry after HTTP 429.

Official result versus the latest baseline:

- `overall_score`: 4.32, regressed from 4.42
- `answer_quality_score`: 3.89, regressed from 4.14
- `image_quality_score`: 3.79, improved from 2.58
- `safety_score`: 4.10, regressed from 4.34
- `schema_valid_rate`: 1, unchanged
- `broken_image_rate`: 0, unchanged
- Validation, 76 tests, and the production build passed; all 41 tasks completed.

The baseline judge completed only 27 of 41 tasks, so a second all-task deterministic comparison
was also recorded. It showed `overall_score` 4.75 versus 4.71 and `image_quality_score` 4.36
versus 2.87, but `answer_quality_score` still moved from 4.59 to 4.54. Safety moved from 4.88 to
4.89 and all image empty/duplicate/broken rates became zero.

Decision: rejected and reverted. The image hypothesis produced a large, measurable reliability
gain, but both the official run and the complete deterministic comparison violated the strict
non-regression rule for answer quality. The run artifacts remain as evidence; no score was accepted
as a new baseline.

Next hypothesis: isolate provider reliability from stochastic answer generation in the evaluator,
then test a smaller query-only scene-profile change or improve renderer-side thumbnail/error
handling without changing answer outputs.

## Operational Realtime and Credential Update — 2026-07-15

Pre-change run: `autoresearch/runs/20260715T143200Z`

Post-change run: `autoresearch/runs/20260715T145258Z`

Credentialed comparison run: `autoresearch/runs/20260715T154114Z`

Scope:

- Updated only the Realtime voice model from `gpt-realtime-1.5` to the documented current
  `gpt-realtime-2.1`; the structured-card chat model remains unchanged.
- Moved the existing full Realtime instructions into session creation and removed the invalid
  client-side `session.update` that resent immutable model/voice fields.
- Added short-lived, non-cacheable Realtime client secrets and request-time server key resolution.
- Bound Realtime client secrets to a hashed abuse-control identifier and preserved recoverable
  sessions when OpenAI emits non-fatal error events.
- Preserved the visual-card architecture, structured JSON schema, validation, prompts, image
  behavior, and safety constraints.

Verification:

- Pre-change deterministic checks: validation, 63 tests, and production build passed.
- Post-change deterministic checks: validation, 74 tests, and production build passed.
- Credentialed comparison: 41 tasks completed with zero task failures, `overall_score: 4.28`,
  `schema_valid_rate: 1`, and `model_parse_success_rate: 1`.
- A live Realtime client-secret request accepted the `gpt-realtime-2.1` session configuration.
- Root and CLI production dependency audits report zero vulnerabilities.
- CLI type-check and command smoke test pass.

The credentialed comparison scored below the accepted reference
`autoresearch/runs/20260428T211807Z` (`overall_score: 4.37`, `schema_valid_rate: 1`), so it was not
accepted as a new quality baseline. The largest score difference was image quality (`2.13` versus
`3.65`); the structured-card chat model, prompt, schema, and image behavior were unchanged by this
Realtime/credential work, so no speculative prompt or image rewrite was made. The current quality
harness does not exercise microphone capture or audio playback, so a browser voice smoke test
remains required before release.

## Iteration 5 — Accepted

Run directory: `autoresearch/runs/20260428T211807Z`

Hypothesis: the accepted schema-normalization baseline can be carried forward while adding UI/UX polish, realtime configuration updates, and context-aware image/query refinements without weakening structured JSON validation or safety behavior.

Change:

- Preserved strict structured response validation and visual-card rendering.
- Added realtime GA configuration coverage.
- Improved image/photo query handling and context-aware visual follow-ups.
- Added voice/text UX polish, card headers, safety callouts, copy actions, and progressive disclosure.
- Added README/docs updates and a generated README hero asset.

Result versus accepted baseline `autoresearch/runs/20260426T214039Z`:

- `overall_score`: 4.37, improved from 3.32
- `answer_quality_score`: 3.97, improved from 2.98
- `image_quality_score`: 3.65, improved from 2.23
- `component_selection_score`: 4.94, improved from 3.99
- `safety_score`: 4.11, improved from 1.22
- `schema_valid_rate`: 1
- `final_response_schema_valid_rate`: 1
- `model_validation_success_rate`: 1, improved from 0.9722
- `fallback_rate`: 0.1463, unchanged

Decision: accepted and kept. The harness still reports `pass: false` because remaining quality thresholds around weak project planning, ignored constraints, missing concrete parts, and generic answers are not fully cleared. Even so, the run improves every headline score and preserves full schema validity.

Next hypothesis: target weak project planning and ignored constraints with a narrow measured change that does not broaden prompt rewrites or disturb image fast-path behavior.

## Iteration 4 — Rejected

Run directory: `autoresearch/runs/20260426T222443Z`

Hypothesis: the photo fast path treats visual inspiration and setup prompts too much like simple component photo lookups. A narrow deterministic classification/query-generation fix should improve image quality without disturbing the main LLM answer path.

Change attempted:

- Added deterministic photo fast-path helpers in `app/api/chat/route.ts`.
- Kept simple component photo requests on the fast path with canonical queries.
- Built longer descriptive queries for visual inspiration-only requests.
- Prevented project-planning-plus-images prompts from using the forced photo path.
- Added `tests/photo-query.test.ts` coverage for the new fast-path behavior.

Result versus accepted baseline `autoresearch/runs/20260426T214039Z`:

- `overall_score`: 3.31, regressed from 3.32
- `answer_quality_score`: 3.05, improved from 2.98
- `image_quality_score`: 2.66, improved from 2.23
- `safety_score`: 1.03, regressed from 1.22
- `generic_answer_rate`: 0.3902, improved from 0.4634
- `shallow_image_query_rate`: 0.5, improved from 1
- `model_validation_success_rate`: 0.9189, regressed from 0.9722
- `schema_valid_rate`: 1
- `final_response_schema_valid_rate`: 1

Decision: rejected and reverted. The change proved that deterministic descriptive image queries can improve image metrics, but the broader fast-path routing change caused a worse first task, lower safety, lower model validation health, and a lower overall score.

Next hypothesis: keep project-planning fast-path behavior unchanged and target only the visual-inspiration forced-photo query text, or separately address safety/code boundaries before trying to route complex project prompts differently.

## Baseline

Status: recorded on 2026-04-26.

No optimization has been performed.

### Credentialed Baseline

Run directory: `autoresearch/runs/20260426T204852Z`

Result:

- `overall_score`: 2
- `answer_quality_score`: 1.08
- `image_quality_score`: 1.61
- `component_selection_score`: 1.5
- `safety_score`: 0.39
- `schema_valid_rate`: 1
- `tasks_run`: 41
- `tasks_failed`: 0
- `pass`: false

This is the real baseline for product quality in this environment. The route handler was invoked directly, model credentials were available, image search used the configured providers, and the optional GPT judge ran.

Top failure modes:

- `missing_concrete_parts`: 41
- `weak_project_plan`: 41
- `unsafe_electrical_guidance`: 39
- `generic_answer`: 38
- `ignored_constraints`: 38

First optimization candidate after baseline: improve the answer/content path before image ranking. The app returns schema-valid responses, but the measured answers are too shallow and miss concrete parts, constraints, project planning, and safety guidance across nearly every task.

Accepted baseline remains: `autoresearch/runs/20260426T204852Z`.

## Measurement Repair — Model Validation Diagnostics

Status: completed on 2026-04-26.

Run directory: `autoresearch/runs/20260426T212430Z`

This is a measurement-only iteration. No product optimization was attempted: no prompt changes, no image ranking changes, no image profile changes, no UI changes, and no schema changes.

Reason: `schema_valid_rate` was misleading because it measured the final public response. When a model response failed validation and the route returned a valid fallback text response, the final response still counted as schema-valid. That hid whether the raw model output parsed, whether the normalized model output validated, which fallback path was used, and which validator paths failed.

The accepted baseline remains `autoresearch/runs/20260426T204852Z`. The rejected optimization run `autoresearch/runs/20260426T210706Z` remains in history, but it is not the accepted baseline for future optimization decisions.

Result:

- `model_parse_success_rate`: 1
- `model_validation_success_rate`: 0.1081
- `final_response_schema_valid_rate`: 1
- `fallback_rate`: 0.9024
- `render_fallback_rate`: 0.8049
- `recovered_text_rate`: 0
- `forced_photo_fast_path_rate`: 0.0976

Most common validator issue paths:

- `text`: 30
- `behavior`: 22
- `ui.data.issue`: 2
- `intent`: 1

Most common validator issue messages:

- `Invalid input: expected string, received undefined`: 33
- `Invalid input: expected object, received undefined`: 22

Conclusion: the dominant blocker is missing top-level `text` and `behavior` fields in otherwise parseable model JSON. Many normalized component payloads fail validation and then become render fallback responses, which explains why final schema validity hid the model-output problem.

## Iteration 2 — Accepted

Run directory: `autoresearch/runs/20260426T214039Z`

Hypothesis: most model outputs parse as JSON but fail validation because required nullable top-level fields, especially `text` and `behavior`, are missing. The schema allows these fields to be `null`, so the normalizer should default missing top-level nullable fields to `null` before validation.

Change:

- In `app/api/chat/response-normalizer.ts`, default missing top-level `text` to `null`.
- Default missing top-level `behavior` to `null`.
- Default missing `ui` to `null` only for `mode: "text"`.
- Added tests proving valid UI payloads missing nullable top-level fields now validate, existing valid fields are preserved, invalid nested UI data still fails, `mode: "text"` without text still fails, and `mode: "ui"` without UI still fails.

Result versus accepted baseline `autoresearch/runs/20260426T204852Z`:

- `overall_score`: 3.32, improved from 2
- `answer_quality_score`: 2.98, improved from 1.08
- `image_quality_score`: 2.23, improved from 1.61
- `component_selection_score`: 3.99, improved from 1.5
- `safety_score`: 1.22, improved from 0.39
- `schema_valid_rate`: 1
- `final_response_schema_valid_rate`: 1
- `model_validation_success_rate`: 0.9722, improved from 0.1081
- `render_fallback_rate`: 0.0244, reduced from 0.8049
- `fallback_rate`: 0.1463, reduced from 0.9024

Decision: accepted and kept. The change repairs the dominant validation/fallback failure without changing the prompt, response schema, image ranking, image profiles, UI components, or eval tasks.

Next hypothesis: now that model outputs mostly validate, the dominant blocker has shifted to content quality and safety specificity. The next small optimization should target safety/code-aware project-planning guidance in the prompt or response strategy, because `unsafe_electrical_guidance` remains the top failure mode.

## Iteration 3 — Rejected

Run directory: `autoresearch/runs/20260426T220524Z`

Hypothesis: after fixing fallback behavior, the remaining quality problem is that the system prompt does not force expert maker/home-builder responses to include concrete parts/materials/tools, project planning structure, user constraints, safety/code boundaries, practical tradeoffs, and useful image queries for complex setup/inspiration requests.

Change attempted:

- Added a compact `Expert maker and home-builder project mode` section to `lib/ai/system-prompt.ts`.
- The section covered concrete part categories, project-plan shape, safety/code boundaries, user constraints, and complex setup image-query examples.

Result versus accepted baseline `autoresearch/runs/20260426T214039Z`:

- `overall_score`: 3.31, regressed from 3.32
- `answer_quality_score`: 2.92, regressed from 2.98
- `image_quality_score`: 1.6, regressed from 2.23
- `component_selection_score`: 4.28, improved from 3.99
- `safety_score`: 1.23, slightly improved from 1.22
- `schema_valid_rate`: 1
- `final_response_schema_valid_rate`: 1
- `model_validation_success_rate`: 0.8919, regressed from 0.9722

Decision: rejected and reverted. The compact prompt section improved component selection and barely improved safety, but it regressed overall quality, answer quality, image quality, and model validation health.

Next hypothesis: prompt-only broad project guidance is too blunt while route-level photo fast path still hijacks complex visual/setup prompts and shallow image queries remain at 1.0. The next small optimization should target the complex-photo fast path or a narrower imageBlock caption/query normalization, not a broad expert-mode prompt block.

## Iteration 1 — Rejected

Run directory: `autoresearch/runs/20260426T210706Z`

Hypothesis: complex maker/home-builder prompts are being treated as simple component/photo prompts, causing generic answers, missing concrete parts, weak project plans, shallow image queries, and poor safety guidance.

Change attempted:

- gated the photo fast path away from complex project/planning/inspiration prompts
- added expert maker/home-builder project-mode rules to the system prompt
- added a focused test for the photo fast-path gate

Result:

- `overall_score`: 1.7, regressed from 2
- `answer_quality_score`: 0.77, regressed from 1.08
- `image_quality_score`: 0.13, regressed from 1.61
- `component_selection_score`: 1.03, regressed from 1.5
- `safety_score`: 0.18, regressed from 0.39
- `schema_valid_rate`: 1
- `tasks_run`: 41
- `tasks_failed`: 0
- `pass`: false

Decision: rejected and reverted. The fast-path gate pushed complex visual prompts into the LLM path, but many model responses still failed validation and fell back to generic text, so image quality and overall score dropped.

### Missing-Credentials Baseline Attempt

Run directory: `autoresearch/runs/20260426T203242Z`

Result:

- `overall_score`: 1.48
- `answer_quality_score`: 0.21
- `image_quality_score`: 2.19
- `component_selection_score`: 0.49
- `safety_score`: 0.24
- `schema_valid_rate`: 0.0976
- `pass`: false

Important baseline caveat: this shell did not have `OPENAI_API_KEY`, so 37 non-photo tasks exercised the real `/api/chat` error path and returned `Failed to generate response. Please try again.` Four explicit-photo tasks exercised the real photo fast path and image-search service. These scores are real for this environment, but they are not a useful product-quality baseline until the eval is rerun with model credentials.
