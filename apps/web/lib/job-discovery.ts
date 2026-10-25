import { createHash } from "node:crypto";
import { PostedDateSchema, type JobClassification, type JobSnapshot } from "@quick-apply/shared";
import { assessSponsorship, normalizeJobUrl } from "./job-intelligence";
import { classifyJob } from "./job-classification";
import { postingText } from "./job-text";
export { postingText } from "./job-text";

export const discoverySources = [
  { id: "anthropic", company: "Anthropic", ats: "greenhouse" as const },
  { id: "figma", company: "Figma", ats: "greenhouse" as const },
  { id: "palantir", company: "Palantir", ats: "lever" as const },
  { id: "remotive", company: "Remotive", ats: null },
  { id: "ramp", company: "Ramp", ats: "ashby" as const },
  { id: "linear", company: "Linear", ats: "ashby" as const },
  { id: "lovable", company: "Lovable", ats: "ashby" as const },
  { id: "affirm", company: "Affirm", ats: "greenhouse" as const },
  { id: "trueanomalyinc", company: "True Anomaly", ats: "greenhouse" as const },
  { id: "spacex", company: "SpaceX", ats: "greenhouse" as const },
  { id: "scaleai", company: "Scale AI", ats: "greenhouse" as const },
  { id: "idmeuniversityrecruiting", company: "ID.me", ats: "greenhouse" as const },
  { id: "commure", company: "Commure", ats: "ashby" as const },
  { id: "cursor", company: "Anysphere (Cursor)", ats: "ashby" as const },
  { id: "replit", company: "Replit", ats: "ashby" as const },
  { id: "aiprise", company: "AiPrise", ats: "ashby" as const },
  { id: "remoteok", company: "Remote OK", ats: null },
  { id: "himalayas", company: "Himalayas", ats: null }
];
type Source = (typeof discoverySources)[number];
const TTL = 5 * 60_000;
const REMOTIVE_TTL = 6 * 60 * 60_000;
const ASHBY_TTL = 15 * 60_000;
const HIMALAYAS_TTL = 24 * 60 * 60_000;
const REMOTEOK_TTL = 6 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 250;
const remotiveAttempts = new Map<string, number>();
type LoadedFeed = { jobs: JobSnapshot[]; status: "loaded" | "cached"; checkedAt: string };
type FeedCache = {
  expires: number;
  jobs: JobSnapshot[];
  checkedAt: string;
  approximateTotal?: number;
  hasMore?: boolean;
};
const cache = new Map<string, FeedCache>();
const inflight = new Map<string, Promise<LoadedFeed>>();
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function storeFeedCache(key: string, entry: FeedCache) {
  const now = Date.now();
  for (const [cachedKey, cached] of cache) {
    if (cached.expires <= now) cache.delete(cachedKey);
  }
  cache.delete(key);
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  cache.set(key, entry);
}

export function normalizeFeed(source: Source, raw: unknown): JobSnapshot[] {
  if (source.id === "remotive") return normalizeRemotive(raw);
  if (source.id === "remoteok") return normalizeRemoteOk(raw);
  if (source.id === "himalayas") return normalizeHimalayas(raw);
  if (source.ats === "ashby") return normalizeAshby(source, raw);
  const entries = source.ats === "greenhouse" ? (raw as { jobs?: unknown })?.jobs : raw;
  if (!Array.isArray(entries)) throw new Error("Unexpected jobs feed format");
  return entries.slice(0, 5000).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const title = source.ats === "greenhouse" ? item.title : item.text;
    const url = source.ats === "greenhouse" ? item.absolute_url : item.hostedUrl;
    if (
      typeof title !== "string" ||
      typeof url !== "string" ||
      (typeof item.id !== "number" && typeof item.id !== "string")
    )
      return [];
    try {
      const canonicalUrl = normalizeJobUrl(url).url.toString();
      const location =
        source.ats === "greenhouse"
          ? (item.location as { name?: unknown })?.name
          : (item.categories as { location?: unknown })?.location;
      const lists = Array.isArray(item.lists)
        ? item.lists.map((list) => (typeof list?.content === "string" ? list.content : "")).join(" ")
        : "";
      const description = postingText(
        source.ats === "greenhouse"
          ? typeof item.content === "string"
            ? item.content
            : ""
          : [item.descriptionPlain ?? item.description, lists, item.additionalPlain ?? item.additional]
              .filter((value) => typeof value === "string")
              .join(" ")
      );
      return [
        {
          id: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32),
          ats: source.ats,
          provider: source.ats ?? undefined,
          sourceUrl: canonicalUrl,
          externalId: String(item.id),
          canonicalUrl,
          applyUrl: canonicalUrl,
          company: source.company,
          title,
          location: typeof location === "string" ? location : "",
          description,
          classification: classifyJob(
            title,
            typeof location === "string" ? location : "",
            item.workplaceType,
            (item.categories as { commitment?: unknown })?.commitment
          ),
          capturedAt: new Date().toISOString()
        }
      ];
    } catch {
      return [];
    }
  });
}

