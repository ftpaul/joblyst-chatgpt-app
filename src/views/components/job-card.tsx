import { useState } from "react";
import {
  Banknote,
  Building,
  Clock,
  Globe,
  Home,
  Laptop,
  MapPin,
} from "lucide-react";

export type JobLite = {
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
  requires_german?: boolean | null;
  visa_sponsorship?: string | null;
};

const SENIORITY_LABEL: Record<string, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-Level",
  senior: "Senior",
  leadership: "Leadership",
};

function decodeHTML(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function shortLocation(loc: string | null): string {
  if (!loc) return "Berlin";
  return loc.split(";")[0].split(",")[0].trim();
}

function relativeTime(iso: string): { label: string; fresh: boolean } {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const fresh = diff < 24 * 60 * 60 * 1000;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return { label: `${Math.max(1, minutes)}m ago`, fresh };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}h ago`, fresh };
  const days = Math.floor(hours / 24);
  if (days < 30) return { label: `${days}d ago`, fresh };
  const months = Math.floor(days / 30);
  if (months < 12) return { label: `${months}mo ago`, fresh };
  return { label: `${Math.floor(months / 12)}y ago`, fresh };
}

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-pink-500",
  "bg-fuchsia-500",
  "bg-purple-500",
  "bg-violet-500",
  "bg-indigo-500",
  "bg-blue-500",
  "bg-sky-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-green-500",
  "bg-lime-500",
  "bg-amber-500",
  "bg-orange-500",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function CompanyLogo({
  name,
  logoUrl,
  websiteUrl,
  size = "sm",
}: {
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  size?: "sm" | "md";
}) {
  const domain = extractDomain(websiteUrl);
  const [state, setState] = useState<"custom" | "brandfetch" | "avatar">(
    logoUrl ? "custom" : domain ? "brandfetch" : "avatar",
  );
  const initials = getInitials(name);
  const color = avatarColor(name);
  const dims = size === "md" ? "h-12 w-12" : "h-11 w-11";
  const box = `mt-0.5 ${dims} shrink-0 rounded-lg overflow-hidden flex items-center justify-center`;
  // Some sources (notably Brandfetch) 200 OK with a 0×0 image when no logo
  // exists. onLoad fires but onError doesn't, so we'd otherwise show a blank
  // white square. Check natural size and cascade to the next fallback.
  const handleLoad =
    (next: "brandfetch" | "avatar") =>
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.naturalWidth < 8 || img.naturalHeight < 8) {
        setState(next);
      }
    };
  if (state === "custom" && logoUrl) {
    return (
      <div className={`${box} bg-white`}>
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain p-1"
          onError={() => setState(domain ? "brandfetch" : "avatar")}
          onLoad={handleLoad(domain ? "brandfetch" : "avatar")}
        />
      </div>
    );
  }
  if (state === "brandfetch" && domain) {
    return (
      <div className={`${box} bg-white`}>
        <img
          src={`https://cdn.brandfetch.io/${domain}?c=1idCgZcxh4Cds9uJc0d`}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setState("avatar")}
          onLoad={handleLoad("avatar")}
        />
      </div>
    );
  }
  return (
    <div className={`${box} ${color}`}>
      <span className="text-sm font-semibold text-white">{initials}</span>
    </div>
  );
}

function FreshDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
    </span>
  );
}

function WorkModeIcon({ mode }: { mode: string }) {
  if (mode === "remote") return <Home className="h-3 w-3" />;
  if (mode === "hybrid") return <Laptop className="h-3 w-3" />;
  if (mode === "onsite") return <Building className="h-3 w-3" />;
  return null;
}

function Badges({ job }: { job: JobLite }) {
  const seniority = job.seniority ? SENIORITY_LABEL[job.seniority] ?? job.seniority : null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {job.category && (
        <span className="inline-flex items-center rounded-full bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--primary)/0.15)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--primary))]">
          {job.category}
        </span>
      )}
      {job.sub_category && (
        <span className="inline-flex items-center rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
          {job.sub_category}
        </span>
      )}
      {seniority && (
        <span className="inline-flex items-center rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-[11px] text-[hsl(var(--foreground))]">
          {seniority}
        </span>
      )}
      {job.work_mode && (
        <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-[11px] text-[hsl(var(--foreground))]">
          <WorkModeIcon mode={job.work_mode} />
          {job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1)}
        </span>
      )}
      {job.salary && (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-400/10 border border-teal-400/25 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:text-teal-300">
          <Banknote className="h-3 w-3" />
          {job.salary}
        </span>
      )}
      {job.visa_sponsorship &&
        !["no", "unknown"].includes(job.visa_sponsorship.toLowerCase()) && (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-500/50 px-2 py-0.5 text-[11px] text-green-600 dark:text-green-400">
            <Globe className="h-3 w-3" />
            Visa
          </span>
        )}
      {job.requires_german && (
        <span className="inline-flex items-center rounded-full border border-amber-500/50 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
          German
        </span>
      )}
    </div>
  );
}

export function JobCard({
  job,
  onOpen,
  rightSlot,
}: {
  job: JobLite;
  onOpen?: () => void;
  rightSlot?: React.ReactNode;
}) {
  const title = decodeHTML(job.title);
  const loc = shortLocation(job.location);
  const { label: posted, fresh } = relativeTime(job.posted_at);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group block w-full text-left overflow-hidden rounded-[var(--radius)] border bg-[hsl(var(--card))] transition-all duration-[180ms] ease-out active:translate-y-px ${
        fresh
          ? "border-teal-300/80 hover:border-teal-400 hover:shadow-md [background-image:radial-gradient(420px_180px_at_100%_0%,rgba(43,212,189,0.10),transparent_65%)]"
          : "border-[hsl(var(--border))]/60 hover:border-[hsl(var(--primary)/0.5)] hover:shadow-md"
      }`}
    >
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          <CompanyLogo
            name={job.company?.name ?? "—"}
            logoUrl={job.company?.logo_url ?? null}
            websiteUrl={job.company?.website_url ?? null}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-[family-name:var(--font-display)] text-[15px] font-semibold leading-snug text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors sm:truncate">
                  {title}
                </h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
                  {job.company?.name ?? "—"}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]/80 shrink-0 pt-0.5">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span className="max-w-[90px] truncate">{loc}</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1 ${fresh ? "font-semibold text-teal-700 dark:text-teal-400" : ""}`}
                >
                  {fresh ? <FreshDot /> : <Clock className="h-3 w-3" />}
                  {posted}
                </span>
                {rightSlot}
              </div>
            </div>
            <div className="hidden sm:block mt-2.5">
              <Badges job={job} />
            </div>
          </div>
        </div>
        <div className="sm:hidden mt-3 space-y-2">
          <div className="flex items-center gap-2.5 flex-wrap text-xs text-[hsl(var(--muted-foreground))]/80">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {loc}
            </span>
            <span
              className={`inline-flex items-center gap-1 ${fresh ? "font-semibold text-teal-700 dark:text-teal-400" : ""}`}
            >
              {fresh ? <FreshDot /> : <Clock className="h-3 w-3" />}
              {posted}
            </span>
            {rightSlot && <span className="ml-auto">{rightSlot}</span>}
          </div>
          <Badges job={job} />
        </div>
      </div>
    </button>
  );
}

export function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  const label =
    tier === 3 ? "Excellent match" : tier === 2 ? "High match" : "Good match";
  const cls =
    tier === 3
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : tier === 2
        ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}
