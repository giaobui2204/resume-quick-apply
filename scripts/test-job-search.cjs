const { chromium, expect } = require("@playwright/test");

const makeJob = (index, experience) => ({
  id: `${experience}-${index}`,
  ats: "lever",
  externalId: `${experience}-${index}`,
  canonicalUrl: `https://jobs.lever.co/acme/${experience}-${index}`,
  applyUrl: `https://jobs.lever.co/acme/${experience}-${index}`,
  company: "Acme",
  title: `${experience === "entry" ? "New Grad" : experience === "senior" ? "Senior" : "General"} Software Engineer ${index}`,
  location: "San Francisco, CA",
  description: "Fixture posting",
  capturedAt: new Date().toISOString(),
  classification: {
    experience,
    workMode: index % 2 ? "hybrid" : "remote",
    employment: index < 10 ? "full_time" : "contract",
    evidence: {
      experience: experience === "unknown" ? [] : ["Explicit fixture title"],
      workMode: ["Employer workplace metadata"],
      employment: ["Employer commitment metadata"]
    }
  }
});
const jobs = [
  ...Array.from({ length: 30 }, (_, i) => makeJob(i, "senior")),
  ...Array.from({ length: 31 }, (_, i) => makeJob(i, "entry")),
  ...Array.from({ length: 25 }, (_, index) => ({
    ...makeJob(index, "entry"),
    id: `himalayas-${index}`,
    ats: null,
    provider: "himalayas",
    externalId: `himalayas-${index}`,
    canonicalUrl: `https://himalayas.app/companies/acme/jobs/junior-engineer-${index}`,
    sourceUrl: `https://himalayas.app/companies/acme/jobs/junior-engineer-${index}`,
    attribution: {
      label: "Himalayas",
      url: `https://himalayas.app/companies/acme/jobs/junior-engineer-${index}`
    },
    applyUrl: `https://himalayas.app/companies/acme/jobs/junior-engineer-${index}?utm_source=api`,
    company: "Acme Remote",
    title: `Junior Remote Engineer ${index}`,
    location: "Remote · United States",
    classification: {
      experience: "entry",
      workMode: "remote",
      employment: "part_time",
      evidence: { experience: ["Entry-level provider metadata"], workMode: ["Remote"], employment: [] }
    }
  })),
  makeJob(0, "unknown"),
  {
    id: "remotive-1",
    ats: null,
    provider: "remotive",
    externalId: "remotive-1",
    canonicalUrl: "https://remotive.com/remote-jobs/software-dev/distributed-engineer-1",
    sourceUrl: "https://remotive.com/remote-jobs/software-dev/distributed-engineer-1?ref=fixture",
    attribution: {
      label: "Remotive",
      url: "https://remotive.com/remote-jobs/software-dev/distributed-engineer-1?ref=fixture"
    },
    applyUrl: "https://remotive.com/remote-jobs/software-dev/distributed-engineer-1?ref=fixture",
    company: "Acme Remote",
    title: "Distributed Platform Engineer",
    location: "Remote - Canada",
    description: "Fixture remote posting",
    capturedAt: new Date().toISOString(),
    classification: {
      experience: "entry",
      workMode: "remote",
      employment: "full_time",
      evidence: { experience: ["Explicit fixture"], workMode: ["Remote"], employment: ["Full-time"] }
    }
  },
  {
    id: "ashby-1",
    ats: "ashby",
    provider: "ashby",
    externalId: "ashby-1",
    canonicalUrl: "https://jobs.ashbyhq.com/ramp/ashby-1",
    sourceUrl: "https://jobs.ashbyhq.com/ramp/ashby-1?utm_source=fixture",
    attribution: { label: "Ashby", url: "https://jobs.ashbyhq.com/ramp/ashby-1?utm_source=fixture" },
    applyUrl: "https://jobs.ashbyhq.com/ramp/ashby-1/application",
    company: "Ramp",
    title: "Senior Product Designer",
    location: "San Francisco, CA",
    description: "Fixture hybrid role",
    postedDate: "2026-10-20",
    capturedAt: new Date().toISOString(),
    classification: {
      experience: "senior",
      workMode: "remote",
      employment: "full_time",
      evidence: { experience: ["Explicit fixture"], workMode: ["Remote"], employment: ["Full-time"] }
    }
  },
  {
    id: "remoteok-1",
    ats: null,
    provider: "remoteok",
    externalId: "remoteok-1",
    canonicalUrl: "https://remoteok.com/remote-jobs/junior-engineer-acme-1",
    sourceUrl: "https://remoteok.com/remote-jobs/junior-engineer-acme-1",
    attribution: {
      label: "Remote OK",
      url: "https://remoteok.com/remote-jobs/junior-engineer-acme-1"
    },
    applyUrl: "https://remoteok.com/remote-jobs/junior-engineer-acme-1",
    company: "Acme Remote",
    title: "Junior Engineer",
    location: "Remote - US",
    description: "Fixture remote US posting",
    capturedAt: new Date().toISOString(),
    classification: {
      experience: "entry",
      workMode: "remote",
      employment: "full_time",
      evidence: { experience: ["Explicit fixture"], workMode: ["Remote"], employment: ["Full-time"] }
    }
  }
];
const feeds = [
  { id: "anthropic", company: "Anthropic", ats: "greenhouse" },
  { id: "figma", company: "Figma", ats: "greenhouse" },
  { id: "palantir", company: "Palantir", ats: "lever" },
  { id: "remotive", company: "Remotive", ats: null },
  { id: "ramp", company: "Ramp", ats: "ashby" },
  { id: "linear", company: "Linear", ats: "ashby" },
  { id: "lovable", company: "Lovable", ats: "ashby" },
  { id: "affirm", company: "Affirm", ats: "greenhouse" },
  { id: "trueanomalyinc", company: "True Anomaly", ats: "greenhouse" },
  { id: "spacex", company: "SpaceX", ats: "greenhouse" },
  { id: "scaleai", company: "Scale AI", ats: "greenhouse" },
  { id: "idmeuniversityrecruiting", company: "ID.me", ats: "greenhouse" },
  { id: "commure", company: "Commure", ats: "ashby" },
  { id: "cursor", company: "Anysphere (Cursor)", ats: "ashby" },
  { id: "replit", company: "Replit", ats: "ashby" },
  { id: "aiprise", company: "AiPrise", ats: "ashby" },
  { id: "remoteok", company: "Remote OK", ats: null },
  { id: "himalayas", company: "Himalayas", ats: null }
];

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/jobs/discover?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      requests.push(Object.fromEntries(params));
      const q = (params.get("q") || "").toLowerCase();
      const location = (params.get("location") || "").toLowerCase();
      const source = params.get("source") || "all";
      const matching = jobs.filter(
        (job) =>
          (!q || `${job.title} ${job.company}`.toLowerCase().includes(q)) &&
          (source === "himalayas" || !location || job.location.toLowerCase().includes(location)) &&
          (source === "all" ||
            (source === "greenhouse"
              ? job.ats === "greenhouse"
              : source === "lever"
                ? job.ats === "lever"
                : (job.provider || job.ats) === source)) &&
          ["experience", "workMode", "employment"].every(
            (key) =>
              !params.get(key) || params.get(key) === "all" || job.classification[key] === params.get(key)
          )
      );
      const offset = Number(params.get("offset") || 0);
      const limit = Number(params.get("limit") || 20);
      const selectedFeeds = feeds.filter(
        (feed) => source === "all" || source === feed.ats || source === feed.id
      );
      return route.fulfill({
        json: {
          jobs: matching.slice(offset, offset + limit),
          total: matching.length,
          ...(source === "himalayas" ? { approximateTotal: matching.length } : {}),
          offset,
          limit,
          hasMore: offset + limit < matching.length,
          errors: [],
          sources: selectedFeeds.map((feed) => ({
            ...feed,
            status: "loaded",
            ...(feed.id === "himalayas" && source !== "himalayas" ? { hasMore: true } : {}),
            checkedAt: "2026-10-22T19:30:00Z"
          })),
          cachedUntil: new Date(Date.now() + 300000).toISOString()
        }
      });
    });
    await page.goto(process.env.APP_URL || "http://localhost:3000");
    await page.getByRole("button", { name: "Jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    await page.locator(".source-coverage > summary").click();
    await page.getByRole("button", { name: "Browse paginated Himalayas results", exact: true }).click();
    await expect(page.locator(".job-card").first()).toContainText("Source: Himalayas");
    await page.getByLabel("Job source", { exact: true }).selectOption("all");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    await expect(page.getByRole("heading", { name: "Find your next move.", exact: true })).toBeVisible();
    await page.screenshot({ path: "/tmp/applypilot-search-desktop.png" });
    await page.getByLabel("Job keywords", { exact: true }).fill("Software Engineer");
    await page.getByLabel("Location", { exact: true }).fill("San Francisco, CA");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    const linkedIn = new URL(
      await page.getByRole("link", { name: "Search LinkedIn ↗", exact: true }).getAttribute("href")
    );
    const indeed = new URL(
      await page.getByRole("link", { name: "Search Indeed ↗", exact: true }).getAttribute("href")
    );
    if (
      linkedIn.searchParams.get("keywords") !== "Software Engineer" ||
      linkedIn.searchParams.get("location") !== "San Francisco, CA" ||
      indeed.searchParams.get("q") !== "Software Engineer" ||
      indeed.searchParams.get("l") !== "San Francisco, CA"
    )
      throw new Error("External search links did not preserve applied search criteria");
    await page.getByLabel("Job keywords", { exact: true }).fill("");
    await page.getByLabel("Location", { exact: true }).fill("");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    console.log("PASS LinkedIn and Indeed shortcuts carry applied keywords and location");
    await page.locator('input[name="experience"][value="entry"]').check();
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    await expect(page.locator(".job-card").first()).toContainText("New Grad");
    await page.getByLabel("Job keywords", { exact: true }).fill("unsent draft");
    await page.getByRole("button", { name: "Page 2", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    const last = requests.at(-1);
    if (last.experience !== "entry" || last.q !== "")
      throw new Error("Pagination did not retain submitted criteria");
    await expect(page.getByRole("button", { name: "Page 2", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    console.log("PASS numbered pagination replaces pages and preserves applied criteria");

    await page.getByLabel("Job keywords", { exact: true }).fill("");
    await page.getByText("More filters", { exact: false }).click();
    await page.getByLabel("Work mode", { exact: true }).selectOption("remote");
    await page.getByLabel("Employment type", { exact: true }).selectOption("full_time");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(7);
    await page.getByRole("button", { name: /Remove experience filter/ }).click();
    await expect(page.locator(".job-card")).toHaveCount(14);
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    await page.locator('input[name="experience"][value="unknown"]').check();
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(1);
    await expect(page.locator(".job-card")).toContainText("General Software Engineer");
    await page.getByLabel("Job keywords", { exact: true }).fill("NoSuchJob");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.getByText("No matches for these filters", { exact: true })).toBeVisible();
    console.log(
      "PASS combined facets, removable applied criteria, clear all, explicit unknown, honest empty state"
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Job keywords", { exact: true }).fill("");
    await page.locator('input[name="experience"][value="all"]').check();
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error("Mobile search overflows");
    await page.getByLabel("Job source", { exact: true }).selectOption("remotive");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(1);
    await expect(page.locator(".job-card").first()).toContainText("Source: Remotive");
    await expect(page.locator(".job-card").first()).toContainText("View on Remotive");
    await expect(page.locator(".external-apply-note")).toBeVisible();
    await expect(page.locator(".source-coverage summary")).toContainText("1 of 1 selected feeds available");
    await expect(page.locator(".source-coverage")).toContainText("Remotive");
    const footerOverflows = await page
      .locator(".job-actions")
      .evaluate((footer) =>
        [...footer.children].some((child) => child.getBoundingClientRect().right > innerWidth + 1)
      );
    if (footerOverflows) throw new Error("Remotive attribution/apply actions overflow on mobile");
    await page.getByLabel("Job source", { exact: true }).selectOption("ashby");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(1);
    await expect(page.locator(".job-card").first()).toContainText("Source: Ashby");
    await expect(page.locator(".job-card").first()).toContainText("Apply on Ashby");
    await expect(page.locator(".external-apply-note")).toBeVisible();
    await expect(page.locator(".source-coverage summary")).toContainText("7 of 7 selected feeds available");
    await page.locator(".source-coverage > summary").click();
    await expect(page.locator(".source-coverage")).toContainText("Ramp");
    await expect(page.locator(".source-coverage")).toContainText("Checked");
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error("Mobile source coverage overflows");
    await page.getByLabel("Job source", { exact: true }).selectOption("himalayas");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    await expect(page.locator(".job-card").first()).toContainText("Source: Himalayas");
    await expect(page.locator(".job-card").first()).toContainText("View on Himalayas");
    await expect(page.getByText(/About 25 opportunities/)).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await page.getByLabel("Job source", { exact: true }).selectOption("remoteok");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(1);
    await expect(page.locator(".job-card").first()).toContainText("Source: Remote OK");
    await expect(page.locator(".job-card").first()).toContainText("View on Remote OK");
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error("Mobile pagination or source labels overflow");
    await page.getByLabel("Job source", { exact: true }).selectOption("all");
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.locator(".job-card")).toHaveCount(20);
    await page.screenshot({ path: "/tmp/applypilot-search-mobile.png" });
    await page.locator(".job-card").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/applypilot-search-mobile-results.png" });
    await page.route("**/api/jobs/discover?*", (route) =>
      route.fulfill({
        json: {
          jobs: [],
          total: 0,
          offset: 0,
          limit: 30,
          hasMore: false,
          errors: ["Palantir: unavailable"],
          sources: [],
          cachedUntil: new Date().toISOString()
        }
      })
    );
    await page.getByRole("button", { name: "Find jobs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Search incomplete", exact: true })).toBeVisible();
    await expect(page.getByText("No matches for these filters", { exact: true })).toHaveCount(0);
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("PASS mobile filters/results, no browser exceptions");
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