function normalizeRemoteOk(raw: unknown): JobSnapshot[] {
  if (!Array.isArray(raw)) throw new Error("Unexpected Remote OK feed format");
  return raw.slice(0, 500).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const job = entry as Record<string, unknown>;
    if (
      (typeof job.id !== "number" && typeof job.id !== "string") ||
      typeof job.position !== "string" ||
      typeof job.company !== "string" ||
      typeof job.url !== "string"
    )
      return [];
    try {
      const sourceUrl = new URL(job.url);
      const applyUrl = typeof job.apply_url === "string" ? new URL(job.apply_url) : new URL(sourceUrl);
      if (
        sourceUrl.protocol !== "https:" ||
        sourceUrl.hostname !== "remoteok.com" ||
        !sourceUrl.pathname.startsWith("/remote-jobs/") ||
        sourceUrl.username ||
        sourceUrl.password ||
        sourceUrl.port ||
        applyUrl.protocol !== "https:" ||
        applyUrl.hostname !== "remoteok.com" ||
        !applyUrl.pathname.startsWith("/remote-jobs/") ||
        applyUrl.username ||
        applyUrl.password ||
        applyUrl.port
      )
        return [];
      const location = typeof job.location === "string" ? job.location : "";
      const canonicalUrl = sourceUrl.toString();
      const postedDate = normalizeSourceDate(typeof job.date === "string" ? job.date : undefined);
      return [
        {
          id: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32),
          ats: null,
          provider: "remoteok" as const,
          externalId: String(job.id),
          sourceUrl: canonicalUrl,
          canonicalUrl,
          applyUrl: applyUrl.toString(),
          attribution: { label: "Remote OK", url: canonicalUrl },
          ...(postedDate ? { postedDate } : {}),
          company: job.company,
          title: job.position,
          location,
          description: postingText(typeof job.description === "string" ? job.description : ""),
          classification: classifyJob(job.position, location, "remote"),
          capturedAt: new Date().toISOString()
        }
      ];
    } catch {
      return [];
    }
  });
}

function normalizeHimalayas(raw: unknown): JobSnapshot[] {
  const entries = (raw as { jobs?: unknown })?.jobs;
  if (!Array.isArray(entries)) throw new Error("Unexpected Himalayas jobs feed format");
  return entries.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const job = entry as Record<string, unknown>;
    if (
      typeof job.guid !== "string" ||
      typeof job.title !== "string" ||
      typeof job.companyName !== "string" ||
      typeof job.applicationLink !== "string" ||
      (typeof job.expiryDate === "number" && job.expiryDate * 1000 <= Date.now())
    )
      return [];
    const countries = Array.isArray(job.locationRestrictions)
      ? job.locationRestrictions.filter((country): country is string => typeof country === "string")
      : [];
    if (
      countries.length &&
      !countries.some((country) => country.toLowerCase() === "united states" || country === "US")
    )
      return [];
    try {
      const sourceUrl = new URL(job.guid);
      const applyUrl = new URL(job.applicationLink);
      if (
        sourceUrl.protocol !== "https:" ||
        sourceUrl.hostname !== "himalayas.app" ||
        !sourceUrl.pathname.startsWith("/companies/") ||
        sourceUrl.username ||
        sourceUrl.password ||
        sourceUrl.port ||
        applyUrl.protocol !== "https:" ||
        applyUrl.hostname !== "himalayas.app" ||
        !applyUrl.pathname.startsWith("/companies/") ||
        applyUrl.username ||
        applyUrl.password ||
        applyUrl.port
      )
        return [];
      const employmentType = typeof job.employmentType === "string" ? job.employmentType : "";
      const employment: Record<string, JobClassification["employment"]> = {
        "Full Time": "full_time",
        "Part Time": "part_time",
        Contractor: "contract",
        Intern: "internship",
        Temporary: "contract"
      };
      const seniority = Array.isArray(job.seniority) ? job.seniority : [];
      const seniorityLevel = seniority.find((level): level is string => typeof level === "string");
      const experienceBySeniority: Record<string, JobClassification["experience"]> = {
        "Entry-level": "entry",
        "Mid-level": "mid",
        Senior: "senior",
        Manager: "management",
        Director: "management",
        Executive: "management"
      };
      const parsed = classifyJob(job.title, "Remote · United States", "remote", employmentType);
      const experience = employmentType === "Intern" ? "intern" : experienceBySeniority[seniorityLevel ?? ""];
      const postedDate =
        typeof job.pubDate === "number" && Number.isFinite(job.pubDate)
          ? new Date(job.pubDate * 1000).toISOString().slice(0, 10)
          : undefined;
      return [
        {
          id: createHash("sha256").update(sourceUrl.toString()).digest("hex").slice(0, 32),
          ats: null,
          provider: "himalayas" as const,
          externalId: sourceUrl.toString(),
          sourceUrl: sourceUrl.toString(),
          canonicalUrl: sourceUrl.toString(),
          applyUrl: applyUrl.toString(),
          attribution: { label: "Himalayas", url: sourceUrl.toString() },
          ...(postedDate ? { postedDate } : {}),
          company: job.companyName,
          title: job.title,
          location: "Remote · United States",
          description: postingText(typeof job.description === "string" ? job.description : ""),
          classification: {
            ...parsed,
            ...(experience ? { experience } : {}),
            ...(employment[employmentType] ? { employment: employment[employmentType] } : {})
          },
          capturedAt: new Date().toISOString()
        }
      ];
    } catch {
      return [];
    }
  });
}

