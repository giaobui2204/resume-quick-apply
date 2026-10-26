const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { resolve } = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { chromium, expect } = require("@playwright/test");

const baseUrl = "http://127.0.0.1:3117";
const profile = {
  schemaVersion: 1,
  contact: {
    legalName: "E2E Ada Lovelace",
    email: "ada-e2e@example.test",
    phone: "555-0100",
    linkedIn: "",
    location: "US"
  },
  summary: "Synthetic account sync profile",
  skills: ["TypeScript"],
  experiences: [],
  educations: [],
  projects: [],
  certifications: []
};
const jobUrl = `https://example.test/e2e/${crypto.randomUUID()}`;
const job = {
  id: crypto.randomUUID(),
  ats: "greenhouse",
  externalId: "e2e-job",
  canonicalUrl: jobUrl,
  applyUrl: jobUrl,
  company: "Synthetic E2E Employer",
  title: "Junior Software Engineer",
  location: "US",
  description: "Synthetic test job",
  capturedAt: new Date().toISOString()
};
const now = new Date().toISOString();
const application = {
  id: crypto.randomUUID(),
  job,
  status: "queued",
  queuePosition: 0,
  resumeId: null,
  blockedReason: null,
  fields: [],
  createdAt: now,
  updatedAt: now
};

