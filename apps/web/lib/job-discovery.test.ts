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
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(first.total).toBe(2);
    expect(first.errors).toEqual(["Figma: Feed returned HTTP 503"]);
    expect(second.jobs.map((j) => j.id)).toEqual(first.jobs.map((j) => j.id));
    const filtered = await discoverJobs({ source: "lever", location: "No matching city" });
    expect(filtered.total).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
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
