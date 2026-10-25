const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const base = process.env.BASE_URL ?? "http://localhost:3100";
const target = "https://job-boards.greenhouse.io/example/jobs/123";
const profile = {
  schemaVersion: 1,
  contact: {
    legalName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "555-0100",
    linkedIn: "https://linkedin.com/in/ada",
    location: "San Francisco"
  },
  skills: ["TypeScript", "React"],
  experiences: [{ id: "experience-1", title: "Software Engineer", company: "Example Labs", current: true }],
  educations: [{ id: "education-1", school: "Example University", degree: "BS", field: "Computer Science" }]
};
const job = {
  id: "job-one",
  ats: "greenhouse",
  externalId: "123",
  canonicalUrl: target,
  applyUrl: target,
  company: "Example",
  title: "Software Engineer",
  location: "Remote",
  description: "Build software",
  capturedAt: new Date().toISOString()
};
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    await context.addInitScript(
      ({ profile, job }) => {
        if (sessionStorage.getItem("assist-seeded")) return;
        sessionStorage.setItem("assist-seeded", "yes");
        localStorage.setItem("applypilot.profile", JSON.stringify(profile));
        localStorage.setItem(
          "applypilot.authorization",
          JSON.stringify({
            status: "opt",
            currentlyAuthorized: true,
            sponsorshipNow: false,
            sponsorshipFuture: true,
            confirmedAt: new Date().toISOString()
          })
        );
        localStorage.setItem(
          "applypilot.applications",
          JSON.stringify([
            {
              id: "application-one",
              job,
              status: "queued",
              queuePosition: 0,
              blockedReason: null,
              fields: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ])
        );
      },
      { profile, job }
    );
    const page = await context.newPage();
    await page.goto(base);
    await page.getByRole("button", { name: "Applications", exact: true }).click();
    await page.getByRole("button", { name: "Prepare", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Confirm and download package", exact: true })
    ).toBeDisabled();
    await page.getByLabel("Given name", { exact: true }).fill("Ada");
    await page.getByLabel("Family name", { exact: true }).fill("Lovelace");
    await page.getByLabel("Experience record (optional)").selectOption("experience-1");
    await page.getByLabel("Education record (optional)").selectOption("education-1");
    await expect(page.getByText("0 fields selected for this package.", { exact: false })).toBeVisible();
    for (const label of [
      "Legal name",
      "Given name",
      "Family name",
      "Email",
      "Phone",
      "Current company",
      "School / University",
      "Skills"
    ])
      await page.getByLabel(`Include ${label}`, { exact: true }).check();
    await page.getByLabel("I reviewed the selected values", { exact: false }).check();
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.getByRole("button", { name: "Confirm and download package", exact: true }).click();
    const validationErrors = (await page.getByRole("alert").allTextContents()).filter((value) =>
      value.trim()
    );
    if (validationErrors.length) {
      void downloadPromise.catch(() => undefined);
      throw new Error(`Review validation: ${validationErrors.join(" · ")}`);
    }
    const download = await downloadPromise;
    console.log("PASS reviewed package download");
    const snapshot = JSON.parse(readFileSync(await download.path(), "utf8"));
    assert.equal(snapshot.job.canonicalUrl, target);
    assert.equal(snapshot.fields.find((field) => field.key === "currentCompany").value, "Example Labs");
    assert.equal(snapshot.fields.find((field) => field.key === "school").source.recordId, "education-1");
    assert.equal(
      snapshot.fields.some((field) => /sponsor|authorization/i.test(field.key)),
      false
    );
    await expect(page.getByText("Package prepared", { exact: true })).toBeVisible();
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem("applypilot.applications"))[0].status),
      "ready"
    );
    await expect(page.getByRole("button", { name: "Record outcome", exact: true })).toBeDisabled();
    await page.route("https://job-boards.greenhouse.io/**", (route) =>
      route.fulfill({ body: "Local test form" })
    );
    const opened = page.waitForEvent("popup");
    await page.getByRole("link", { name: "Open form", exact: false }).click();
    await (await opened).close();
    await page.getByRole("button", { name: "Record outcome", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save confirmed outcome", exact: true })).toBeDisabled();
    await page.getByLabel("Application outcome", { exact: true }).selectOption("submitted");
    await page.getByLabel("I confirm this is my report", { exact: false }).check();
    await page.getByRole("button", { name: "Save confirmed outcome", exact: true }).click();
    await expect(page.getByText("Submitted · self-reported", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Applications", exact: true }).click();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("applypilot.applications"))[0].assistPackage.fields.find(
            (field) => field.key === "givenName"
          ).value
      ),
      "Ada"
    );
    console.log("PASS explicit self-report and snapshot reload");
    // Run the actual built content script on an intercepted local fixture at the
    // supported URL. No request reaches an ATS and no form is submitted.
    const fixture = await context.newPage();
    await fixture.route("https://job-boards.greenhouse.io/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<form onsubmit="window.submits++;return false"><label>First name<input required></label><label>Last name<input></label><label>Email<input value="existing@example.com"></label><label>Current company<input></label><label>School<input></label><label>School<input></label><label>Skills<textarea></textarea></label><label>Resume<input type="file" required></label><label>Sponsorship<input type="checkbox"></label><button type="submit">Submit</button></form>'
      })
    );
    await fixture.addInitScript((value) => {
      window.submits = 0;
      window.fixturePackage = value;
      window.chrome = {
        runtime: {
          id: "fixture",
          onMessage: {
            addListener: (listener) => {
              window.assistListener = listener;
            }
          }
        },
        storage: { local: { get: async () => ({ applicationAssistPackage: window.fixturePackage }) } }
      };
    }, snapshot);
    await fixture.goto(target);
    await fixture.addScriptTag({ path: resolve("apps/extension/dist/content.js") });
    const send = (type, selected = []) =>
      fixture.evaluate(
        ({ type, selected }) =>
          new Promise((done) => window.assistListener({ type, selected }, { id: "fixture" }, done)),
        { type, selected }
      );
    const inspect = await send("assist.inspect");
    assert.equal(inspect.ok, true);
    assert.equal(inspect.fields.find((field) => field.label === "Resume").required, true);
    assert.equal(
      inspect.fields.filter((field) => field.label === "School").every((field) => field.value === null),
      true
    );
    assert.equal(inspect.fields.find((field) => field.label === "Email").value, null);
    const selected = inspect.fields
      .filter((field) => field.value)
      .map((field) => `${field.key}:${field.value}`);
    const filled = await send("assist.fill", selected);
    assert.equal(filled.ok, true);
    assert.equal(filled.result.filled, 4);
    assert.equal(await fixture.getByLabel("First name", { exact: true }).inputValue(), "Ada");
    assert.equal(await fixture.getByLabel("Email", { exact: true }).inputValue(), "existing@example.com");
    assert.equal(await fixture.evaluate(() => window.submits), 0);
    await fixture.evaluate(() => history.replaceState({}, "", "/example/jobs/999"));
    assert.equal((await send("assist.fill", selected)).ok, false);
    assert.equal(await fixture.evaluate(() => window.submits), 0);
    console.log("PASS built content script selected fill and mismatch rejection");
    // The popup imports the same package and cannot fill without a fresh review
    // and an explicit per-field selection.
    const popup = await context.newPage();
    const popupHtml = readFileSync(resolve("apps/extension/dist/popup.html"), "utf8");
    await popup.route(`${base}/extension-fixture`, (route) =>
      route.fulfill({ contentType: "text/html", body: popupHtml })
    );
    await popup.route(`${base}/assets/**`, (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: readFileSync(resolve("apps/extension/dist", new URL(route.request().url()).pathname.slice(1)))
      })
    );
    await popup.addInitScript((fields) => {
      window.sentCommands = [];
      window.savedPackage = null;
      window.chrome = {
        storage: {
          local: {
            get: async () => ({ applicationAssistPackage: window.savedPackage }),
            set: async (value) => {
              window.savedPackage = value.applicationAssistPackage;
            },
            remove: async () => {
              window.savedPackage = null;
            }
          }
        },
        tabs: {
          query: async () => [{ id: 1 }],
          sendMessage: async (_id, request) => {
            window.sentCommands.push(request);
            return {
              ok: true,
              fields,
              ...(request.type === "assist.fill"
                ? { result: { filled: request.selected.length, skipped: 0, failed: 0 } }
                : {})
            };
          }
        }
      };
    }, inspect.fields);
    await popup.goto(`${base}/extension-fixture`);
    await popup.locator("#import").setInputFiles({
      name: "application.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(snapshot))
    });
    await expect(popup.getByText("Package imported locally.", { exact: false })).toBeVisible();
    await popup.getByRole("button", { name: "Review form fields", exact: true }).click();
    await expect(popup.getByRole("button", { name: "Fill selected fields", exact: true })).toBeDisabled();
    await popup.getByRole("checkbox", { name: "First name · required", exact: true }).check();
    await popup.getByRole("button", { name: "Fill selected fields", exact: true }).click();
    assert.equal((await popup.evaluate(() => window.sentCommands.at(-1))).selected.length, 1);
    await popup.getByRole("button", { name: "Delete imported package", exact: true }).click();
    await expect(popup.getByText("Imported package deleted", { exact: false })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    console.log(
      "Application assist E2E passed: reviewed snapshot export, explicit self-report, persistence, built extension target checks, selected fill, repeated/protected/existing fields, manual attachments, popup import/delete, no submits, mobile."
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
