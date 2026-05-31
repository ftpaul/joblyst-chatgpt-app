import "@/index.css";
import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";

type Profile = {
  role_families: string[];
  primary_category: string | null;
  secondary_category: string | null;
  seniority: string | null;
  primary_skills: string[];
  secondary_skills: string[];
  industry_experience: string[];
  languages: string[];
  preferences: {
    remote_only: boolean;
    english_only: boolean;
    salary_required: boolean;
    salary_floor_eur: number | null;
    seniority_floor: string | null;
    seniority_ceiling: string | null;
    excluded_subcategories: string[];
    excluded_employment_types: string[];
  };
};

export default function ProfileView() {
  const { output, isPending } = useToolInfo<"get_profile">();
  const { theme } = useLayout();

  const wrap = (children: React.ReactNode) => (
    <div
      className={`${theme === "dark" ? "dark" : ""} mx-auto w-full max-w-3xl bg-[hsl(var(--background))] text-[hsl(var(--foreground))] font-[family-name:var(--font-display)]`}
    >
      {children}
    </div>
  );

  if (isPending) {
    return wrap(
      <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">
        Loading your profile…
      </div>,
    );
  }

  if (output && "error" in output) {
    const msg =
      output.error === "unauthorized"
        ? "Generate an API key on joblyst.tech/account and update the connector URL to end with ?key=<your-uuid>."
        : "Profile not set up yet. Visit joblyst.tech and complete onboarding.";
    return wrap(
      <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] p-6">
        <h2 className="text-lg font-semibold">Profile not available</h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          {msg}
        </p>
      </div>,
    );
  }

  const p = output?.profile as Profile | undefined;
  if (!p) return wrap(<div className="p-6">No profile data.</div>);

  const prefSummary: string[] = [];
  if (p.preferences.remote_only) prefSummary.push("Remote only");
  if (p.preferences.english_only) prefSummary.push("English-friendly only");
  if (p.preferences.salary_required) prefSummary.push("Salary required");
  if (p.preferences.salary_floor_eur)
    prefSummary.push(`€${p.preferences.salary_floor_eur.toLocaleString()}+`);
  if (p.preferences.seniority_floor || p.preferences.seniority_ceiling)
    prefSummary.push(
      `${p.preferences.seniority_floor ?? "any"}–${p.preferences.seniority_ceiling ?? "any"}`,
    );

  return wrap(
    <div className="p-4">
      <header className="mb-4 px-1">
        <h2 className="text-lg font-semibold">Your Joblyst profile</h2>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          Used by{" "}
          <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 text-[11px]">
            get_matches
          </code>{" "}
          to score jobs, and by the LLM to draft tailored applications.
        </p>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-2">
        {p.primary_category && (
          <span className="rounded-full border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/15 px-2.5 py-1 text-xs font-semibold text-[hsl(var(--primary))]">
            {p.primary_category}
          </span>
        )}
        {p.secondary_category && (
          <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-1 text-xs">
            {p.secondary_category}
          </span>
        )}
        {p.seniority && (
          <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-1 text-xs">
            {p.seniority}
          </span>
        )}
      </section>

      {p.role_families.length > 0 && (
        <Section title="Role families">
          <ChipList items={p.role_families} />
        </Section>
      )}

      {p.primary_skills.length > 0 && (
        <Section title={`Primary skills (${p.primary_skills.length})`}>
          <ChipList items={p.primary_skills} accent />
        </Section>
      )}

      {p.secondary_skills.length > 0 && (
        <Section title={`Secondary skills (${p.secondary_skills.length})`}>
          <ChipList items={p.secondary_skills} />
        </Section>
      )}

      {p.industry_experience.length > 0 && (
        <Section title="Industries">
          <ChipList items={p.industry_experience} />
        </Section>
      )}

      {p.languages.length > 0 && (
        <Section title="Languages">
          <ChipList items={p.languages} />
        </Section>
      )}

      {prefSummary.length > 0 && (
        <Section title="Preferences">
          <ChipList items={prefSummary} />
        </Section>
      )}
    </div>,
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ChipList({ items, accent }: { items: string[]; accent?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1 px-1">
      {items.map((s, i) => (
        <span
          key={i}
          className={
            accent
              ? "rounded bg-[hsl(var(--primary))]/15 px-1.5 py-0.5 text-[11px] text-[hsl(var(--primary))]"
              : "rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[11px]"
          }
        >
          {s}
        </span>
      ))}
    </div>
  );
}
