import { createHash } from "node:crypto";
import { PostedDateSchema, type JobSnapshot } from "@quick-apply/shared";
import { assessSponsorship, normalizeJobUrl } from "./job-intelligence";
import { classifyJob } from "./job-classification";
import { postingText } from "./job-text";
export { postingText } from "./job-text";

export const discoverySources = [
  { id: "anthropic", company: "Anthropic", ats: "greenhouse" as const },
  { id: "figma", company: "Figma", ats: "greenhouse" as const },
  { id: "palantir", company: "Palantir", ats: "lever" as const },
  { id: "remotive", company: "Remotive", ats: null }
];
type Source = typeof discoverySources[number];
const TTL = 5 * 60_000;
const REMOTIVE_TTL = 6 * 60 * 60_000;
const remotiveAttempts = new Map<string, number>();
const cache = new Map<string, { expires: number; jobs: JobSnapshot[] }>();
const inflight = new Map<string, Promise<JobSnapshot[]>>();
const MAX_BODY_BYTES = 12 * 1024 * 1024;


export function normalizeFeed(source: Source, raw: unknown): JobSnapshot[] {
  if (source.id === "remotive") return normalizeRemotive(raw);
  const entries = source.ats === "greenhouse" ? (raw as { jobs?: unknown })?.jobs : raw;
  if (!Array.isArray(entries)) throw new Error("Unexpected jobs feed format");
  return entries.slice(0, 5000).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const title = source.ats === "greenhouse" ? item.title : item.text;
    const url = source.ats === "greenhouse" ? item.absolute_url : item.hostedUrl;
    if (typeof title !== "string" || typeof url !== "string" || (typeof item.id !== "number" && typeof item.id !== "string")) return [];
    try {
      const canonicalUrl = normalizeJobUrl(url).url.toString();
      const location = source.ats === "greenhouse" ? (item.location as { name?: unknown })?.name : (item.categories as { location?: unknown })?.location;
      const lists = Array.isArray(item.lists) ? item.lists.map((list) => typeof list?.content === "string" ? list.content : "").join(" ") : "";
      const description = postingText(source.ats === "greenhouse" ? typeof item.content === "string" ? item.content : "" : [item.descriptionPlain ?? item.description, lists, item.additionalPlain ?? item.additional].filter((value) => typeof value === "string").join(" "));
      return [{ id: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32), ats: source.ats, provider: source.ats ?? undefined, sourceUrl: canonicalUrl, externalId: String(item.id), canonicalUrl, applyUrl: canonicalUrl, company: source.company, title, location: typeof location === "string" ? location : "", description, classification: classifyJob(title, typeof location === "string" ? location : "", item.workplaceType, (item.categories as { commitment?: unknown })?.commitment), capturedAt: new Date().toISOString() }];
    } catch { return []; }
  });
}

export function normalizeRemotive(raw: unknown): JobSnapshot[] {
  const entries = (raw as { jobs?: unknown })?.jobs;
  if (!Array.isArray(entries)) throw new Error("Unexpected jobs feed format");
  return entries.slice(0, 5000).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const job = entry as Record<string, unknown>;
    if ((typeof job.id !== "number" && typeof job.id !== "string") || typeof job.title !== "string" || typeof job.company_name !== "string" || typeof job.url !== "string") return [];
    try {
      const url = new URL(job.url);
      if (url.protocol !== "https:" || url.hostname !== "remotive.com" || url.username || url.password || url.port || !url.pathname.startsWith("/remote-jobs/")) return [];
      const sourceUrl = url.toString();
      url.search = ""; url.hash = "";
      const canonicalUrl = url.toString();
      const location = typeof job.candidate_required_location === "string" ? job.candidate_required_location : "";
      const publication = typeof job.publication_date === "string" ? job.publication_date : "";
      const date = PostedDateSchema.safeParse(publication.slice(0, 10));
      const validTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(publication)
        && Number.isFinite(Date.parse(publication));
      const postedDate = date.success && (publication.length === 10 || validTimestamp) ? date.data : undefined;
      const commitment = typeof job.job_type === "string" ? job.job_type.replaceAll("_", "-") : "";
      return [{ id: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32), ats: null, provider: "remotive" as const, externalId: String(job.id), canonicalUrl, sourceUrl, applyUrl: sourceUrl,
        attribution: { label: "Remotive", url: sourceUrl }, ...(postedDate ? { postedDate } : {}), company: job.company_name, title: job.title, location,
        description: postingText(typeof job.description === "string" ? job.description : ""), classification: classifyJob(job.title, location, "remote", commitment), capturedAt: new Date().toISOString() }];
    } catch { return []; }
  });
}

