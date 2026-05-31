import "@/index.css";
import { useLayout } from "skybridge/web";
import { useToolInfo } from "../helpers.js";
import { CompanyLogo } from "./components/job-card.js";

type Company = {
  name: string;
  logo_url: string | null;
  website_url: string | null;
  job_count: number;
  sample_titles: string[];
};

export default function TopCompanies() {
  const { output, isPending, input } = useToolInfo<"top_hiring_companies">();
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
        Aggregating open roles by company…
      </div>,
    );
  }

  const companies = (output?.companies ?? []) as Company[];
  const category = (input?.category as string | undefined) ?? null;

  return wrap(
    <div className="p-4">
      <header className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="text-lg font-semibold">
          Top hirers{category ? ` in ${category}` : ""}
        </h2>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {companies.length} companies
        </span>
      </header>

      {companies.length === 0 ? (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
          No companies match.
        </p>
      ) : (
        <ul className="space-y-2">
          {companies.map((c, i) => (
            <li
              key={c.name}
              className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-6 shrink-0 items-center justify-center text-sm font-semibold text-[hsl(var(--muted-foreground))]">
                  {i + 1}
                </div>
                <CompanyLogo
                  name={c.name}
                  logoUrl={c.logo_url}
                  websiteUrl={c.website_url}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="truncate text-sm font-medium">
                      {c.website_url ? (
                        <a
                          href={c.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {c.name}
                        </a>
                      ) : (
                        c.name
                      )}
                    </h3>
                    <span className="shrink-0 rounded-full bg-[hsl(var(--primary))]/15 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--primary))]">
                      {c.job_count} {c.job_count === 1 ? "role" : "roles"}
                    </span>
                  </div>
                  {c.sample_titles.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {c.sample_titles.map((t, j) => (
                        <li
                          key={j}
                          className="truncate text-xs text-[hsl(var(--muted-foreground))]"
                        >
                          · {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>,
  );
}