const usStateNames =
  /\b(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\b/i;
const usStateCode =
  /(?:,\s*|\bUS[- ]?)(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;

export function isUSJob(job: Pick<JobSnapshot, "location" | "provider">): boolean {
  if (job.provider === "himalayas") return true;
  return (
    /\b(?:united states|u\.?s\.?a?\.?|usa|remote\s+(?:in|within|-)?\s*(?:the\s+)?u\.?s\.?a?\.?)\b/i.test(
      job.location
    ) ||
    usStateNames.test(job.location) ||
    usStateCode.test(job.location)
  );
}

function normalizeAshby(source: Source, raw: unknown): JobSnapshot[] {
  const entries = (raw as { jobs?: unknown })?.jobs;
  if (!Array.isArray(entries)) throw new Error("Unexpected Ashby jobs feed format");
  return entries.slice(0, 5000).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const job = entry as Record<string, unknown>;
    if (
      job.isListed !== true ||
      (typeof job.id !== "string" && typeof job.id !== "number") ||
      typeof job.title !== "string" ||
      typeof job.jobUrl !== "string"
    )
      return [];
    try {
      const listing = new URL(job.jobUrl);
      if (
        listing.protocol !== "https:" ||
        listing.hostname !== "jobs.ashbyhq.com" ||
        listing.username ||
        listing.password ||
        listing.port ||
        !listing.pathname.startsWith(`/${source.id}/`)
      )
        return [];
      const sourceUrl = listing.toString();
      listing.search = "";
      listing.hash = "";
      const canonicalUrl = listing.toString();
      const applyUrl = typeof job.applyUrl === "string" ? new URL(job.applyUrl) : new URL(sourceUrl);
      if (
        applyUrl.protocol !== "https:" ||
        applyUrl.hostname !== "jobs.ashbyhq.com" ||
        applyUrl.username ||
        applyUrl.password ||
        applyUrl.port ||
        !applyUrl.pathname.startsWith(`/${source.id}/`)
      )
        return [];
      const locationParts = [
        job.location,
        ...(Array.isArray(job.secondaryLocations)
          ? job.secondaryLocations.map((place) =>
              place && typeof place === "object" ? (place as Record<string, unknown>).location : undefined
            )
          : [])
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      const location = [...new Set(locationParts.map((value) => value.trim()))].join(" · ");
      const workplace =
        typeof job.workplaceType === "string" &&
        ["remote", "hybrid", "onsite", "on-site"].includes(job.workplaceType.toLowerCase())
          ? job.workplaceType.replace(/on.?site/i, "on-site")
          : job.isRemote === true
            ? "remote"
            : undefined;
      const commitment =
        typeof job.employmentType === "string"
          ? (
              {
                FullTime: "full-time",
                PartTime: "part-time",
                Contract: "contract",
                Intern: "internship",
                Internship: "internship"
              } as Record<string, string>
            )[job.employmentType]
          : undefined;
      const postedDate = normalizeSourceDate(job.publishedAt);
      const description = postingText(
        typeof job.descriptionPlain === "string"
          ? job.descriptionPlain
          : typeof job.descriptionHtml === "string"
            ? job.descriptionHtml
            : ""
      );
      return [
        {
          id: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32),
          ats: "ashby" as const,
          provider: "ashby" as const,
          externalId: String(job.id),
          sourceUrl,
          canonicalUrl,
          applyUrl: applyUrl.toString(),
          attribution: { label: "Ashby", url: sourceUrl },
          ...(postedDate ? { postedDate } : {}),
          company: source.company,
          title: job.title,
          location,
          description,
          classification: classifyJob(job.title, location, workplace, commitment),
          capturedAt: new Date().toISOString()
        }
      ];
    } catch {
      return [];
    }
  });
}