function localEnvironment() {
  const result = spawnSync("npm", ["exec", "--", "supabase", "status", "-o", "env"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Could not read local Supabase status.");
  const values = {};
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

async function waitForServer(server) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) throw new Error("Next.js exited before it became ready.");
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Next.js did not become ready in 90 seconds.");
}

async function main() {
  const env = localEnvironment();
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const email = `account-e2e-${crypto.randomUUID()}@example.test`;
  const password = `Synthetic-${crypto.randomUUID()}-aA1!`;
  let userId;
  let serverLogs = "";
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", "3117"], {
    cwd: resolve(__dirname, "../apps/web"),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: env.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.PUBLISHABLE_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.ANON_KEY,
      NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "false",
      NEXT_PUBLIC_AUTH_APPLE_ENABLED: "false",
      NEXT_PUBLIC_AUTH_EMAIL_ENABLED: "false",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1"
    }
  });
  server.stdout.on("data", (chunk) => {
    serverLogs += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverLogs += chunk.toString();
  });
  let browser;
  let passed = false;
  try {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    await waitForServer(server);
    browser = await chromium.launch({ channel: "chrome", headless: true });

    const first = await browser.newContext();
    await first.addInitScript(
      ({ profile, job, application }) => {
        if (localStorage.getItem("account-e2e-seeded")) return;
        localStorage.setItem("account-e2e-seeded", "yes");
        localStorage.setItem("applypilot.profile", JSON.stringify(profile));
        localStorage.setItem("applypilot.jobs", JSON.stringify([job]));
        localStorage.setItem("applypilot.applications", JSON.stringify([application]));
      },
      { profile, job, application }
    );
    const firstPage = await first.newPage();
    firstPage.on("console", (message) => {
      if (message.type() === "error") serverLogs += `\nBROWSER: ${message.text()}`;
    });
    firstPage.on("requestfailed", (request) => {
      serverLogs += `\nREQUEST: ${request.url()} ${request.failure()?.errorText}`;
    });
    await firstPage.goto(baseUrl);
    await firstPage.getByRole("button", { name: "Resume", exact: true }).click();
    const localResume = await firstPage.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("applypilot.resumes", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const get = request.result.transaction("metadata").objectStore("metadata").get("library");
            get.onsuccess = () => resolve(get.result.resumes[0]);
            get.onerror = () => reject(get.error);
          };
        })
    );
    assert.ok(localResume?.id, "Legacy resume was not migrated to the local resume library.");
    await firstPage.evaluate(
      ({ application, resumeId, resumeName }) => {
        localStorage.setItem(
          "applypilot.applications",
          JSON.stringify([{ ...application, resumeId, resumeName }])
        );
      },
      { application, resumeId: localResume.id, resumeName: localResume.name }
    );
    const locallyLinkedResume = await firstPage.evaluate(
      () => JSON.parse(localStorage.getItem("applypilot.applications") || "[]")[0]?.resumeId
    );
    assert.equal(
      locallyLinkedResume,
      localResume.id,
      "Local application lost its resume link before import."
    );
    await firstPage.reload();
    assert.equal(
      await firstPage.evaluate(
        () => JSON.parse(localStorage.getItem("applypilot.applications") || "[]")[0]?.resumeId
      ),
      localResume.id,
      "Local application resume link changed after reload."
    );
    await firstPage.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(firstPage.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
    await expect(firstPage.getByText(/Existing email accounts can still sign in/)).toBeVisible();
    await firstPage.getByLabel("Email", { exact: true }).fill(email);
    await firstPage.getByLabel("Password", { exact: true }).fill(password);
    await firstPage.locator(".auth-panel form").getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      firstPage.getByRole("dialog").getByRole("heading", { name: "Choose what to sync" })
    ).toBeVisible({ timeout: 15000 });
    await expect(firstPage.getByLabel(/Sync work authorization answers/)).not.toBeChecked();
    await firstPage.getByRole("button", { name: "Import selected data", exact: true }).click();
    await expect(firstPage.getByText("Cloud workspace", { exact: true })).toBeVisible({ timeout: 15000 });
    assert.equal(
      await firstPage.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith("applypilot.cloud.pending."))
      ),
      false,
      "Successful retry left a pending sync marker."
    );
    assert.equal(
      await firstPage.getByRole("dialog").count(),
      0,
      "Import dialog remained after verified sync."
    );

    await firstPage.route("**/rest/v1/resume_documents**", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"synthetic outage"}' })
    );
    await firstPage.getByRole("button", { name: "Application profile", exact: true }).click();
    await firstPage.getByLabel("Legal name", { exact: true }).fill("E2E Local Pending Name");
    await expect(firstPage.getByText(/cloud sync failed/i)).toBeVisible({ timeout: 15000 });
    assert.equal(
      await firstPage.evaluate(() => {
        const key = Object.keys(localStorage).find((item) => item.startsWith("applypilot.cloud.pending."));
        return key ? localStorage.getItem(key) : null;
      }),
      "1"
    );
    await firstPage.unroute("**/rest/v1/resume_documents**");
    await firstPage.reload();
    await expect(
      firstPage.getByRole("dialog").getByRole("heading", { name: "Choose what to sync" })
    ).toBeVisible({ timeout: 15000 });
    await firstPage.getByRole("button", { name: "Import selected data", exact: true }).click();
    await expect(firstPage.getByText("Cloud workspace", { exact: true })).toBeVisible({ timeout: 15000 });

    const { data: storedResumes, error: resumeError } = await admin
      .from("resume_documents")
      .select("id,display_name,extraction")
      .eq("user_id", userId);
    if (resumeError) throw resumeError;
    assert.equal(storedResumes.length, 1);
    assert.equal(storedResumes[0].extraction.contact.legalName, "E2E Local Pending Name");
    const { data: storedJobs, error: jobsError } = await admin
      .from("jobs")
      .select("id,canonical_url")
      .eq("user_id", userId);
    if (jobsError) throw jobsError;
    assert.equal(storedJobs.length, 1);
    assert.equal(storedJobs[0].canonical_url, jobUrl);
    const { data: storedApplications, error: applicationError } = await admin
      .from("applications")
      .select("id,job_id,resume_id,status")
      .eq("user_id", userId);
    if (applicationError) throw applicationError;
    assert.equal(storedApplications.length, 1);
    assert.equal(storedApplications[0].status, "queued");
    assert.equal(
      storedApplications[0].resume_id,
      storedResumes[0].id,
      "Application resume reference did not map to the cloud resume."
    );
    const { data: authRows, error: authError } = await admin
      .from("work_authorizations")
      .select("user_id")
      .eq("user_id", userId);
    if (authError) throw authError;
    assert.equal(authRows.length, 0, "Work authorization synced without opt-in.");

    const second = await browser.newContext();
    const secondPage = await second.newPage();
    await secondPage.goto(baseUrl);
    await secondPage.getByRole("button", { name: "Settings", exact: true }).click();
    await secondPage.getByLabel("Email", { exact: true }).fill(email);
    await secondPage.getByLabel("Password", { exact: true }).fill(password);
    await secondPage
      .locator(".auth-panel form")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(secondPage.getByText("Cloud workspace", { exact: true })).toBeVisible({ timeout: 15000 });
    await secondPage.reload();
    await expect(secondPage.getByText("Cloud workspace", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(secondPage.getByRole("dialog")).toHaveCount(0);
    await secondPage.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(secondPage.getByText(/Account deletion is unavailable until/)).toBeVisible();
    await secondPage.getByRole("button", { name: "Applications", exact: true }).click();
    await expect(secondPage.getByText("Synthetic E2E Employer", { exact: false })).toBeVisible({
      timeout: 10000
    });
    await expect(secondPage.getByText("Junior Software Engineer", { exact: false })).toBeVisible();
    await secondPage.getByRole("button", { name: "Settings", exact: true }).click();
    await secondPage.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(secondPage.getByRole("heading", { name: "Apply faster. Stay truthful." })).toBeVisible({
      timeout: 15000
    });
    await secondPage.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(secondPage.getByRole("heading", { name: "Back up your workspace" })).toBeVisible({
      timeout: 15000
    });
    const cachedAccountData = await secondPage.evaluate(() => ({
      owner: localStorage.getItem("applypilot.cloud.owner"),
      jobs: localStorage.getItem("applypilot.jobs"),
      applications: localStorage.getItem("applypilot.applications"),
      pending: Object.keys(localStorage).some((key) => key.startsWith("applypilot.cloud.pending."))
    }));
    assert.deepEqual(cachedAccountData, { owner: null, jobs: null, applications: null, pending: false });

    const callback = await fetch(`${baseUrl}/auth/callback`, { redirect: "manual" });
    assert.equal(callback.status, 307);
    assert.match(callback.headers.get("location") ?? "", /auth_error=callback_failed/);
    const callbackPage = await browser.newPage();
    await callbackPage.goto(`${baseUrl}/?auth_error=callback_failed`);
    await expect(
      callbackPage.getByRole("alert").filter({ hasText: /sign-in or recovery link/i })
    ).toBeVisible();
    await callbackPage.close();

    const stale = await browser.newContext();
    await stale.addInitScript(
      ({ userId, profile }) => {
        if (localStorage.getItem("account-lock-e2e-seeded")) return;
        localStorage.setItem("account-lock-e2e-seeded", "yes");
        localStorage.setItem("applypilot.cloud.owner", userId);
        localStorage.setItem("applypilot.cloud.owner.email", "locked@example.test");
        localStorage.setItem("applypilot.cloud.pending." + userId, "1");
        localStorage.setItem("applypilot.profile", JSON.stringify(profile));
      },
      { userId, profile }
    );
    const stalePage = await stale.newPage();
    await stalePage.goto(baseUrl);
    await expect(
      stalePage
        .getByRole("alertdialog")
        .getByRole("heading", { name: "Sign in to unlock saved account data" })
    ).toBeVisible({ timeout: 15000 });
    await expect(stalePage.locator("main")).toHaveAttribute("aria-hidden", "true");
    const preservedPending = await stalePage.evaluate(
      (userId) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("applypilot.resumes", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const transaction = request.result.transaction(["metadata", "profiles"]);
            const library = transaction.objectStore("metadata").get("library");
            const profiles = transaction.objectStore("profiles").getAll();
            transaction.oncomplete = () =>
              resolve({
                owner: localStorage.getItem("applypilot.cloud.owner"),
                pending: localStorage.getItem(`applypilot.cloud.pending.${userId}`),
                resumes: library.result?.resumes?.length ?? 0,
                profileName: profiles.result?.[0]?.contact?.legalName
              });
          };
        }),
      userId
    );
    assert.equal(preservedPending.owner, userId);
    assert.equal(preservedPending.pending, "1");
    assert.equal(
      preservedPending.resumes,
      1,
      "Locked resume metadata was discarded before reauthentication."
    );
    assert.equal(
      preservedPending.profileName,
      profile.contact.legalName,
      "Locked resume facts were discarded before reauthentication."
    );
    await stalePage
      .getByLabel("I understand clearing this browser deletes any unsynced account changes here.")
      .check();
    await stalePage.getByRole("button", { name: "Clear this browser and continue as guest" }).click();
    await expect(stalePage.getByRole("heading", { name: "Apply faster. Stay truthful." })).toBeVisible({
      timeout: 15000
    });
    await expect(stalePage.getByRole("alertdialog")).toHaveCount(0, { timeout: 15000 });
    assert.deepEqual(
      await stalePage.evaluate(() => ({
        owner: localStorage.getItem("applypilot.cloud.owner"),
        pending: Object.keys(localStorage).some((key) => key.startsWith("applypilot.cloud.pending.")),
        profile: localStorage.getItem("applypilot.profile")
      })),
      { owner: null, pending: false, profile: null }
    );
    await stale.close();
    console.log(
      "Account browser E2E passed: import and DB mapping, opt-in, failed-sync recovery, second-device load, sign-out isolation, and expired-session cache lock."
    );
    passed = true;
    await second.close();
    await first.close();
  } finally {
    if (!passed && serverLogs) console.error(serverLogs.slice(-12000));
    if (browser) await browser.close();
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
