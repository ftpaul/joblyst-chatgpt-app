// Node-compatible mirror of supabase/functions/_shared/scoring.ts.
//
// Why this exists: the Deno _shared file imports siblings with `.ts`
// extensions and is the active backend implementation. This mirror lets
// the vitest suite exercise the exact same logic in a Node environment
// without pulling in Deno-specific syntax.
//
// IMPORTANT: keep this in lockstep with _shared/scoring.ts. Any change to
// the algorithm goes in BOTH files. Tests in src/lib/__tests__/scoring.test.ts
// pin the expected behaviour and will catch most accidental drift.
//
// The frontend never calls scoreJob at runtime — useMatches.ts reads
// pre-computed scored_matches from the user's profile. This file is for
// tests only.

import { canonicalSkill, matchedCanonicalSkills } from './skillSynonyms.js';
import { getCategoryWeights } from './weights.js';

export function isBerlinJob(location: string): boolean {
  const loc = location.toLowerCase();
  const hasBerlin = loc.includes('berlin');
  const isRemoteGermany =
    (loc === 'remote' ||
      loc === 'remote, germany' ||
      loc.includes('remote germany') ||
      loc === 'germany' ||
      loc === 'deutschland') &&
    !['munich', 'münchen', 'hamburg', 'frankfurt', 'cologne', 'köln', 'düsseldorf', 'stuttgart'].some(
      (city) => loc.includes(city),
    );
  return hasBerlin || isRemoteGermany;
}

const SENIORITY_ORDER = ['intern', 'junior', 'mid', 'senior', 'leadership'];

const normSeniority = (s: string) => {
  const low = (s || '').toLowerCase().trim();
  if (low === 'working student' || low === 'internship') return 'intern';
  return low;
};

function profileSpeaksGerman(profile: any): boolean {
  const langs: string[] = profile?.languages || profile?.candidate_profile?.languages || [];
  return langs.some((l) => /german|deutsch/i.test(l || ''));
}

function normCat(s: string | null | undefined): string {
  return (s || '').toLowerCase().trim();
}