function normalizeSourceDate(value: unknown, allowDateOnly = false): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = PostedDateSchema.safeParse(value.slice(0, 10));
  const isDateOnly = allowDateOnly && value.length === 10;
  const isTimestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value) &&
    Number.isFinite(Date.parse(value));
  return date.success && (isDateOnly || isTimestamp) ? date.data : undefined;
}

export function normalizeRemotive(raw: unknown): JobSnapshot[] {
  const entries = (raw as { jobs?: unknown })?.jobs;
  if (!Array.isArray(entries)) throw new Error("Unexpected jobs feed format");
  return entries.slice(0, 5000).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const job = entry as Record<string, unknown>;
    if (
      (typeof job.id !== "number" && typeof job.id !== "string") ||
      typeof job.title !== "string" ||
      typeof job.company_name !== "string" ||
      typeof job.url !== "string"
    )
      return [];
    try {
      const url = new URL(job.url);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "remotive.com" ||
        url.username ||
        url.password ||
        url.port ||
        !url.pathname.startsWith("/remote-jobs/")
      )
        return [];
      const sourceUrl = url.toString();
      url.search = "";
      url.hash = "";
      const canonicalUrl = url.toString();
      const location =
        typeof job.candidate_required_location === "string" ? job.candidate_required_location : "";
      const postedDate = normalizeSourceDate(job.publication_date, true);
      const commitment = typeof job.job_type === "string" ? job.job_type.replaceAll("_", "-") : "";
      return [
        {
          id: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32),
          ats: null,
          provider: "remotive" as const,
          externalId: String(job.id),
          canonicalUrl,
          sourceUrl,
          applyUrl: sourceUrl,
          attribution: { label: "Remotive", url: sourceUrl },
          ...(postedDate ? { postedDate } : {}),
          company: job.company_name,
          title: job.title,
          location,
          description: postingText(typeof job.description === "string" ? job.description : ""),
          classification: classifyJob(job.title, location, "remote", commitment),
          capturedAt: new Date().toISOString()
        }
      ];
    } catch {
      return [];
    }
  });
}

