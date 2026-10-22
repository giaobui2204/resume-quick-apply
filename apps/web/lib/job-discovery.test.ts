import { describe, expect, it } from "vitest";
import { discoverySources, normalizeFeed, postingText } from "./job-discovery";

describe("public job feed normalization", () => {
  it("normalizes Greenhouse and discards unsafe or malformed postings", () => {
    const jobs = normalizeFeed(discoverySources[0]!, { jobs: [
      { id: 123, title: "Engineer", absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/123?gh_src=tracking", content: "&lt;p&gt;Visa sponsorship supported.&lt;/p&gt;", location: { name: "Remote" } },
      { id: 2, title: "Unsafe", absolute_url: "http://localhost/private" },
      { id: 3, absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/3" }
    ] });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ externalId: "123", company: "Anthropic", location: "Remote", description: "Visa sponsorship supported.", canonicalUrl: "https://job-boards.greenhouse.io/anthropic/jobs/123" });
  });
  it("preserves Lever sections and stable identity", () => {
    const raw = [{ id: "abc-123", text: "Product Designer", hostedUrl: "https://jobs.lever.co/plaid/abc-123", descriptionPlain: "Team", lists: [{ content: "<li>Requirements</li>" }], additionalPlain: "Benefits", categories: { location: "New York" } }];
    expect(normalizeFeed(discoverySources[2]!, raw)[0]).toMatchObject({ title: "Product Designer", description: "Team Requirements Benefits", location: "New York" });
    expect(normalizeFeed(discoverySources[2]!, raw)[0]!.id).toBe(normalizeFeed(discoverySources[2]!, raw)[0]!.id);
  });
  it("rejects incompatible feed envelopes and strips active markup", () => {
    expect(() => normalizeFeed(discoverySources[0]!, {})).toThrow("Unexpected jobs feed format");
    expect(postingText("&amp;lt;p&amp;gt;Hello&amp;lt;/p&amp;gt;<script>bad()</script>" )).toBe("Hello");
  });
});

it("coalesces parallel discovery requests, caches boards and reports partial failures", async () => {
  const { vi } = await import("vitest");
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("figma")) return new Response("unavailable", { status: 503 });
    if (url.includes("lever")) return Response.json([{ id: "abc-123", text: "Engineer", hostedUrl: "https://jobs.lever.co/palantir/abc-123", descriptionPlain: "Team" }]);
    return Response.json({ jobs: [{ id: 123, title: "Engineer", absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/123", content: "A role" }] });
  });
  try {
    const { discoverJobs } = await import("./job-discovery");
    const [first, second] = await Promise.all([discoverJobs({ q: "engineer" }), discoverJobs({ q: "engineer" })]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(first.total).toBe(2);
    expect(first.errors).toEqual(["Figma: Feed returned HTTP 503"]);
    expect(second.jobs.map((j) => j.id)).toEqual(first.jobs.map((j) => j.id));
    const filtered = await discoverJobs({ source: "lever", location: "No matching city" });
    expect(filtered.total).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(4);
  } finally { fetcher.mockRestore(); }
});

it("filters the entire board before paging and preserves exact explicit levels", async () => {
  const { vi } = await import("vitest");
  vi.resetModules();
  const rows = Array.from({ length: 65 }, (_, index) => ({ id: index + 1, title: `${index < 35 ? "Senior Engineer" : "New Grad Engineer"} ${String(index).padStart(2, "0")}`, absolute_url: `https://job-boards.greenhouse.io/anthropic/jobs/${index + 1}`, location: { name: "Remote" }, content: "Role" }));
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ jobs: rows }));
  try {
    const { discoverJobs } = await import("./job-discovery");
    const filtered = await discoverJobs({ source: "greenhouse", experience: "entry", limit: 10, offset: 20 });
    expect(filtered.total).toBe(30);
    expect(filtered.jobs).toHaveLength(10);
    expect(filtered.hasMore).toBe(false);
    expect(filtered.jobs.every((job) => job.classification?.experience === "entry")).toBe(true);
    const first = await discoverJobs({ source: "greenhouse", experience: "entry", limit: 10 });
    expect(first.hasMore).toBe(true);
    expect(first.jobs.some((job) => filtered.jobs.some((other) => other.id === job.id))).toBe(false);
    const unknown = await discoverJobs({ source: "greenhouse", experience: "unknown" });
    expect(unknown.total).toBe(0);
  } finally { fetcher.mockRestore(); }
});

