import "@/index.css";
import { useState } from "react";
import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";
import {
  CompanyLogo,
  JobCard,
  TierBadge,
  type JobLite,
} from "./components/job-card.js";

type Match = {
  job: JobLite;
  score: number;
  tier: 1 | 2 | 3;
  reasons: string[];
};

export default function Matches() {
  const { output, isPending } = useToolInfo<"get_matches">();
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
        Scoring your matches…
      </div>,
    );
  }

  if (output && "error" in output && output.error === "unauthorized") {
    return wrap(
      <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] p-6">
        <h2 className="text-lg font-semibold">
          Personalized matches need a free Joblyst account
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Joblyst scores Berlin/Remote-Germany jobs against your profile using
          the same algorithm as the website. In three steps:
        </p>
        <ol className="mt-3 space-y-1.5 text-sm">
          <li>
            <span className="mr-2 text-[hsl(var(--muted-foreground))]">1.</span>
            Sign up or sign in at{" "}
            <a
              href="https://joblyst.tech"
              target="_blank"
              rel="noreferrer"
              className="underline text-[hsl(var(--primary))]"
            >
              joblyst.tech
            </a>
            {" "}and upload your CV (or do the manual onboarding)
          </li>
          <li>
            <span className="mr-2 text-[hsl(var(--muted-foreground))]">2.</span>
            Go to{" "}
            <a
              href="https://joblyst.tech/account"
              target="_blank"
              rel="noreferrer"
              className="underline text-[hsl(var(--primary))]"
            >
              /account
            </a>{" "}
            → "LLM Access" → Generate. Copy the UUID.
          </li>
          <li>
            <span className="mr-2 text-[hsl(var(--muted-foreground))]">3.</span>
            Update this app's connector URL to end with{" "}
            <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 text-[11px]">
              ?key=&lt;your-uuid&gt;
            </code>
          </li>
        </ol>
        <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
          No account yet? You can still search jobs — try asking "find senior
          engineering roles in Berlin".
        </p>
      </div>,
    );
  }

  if (output && "error" in output && output.error === "profile_incomplete") {
    return wrap(
      <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] p-6">
        <h2 className="text-lg font-semibold">Profile not set up</h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Visit{" "}
          <a
            href="https://joblyst.tech/account"
            target="_blank"
            rel="noreferrer"
            className="underline text-[hsl(var(--primary))]"
          >
            joblyst.tech/account
          </a>{" "}
          and complete onboarding (CV upload or manual). Then ask for your
          matches again.
        </p>
      </div>,
    );
  }

  const matches = (output?.matches ?? []) as Match[];
  const open = matches.find((m) => m.job.id === openId);

  if (open) {
    return wrap(<DetailView match={open} onBack={() => setOpenId(null)} />);
  }

  return wrap(
    <div className="p-4">
      <header className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="text-lg font-semibold">Your matches</h2>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {matches.length} ranked
        </span>
      </header>
      {matches.length === 0 ? (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
          No matches above threshold. Try widening preferences on joblyst.tech.
        </p>
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => (
            <li key={m.job.id}>
              <JobCard
                job={m.job}
                onOpen={() => setOpenId(m.job.id)}
                rightSlot={<TierBadge tier={m.tier} />}
              />
            </li>
          ))}
        </ul>
      )}
    </div>,
  );
}

function DetailView({ match, onBack }: { match: Match; onBack: () => void }) {
  const { job, tier, reasons } = match;
  return (
    <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <button
        onClick={onBack}
        className="mb-3 text-xs text-[hsl(var(--muted-foreground))] hover:underline"
      >
        ← Back to matches
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
        <TierBadge tier={tier} />
      </div>

      {reasons.length > 0 && (
        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Why this matched you
          </h3>
          <ul className="mt-1.5 space-y-1">
            {reasons.map((r, i) => (
              <li key={i} className="text-sm">
                · {r}
              </li>
            ))}
          </ul>
        </section>
      )}

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