async function fetchBoard(source: Source): Promise<JobSnapshot[]> {
  const existing = cache.get(source.id);
  if (existing && existing.expires > Date.now()) return existing.jobs;
  const pending = inflight.get(source.id);
  if (pending) return pending;
  const ttl = source.id === "remotive" ? REMOTIVE_TTL : TTL;
  if (source.id === "remotive" && (remotiveAttempts.get(source.id) ?? 0) > Date.now()) throw new Error("Feed refresh is limited to once every six hours. Try again later.");
  if (source.id === "remotive") remotiveAttempts.set(source.id, Date.now() + ttl);
  const request = (async () => {
    const url = source.id === "remotive" ? "https://remotive.com/api/remote-jobs" : source.ats === "greenhouse" ? `https://boards-api.greenhouse.io/v1/boards/${source.id}/jobs?content=true` : `https://api.lever.co/v0/postings/${source.id}?mode=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: "error", ...(source.id === "remotive" ? { next: { revalidate: REMOTIVE_TTL / 1000 } } : { cache: "no-store" as const }) });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES) throw new Error("Feed is too large");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Feed has no response body");
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > MAX_BODY_BYTES) throw new Error("Feed is too large"); chunks.push(chunk.value); } }
    finally { await reader.cancel(); }
    const jobs = normalizeFeed(source, JSON.parse(Buffer.concat(chunks).toString("utf8")));
    cache.set(source.id, { jobs, expires: Date.now() + ttl });
    return jobs;
  })();
  inflight.set(source.id, request);
  try { return await request; } finally { inflight.delete(source.id); }
}

export async function discoverJobs(options: { q?: string; location?: string; source?: string; limit?: number; offset?: number; experience?: string; workMode?: string; employment?: string }) {
  const sources = discoverySources.filter((source) => !options.source || options.source === "all" || options.source === source.ats || options.source === source.id);
  // Four configured feeds bound concurrency; requests coalesce per source.
  const results = await Promise.allSettled(sources.map(fetchBoard));
  const jobs = new Map<string, JobSnapshot>(); const owners = new Map<string, string>(); const errors: string[] = [];
  const terms = (options.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const location = (options.location ?? "").toLowerCase().trim();
  results.forEach((result, index) => {
    if (result.status === "rejected") { errors.push(`${sources[index]!.company}: ${result.reason instanceof Error ? result.reason.message : "Could not load jobs"}`); return; }
    result.value.forEach((job) => {
      const search = `${job.title} ${job.company}`.toLowerCase();
      if (terms.every((term) => search.includes(term)) && (!location || job.location.toLowerCase().includes(location)) && (["experience", "workMode", "employment"] as const).every((key) => !options[key] || options[key] === "all" || job.classification?.[key] === options[key]) && !jobs.has(job.canonicalUrl)) {
        jobs.set(job.canonicalUrl, job);
        owners.set(job.canonicalUrl, sources[index]!.id);
      }
    });
  });
  const sorted = [...jobs.values()].sort((a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title) || a.canonicalUrl.localeCompare(b.canonicalUrl));
  const allSources = !options.source || options.source === "all";
  // Order the complete filtered snapshot before paging: offsets never depend on
  // the requested page size, and large feeds cannot monopolize page one.
  const matches = allSources ? roundRobin(sources.map((source) => {
    const feed = sorted.filter((job) => owners.get(job.canonicalUrl) === source.id);
    return source.id === "remotive" ? interleaveCompanies(feed) : feed;
  })) : options.source === "remotive" ? interleaveCompanies(sorted) : sorted;
  const expiry = Math.min(...sources.map((source) => cache.get(source.id)?.expires ?? Date.now()));
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 30;
  return { offset, limit, hasMore: offset + limit < matches.length, jobs: matches.slice(offset, offset + limit).map((job) => ({ ...job, sponsorship: assessSponsorship(job.description) })), total: matches.length, errors, sources, cachedUntil: new Date(expiry).toISOString() };
}

function roundRobin(groups: JobSnapshot[][]): JobSnapshot[] {
  const ordered: JobSnapshot[] = [];
  const depth = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < depth; index++) {
    for (const group of groups) { const job = group[index]; if (job) ordered.push(job); }
  }
  return ordered;
}

function interleaveCompanies(jobs: JobSnapshot[]): JobSnapshot[] {
  const groups = new Map<string, JobSnapshot[]>();
  for (const job of jobs) {
    const company = job.company.trim().toLowerCase();
    const group = groups.get(company) ?? [];
    group.push(job); groups.set(company, group);
  }
  return roundRobin([...groups.values()]);
}