it("preserves Remotive provenance without inventing an ATS and rejects foreign links", () => {
  const raw = { jobs: [
    { id: 9, title: "Junior Engineer", company_name: "Example", url: "https://remotive.com/remote-jobs/software-dev/junior-engineer-9?ref=source", candidate_required_location: "USA", job_type: "full_time", description: "<p>A real role</p>" },
    { id: 10, title: "Unsafe", company_name: "Example", url: "https://attacker.test/remote-jobs/10" }
  ] };
  const result = normalizeFeed(discoverySources[3]!, raw);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ ats: null, provider: "remotive", company: "Example", description: "A real role", classification: { experience: "entry", employment: "full_time", workMode: "remote" }, attribution: { label: "Remotive", url: raw.jobs[0]!.url }, applyUrl: raw.jobs[0]!.url, sourceUrl: raw.jobs[0]!.url, canonicalUrl: "https://remotive.com/remote-jobs/software-dev/junior-engineer-9" });
});

it("refreshes Remotive no more than once per six hours including failed attempts", async () => {
  const { vi } = await import("vitest");
  vi.resetModules(); vi.useFakeTimers();
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ jobs: [] }));
  try {
    const { discoverJobs } = await import("./job-discovery");
    await discoverJobs({ source: "remotive" });
    await discoverJobs({ source: "remotive", q: "new query" });
    vi.advanceTimersByTime(6 * 60 * 60_000 - 1);
    await discoverJobs({ source: "remotive" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    fetcher.mockResolvedValue(new Response("down", { status: 503 }));
    expect((await discoverJobs({ source: "remotive" })).errors).toHaveLength(1);
    expect((await discoverJobs({ source: "remotive" })).errors).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { fetcher.mockRestore(); vi.useRealTimers(); }
});

it("interleaves all feeds and Remotive employers before stable pagination", async () => {
  const { vi } = await import("vitest");
  vi.resetModules();
  const remoteRows = ["A", "A", "A", "B", "C"].map((company, index) => ({ id: index, title: `Engineer ${index}`, company_name: company, url: `https://remotive.com/remote-jobs/software-dev/engineer-${index}`, description: "Role" }));
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("remotive")) return Response.json({ jobs: remoteRows });
    if (url.includes("lever")) return Response.json(Array.from({ length: 5 }, (_, id) => ({ id: `lever-${id}`, text: `Engineer ${id}`, hostedUrl: `https://jobs.lever.co/palantir/lever-${id}` })));
    const company = url.includes("figma") ? "figma" : "anthropic";
    return Response.json({ jobs: Array.from({ length: 6 }, (_, id) => ({ id, title: `Engineer ${id}`, absolute_url: `https://job-boards.greenhouse.io/${company}/jobs/${id}`, content: "Role" })) });
  });
  try {
    const { discoverJobs } = await import("./job-discovery");
    const first = await discoverJobs({ limit: 8 });
    const second = await discoverJobs({ offset: 8, limit: 8 });
    const full = await discoverJobs({ limit: 50 });
    expect(first.total).toBe(22);
    expect(first.jobs.slice(0, 4).map((job) => job.provider)).toEqual(["greenhouse", "greenhouse", "lever", "remotive"]);
    expect(first.jobs.slice(0, 3).map((job) => job.company)).toEqual(["Anthropic", "Figma", "Palantir"]);
    expect(full.jobs.filter((job) => job.provider === "remotive").slice(0, 3).map((job) => job.company)).toEqual(["A", "B", "C"]);
    expect([...first.jobs, ...second.jobs].map((job) => job.canonicalUrl)).toEqual(full.jobs.slice(0, 16).map((job) => job.canonicalUrl));
    expect(new Set(full.jobs.map((job) => job.canonicalUrl)).size).toBe(full.total);
    const lever = await discoverJobs({ source: "lever", limit: 5 });
    expect(lever.jobs.map((job) => job.title)).toEqual(["Engineer 0", "Engineer 1", "Engineer 2", "Engineer 3", "Engineer 4"]);
  } finally { fetcher.mockRestore(); }
});

it("retains the Remotive publication calendar date and omits missing or malformed dates", () => {
  const base = { id: 1, title: "Engineer", company_name: "Example", url: "https://remotive.com/remote-jobs/software-dev/engineer-1" };
  const normalize = (publication_date?: string) => normalizeFeed(discoverySources[3]!, { jobs: [{ ...base, publication_date }] })[0]!;
  expect(normalize("2026-10-21T23:30:00").postedDate).toBe("2026-10-21");
  expect(normalize("2026-10-21T23:30:00-07:00").postedDate).toBe("2026-10-21");
  expect(normalize("2024-02-29").postedDate).toBe("2024-02-29");
  for (const value of [undefined, "", "invalid", "2026-02-30T12:00:00", "2026-01-01T99:00:00"]) expect(normalize(value).postedDate).toBeUndefined();
});
