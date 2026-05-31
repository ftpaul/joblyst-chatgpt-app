# Joblyst ChatGPT App

A ChatGPT App (Skybridge MCP server) that lets existing Joblyst users browse personalized matches, open job detail views, and search the Berlin/Remote-Germany job pool — without leaving ChatGPT.

## Value Proposition

**Problem**: Joblyst users already use ChatGPT to draft cover letters, refine CVs, and prep for interviews. They currently context-switch to joblyst.tech `/matches` to find which job to apply for. The existing MCP server (Claude Desktop/Cursor) is text-only, with no rich UI.

**Target user**: Existing Joblyst account holders with `candidate_profile` set (CV upload or manual onboarding completed). V2 may add an unauthenticated search path for prospects.

**Pain solved today by**: visiting joblyst.tech in another tab, or using the Claude Desktop / Cursor MCP server (no inline UI).

**Core actions (v1)**:
1. **View personalized matches** — ranked card list with score + reasons
2. **Open a job detail view** — full description, salary, work mode, "why this matched", apply link
3. **Search jobs** — filter by category, seniority, work mode, salary band (unscored)

Out of scope for v1: follow company, save job, in-ChatGPT onboarding, alerts management.

## Why LLM?

**Conversational win**:
- "Show me senior backend roles in Berlin paying €90k+ that are remote-friendly" beats clicking filters.
- "Why did this one rank higher than that one?" — natural follow-up the website cannot answer.
- "Draft a cover letter for #2" — composition happens next to the job data.

**LLM adds**:
- **Intent extraction**: natural language → `search_jobs` filters
- **Reasoning over matches**: explain why a job scored well, compare two jobs, suggest application order
- **Composition**: draft cover letter / tailored CV bullets with real job context loaded

**What the LLM lacks (the app supplies)**:
- Joblyst's job pool (`jobs`, `companies`)
- The user's `candidate_profile`
- The canonical `scoreJob` algorithm (deterministic 100-pt scoring)

**Fail-pattern check**: not a dashboard, not a full app port, not long-form static content. Clear "why in ChatGPT" — composition surface and job surface co-located.

## UI Overview

**First view (e.g. "show my matches")**: Compact ranked card list, top 5 by default. Each card:
- Title, company name + logo
- Score badge (tier color: green / blue / yellow)
- 2–3 reason chips ("Skills match: Python, K8s", "Senior level", "Remote OK")
- "Open" affordance
- "Show more" reveals additional results

**Match detail (tap card or "tell me more about #2")**: Expanded card with:
- Full description (plain-text from `description_html`)
- Salary band, work mode, visa info, location
- "Why this matched you" — full reasons list
- Apply button → opens external URL in browser

**Search flow ("find me product designer roles")**: Filter chips at top (Category, Seniority, Work mode), result cards below — same compact format, no score badge.

**End state**: User picks a job → reads detail → clicks Apply → opens external URL. Conversation continues — ChatGPT drafts application materials with real job context loaded.

## Product Context

**Existing products**:
- `joblyst.tech` web app (Next.js, Vercel)
- Existing MCP server at `supabase/functions/mcp/index.ts` (Claude Desktop / Cursor, text-only)

**Data sources**:
- Supabase Postgres: `jobs`, `companies`, `profiles` (incl. `candidate_profile`, `mcp_api_key`)
- Read path: Supabase REST API with `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- Scoring: import `src/lib/scoring.ts` (Node-compatible mirror, pinned by 39 vitest tests)

**Auth (two tiers)**:
- **Public** (`search_jobs`): no key needed. Data is already public on joblyst.tech. MCP URL: `https://<deploy>.alpic.live/mcp`.
- **Authenticated** (`get_matches`, `get_profile`): require the user's `mcp_api_key` (UUID). User generates key on `/account` → "LLM Access" → Generate, then appends it as a query param: `https://<deploy>.alpic.live/mcp?key=<uuid>`. Same key as the existing Claude Desktop / Cursor MCP server.

Why query param? ChatGPT's MCP connector only exposes None / OAuth — there's no static-token field. We don't run OAuth discovery, so `?key=` is the v1 ship.

**Topology**:
- Standalone Skybridge project (Node runtime + React views) — **not** a Supabase edge function (Deno, no React).
- Deploys to **Alpic**.
- Server side calls Supabase REST API for `jobs`/`companies` reads and to look up profile by `mcp_api_key`.
- Scoring algorithm vendored from `src/lib/scoring.ts` (Node mirror of `_shared/scoring.ts` in the Joblyst monorepo). Three-way sync rule.

**Constraints**:
- Production has no staging — deploys are immediately live, but Skybridge app is isolated from the Joblyst website / pipeline.
- Scoring sync: any change to scoring weights/thresholds must land in `chatgpt-app/src/scoring/`, `src/lib/scoring.ts`, and `supabase/functions/_shared/scoring.ts` simultaneously.
- `get_matches` runs scoring live each call (does NOT read `profile.scored_matches`); same approach as the existing MCP server. Does NOT run LLM rerank — deterministic scores only.
- Berlin/Remote-Germany filter and 55/75 thresholds inherited from `scoreJob` and `passesHardPreferences`.
- Description text is email-redacted before returning to the LLM (prevents recruiter contact emails being mistaken for auth identity).

