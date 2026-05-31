# Scoring (vendored)

Vendored copy of Joblyst's canonical scoring algorithm from `../../../src/lib/`. Imported by `src/server.ts` to score jobs against the user's `candidate_profile`.

## Why vendored?

Alpic deploys the `chatgpt-app/` directory only — files outside the folder are not in the production bundle. A direct relative import (`../src/lib/scoring`) works in dev but breaks in production.

## Sync rule

Any change to scoring weights, thresholds, or logic MUST land in all three places at the same time:

1. `supabase/functions/_shared/scoring.ts` (canonical, Deno)
2. `src/lib/scoring.ts` (Node mirror, tested by vitest)
3. `chatgpt-app/src/scoring/scoring.ts` (this copy)

Same rule applies to `skillSynonyms.ts` and `weights.ts`.

The 39 vitest tests in `src/lib/__tests__/scoring.test.ts` pin the algorithm. Add a CI check that diffs `chatgpt-app/src/scoring/scoring.ts` against `src/lib/scoring.ts` and fails on drift.
