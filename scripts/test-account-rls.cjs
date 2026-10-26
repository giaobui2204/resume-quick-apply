const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");

function localEnvironment() {
  const result = spawnSync("npm", ["exec", "--", "supabase", "status", "-o", "env"], {
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(result.stderr || "Could not read local Supabase status.");
  const values = {};
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    if (match) values[match[1]] = match[2];
  }
  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"])
    if (!values[key]) throw new Error(`Local Supabase status is missing ${key}.`);
  return values;
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function mustReject(promise, message) {
  const { error } = await promise;
  assert.ok(error, message);
}

(async () => {
  const env = localEnvironment();
  const admin = client(env.API_URL, env.SERVICE_ROLE_KEY);
  const ownerEmail = `rls-owner-${crypto.randomUUID()}@example.test`;
  const otherEmail = `rls-other-${crypto.randomUUID()}@example.test`;
  const password = `LocalTest-${crypto.randomUUID()}-aA1!`;
  const created = [];
  try {
    for (const email of [ownerEmail, otherEmail]) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      created.push(data.user.id);
    }
    const owner = client(env.API_URL, env.ANON_KEY);
    const other = client(env.API_URL, env.ANON_KEY);
    for (const [authClient, email] of [
      [owner, ownerEmail],
      [other, otherEmail]
    ]) {
      const { error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    const [{ data: ownerData }, { data: otherData }] = await Promise.all([
      owner.auth.getUser(),
      other.auth.getUser()
    ]);
    assert.ok(ownerData.user && otherData.user);

    const jobId = crypto.randomUUID();
    const ownerJob = {
      id: jobId,
      user_id: ownerData.user.id,
      ats: "greenhouse",
      external_id: jobId,
      canonical_url: `https://example.test/jobs/${jobId}`,
      apply_url: `https://example.test/jobs/${jobId}`,
      company: "Synthetic Employer",
      title: "Software Engineer",
      location: "US",
      description: "Synthetic test job",
      content_hash: "a".repeat(64)
    };
    const { error: jobError } = await owner.from("jobs").insert(ownerJob);
    if (jobError) throw jobError;
    const { data: hiddenJobs, error: hiddenJobError } = await other.from("jobs").select("id").eq("id", jobId);
    if (hiddenJobError) throw hiddenJobError;
    assert.equal(hiddenJobs.length, 0, "Other account can read the owner's job.");

    const resumeId = crypto.randomUUID();
    const resume = {
      id: resumeId,
      user_id: ownerData.user.id,
      file_name: "Synthetic resume",
      display_name: "Synthetic resume",
      byte_size: 0,
      sha256: "b".repeat(64),
      status: "extracted",
      active: true,
      extraction: { schemaVersion: 1 },
      schema_version: 1
    };
    const { error: resumeError } = await owner.from("resume_documents").insert(resume);
    if (resumeError) throw resumeError;
    await mustReject(
      owner.from("resume_documents").insert({ ...resume, id: crypto.randomUUID(), active: false }),
      "Duplicate live resume hash was accepted for one account."
    );
    await mustReject(
      owner.from("resume_documents").insert({ ...resume, id: crypto.randomUUID(), sha256: "c".repeat(64) }),
      "Second active resume was accepted for one account."
    );
    const ownerAppId = crypto.randomUUID();
    const ownerApp = {
      id: ownerAppId,
      user_id: ownerData.user.id,
      job_id: jobId,
      resume_id: resumeId,
      status: "queued",
      queue_position: 0
    };
    const { error: appError } = await owner.from("applications").insert(ownerApp);
    if (appError) throw appError;
    const { data: visibleApps, error: visibleAppsError } = await owner
      .from("applications")
      .select("id,job_id,resume_id");
    if (visibleAppsError) throw visibleAppsError;
    assert.deepEqual(visibleApps, [{ id: ownerAppId, job_id: jobId, resume_id: resumeId }]);
    const { data: hiddenApps, error: hiddenAppsError } = await other
      .from("applications")
      .select("id")
      .eq("id", ownerAppId);
    if (hiddenAppsError) throw hiddenAppsError;
    assert.equal(hiddenApps.length, 0, "Other account can read the owner's application.");

    const otherJobId = crypto.randomUUID();
    const { error: otherJobError } = await other.from("jobs").insert({
      ...ownerJob,
      id: otherJobId,
      user_id: otherData.user.id,
      canonical_url: `https://example.test/jobs/${otherJobId}`
    });
    if (otherJobError) throw otherJobError;

    const foreignJobId = crypto.randomUUID();
    await mustReject(
      other.from("applications").insert({
        id: foreignJobId,
        user_id: otherData.user.id,
        job_id: jobId,
        status: "queued",
        queue_position: 0
      }),
      "Cross-owner application -> job reference was accepted."
    );
    await mustReject(
      other.from("applications").insert({
        id: crypto.randomUUID(),
        user_id: otherData.user.id,
        job_id: otherJobId,
        resume_id: resumeId,
        status: "queued",
        queue_position: 0
      }),
      "Cross-owner application -> resume reference was accepted."
    );
    await mustReject(
      other.from("application_events").insert({
        application_id: ownerAppId,
        user_id: otherData.user.id,
        event_type: "synthetic_test"
      }),
      "Cross-owner event -> application reference was accepted."
    );
    await mustReject(
      other
        .from("resume_documents")
        .insert({ ...resume, id: crypto.randomUUID(), user_id: ownerData.user.id }),
      "Other account inserted a resume under the owner's ID."
    );

    console.log("Local Supabase RLS checks passed for owner isolation and cross-owner references.");
  } finally {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