**Scope boundary**: ChatGPT app does not write to the database in v1 (no follow-company, no save-job, no profile mutation). All actions are reads + opening external URLs.

## UX Flows

**View personalized matches:**
1. See ranked card list (top 10 by default)
2. Open a match → full detail subview
3. Click Apply → external URL

**Search jobs:**
1. Provide filters (category, seniority, work mode, salary, free-text query)
2. See filtered card list (unscored)
3. Open a job → full detail subview
4. Click Apply → external URL

**Compose application materials (LLM-only, no view):**
1. LLM calls `get_profile` to load the user's skills/seniority/preferences as text
2. LLM combines profile + job data already in conversation context to draft cover letter / tailored CV bullets

**Discover what's new ("what's hot in Berlin right now"):**
1. `recent_jobs` shows the latest postings in a date-bounded card list
2. `top_hiring_companies` ranks growing teams by open-role count, with sample titles per company
3. `language_benchmark` quantifies the English vs German split for a category — a real concern for international job-seekers in Berlin

## Tools and Views

**View: `get_matches`** — requires key
- **Input**: `{ limit?: number }` (default 10, max 50)
- **Output**: `{ matches: [{ job, score, reasons[] }] }` — full `Job` shape inline; no lazy-load
- **Subviews**: ranked card list, job detail
- **Behavior**: runs canonical `scoreJob` (vendored from `src/lib/scoring.ts`) live; applies Berlin filter, hard preferences, and 55/75 in-category / cross-category thresholds. No LLM rerank.
- **Errors**: returns `{ error: "unauthorized" }` if no key, `{ error: "profile_incomplete" }` if `candidate_profile` is null.

**View: `search_jobs`** — public, no auth
- **Input**: `{ query?, category?, seniority?, work_mode?, salary_min?, limit? }` (limit default 20, max 50)
- **Output**: `{ jobs: Job[], appliedFilters }`
- **Subviews**: filtered card list, job detail
- **Behavior**: filters `is_active` + AI-processed Berlin/Remote-Germany jobs via Supabase REST. No scoring.

**View: `get_profile`** — requires key
- **Input**: `{}` (with a single reserved `_` field — Skybridge requires a non-empty inputSchema for `extra.requestInfo` to be populated, otherwise our inline URL-based auth can't see the `?key=`).
- **Output**: `{ profile: { role_families[], primary_skills[], secondary_skills[], seniority, industries[], languages[], preferences } }` — `preferences` is an allowlisted set of known keys; the raw JSONB blob is never returned.
- **Subviews**: profile summary card with chip lists for skills / industries / languages / preferences.
- **Behavior**: returns the user's `candidate_profile` both as a styled view (for the human) and as structured text via `content` (for the LLM to compose against — cover letters, tailored CV bullets).
- **Errors**: returns `{ error: "unauthorized" }` if no key, `{ error: "profile_incomplete" }` if `candidate_profile` is null.

**View: `recent_jobs`** — public, no auth
- **Input**: `{ days?: number (1–30, default 7), category?, seniority?, work_mode?, limit? }`
- **Output**: same shape as `search_jobs` plus `appliedFilters.since_days`
- **Subviews**: filtered card list, job detail
- **Behavior**: filters active Berlin / Remote-Germany jobs to those with `created_at` within the last N days. Uses a dedicated `recent-jobs` view component because Skybridge enforces 1 view per tool — the rendering logic is the same as `search-jobs` but the view file is distinct.

**View: `top_hiring_companies`** — public, no auth
- **Input**: `{ category?, limit?: number (1–20, default 10) }`
- **Output**: `{ companies: [{ name, logo_url, website_url, job_count, sample_titles[] }], category, total_jobs_considered }`
- **Subviews**: ranked company list (no detail subview in v1)
- **Behavior**: groups active Berlin / Remote-Germany jobs by company name, counts open roles per company, returns top N sorted desc. Includes up to 5 sample role titles per company for context.

**Tool: `language_benchmark`** — public, no auth
- **Input**: `{ category? }`
- **Output**: `{ category, total_jobs, requires_german, english_friendly, unspecified, percentages: { requires_german, english_friendly, unspecified } }`
- **Behavior**: counts active Berlin / Remote-Germany jobs grouped by `requires_german` (true / false / null). Text-only output — no view. Returns a one-sentence summary phrased for the LLM ("Of N jobs in <X>: Y% accept English-only, Z% require German.").

**Shared `Job` shape:**
```ts
{
  id, title,
  company: { name, logo_url, slug },
  category, subcategory, seniority, work_mode,
  salary_min, salary_max, currency, location, visa_sponsorship,
  description_text,           // description_html stripped server-side
  external_url, published_at, is_active
}
```
