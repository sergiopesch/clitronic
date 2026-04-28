# Quality Research Log

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
