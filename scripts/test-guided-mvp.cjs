const { chromium, expect } = require("@playwright/test");

const profile = (name) => ({
  schemaVersion: 1,
  contact: {
    legalName: name,
    preferredName: "",
    email: `${name.toLowerCase()}@example.com`,
    phone: "",
    location: "",
    linkedIn: "",
    github: "",
    portfolio: ""
  },
  summary: "",
  experiences: [],
  educations: [],
  projects: [],
  skills: [],
  certifications: [],
  warnings: []
});
const job = {
  id: "discovered-one",
  ats: "greenhouse",
  externalId: "123",
  canonicalUrl: "https://boards.greenhouse.io/acme/jobs/123",
  applyUrl: "https://boards.greenhouse.io/acme/jobs/123",
  company: "Acme",
  title: "Discovered Engineer",
  location: "Remote",
  description: "Public board fixture",
  capturedAt: new Date().toISOString()
};

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const exceptions = [];
    page.on("pageerror", (error) => exceptions.push(error.message));
    let extractions = 0;
    let discoveries = 0;
    await page.route("**/api/resumes/extract", async (route) => {
      extractions += 1;
      const name = extractions === 1 ? "Alpha" : "Beta";
      await route.fulfill({ json: { profile: profile(name), provider: "fixture" } });
    });
    await page.route("**/api/jobs/discover?*", (route) => {
      discoveries += 1;
      return route.fulfill({
        json: {
          jobs: [job, job],
          errors: ["Figma: temporarily unavailable"],
          total: 1,
          sources: [
            { id: "anthropic", company: "Anthropic", ats: "greenhouse" },
            { id: "plaid", company: "Plaid", ats: "lever" }
          ],
          cachedUntil: new Date(Date.now() + 300000).toISOString()
        }
      });
    });
    await page.goto(process.env.APP_URL || "http://localhost:3000");
    const nav = (name) => page.getByRole("button", { name, exact: true }).click();
    await nav("Resume");
    const initialCount = await page.locator(".resume-row").count();
    const upload = (name, content) =>
      page
        .getByLabel("Choose a resume", { exact: true })
        .setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from(content) });
    await upload("Alpha.pdf", "unique-alpha-resume-content");
    await expect(page.locator(".resume-row")).toHaveCount(initialCount + 1);
    await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue("Alpha");
    await page.getByRole("button", { name: "Next: Review profile" }).click();
    await expect(page.getByRole("button", { name: "Next: Discover jobs" })).toBeVisible();
    await page.getByRole("button", { name: "Next: Discover jobs" }).click();
    await expect(page.getByRole("heading", { name: "Discovered Engineer", exact: true })).toBeVisible();
    if (!discoveries) throw new Error("Jobs did not auto-load on entry");
    await expect(page.locator(".job-card")).toHaveCount(1);
    await expect(page.getByText(/temporarily unavailable/)).toBeVisible();
    await page.getByRole("button", { name: "Add to queue", exact: true }).click();
    await page.getByRole("button", { name: "Next: Applications" }).click();
    await expect(page.getByText(/Resume: Alpha/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Review this resume", exact: true }).click();
    await page.getByRole("button", { name: "Confirm authorization answers" }).click();
    await page.getByRole("button", { name: "Next: Discover jobs" }).click();
    await page.getByRole("button", { name: "Next: Applications" }).click();
    await expect(page.getByRole("button", { name: "Prepare", exact: true })).toBeEnabled();
    console.log(
      "PASS guided Next flow, automatic discovery, deduplication, partial source failure, queue resume binding"
    );

    await nav("Resume");
    await upload("Beta.pdf", "unique-beta-resume-content");
    await expect(page.locator(".resume-row")).toHaveCount(initialCount + 2);
    await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue("Beta");
    await nav("Applications");
    await expect(page.getByRole("button", { name: "Prepare", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Review this resume", exact: true }).click();
    await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue("Alpha");
    await nav("Resume");
    await page.locator(".resume-select").filter({ hasText: "Alpha" }).click();
    await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue("Alpha");
    await page.getByLabel("Phone", { exact: true }).fill("555-0101");
    await page.reload();
    await nav("Resume");
    await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue("Alpha");
    await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("555-0101");
    await upload("Alpha.pdf", "unique-alpha-resume-content");
    await expect(page.locator(".resume-row")).toHaveCount(initialCount + 2);
    if (extractions !== 2) throw new Error(`Duplicate resume reran extraction: ${extractions}`);
    const alphaRow = page
      .locator(".resume-row")
      .filter({ has: page.locator(".resume-select").filter({ hasText: "Alpha" }) });
    page.once("dialog", (dialog) => dialog.accept("Alpha tailored"));
    await alphaRow.getByRole("button", { name: "Rename", exact: true }).click();
    await expect(page.locator(".resume-select").filter({ hasText: "Alpha tailored" })).toBeVisible();
    await nav("Applications");
    await expect(
      page
        .getByText("Resume: Alpha.pdf", { exact: true })
        .or(page.getByText("Resume: Alpha", { exact: true }))
    ).toBeVisible();
    await nav("Resume");
    const protectedRow = page.locator(".resume-row").filter({ has: page.locator(".resume-select.selected") });
    await expect(protectedRow.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    await nav("Applications");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await nav("Resume");
    const active = page.locator(".resume-row").filter({ has: page.locator(".resume-select.selected") });
    page.once("dialog", (dialog) => dialog.accept());
    await active.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator(".resume-row")).toHaveCount(initialCount + 1);
    await expect(page.locator(".resume-select.selected")).toHaveCount(1);
    console.log(
      "PASS independent resumes, IndexedDB persistence, file-hash dedup before inference, protected referenced deletion, rename/delete fallback, preserved queue context"
    );
    while ((await page.locator(".resume-row").count()) > 1) {
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator(".resume-row").first().getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.getByLabel("Choose a resume", { exact: true })).toBeEnabled();
    }
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".resume-row").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue("");
    await page.getByLabel("Legal name", { exact: true }).fill("After final deletion");
    await expect(page.getByLabel("Choose a resume", { exact: true })).toBeEnabled();
    await page.reload();
    await nav("Resume");
    await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue("After final deletion");
    console.log("PASS deleting last resume leaves a durable editable blank record");

    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ["Resume", "Application profile", "Jobs", "Applications"]) {
      await nav(name);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`Mobile overflow: ${name}`);
    }
    await nav("Settings");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete local data" }).click();
    await page.reload();
    await nav("Resume");
    await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue("");
    if (exceptions.length) throw new Error(exceptions.join("\n"));
    console.log("PASS mobile guided flow, reset across local stores, no browser exceptions");
    await page.screenshot({ path: "/tmp/applypilot-guided-mobile.png", fullPage: true });
    for (const value of [
      JSON.stringify({
        ...profile("Migrated"),
        contact: { ...profile("Migrated").contact, email: "unfinished@" }
      }),
      "{corrupt-json"
    ]) {
      const context = await browser.newContext();
      await context.addInitScript((value) => {
        if (!sessionStorage.getItem("migration-fixture")) {
          localStorage.setItem("applypilot.profile", value);
          sessionStorage.setItem("migration-fixture", "set");
        }
      }, value);
      const migrated = await context.newPage();
      await migrated.goto(process.env.APP_URL || "http://localhost:3000");
      await migrated.getByRole("button", { name: "Resume", exact: true }).click();
      await expect(migrated.locator(".resume-row")).toHaveCount(1);
      await expect(migrated.getByLabel("Legal name", { exact: true })).toHaveValue(
        value.startsWith("{corrupt") ? "" : "Migrated"
      );
      if (!value.startsWith("{corrupt"))
        await expect(migrated.getByLabel("Email", { exact: true })).toHaveValue("unfinished@");
      await migrated.reload();
      await migrated.getByRole("button", { name: "Resume", exact: true }).click();
      await expect(migrated.locator(".resume-row")).toHaveCount(1);
      await context.close();
    }
    console.log(
      "PASS legacy migration preserves incomplete drafts, corrupt legacy data recovers, reload does not duplicate migration"
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
