import { McpServer } from "skybridge/server";
import { z } from "zod";
import { AuthError, profileFromAuth } from "./auth.js";
import {
  fetchActiveJobs,
  toJobLite,
  type JobRow,
  type ProfileRow,
} from "./joblyst.js";
import {
  isBerlinJob,
  passesHardPreferences,
  scoreJob,
  scoreTier,
} from "./scoring/scoring.js";

// Run profileFromAuth and convert AuthError into a clean MCP tool error.
async function getAuthedProfile(
  extra: Parameters<typeof profileFromAuth>[0],
): Promise<
  | { profile: ProfileRow; error: null }
  | {
      profile: null;
      error: {
        structuredContent: { error: "unauthorized"; message: string };
        content: { type: "text"; text: string }[];
        isError: true;
      };
    }
> {
  try {
    return { profile: await profileFromAuth(extra), error: null };
  } catch (e) {
    if (e instanceof AuthError) {
      return {
        profile: null,
        error: {
          structuredContent: { error: "unauthorized" as const, message: e.message },
          content: [{ type: "text" as const, text: e.message }],
          isError: true as const,
        },
      };
    }
    throw e;
  }
}

const APPLY_DOMAIN_HINT = "https://joblyst.tech";

// Derive the Supabase origin from the env var so the codebase stays portable
// (anyone can fork and point at their own Supabase project without touching
// this file). Fall back to a placeholder if unset — harmless in CSP because
// no request will actually be made to it.
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.SUPABASE_URL ?? "https://example.invalid").origin;
  } catch {
    return "https://example.invalid";
  }
})();

const VIEW_CSP = {
  resourceDomains: [
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://cdn.brandfetch.io",
    SUPABASE_ORIGIN,
  ],
};

