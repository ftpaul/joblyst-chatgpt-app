// Step 5 — per-category scoring weights (Next.js side).
//
// IMPORTANT: keep this in lockstep with supabase/functions/_shared/weights.ts.
// The two files are intentional duplicates — Deno edge functions can't import
// from src/, and src/ can't import the Deno-extension imports either.

export interface CategoryWeights {
  /** Sub-category match (full) or category match (1/3). */
  role: number;
  /** Skill match — must-have weighted, nice-to-have lightly. */
  skills: number;
  /** Seniority alignment. Off-by-1 = half points, unknown = half. */
  seniority: number;
  /** Industry overlap between profile.industry_experience and job.ai_industry. */
  industry: number;
  /** Work-mode preference / availability. */
  work: number;
}

const DEFAULT_WEIGHTS: CategoryWeights = {
  role: 30,
  skills: 30,
  seniority: 20,
  industry: 5,
  work: 15,
};

const WEIGHTS_BY_CATEGORY: Record<string, CategoryWeights> = {
  'engineering':           { role: 25, skills: 40, seniority: 15, industry: 5,  work: 15 },
  'data & ai':             { role: 25, skills: 40, seniority: 15, industry: 5,  work: 15 },
  'product & design':      { role: 30, skills: 25, seniority: 20, industry: 10, work: 15 },
  'sales & growth':        { role: 25, skills: 20, seniority: 25, industry: 15, work: 15 },
  'marketing':             { role: 25, skills: 25, seniority: 20, industry: 15, work: 15 },
  'customer success':      { role: 25, skills: 25, seniority: 20, industry: 15, work: 15 },
  'people & hr':           { role: 30, skills: 20, seniority: 25, industry: 10, work: 15 },
  'finance & operations':  { role: 30, skills: 20, seniority: 25, industry: 10, work: 15 },
  'legal & compliance':    { role: 30, skills: 15, seniority: 30, industry: 10, work: 15 },
};

/**
 * Resolve scoring weights for a profile's primary category.
 * Falls back to DEFAULT_WEIGHTS for missing / unknown categories.
 */
export function getCategoryWeights(primaryCategory: string | null | undefined): CategoryWeights {
  if (!primaryCategory) return DEFAULT_WEIGHTS;
  const key = primaryCategory.toLowerCase().trim();
  return WEIGHTS_BY_CATEGORY[key] ?? DEFAULT_WEIGHTS;
}