async function fetchBoard(
  source: Source,
  options: { q?: string; experience?: string; employment?: string; page?: number } = {}
): Promise<LoadedFeed & { approximateTotal?: number; hasMore?: boolean }> {
  const isHimalayas = source.id === "himalayas";
  const page = isHimalayas ? (options.page ?? 1) : 1;
  const queryKey = isHimalayas
    ? `${source.id}:${(options.q ?? "").trim().toLowerCase()}:${options.experience ?? "entry"}:${options.employment ?? "all"}:${page}`
    : source.id;
  const existing = cache.get(queryKey);
  if (existing && existing.expires > Date.now()) {
    cache.delete(queryKey);
    cache.set(queryKey, existing);
    return {
      jobs: existing.jobs,
      status: "cached",
      checkedAt: existing.checkedAt,
      approximateTotal: existing.approximateTotal,
      hasMore: existing.hasMore
    };
  }
  if (existing) cache.delete(queryKey);
  const pending = inflight.get(queryKey);
  if (pending) return pending;
  const ttl = isHimalayas
    ? HIMALAYAS_TTL
    : source.id === "remoteok"
      ? REMOTEOK_TTL
      : source.id === "remotive"
        ? REMOTIVE_TTL
        : source.ats === "ashby"
          ? ASHBY_TTL
          : TTL;
  if (source.id === "remotive" && (remotiveAttempts.get(source.id) ?? 0) > Date.now())
    throw new Error("Feed refresh is limited to once every six hours. Try again later.");
  if (source.id === "remotive") remotiveAttempts.set(source.id, Date.now() + ttl);
  const request = (async () => {
    const url =
      source.id === "remotive"
        ? "https://remotive.com/api/remote-jobs"
        : source.id === "remoteok"
          ? "https://remoteok.com/api"
          : isHimalayas
            ? (() => {
                const endpoint = new URL("https://himalayas.app/jobs/api/search");
                endpoint.searchParams.set("country", "US");
                endpoint.searchParams.set("sort", "recent");
                endpoint.searchParams.set("page", String(page));
                if (options.q?.trim()) endpoint.searchParams.set("q", options.q.trim());
                const experience = options.experience ?? "entry";
                const seniority: Record<string, string> = {
                  entry: "Entry-level",
                  mid: "Mid-level",
                  senior: "Senior",
                  management: "Manager"
                };
                if (seniority[experience]) endpoint.searchParams.set("seniority", seniority[experience]!);
                if (experience === "intern") endpoint.searchParams.set("employment_type", "Intern");
                if (options.experience === undefined || options.experience === "all")
                  endpoint.searchParams.delete("seniority");
                const employmentType: Record<string, string> = {
                  full_time: "Full Time",
                  part_time: "Part Time",
                  contract: "Contract",
                  internship: "Intern"
                };
                if (employmentType[options.employment ?? ""])
                  endpoint.searchParams.set("employment_type", employmentType[options.employment ?? ""]!);
                return endpoint.toString();
              })()
            : source.ats === "greenhouse"
              ? `https://boards-api.greenhouse.io/v1/boards/${source.id}/jobs?content=${source.id === "spacex" ? "false" : "true"}`
              : source.ats === "lever"
                ? `https://api.lever.co/v0/postings/${source.id}?mode=json`
                : `https://api.ashbyhq.com/posting-api/job-board/${source.id}`;
    const response = await fetch(url, {
      headers: source.id === "remoteok" ? { "User-Agent": "ApplyPilot public job feed" } : undefined,
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
      ...(source.id === "remotive"
        ? { next: { revalidate: REMOTIVE_TTL / 1000 } }
        : { cache: "no-store" as const })
    });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES) throw new Error("Feed is too large");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Feed has no response body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_BODY_BYTES) throw new Error("Feed is too large");
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      totalCount?: unknown;
      jobs?: unknown;
    };
    const jobs = normalizeFeed(source, data);
    const checkedAt = new Date().toISOString();
    const approximateTotal =
      isHimalayas && typeof data.totalCount === "number" && Number.isFinite(data.totalCount)
        ? data.totalCount
        : undefined;
    const hasMore =
      isHimalayas && (page > 1 ? jobs.length > 0 : jobs.length > 0 && (approximateTotal ?? 0) > jobs.length);
    storeFeedCache(queryKey, { jobs, expires: Date.now() + ttl, checkedAt, approximateTotal, hasMore });
    return { jobs, status: "loaded" as const, checkedAt, approximateTotal, hasMore };
  })();
  inflight.set(queryKey, request);
  try {
    return await request;
  } finally {
    inflight.delete(queryKey);
  }
}

