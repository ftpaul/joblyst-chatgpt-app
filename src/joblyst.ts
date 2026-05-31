// Joblyst data access via Supabase REST API.
//
// Uses the service role key (bypasses RLS) — never exposed client-side.
// Auth is enforced upstream by the Bearer mcp_api_key check in auth.ts.

// Load .env.local in dev. Production (Alpic) injects env vars directly.
if (process.env.NODE_ENV !== "production") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // .env.local missing — env vars may come from the shell instead.
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. " +
      "Dev: add to chatgpt-app/.env.local. " +
      "Prod (Alpic): `alpic environment-variable add --env-file <file>` " +
      "or set in the Alpic dashboard.",
  );
}

const REST_BASE = `${SUPABASE_URL}/rest/v1`;

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${REST_BASE}/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase REST ${path} → ${res.status} ${text}`);
  }
  return res.json();
}

export interface ProfileRow {
  id: string;
  email: string;
  candidate_profile: any | null;
  preferences: any | null;
  primary_category: string | null;
  seniority: string | null;
  subcategories: string[] | null;
}

export async function findProfileByApiKey(
  apiKey: string,
): Promise<ProfileRow | null> {
  const rows: ProfileRow[] = await rest(
    `profiles?select=id,email,candidate_profile,preferences,primary_category,seniority,subcategories&mcp_api_key=eq.${encodeURIComponent(apiKey)}&limit=1`,
  );
  return rows[0] ?? null;
}

export interface JobRow {
  id: string;
  title: string;
  location: string | null;
  external_url: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  ai_category: string | null;
  ai_sub_category: string | null;
  ai_skills: string[] | null;
  seniority_level: string | null;
  ai_work_mode: string | null;
  requires_german: boolean | null;
  employment_type: string | null;
  description_html: string | null;
  created_at: string;
  company:
    | {
        name: string;
        logo_url: string | null;
        website_url: string | null;
        slug: string | null;
      }
    | null;
}

const JOB_SELECT =
  "id,title,location,external_url,salary_min,salary_max,salary_currency," +
  "ai_category,ai_sub_category,ai_skills,seniority_level,ai_work_mode," +
  "requires_german,ai_visa_sponsorship,employment_type,description_html,created_at," +
  "company:companies(name,logo_url,website_url,slug)";

export async function fetchActiveJobs(opts: {
  category?: string;
  seniority?: string;
  workMode?: string;
  salaryMin?: number;
  query?: string;
  limit?: number;
}): Promise<JobRow[]> {
  const params = new URLSearchParams();
  params.set("select", JOB_SELECT);
  params.set("is_active", "eq.true");
  params.set("ai_processed_at", "not.is.null");
  params.set("order", "created_at.desc");
  params.set("limit", String(opts.limit ?? 300));
  if (opts.query) params.set("title", `ilike.%${opts.query}%`);
  if (opts.category) params.set("ai_category", `eq.${opts.category}`);
  if (opts.seniority) params.set("seniority_level", `eq.${opts.seniority}`);
  if (opts.workMode) params.set("ai_work_mode", `eq.${opts.workMode}`);
  if (opts.salaryMin) params.set("salary_min", `gte.${opts.salaryMin}`);
  return rest(`jobs?${params.toString()}`);
}

// Reasonably tight email pattern. We redact rather than remove so the
// surrounding sentence still reads naturally.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    // Redact emails so ChatGPT doesn't mistake a recruiter contact for the
    // user's identity (seen: "Your email 'inclusion@deliveryhero.com' is
    // used for authentication" in the tool consent dialog).
    .replace(EMAIL_RE, "[email removed]")
    .trim();
}

export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  if (!min && !max) return null;
  const cur = currency || "EUR";
  const fmt = (n: number) =>
    n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  if (min && max) return `${cur} ${fmt(min)}–${fmt(max)}`;
  return `${cur} ${fmt((min || max)!)}+`;
}

export interface JobLite {
  id: string;
  title: string;
  company: {
    name: string;
    logo_url: string | null;
    website_url: string | null;
  } | null;
  location: string | null;
  category: string | null;
  sub_category: string | null;
  seniority: string | null;
  work_mode: string | null;
  skills: string[];
  salary: string | null;
  apply_url: string | null;
  posted_at: string;
  description_text: string | null;
  requires_german: boolean | null;
  visa_sponsorship: string | null;
}

export function toJobLite(job: JobRow, includeDescription = true): JobLite {
  return {
    id: job.id,
    title: job.title,
    company: job.company
      ? {
          name: job.company.name,
          logo_url: job.company.logo_url,
          website_url: job.company.website_url,
        }
      : null,
    location: job.location,
    category: job.ai_category,
    sub_category: job.ai_sub_category,
    seniority: job.seniority_level,
    work_mode: job.ai_work_mode,
    skills: job.ai_skills ?? [],
    salary: formatSalary(job.salary_min, job.salary_max, job.salary_currency),
    apply_url: job.external_url,
    posted_at: job.created_at,
    description_text:
      includeDescription && job.description_html
        ? stripHtml(job.description_html)
        : null,
    requires_german: job.requires_german ?? null,
    visa_sponsorship: (job as any).ai_visa_sponsorship ?? null,
  };
}
