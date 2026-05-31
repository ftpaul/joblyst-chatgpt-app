import "@/index.css";
import { useState } from "react";
import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";
import { CompanyLogo, JobCard, type JobLite } from "./components/job-card.js";

export default function SearchJobs() {
  const { output, isPending, input } = useToolInfo<"search_jobs">();
  const { theme } = useLayout();
  const [openId, setOpenId] = useState<string | null>(null);

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
        Searching Joblyst…
      </div>,
    );
  }

  const jobs = (output?.jobs ?? []) as JobLite[];
  const open = jobs.find((j) => j.id === openId);

  if (open) {
    return wrap(<Detail job={open} onBack={() => setOpenId(null)} />);
  }

  const chips: string[] = [];
  if (input?.query) chips.push(`"${input.query}"`);
  if (input?.category) chips.push(input.category);
  if (input?.seniority) chips.push(input.seniority);
  if (input?.work_mode) chips.push(input.work_mode);
  if (input?.salary_min) chips.push(`€${input.salary_min}+`);

  return wrap(
    <div className="p-4">
      <header className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="text-lg font-semibold">Joblyst search</h2>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {jobs.length} results
        </span>
      </header>
      {chips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1 px-1">
          {chips.map((c, i) => (
            <span
              key={i}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-0.5 text-[11px]"
            >
              {c}
            </span>
          ))}
        </div>
      )}
      {jobs.length === 0 ? (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
          No jobs match those filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <JobCard job={j} onOpen={() => setOpenId(j.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>,
  );
}

function Detail({ job, onBack }: { job: JobLite; onBack: () => void }) {
  return (
    <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <button
        onClick={onBack}
        className="mb-3 text-xs text-[hsl(var(--muted-foreground))] hover:underline"
      >
        ← Back to results
      </button>
      <div className="flex items-start gap-3">
        <CompanyLogo
          name={job.company?.name ?? "—"}
          logoUrl={job.company?.logo_url ?? null}
          websiteUrl={job.company?.website_url ?? null}
          size="md"
        />
        <div className="flex-1">
          <h2 className="text-base font-semibold leading-snug">{job.title}</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {job.company?.name ?? "—"} · {job.location ?? "Berlin"}
            {job.salary ? ` · ${job.salary}` : ""}
          </p>
        </div>
      </div>

      {job.skills.length > 0 && (
        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Skills
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {job.skills.map((s, i) => (
              <span
                key={i}
                className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[11px]"
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {job.description_text && (
        <section className="mt-4 max-h-80 overflow-y-auto rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
          <pre className="whitespace-pre-wrap text-xs leading-relaxed">
            {job.description_text}
          </pre>
        </section>
      )}

      {job.apply_url && (
        <div className="mt-5">
          <a
            href={job.apply_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
          >
            Apply →
          </a>
        </div>
      )}
    </div>
  );
}
