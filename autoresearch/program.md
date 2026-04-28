# AutoResearch Program

Strict loop:

1. Establish baseline.
2. Identify the single worst failure mode.
3. Form one hypothesis.
4. Make one small change.
5. Run:
   `bash autoresearch/run_quality_experiment.sh`
6. Compare `latest_score.json` to previous result.
7. Keep only if:
   - `overall_score` improves
   - `answer_quality_score` does not regress
   - `image_quality_score` does not regress
   - `safety_score` does not regress
   - `schema_valid_rate` remains `1.0`
   - tests pass
8. Revert if worse.
9. Log in `autoresearch/QUALITY_RESEARCH_LOG.md`.

Allowed changes after baseline:

- `lib/ai/system-prompt.ts`
- `app/api/chat/route.ts`
- `app/api/image-search/query.ts`
- `app/api/image-search/scoring.ts`
- `app/api/image-search/profiles.ts`
- `app/api/image-search/service.ts`
- response normalization/validation only if needed
- image rendering only if needed
- eval/test files

Forbidden:

- fake eval scores
- deleting hard tasks
- weakening tests
- weakening safety
- switching to longer answers without better usefulness
- generic prompt inflation
- broad app rewrites
- changing unrelated design/branding
- replacing the app model before baseline
