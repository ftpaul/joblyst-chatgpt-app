# Joblyst for ChatGPT

A ChatGPT App that brings personalized Berlin tech-job matches into your conversation. Search public listings without an account, or connect your Joblyst profile for ranked matches scored against your CV.

**Live MCP URL:** `https://joblyst-app-442c1dad.alpic.live/mcp`
**Built for the Alpic × MCP hackathon (May 2026).** Powered by [Joblyst](https://joblyst.tech), [Skybridge](https://skybridge.tech), and [Alpic](https://alpic.ai).

---

## What it does

Six MCP tools — four with rich React views, two text-only. All operate on the same active Berlin / Remote-Germany job pool.

**Public (no account required):**

| Tool | View | Purpose | Try in chat |
|---|---|---|---|
| `search_jobs` | ✅ cards | Browse + filter by category, seniority, work mode, salary | *"find senior product roles in Berlin"* |
| `recent_jobs` | ✅ cards | Jobs posted in the last N days (default 7, max 30) | *"what's new this week?"* |
| `top_hiring_companies` | ✅ ranked list | Companies with the most open roles, optionally per category | *"who's hiring the most engineers right now?"* |
| `language_benchmark` | text | English vs German requirement breakdown, optionally per category | *"do I need German for product roles in Berlin?"* |

**Authenticated (`?key=<uuid>` appended to the MCP URL):**

| Tool | View | Purpose | Try in chat |
|---|---|---|---|
| `get_matches` | ✅ cards | Personalized ranked matches scored with the same 100-point algorithm as joblyst.tech, with tier badges and "why this matched" reasons | *"show my matches"* |
| `get_profile` | text | Returns your candidate profile as structured text — skills, seniority, preferences | *"draft a cover letter for #1 using my profile"* |

Each view returns rich UI (React components rendered inline in ChatGPT) plus structured text the LLM can reason over. After picking a job, ask ChatGPT to draft a cover letter — the job context is already loaded in the conversation.

---

## Connect it to ChatGPT

1. Open https://chatgpt.com/apps#settings/Connectors → **Create App** (Developer mode required: Settings → Apps → Advanced Settings)
2. Configure:
   - **Name**: Joblyst
   - **MCP Server URL**: see auth options below
   - **Authentication**: None
3. Test in any chat: `@joblyst find me senior product roles in Berlin`

### Public mode (search only)
```
https://joblyst-app-442c1dad.alpic.live/mcp
```
No account required. `get_matches` and `get_profile` return a friendly sign-up CTA.

### Authenticated mode (personalized matches)
```
https://joblyst-app-442c1dad.alpic.live/mcp?key=<your-mcp_api_key>
```

To get your key:
1. Sign up at [joblyst.tech](https://joblyst.tech) (free)
2. Upload your CV or complete the manual onboarding
3. `/account` → "LLM Access" → **Generate**
4. Paste the UUID into the URL above

> ChatGPT doesn't let you edit a connector's URL after creation. To upgrade from public → personal, delete the connector and recreate it, or install both side by side.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ChatGPT (browser)                       │
│                                                              │
│   user: "@joblyst show my matches"                          │
│         │                                                    │
│         ▼                                                    │
│   POST /mcp?key=<uuid>  ─────────────┐                      │
└──────────────────────────────────────┼──────────────────────┘
                                       │
                                       ▼  CloudFront edge
┌─────────────────────────────────────────────────────────────┐
│         Alpic runtime (Node 24 + Skybridge + React)          │
│                                                              │
│   src/server.ts  — MCP tools (get_matches, search_jobs,      │
│                    get_profile)                              │
│   src/auth.ts    — Extract ?key= from request URL,           │
│                    look up profiles.mcp_api_key              │
│   src/joblyst.ts — Supabase REST client                      │
│   src/scoring/   — Vendored scoreJob from Joblyst's          │
│                    monorepo (kept in lockstep via sync rule) │
│   src/views/*    — React components rendered inline in       │
│                    ChatGPT (Tailwind, Brandfetch logos)      │
└──────────────────────────────────────┬──────────────────────┘
                                       │
                                       ▼  Supabase REST (service role)
┌─────────────────────────────────────────────────────────────┐
│        Joblyst Supabase (PostgreSQL + Edge Functions)        │
│                                                              │
│   profiles, jobs, companies                                  │
│   ATS-fetched + GPT-enriched + auto-scored                   │
└─────────────────────────────────────────────────────────────┘
```

**Key design choices**
- **Auth via `?key=` query param.** ChatGPT's MCP connector only supports None / OAuth — no static-token field. Rather than implement OAuth discovery for v1, we accept the key as a URL param. The extractor reads it from `extra.requestInfo.url` (which Skybridge populates with the inbound `req.url`).
- **Tools run with full service role.** Auth happens inline at handler entry via `getAuthedProfile(extra)`, which throws a clean `AuthError` if no valid UUID is present. Errors are converted to MCP tool errors with a sign-up CTA — never `-32603 Invalid response format`.
- **Scoring is vendored, not imported.** Alpic deploys only `chatgpt-app/`, so a cross-package import from `../src/lib/scoring` would break in production. The three copies (`supabase/functions/_shared/scoring.ts`, `src/lib/scoring.ts`, `chatgpt-app/src/scoring/scoring.ts`) must be kept in lockstep. See `src/scoring/README.md`.
- **`description_text` is email-redacted** before being returned to the LLM. Prevents ChatGPT from mistaking a recruiter contact email for the user's identity (real bug we caught).
- **`get_profile` returns an allowlisted preferences shape**, never the raw JSONB blob.

---

## Run it locally

Requirements: Node ≥24.14.1 (see `.nvmrc`), an `.env.local` with Supabase credentials.

```bash
# from this directory
nvm use                                # picks up .nvmrc
npm install
cp .env.example .env.local             # then fill in SUPABASE_* values
npm run dev                            # starts http://localhost:3000
```

For local DevTools (Skybridge's built-in inspector at http://localhost:3000/), you must set `DEV_PROFILE_API_KEY=<your-uuid>` in `.env.local`. DevTools has no OAuth flow, so the server falls back to that key for handler-side auth.

`.env.local` keys:
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...                 # bypasses RLS, never commit
DEV_PROFILE_API_KEY=<your-mcp_api_key-uuid>      # dev only — prod ignores this
```

---

## Deploy to Alpic

```bash
npx alpic@latest login                                     # one-time
npx alpic@latest deploy --non-interactive                  # uses .alpic/project.json
```

First-time deploy (no `.alpic/` yet):

```bash
npx alpic@latest deploy --non-interactive \
  --project-name joblyst-app \
  --runtime node24
```

Then push the production env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — **not** `DEV_PROFILE_API_KEY`):

```bash
npx alpic@latest environment-variable add \
  --non-interactive \
  --key SUPABASE_URL \
  --value https://<project-ref>.supabase.co \
  --no-secret
npx alpic@latest environment-variable add \
  --non-interactive \
  --key SUPABASE_SERVICE_ROLE_KEY
# (interactive prompt for the value so it stays out of shell history)
```

---

## Project layout

```
chatgpt-app/
├── src/
│   ├── server.ts            # McpServer setup + tool registrations
│   ├── auth.ts              # Inline Bearer / ?key= auth
│   ├── joblyst.ts           # Supabase REST client + HTML→text + email redaction
│   ├── scoring/             # Vendored canonical scoreJob (see scoring/README.md)
│   ├── helpers.ts           # generateHelpers for typed views
│   ├── views/
│   │   ├── matches.tsx        # get_matches view (cards + detail + sign-up CTA)
│   │   ├── search-jobs.tsx    # search_jobs view (cards + detail)
│   │   ├── recent-jobs.tsx    # recent_jobs view (same shape, separate per Skybridge 1-view-per-tool rule)
│   │   ├── top-companies.tsx  # top_hiring_companies view (ranked company cards)
│   │   └── components/
│   │       └── job-card.tsx   # Shared JobCard + CompanyLogo + TierBadge (Brandfetch cascade)
│   └── index.css            # Tailwind base + Joblyst design tokens
├── SPEC.md                  # Discovery + architecture record
├── alpic.json               # Deploy config (schema reference only)
├── vite.config.ts           # Skybridge + Tailwind + React plugin
└── tsconfig.json            # Extends skybridge/tsconfig
```

---

## Tech stack

- **Skybridge** 1.0.3 — MCP server framework with React-view bundling
- **@modelcontextprotocol/sdk** 1.29 — JSON-RPC transport + handler primitives
- **Vite** 8 / **React** 19 / **Tailwind** 4
- **Node** 24.16 (Alpic runtime)
- **Supabase** REST API — reads `jobs`, `companies`, `profiles`
- **Brandfetch CDN** — company logo fallback (cascading from explicit `logo_url` → Brandfetch → colored initials avatar with 0×0 image detection)

---

## Links

- **Joblyst**: https://joblyst.tech
- **MCP spec**: https://modelcontextprotocol.io
- **Skybridge docs**: https://docs.skybridge.tech
- **Alpic**: https://alpic.ai