function profileMatchesIndustry(profile: any, jobIndustry: string | null | undefined): boolean {
  if (!jobIndustry) return false;
  const ji = jobIndustry.toLowerCase().trim();
  const xp: string[] =
    profile?.industry_experience ||
    profile?.candidate_profile?.industry_experience ||
    [];
  return xp.some((i) => (i || '').toLowerCase().trim() === ji);
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export function scoreJob(job: any, profile: any, remoteOnly: boolean): ScoreResult {
  const W = getCategoryWeights(profile.primary_category);
  const reasons: string[] = [];
  let score = 0;

  const jobCat = normCat(job.ai_category);
  const jobSubCat = normCat(job.ai_sub_category);
  const roleFamiliesRaw: string[] = profile.role_families || [];
  const roleFamilies = roleFamiliesRaw.map((r) => normCat(r));

  const subCatMatch = roleFamilies.includes(jobSubCat) && jobSubCat !== '';
  const userCats = [profile.primary_category, profile.secondary_category]
    .filter(Boolean)
    .map((c: string) => normCat(c));
  const catMatch = userCats.includes(jobCat) && jobCat !== '';

  if (subCatMatch) {
    score += W.role;
    const matchedRole = roleFamiliesRaw.find((r) => normCat(r) === jobSubCat);
    if (matchedRole) reasons.push(matchedRole);
  } else if (catMatch) {
    score += W.role / 3;
    if (job.ai_category) reasons.push(job.ai_category);
  }

  const mustHaveRaw = (job.ai_must_have_skills || []) as string[];
  const niceToHaveRaw = (job.ai_nice_to_have_skills || []) as string[];
  const jobSkillsRaw = (job.ai_skills || []) as string[];
  const primarySkillsRaw = (profile.primary_skills || []) as string[];
  const secondarySkillsRaw = (profile.secondary_skills || []) as string[];
  const toolsRaw = (profile.tools_and_technologies || []) as string[];
  const userSkills = [...primarySkillsRaw, ...secondarySkillsRaw, ...toolsRaw];

  let skillScoreRaw = 0;
  let matchedPrimary: string[];
  let matchedSecondary: string[];

  if (mustHaveRaw.length > 0) {
    const mustHaveMatched = matchedCanonicalSkills(userSkills, mustHaveRaw);
    const niceToHaveMatched = matchedCanonicalSkills(userSkills, niceToHaveRaw);
    const ratio = mustHaveMatched.length / Math.max(mustHaveRaw.length, 1);
    skillScoreRaw = Math.min(35, ratio * 25 + niceToHaveMatched.length * 2);
    matchedPrimary = matchedCanonicalSkills(primarySkillsRaw, mustHaveRaw);
    matchedSecondary = matchedCanonicalSkills(secondarySkillsRaw, mustHaveRaw);
  } else {
    matchedPrimary = matchedCanonicalSkills(primarySkillsRaw, jobSkillsRaw);
    matchedSecondary = matchedCanonicalSkills(secondarySkillsRaw, jobSkillsRaw);
    skillScoreRaw = Math.min(
      35,
      (matchedPrimary.length / Math.max(primarySkillsRaw.length, 1)) * 30 + matchedSecondary.length * 3,
    );
  }
  score += skillScoreRaw * (W.skills / 35);

  if (matchedPrimary.length > 0) {
    const matchedSet = new Set(matchedPrimary);
    const displaySkills = primarySkillsRaw
      .filter((s) => matchedSet.has(canonicalSkill(s)))
      .slice(0, 3);
    if (displaySkills.length > 0) reasons.push(displaySkills.join(', '));
  }

  const profileSenIdx = SENIORITY_ORDER.indexOf(normSeniority(profile.seniority_level));
  const jobSenIdx = SENIORITY_ORDER.indexOf(normSeniority(job.seniority_level || ''));
  let seniorityDiff: number | null = null;

  if (profileSenIdx !== -1 && jobSenIdx !== -1) {
    seniorityDiff = Math.abs(profileSenIdx - jobSenIdx);
    if (seniorityDiff === 0) {
      score += W.seniority;
      reasons.push(`${profile.seniority_level} level`);
    } else if (seniorityDiff === 1) {
      score += W.seniority / 2;
    }
  } else {
    score += W.seniority / 2;
  }

  if (remoteOnly) {
    if (job.ai_work_mode === 'remote') {
      score += W.work;
      reasons.push('Remote role');
    }
  } else if (job.ai_work_mode) {
    score += W.work;
  } else {
    score += W.work / 2;
  }

  if (profileMatchesIndustry(profile, job.ai_industry)) {
    score += W.industry;
    if (job.ai_industry) reasons.push(job.ai_industry);
  }

  if (job.requires_german === true && profileSpeaksGerman(profile)) {
    score += 5;
  }

  if (seniorityDiff !== null && seniorityDiff >= 2) score -= 15;

  if (job.requires_german === true && !profileSpeaksGerman(profile)) score -= 20;

  const totalUserSkills = primarySkillsRaw.length + secondarySkillsRaw.length;
  const skillListForPenalty = mustHaveRaw.length > 0 ? mustHaveRaw : jobSkillsRaw;
  if (
    skillListForPenalty.length >= 3 &&
    totalUserSkills > 0 &&
    matchedPrimary.length === 0 &&
    matchedSecondary.length === 0
  ) {
    score -= 15;
  }

  if (!catMatch && !subCatMatch && jobCat !== '') score -= 10;

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function scoreTier(score: number): 3 | 2 | 1 {
  if (score >= 85) return 3;
  if (score >= 70) return 2;
  return 1;
}

export interface HardPreferences {
  remote_only?: boolean;
  english_only?: boolean;
  salary_required?: boolean;
  seniority_floor?: string | null;
  seniority_ceiling?: string | null;
  excluded_subcategories?: string[];
  excluded_employment_types?: string[];
  salary_floor_eur?: number | null;
}

export function passesHardPreferences(
  job: any,
  prefs: HardPreferences | null | undefined,
): boolean {
  if (!prefs) return true;

  if (prefs.seniority_floor || prefs.seniority_ceiling) {
    const jobIdx = SENIORITY_ORDER.indexOf(normSeniority(job.seniority_level || ''));
    if (jobIdx !== -1) {
      if (prefs.seniority_floor) {
        const floorIdx = SENIORITY_ORDER.indexOf(normSeniority(prefs.seniority_floor));
        if (floorIdx !== -1 && jobIdx < floorIdx) return false;
      }
      if (prefs.seniority_ceiling) {
        const ceilIdx = SENIORITY_ORDER.indexOf(normSeniority(prefs.seniority_ceiling));
        if (ceilIdx !== -1 && jobIdx > ceilIdx) return false;
      }
    }
  }

  if (Array.isArray(prefs.excluded_subcategories) && prefs.excluded_subcategories.length > 0) {
    const subCat = normCat(job.ai_sub_category);
    const excluded = prefs.excluded_subcategories.map((s) => normCat(s));
    if (subCat && excluded.includes(subCat)) return false;
  }

  if (Array.isArray(prefs.excluded_employment_types) && prefs.excluded_employment_types.length > 0) {
    const et = (job.employment_type || '').toLowerCase().trim();
    if (et) {
      const excluded = prefs.excluded_employment_types.map((s) => (s || '').toLowerCase().trim());
      if (excluded.some((ex) => ex && et.includes(ex))) return false;
    }
  }

  if (typeof prefs.salary_floor_eur === 'number' && prefs.salary_floor_eur > 0) {
    const max = job.salary_max;
    if (typeof max === 'number' && max > 0 && max < prefs.salary_floor_eur) return false;
  }

  return true;
}
