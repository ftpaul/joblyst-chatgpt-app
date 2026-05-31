// Skill synonym + canonicalization map.
//
// Used by scoring (substring matching produced false positives like "QA" matching
// "QALY" and false negatives like "JS" not matching "JavaScript") and by the
// enrichment pipeline (so stored ai_skills are already canonical).
//
// IMPORTANT: this file is mirrored at supabase/functions/_shared/skillSynonyms.ts
// so the Deno edge functions can use the same logic. Any change here MUST be
// applied there too. Keep this file dependency-free TypeScript.

const SYNONYM_PAIRS: ReadonlyArray<readonly [string, string]> = [
  // ── Languages ────────────────────────────────────────────────────────────
  ['javascript', 'javascript'],
  ['js', 'javascript'],
  ['ecmascript', 'javascript'],
  ['typescript', 'typescript'],
  ['ts', 'typescript'],
  ['python', 'python'],
  ['py', 'python'],
  ['golang', 'go'],
  ['go', 'go'],
  ['kotlin', 'kotlin'],
  ['objective c', 'objective-c'],
  ['objc', 'objective-c'],
  ['c sharp', 'c#'],
  ['csharp', 'c#'],
  ['c plus plus', 'c++'],
  ['cpp', 'c++'],

  // ── Frameworks / runtimes ────────────────────────────────────────────────
  ['react', 'react'],
  ['reactjs', 'react'],
  ['react native', 'react native'],
  ['nextjs', 'next.js'],
  ['next', 'next.js'],
  ['nodejs', 'node.js'],
  ['node', 'node.js'],
  ['vuejs', 'vue'],
  ['vue', 'vue'],
  ['nuxt', 'nuxt'],
  ['nuxtjs', 'nuxt'],
  ['angular', 'angular'],
  ['angularjs', 'angular'],
  ['svelte', 'svelte'],
  ['sveltekit', 'svelte'],
  ['express', 'express'],
  ['expressjs', 'express'],
  ['nestjs', 'nest.js'],
  ['nest', 'nest.js'],
  ['django', 'django'],
  ['flask', 'flask'],
  ['fastapi', 'fastapi'],
  ['spring', 'spring'],
  ['spring boot', 'spring'],
  ['rails', 'ruby on rails'],
  ['ruby on rails', 'ruby on rails'],
  ['laravel', 'laravel'],
  ['dotnet', '.net'],
  ['.net', '.net'],
  ['net', '.net'],

  // ── Databases ────────────────────────────────────────────────────────────
  ['postgres', 'postgresql'],
  ['postgresql', 'postgresql'],
  ['psql', 'postgresql'],
  ['mysql', 'mysql'],
  ['mariadb', 'mysql'],
  ['mongodb', 'mongodb'],
  ['mongo', 'mongodb'],
  ['redis', 'redis'],
  ['elasticsearch', 'elasticsearch'],
  ['elastic', 'elasticsearch'],
  ['dynamodb', 'dynamodb'],
  ['snowflake', 'snowflake'],
  ['bigquery', 'bigquery'],
  ['redshift', 'redshift'],

  // ── Cloud / Infra ────────────────────────────────────────────────────────
  ['aws', 'aws'],
  ['amazon web services', 'aws'],
  ['gcp', 'gcp'],
  ['google cloud', 'gcp'],
  ['google cloud platform', 'gcp'],
  ['azure', 'azure'],
  ['microsoft azure', 'azure'],
  ['kubernetes', 'kubernetes'],
  ['k8s', 'kubernetes'],
  ['docker', 'docker'],
  ['terraform', 'terraform'],
  ['ansible', 'ansible'],
  ['pulumi', 'pulumi'],
  ['cloudformation', 'cloudformation'],
  ['ci cd', 'ci/cd'],
  ['cicd', 'ci/cd'],
  ['ci/cd', 'ci/cd'],
  ['github actions', 'github actions'],
  ['gitlab ci', 'gitlab ci'],
  ['jenkins', 'jenkins'],

  // ── Data / AI ────────────────────────────────────────────────────────────
  ['ml', 'machine learning'],
  ['machine learning', 'machine learning'],
  ['ai', 'artificial intelligence'],
  ['artificial intelligence', 'artificial intelligence'],
  ['nlp', 'nlp'],
  ['natural language processing', 'nlp'],
  ['llm', 'llm'],
  ['llms', 'llm'],
  ['large language models', 'llm'],
  ['genai', 'generative ai'],
  ['generative ai', 'generative ai'],
  ['mlops', 'mlops'],
  ['data engineering', 'data engineering'],
  ['data science', 'data science'],
  ['tensorflow', 'tensorflow'],
  ['pytorch', 'pytorch'],
  ['scikit learn', 'scikit-learn'],
  ['sklearn', 'scikit-learn'],
  ['pandas', 'pandas'],
  ['numpy', 'numpy'],
  ['spark', 'spark'],
  ['apache spark', 'spark'],
  ['airflow', 'airflow'],
  ['apache airflow', 'airflow'],
  ['dbt', 'dbt'],
  ['kafka', 'kafka'],
  ['apache kafka', 'kafka'],

  // ── BI / Analytics ───────────────────────────────────────────────────────
  ['tableau', 'tableau'],
  ['looker', 'looker'],
  ['power bi', 'power bi'],
  ['powerbi', 'power bi'],
  ['metabase', 'metabase'],
  ['mixpanel', 'mixpanel'],
  ['amplitude', 'amplitude'],
  ['google analytics', 'google analytics'],
  ['ga', 'google analytics'],
  ['ga4', 'google analytics'],

  // ── Design / Product ─────────────────────────────────────────────────────
  ['figma', 'figma'],
  ['sketch', 'sketch'],
  ['adobe xd', 'adobe xd'],
  ['xd', 'adobe xd'],
  ['photoshop', 'photoshop'],
  ['illustrator', 'illustrator'],
  ['indesign', 'indesign'],
  ['adobe creative suite', 'adobe creative suite'],
  ['miro', 'miro'],
  ['notion', 'notion'],
  ['jira', 'jira'],
  ['confluence', 'confluence'],
  ['linear', 'linear'],
  ['asana', 'asana'],

  // ── Marketing / Sales ────────────────────────────────────────────────────
  ['salesforce', 'salesforce'],
  ['sfdc', 'salesforce'],
  ['hubspot', 'hubspot'],
  ['marketo', 'marketo'],
  ['mailchimp', 'mailchimp'],
  ['braze', 'braze'],
  ['iterable', 'iterable'],
  ['klaviyo', 'klaviyo'],
  ['google ads', 'google ads'],
  ['adwords', 'google ads'],
  ['facebook ads', 'meta ads'],
  ['meta ads', 'meta ads'],
  ['linkedin ads', 'linkedin ads'],
  ['seo', 'seo'],
  ['sem', 'sem'],
  ['ppc', 'ppc'],

  // ── HR / People ──────────────────────────────────────────────────────────
  ['workday', 'workday'],
  ['personio', 'personio'],
  ['greenhouse', 'greenhouse'],
  ['lever', 'lever'],
  ['ashby', 'ashby'],
  ['bamboohr', 'bamboohr'],

  // ── Methodology / soft skills ────────────────────────────────────────────
  ['agile', 'agile'],
  ['scrum', 'scrum'],
  ['kanban', 'kanban'],
  ['safe', 'safe'],
  ['waterfall', 'waterfall'],
  ['lean', 'lean'],
  ['six sigma', 'six sigma'],
  ['stakeholder management', 'stakeholder management'],
  ['project management', 'project management'],
  ['program management', 'program management'],

  // ── QA / Testing ─────────────────────────────────────────────────────────
  ['qa', 'qa'],
  ['quality assurance', 'qa'],
  ['cypress', 'cypress'],
  ['playwright', 'playwright'],
  ['selenium', 'selenium'],
  ['jest', 'jest'],
  ['pytest', 'pytest'],

  // ── Mobile ───────────────────────────────────────────────────────────────
  ['ios', 'ios'],
  ['android', 'android'],
  ['flutter', 'flutter'],
  ['swift', 'swift'],
  ['swiftui', 'swift'],
];

const SYNONYM_MAP: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [alias, canon] of SYNONYM_PAIRS) {
    m.set(alias, canon);
  }
  return m;
})();

function normalize(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  s = s.replace(/\.js\b/g, '');
  s = s.replace(/[_\-]+/g, ' ');
  s = s.replace(/[(){}\[\]"'`,;:!?]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function canonicalSkill(raw: string): string {
  const n = normalize(raw);
  if (!n) return '';
  const canon = SYNONYM_MAP.get(n);
  return canon ?? n;
}

export function canonicalSkills(raws: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const r of raws) {
    if (!r) continue;
    const c = canonicalSkill(r);
    if (c) out.add(c);
  }
  return Array.from(out);
}

export function matchedCanonicalSkills(
  a: readonly (string | null | undefined)[],
  b: readonly (string | null | undefined)[],
): string[] {
  const setA = new Set(canonicalSkills(a));
  const setB = new Set(canonicalSkills(b));
  const out: string[] = [];
  for (const s of setA) if (setB.has(s)) out.push(s);
  return out;
}