const server = new McpServer(
  { name: "joblyst", version: "0.1.0" },
  { capabilities: {} },
)
  // Auth is enforced inline by profileFromAuth() inside each handler — see
  // src/auth.ts. The MCP URL accepts the API key as a `?key=<uuid>` query
  // param (workaround for ChatGPT's MCP connector which only supports
  // None / OAuth, no static-token field). profileFromAuth reads the token
  // from extra.requestInfo.url's query string.
  .registerTool(
    {
      name: "get_matches",
      description:
        "Personalized Joblyst job matches for the authenticated user. " +
        "Scores active Berlin/Remote-Germany jobs against the user's profile " +
        "using the same algorithm as joblyst.tech. Returns up to 50 matches " +
        "sorted by tier and recency. " +
        "REQUIRES a Joblyst account — the user must sign up at joblyst.tech " +
        "and append ?key=<their-mcp_api_key> to the MCP URL. " +
        "For non-authenticated users, suggest search_jobs instead.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max matches to return (default 10, max 50)."),
      },
      annotations: {
        title: "Show my Joblyst matches",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Scoring your matches…",
        "openai/toolInvocation/invoked": "Matches ready.",
      },
      view: {
        component: "matches",
        domain: APPLY_DOMAIN_HINT,
        description: "Ranked match cards with score and reasons",
        csp: VIEW_CSP,
      },
    },
    async ({ limit }, extra) => {
      const auth = await getAuthedProfile(extra);
      if (auth.error) return auth.error;
      const profile = auth.profile;
      const cp = profile.candidate_profile;
      if (!cp) {
        return {
          structuredContent: { error: "profile_incomplete" as const },
          content: [
            {
              type: "text",
              text: "Profile not set up yet. Visit joblyst.tech, upload a CV or complete manual onboarding, then try again.",
            },
          ],
          isError: false,
        };
      }
      const prefs = profile.preferences ?? {};
      const remoteOnly = !!prefs.remote_only;
      const englishOnly = !!prefs.english_only;
      const salaryRequired = !!prefs.salary_required;

      const raw = await fetchActiveJobs({ limit: 300 });

      const userCats = [cp.primary_category, cp.secondary_category]
        .filter(Boolean)
        .map((c: string) => c.toLowerCase());

      const filtered = raw.filter((j: JobRow) => {
        if (!isBerlinJob(j.location || "")) return false;
        if (englishOnly && j.requires_german) return false;
        if (remoteOnly && j.ai_work_mode !== "remote") return false;
        if (salaryRequired && j.salary_min == null && j.salary_max == null)
          return false;
        if (!passesHardPreferences(j, prefs)) return false;
        return true;
      });

      const scored = filtered
        .map((j: JobRow) => {
          const { score, reasons } = scoreJob(j, cp, remoteOnly);
          return { job: j, score, reasons };
        })
        .filter(({ job, score }) => {
          const inCat = userCats.includes(
            (job.ai_category || "").toLowerCase(),
          );
          return inCat ? score >= 55 : score >= 75;
        })
        .sort((a, b) => {
          const t = scoreTier(b.score) - scoreTier(a.score);
          if (t !== 0) return t;
          return (
            new Date(b.job.created_at).getTime() -
            new Date(a.job.created_at).getTime()
          );
        })
        .slice(0, Math.min(limit ?? 10, 50));

      const matches = scored.map(({ job, score, reasons }) => ({
        job: toJobLite(job),
        score,
        tier: scoreTier(score),
        reasons,
      }));

      return {
        structuredContent: { matches },
        content: [
          {
            type: "text",
            text:
              matches.length === 0
                ? "No matches above threshold right now. Try widening preferences on joblyst.tech."
                : `${matches.length} ranked matches.`,
          },
        ],
        isError: false,
      };
    },
  )
  .registerTool(
    {
      name: "search_jobs",
      description:
        "Browse active Berlin/Remote-Germany tech jobs from Joblyst. " +
        "Public — no account required. " +
        "Filter by free-text query, category (Engineering, Product & Design, " +
        "Data & AI, Sales & Growth, Marketing, People & HR, Operations & Legal, " +
        "Leadership), seniority, work mode, and minimum salary. " +
        "Use this when the user is exploring without a Joblyst account, " +
        "or when they want unscored search results.",
      inputSchema: {
        query: z.string().optional().describe("Title contains (case-insensitive)."),
        category: z
          .string()
          .optional()
          .describe(
            "Primary category, e.g. Engineering, Product & Design, Data & AI.",
          ),
        seniority: z
          .enum(["intern", "junior", "mid", "senior", "leadership"])
          .optional(),
        work_mode: z.enum(["remote", "hybrid", "onsite"]).optional(),
        salary_min: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: {
        title: "Search Joblyst jobs",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Searching Joblyst…",
        "openai/toolInvocation/invoked": "Results ready.",
      },
      view: {
        component: "search-jobs",
        domain: APPLY_DOMAIN_HINT,
        description: "Filtered job results",
        csp: VIEW_CSP,
      },
    },
    async (input) => {
      const limit = Math.min(input.limit ?? 20, 50);
      const raw = await fetchActiveJobs({
        category: input.category,
        seniority: input.seniority,
        workMode: input.work_mode,
        salaryMin: input.salary_min,
        query: input.query,
        limit: 300,
      });
      const jobs = raw
        .filter((j) => isBerlinJob(j.location || ""))
        .slice(0, limit)
        .map((j) => toJobLite(j));

      return {
        structuredContent: {
          jobs,
          appliedFilters: {
            query: input.query ?? null,
            category: input.category ?? null,
            seniority: input.seniority ?? null,
            work_mode: input.work_mode ?? null,
            salary_min: input.salary_min ?? null,
          },
        },
        content: [
          {
            type: "text",
            text:
              jobs.length === 0
                ? "No jobs match those filters."
                : `${jobs.length} jobs.`,
          },
        ],
        isError: false,
      };
    },
  )
  .registerTool(
    {
      name: "get_profile",
      description:
        "Read the authenticated user's Joblyst candidate profile (skills, " +
        "seniority, preferences). Useful for drafting cover letters or " +
        "tailoring CV bullets to a specific role. " +
        "REQUIRES a Joblyst account — same auth as get_matches.",
      // Empty inputSchema is required: without it, Skybridge dispatches the
      // handler via a different path that doesn't populate extra.requestInfo,
      // so our inline auth can't read ?key= from the URL.
      inputSchema: {
        _: z
          .undefined()
          .optional()
          .describe("Reserved — pass no arguments."),
      },
      annotations: {
        title: "Read my Joblyst profile",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Loading your profile…",
        "openai/toolInvocation/invoked": "Profile loaded.",
      },
      view: {
        component: "profile",
        domain: APPLY_DOMAIN_HINT,
        description: "Profile summary",
        csp: VIEW_CSP,
      },
    },
    async (_input, extra) => {
      const auth = await getAuthedProfile(extra);
      if (auth.error) return auth.error;
      const profile = auth.profile;
      const cp = profile.candidate_profile;
      if (!cp) {
        return {
          structuredContent: { error: "profile_incomplete" as const },
          content: [
            {
              type: "text",
              text: "Profile not set up yet. Visit joblyst.tech and complete onboarding.",
            },
          ],
          isError: false,
        };
      }
      // Allowlist preferences keys — never return raw JSONB to the LLM in
      // case an email-shaped field crept into the blob over time.
      const p = profile.preferences ?? {};
      const safePreferences = {
        remote_only: !!p.remote_only,
        english_only: !!p.english_only,
        salary_required: !!p.salary_required,
        salary_floor_eur:
          typeof p.salary_floor_eur === "number" ? p.salary_floor_eur : null,
        seniority_floor:
          typeof p.seniority_floor === "string" ? p.seniority_floor : null,
        seniority_ceiling:
          typeof p.seniority_ceiling === "string" ? p.seniority_ceiling : null,
        excluded_subcategories: Array.isArray(p.excluded_subcategories)
          ? p.excluded_subcategories
          : [],
        excluded_employment_types: Array.isArray(p.excluded_employment_types)
          ? p.excluded_employment_types
          : [],
      };
      const out = {
        profile: {
          role_families: cp.role_families ?? [],
          primary_category: cp.primary_category ?? profile.primary_category,
          secondary_category: cp.secondary_category ?? null,
          seniority: cp.seniority ?? profile.seniority,
          primary_skills: cp.primary_skills ?? [],
          secondary_skills: cp.secondary_skills ?? [],
          industry_experience: cp.industry_experience ?? [],
          languages: cp.languages ?? [],
          preferences: safePreferences,
        },
      };
      return {
        structuredContent: out,
        content: [
          {
            type: "text",
            text: JSON.stringify(out.profile, null, 2),
          },
        ],
        isError: false,
      };
    },
  )
  .registerTool(
    {
      name: "top_hiring_companies",
      description:
        "Public — no account required. " +
        "Find companies currently hiring the most active roles on Joblyst " +
        "(Berlin / Remote-Germany). Useful for spotting growing teams in a " +
        "category, identifying potential employers worth following, or " +
        "answering 'who's hiring lots of <X> right now?'. " +
        "Returns up to 20 companies ranked by open-role count, with sample " +
        "role titles for each.",
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe(
            "Filter to one category (Engineering, Product & Design, Data & AI, etc).",
          ),
        limit: z.number().int().min(1).max(20).optional(),
      },
      annotations: {
        title: "Top hiring companies in Berlin",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Aggregating open roles by company…",
        "openai/toolInvocation/invoked": "Top hirers ready.",
      },
      view: {
        component: "top-companies",
        domain: APPLY_DOMAIN_HINT,
        description: "Companies hiring the most active roles",
        csp: VIEW_CSP,
      },
    },
    async (input) => {
      const raw = await fetchActiveJobs({
        category: input.category,
        limit: 300,
      });
      const berlinJobs = raw.filter((j) => isBerlinJob(j.location || ""));

      // Group by company name (some jobs may have no company row — skip those).
      const byCompany = new Map<
        string,
        {
          name: string;
          logo_url: string | null;
          website_url: string | null;
          jobs: { id: string; title: string; sub_category: string | null }[];
        }
      >();
      for (const j of berlinJobs) {
        if (!j.company?.name) continue;
        const key = j.company.name;
        const existing = byCompany.get(key);
        if (existing) {
          existing.jobs.push({
            id: j.id,
            title: j.title,
            sub_category: j.ai_sub_category,
          });
        } else {
          byCompany.set(key, {
            name: j.company.name,
            logo_url: j.company.logo_url ?? null,
            website_url: j.company.website_url ?? null,
            jobs: [
              {
                id: j.id,
                title: j.title,
                sub_category: j.ai_sub_category,
              },
            ],
          });
        }
      }

      const limit = Math.min(input.limit ?? 10, 20);
      const companies = Array.from(byCompany.values())
        .sort((a, b) => b.jobs.length - a.jobs.length)
        .slice(0, limit)
        .map((c) => ({
          name: c.name,
          logo_url: c.logo_url,
          website_url: c.website_url,
          job_count: c.jobs.length,
          sample_titles: c.jobs.slice(0, 5).map((j) => j.title),
        }));

      return {
        structuredContent: {
          companies,
          category: input.category ?? null,
          total_jobs_considered: berlinJobs.length,
        },
        content: [
          {
            type: "text",
            text:
              companies.length === 0
                ? "No companies match."
                : `${companies.length} companies, ranked by active roles in Berlin/Remote-Germany${input.category ? ` (${input.category})` : ""}.`,
          },
        ],
        isError: false,
      };
    },
  )
  .registerTool(
    {
      name: "recent_jobs",
      description:
        "Public — no account required. " +
        "Jobs posted to Joblyst in the last N days (default 7, max 30). " +
        "Use this when the user asks 'what's new this week' or wants the " +
        "freshest Berlin / Remote-Germany roles. Filterable by category, " +
        "seniority, and work mode. Same card view as search_jobs.",
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("Look-back window in days (default 7, max 30)."),
        category: z.string().optional(),
        seniority: z
          .enum(["intern", "junior", "mid", "senior", "leadership"])
          .optional(),
        work_mode: z.enum(["remote", "hybrid", "onsite"]).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: {
        title: "What's new on Joblyst",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Pulling the latest postings…",
        "openai/toolInvocation/invoked": "Fresh jobs ready.",
      },
      view: {
        component: "recent-jobs",
        domain: APPLY_DOMAIN_HINT,
        description: "Recently posted job results",
        csp: VIEW_CSP,
      },
    },
    async (input) => {
      const days = Math.min(input.days ?? 7, 30);
      const limit = Math.min(input.limit ?? 20, 50);
      const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

      const raw = await fetchActiveJobs({
        category: input.category,
        seniority: input.seniority,
        workMode: input.work_mode,
        limit: 300,
      });
      const jobs = raw
        .filter((j) => isBerlinJob(j.location || ""))
        .filter((j) => new Date(j.created_at).getTime() >= sinceMs)
        .slice(0, limit)
        .map((j) => toJobLite(j));

      return {
        structuredContent: {
          jobs,
          appliedFilters: {
            query: null,
            category: input.category ?? null,
            seniority: input.seniority ?? null,
            work_mode: input.work_mode ?? null,
            salary_min: null,
            since_days: days,
          },
        },
        content: [
          {
            type: "text",
            text:
              jobs.length === 0
                ? `No jobs in the last ${days} days for those filters.`
                : `${jobs.length} jobs posted in the last ${days} days.`,
          },
        ],
        isError: false,
      };
    },
  )
  .registerTool(
    {
      name: "language_benchmark",
      description:
        "Public — no account required. " +
        "How many active Berlin / Remote-Germany jobs require German vs. " +
        "accept English-only? Returns counts and percentages, optionally " +
        "scoped to a category. Useful for answering 'do I need German for " +
        "<role> in Berlin?'. Text-only (no view).",
      inputSchema: {
        category: z.string().optional(),
      },
      annotations: {
        title: "English vs German job mix",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Calculating language requirements…",
        "openai/toolInvocation/invoked": "Breakdown ready.",
      },
    },
    async (input) => {
      const raw = await fetchActiveJobs({
        category: input.category,
        limit: 300,
      });
      const jobs = raw.filter((j) => isBerlinJob(j.location || ""));
      const total = jobs.length;
      const requires_german = jobs.filter((j) => j.requires_german === true)
        .length;
      const english_friendly = jobs.filter(
        (j) => j.requires_german === false,
      ).length;
      const unspecified = total - requires_german - english_friendly;
      const pct = (n: number) =>
        total === 0 ? 0 : Math.round((n / total) * 100);

      const result = {
        category: input.category ?? null,
        total_jobs: total,
        requires_german,
        english_friendly,
        unspecified,
        percentages: {
          requires_german: pct(requires_german),
          english_friendly: pct(english_friendly),
          unspecified: pct(unspecified),
        },
      };

      const summary =
        total === 0
          ? "No active jobs found for that filter."
          : `Of ${total} active Berlin / Remote-Germany jobs${
              input.category ? ` in ${input.category}` : ""
            }: ${pct(english_friendly)}% accept English-only, ${pct(
              requires_german,
            )}% require German${
              unspecified > 0 ? `, ${pct(unspecified)}% unspecified` : ""
            }.`;

      return {
        structuredContent: result,
        content: [{ type: "text", text: summary }],
        isError: false,
      };
    },
  );

if (process.env.NODE_ENV === "production") {
  const { default: manifest } = await import("./vite-manifest.js");
  server.setViteManifest(manifest);
}

export default await server.run();

export type AppType = typeof server;