export async function discoverJobs(options: {
  q?: string;
  location?: string;
  source?: string;
  limit?: number;
  offset?: number;
  experience?: string;
  workMode?: string;
  employment?: string;
}) {
  const sources = discoverySources.filter(
    (source) =>
      !options.source ||
      options.source === "all" ||
      options.source === source.ats ||
      options.source === source.id
  );
  // Bound concurrent upstream connections as the employer registry grows.
  const offset = options.offset ?? 0;
  const pageSize = options.source === "himalayas" ? 20 : (options.limit ?? 20);
  const remotePage = Math.floor(offset / 20) + 1;
  const results: PromiseSettledResult<LoadedFeed & { approximateTotal?: number; hasMore?: boolean }>[] =
    Array(sources.length);
  let nextSource = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, sources.length) }, async () => {
      while (nextSource < sources.length) {
        const index = nextSource++;
        const source = sources[index]!;
        try {
          results[index] = {
            status: "fulfilled",
            value: await fetchBoard(source, {
              q: options.q,
              experience: options.experience ?? "entry",
              employment: options.employment,
              page: source.id === "himalayas" && options.source === "himalayas" ? remotePage : 1
            })
          };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    })
  );
  const jobs = new Map<string, JobSnapshot>();
  const owners = new Map<string, string>();
  const errors: string[] = [];
  const terms = (options.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const location = (options.location ?? "").toLowerCase().trim();
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      errors.push(
        `${sources[index]!.company}: ${result.reason instanceof Error ? result.reason.message : "Could not load jobs"}`
      );
      return;
    }
    result.value.jobs.forEach((job) => {
      const search = `${job.title} ${job.company}`.toLowerCase();
      if (
        (options.source === "himalayas" || isUSJob(job)) &&
        (options.source === "himalayas" || terms.every((term) => search.includes(term))) &&
        (options.source === "himalayas" || !location || job.location.toLowerCase().includes(location)) &&
        (["experience", "workMode", "employment"] as const).every(
          (key) => !options[key] || options[key] === "all" || job.classification?.[key] === options[key]
        ) &&
        !jobs.has(job.canonicalUrl)
      ) {
        jobs.set(job.canonicalUrl, job);
        owners.set(job.canonicalUrl, sources[index]!.id);
      }
    });
  });
  const sorted = [...jobs.values()].sort(
    (a, b) =>
      Number(Boolean(b.postedDate)) - Number(Boolean(a.postedDate)) ||
      (b.postedDate ?? "").localeCompare(a.postedDate ?? "") ||
      a.company.localeCompare(b.company) ||
      a.title.localeCompare(b.title) ||
      a.canonicalUrl.localeCompare(b.canonicalUrl)
  );
  // Order the complete filtered snapshot before paging: offsets never depend on
  // the requested page size, and large feeds cannot monopolize page one.
  const matches =
    sources.length > 1
      ? roundRobin(
          sources.map((source) => {
            const feed = sorted.filter((job) => owners.get(job.canonicalUrl) === source.id);
            return source.id === "remotive" ? interleaveCompanies(feed) : feed;
          })
        )
      : sources[0]?.id === "remotive"
        ? interleaveCompanies(sorted)
        : sorted;
  const remoteSourcePage = options.source === "himalayas";
  const remoteResult = remoteSourcePage ? results[0] : undefined;
  const approximateTotal =
    remoteResult?.status === "fulfilled" ? remoteResult.value.approximateTotal : undefined;
  const remoteHasMore =
    remoteResult?.status === "fulfilled" &&
    remoteResult.value.hasMore &&
    (!options.workMode || options.workMode === "all" || options.workMode === "remote");
  const expiry = Math.min(
    ...sources.map((source) => {
      if (source.id === "himalayas") {
        const key = `${source.id}:${(options.q ?? "").trim().toLowerCase()}:${options.experience ?? "entry"}:${options.employment ?? "all"}:${remoteSourcePage ? remotePage : 1}`;
        return cache.get(key)?.expires ?? Date.now();
      }
      return cache.get(source.id)?.expires ?? Date.now();
    })
  );
  const sourceStatus = sources.map((source, index) => {
    const result = results[index];
    return {
      ...source,
      status: result?.status === "fulfilled" ? result.value.status : "unavailable",
      checkedAt: result?.status === "fulfilled" ? result.value.checkedAt : undefined,
      ...(result?.status === "fulfilled" && result.value.hasMore ? { hasMore: true } : {})
    };
  });
  return {
    offset,
    limit: pageSize,
    hasMore: remoteSourcePage ? Boolean(remoteHasMore) : offset + pageSize < matches.length,
    ...(remoteSourcePage && approximateTotal !== undefined ? { approximateTotal } : {}),
    jobs: (remoteSourcePage ? matches : matches.slice(offset, offset + pageSize)).map((job) => ({
      ...job,
      sponsorship: assessSponsorship(job.description)
    })),
    total: remoteSourcePage
      ? !options.workMode || options.workMode === "all" || options.workMode === "remote"
        ? (approximateTotal ?? matches.length)
        : 0
      : matches.length,
    errors,
    sources: sourceStatus,
    cachedUntil: new Date(expiry).toISOString()
  };
}

function roundRobin(groups: JobSnapshot[][]): JobSnapshot[] {
  const ordered: JobSnapshot[] = [];
  const depth = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < depth; index++) {
    for (const group of groups) {
      const job = group[index];
      if (job) ordered.push(job);
    }
  }
  return ordered;
}

function interleaveCompanies(jobs: JobSnapshot[]): JobSnapshot[] {
  const groups = new Map<string, JobSnapshot[]>();
  for (const job of jobs) {
    const company = job.company.trim().toLowerCase();
    const group = groups.get(company) ?? [];
    group.push(job);
    groups.set(company, group);
  }
  return roundRobin([...groups.values()]);
}
