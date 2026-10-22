import { createHash } from "node:crypto";
import type { JobSnapshot } from "@quick-apply/shared";
import { assessSponsorship, normalizeJobUrl } from "./job-intelligence";
import { postingText } from "./job-text";
export { postingText } from "./job-text";

export const discoverySources = [
  { id: "anthropic", company: "Anthropic", ats: "greenhouse" as const },
  { id: "figma", company: "Figma", ats: "greenhouse" as const },
  { id: "palantir", company: "Palantir", ats: "lever" as const }
];
type Source = typeof discoverySources[number];
const TTL = 5 * 60_000;
const cache = new Map<string, { expires: number; jobs: JobSnapshot[] }>();
const inflight = new Map<string, Promise<JobSnapshot[]>>();
const MAX_BODY_BYTES = 12 * 1024 * 1024;


export function normalizeFeed(source: Source, raw: unknown): JobSnapshot[] {
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
      return [{ id: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32), ats: source.ats, externalId: String(item.id), canonicalUrl, applyUrl: canonicalUrl, company: source.company, title, location: typeof location === "string" ? location : "", description, capturedAt: new Date().toISOString() }];
    } catch { return []; }
  });
}

async function fetchBoard(source: Source): Promise<JobSnapshot[]> {
  const existing = cache.get(source.id);
  if (existing && existing.expires > Date.now()) return existing.jobs;
  const pending = inflight.get(source.id);
  if (pending) return pending;
  const request = (async () => {
    const url = source.ats === "greenhouse" ? `https://boards-api.greenhouse.io/v1/boards/${source.id}/jobs?content=true` : `https://api.lever.co/v0/postings/${source.id}?mode=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: "error", cache: "no-store" });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES) throw new Error("Feed is too large");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Feed has no response body");
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > MAX_BODY_BYTES) throw new Error("Feed is too large"); chunks.push(chunk.value); } }
    finally { await reader.cancel(); }
    const jobs = normalizeFeed(source, JSON.parse(Buffer.concat(chunks).toString("utf8")));
    cache.set(source.id, { jobs, expires: Date.now() + TTL });
    return jobs;
  })();
  inflight.set(source.id, request);
  try { return await request; } finally { inflight.delete(source.id); }
}

export async function discoverJobs(options: { q?: string; location?: string; source?: string; limit?: number }) {
  const sources = discoverySources.filter((source) => !options.source || options.source === "all" || options.source === source.ats);
  // Only three configured boards: concurrency is bounded, and requests coalesce per board.
  const results = await Promise.allSettled(sources.map(fetchBoard));
  const jobs = new Map<string, JobSnapshot>(); const errors: string[] = [];
  const terms = (options.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const location = (options.location ?? "").toLowerCase().trim();
  results.forEach((result, index) => {
    if (result.status === "rejected") { errors.push(`${sources[index]!.company}: ${result.reason instanceof Error ? result.reason.message : "Could not load jobs"}`); return; }
    result.value.forEach((job) => {
      const search = `${job.title} ${job.company}`.toLowerCase();
      if (terms.every((term) => search.includes(term)) && (!location || job.location.toLowerCase().includes(location))) jobs.set(job.canonicalUrl, job);
    });
  });
  const matches = [...jobs.values()].sort((a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
  const expiry = Math.min(...sources.map((source) => cache.get(source.id)?.expires ?? Date.now()));
  return { jobs: matches.slice(0, options.limit ?? 30).map((job) => ({ ...job, sponsorship: assessSponsorship(job.description) })), total: matches.length, errors, sources, cachedUntil: new Date(expiry).toISOString() };
}
