"use client";

import type { Application, JobSnapshot, ResumeExtraction, WorkAuthorization } from "@quick-apply/shared";
import { ApplicationSchema, JobSnapshotSchema } from "@quick-apply/shared";
import type { ResumeEntry, ResumeLibrary } from "./resume-library";
import { createClient } from "./supabase/client";
import { emptyAuthorization, emptyResume } from "./demo-data";

export type ResumeRecord = { entry: ResumeEntry; profile: ResumeExtraction };
export type CloudWorkspace = {
  userId: string;
  library: ResumeLibrary;
  resumes: ResumeRecord[];
  authorization: WorkAuthorization;
  syncWorkAuthorization: boolean;
  jobs: JobSnapshot[];
  applications: Application[];
};

const PAGE_SIZE = 500;
const MAX_CLOUD_ROWS = 10_000;
type PageQuery<T> = {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};
type ResumeCloudRow = {
  id: string;
  display_name: string | null;
  file_name: string;
  sha256: string | null;
  extraction: unknown;
  active: boolean;
  created_at: string;
  updated_at: string;
};
type JobCloudRow = Record<string, unknown> & { id: string; captured_at: string };
type ApplicationCloudRow = {
  id: string;
  job_id: string;
  resume_id: string | null;
  status: string;
  queue_position: number;
  blocked_reason: string | null;
  opened_at: string | null;
  confirmed_at: string | null;
  outcome_source: string | null;
  created_at: string;
  updated_at: string;
};

function isoTimestamp(value: unknown): string {
  const timestamp = new Date(String(value));
  if (Number.isNaN(timestamp.getTime())) throw new Error("The account contains an invalid timestamp.");
  return timestamp.toISOString();
}

async function readAllPages<T>(query: {
  range(
    from: number,
    to: number
  ): PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
}): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_CLOUD_ROWS; from += PAGE_SIZE) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error("This cloud workspace is too large to load safely. Contact support.");
}

async function userId() {
  const { data, error } = await createClient().auth.getUser();
  if (error || !data.user) throw new Error("Sign in again to sync your workspace.");
  return data.user.id;
}

function fromJobRow(row: Record<string, unknown>): JobSnapshot {
  return JobSnapshotSchema.parse({
    id: row.id,
    ats: row.ats,
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.attribution ? { attribution: row.attribution } : {}),
    externalId: row.external_id,
    canonicalUrl: row.canonical_url,
    applyUrl: row.apply_url,
    company: row.company,
    title: row.title,
    location: row.location,
    description: row.description,
    capturedAt: isoTimestamp(row.captured_at),
    ...(row.posted_date ? { postedDate: row.posted_date } : {}),
    ...(row.sponsorship_assessment ? { sponsorship: row.sponsorship_assessment } : {}),
    ...(row.classification ? { classification: row.classification } : {})
  });
}

function toWorkAuthorizationRow(user_id: string, value: WorkAuthorization) {
  return {
    user_id,
    status: value.status,
    authorization_start: value.authorizationStart || null,
    authorization_end: value.authorizationEnd || null,
    currently_authorized: value.currentlyAuthorized,
    sponsorship_now: value.sponsorshipNow,
    sponsorship_future: value.sponsorshipFuture,
    confirmed_at: value.confirmedAt,
    updated_at: new Date().toISOString()
  };
}

export async function loadCloudWorkspace(): Promise<CloudWorkspace> {
  const supabase = createClient();
  const id = await userId();
  const [resumeRows, jobRows, applicationRows, preferenceResult, authorizationResult] = await Promise.all([
    readAllPages<ResumeCloudRow>(
      supabase
        .from("resume_documents")
        .select("id, display_name, file_name, sha256, extraction, active, created_at, updated_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }) as unknown as PageQuery<ResumeCloudRow>
    ),
    readAllPages<JobCloudRow>(
      supabase
        .from("jobs")
        .select(
          "id,ats,provider,source_url,attribution,external_id,canonical_url,apply_url,company,title,location,description,captured_at,posted_date,sponsorship_assessment,classification"
        )
        .order("captured_at", { ascending: true })
        .order("id", { ascending: true }) as unknown as PageQuery<JobCloudRow>
    ),
    readAllPages<ApplicationCloudRow>(
      supabase
        .from("applications")
        .select(
          "id,job_id,resume_id,status,queue_position,blocked_reason,opened_at,confirmed_at,submitted_at,outcome_source,created_at,updated_at"
        )
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }) as unknown as PageQuery<ApplicationCloudRow>
    ),
    supabase.from("user_sync_preferences").select("sync_work_authorization").maybeSingle(),
    supabase
      .from("work_authorizations")
      .select(
        "status, authorization_start, authorization_end, currently_authorized, sponsorship_now, sponsorship_future, confirmed_at"
      )
      .maybeSingle()
  ]);
  for (const result of [preferenceResult, authorizationResult]) {
    if (result.error) throw new Error("Could not load the cloud workspace. Try again.");
  }

  const resumes: ResumeRecord[] = resumeRows
    .filter((row) => row.extraction)
    .map((row) => ({
      entry: {
        id: row.id,
        name: row.display_name || row.file_name,
        createdAt: isoTimestamp(row.created_at),
        updatedAt: isoTimestamp(row.updated_at),
        ...(row.sha256 ? { contentHash: row.sha256 } : {})
      },
      profile: row.extraction as ResumeExtraction
    }));
  const library: ResumeLibrary = {
    resumes: resumes.map(({ entry }) => entry),
    activeResumeId:
      resumes.find(({ entry }) => {
        const row = resumeRows.find((candidate) => candidate.id === entry.id);
        return row?.active;
      })?.entry.id ??
      resumes[0]?.entry.id ??
      null
  };
  const jobs = jobRows.map((row) => fromJobRow(row));
  const jobsById = new Map(jobRows.map((row, index) => [row.id, jobs[index]!])) as Map<string, JobSnapshot>;
  const resumeById = new Map(resumes.map(({ entry }) => [entry.id, entry]));
  const applications = applicationRows.flatMap((row) => {
    const job = jobsById.get(row.job_id);
    if (!job) return [];
    const resume = row.resume_id ? resumeById.get(row.resume_id) : undefined;
    const parsed = ApplicationSchema.safeParse({
      id: row.id,
      job,
      status: row.status,
      queuePosition: row.queue_position,
      ...(row.resume_id ? { resumeId: row.resume_id } : { resumeId: null }),
      ...(resume ? { resumeName: resume.name } : {}),
      ...(row.opened_at ? { openedAt: isoTimestamp(row.opened_at) } : {}),
      ...(row.confirmed_at ? { submissionConfirmedAt: isoTimestamp(row.confirmed_at) } : {}),
      ...(row.outcome_source ? { outcomeSource: row.outcome_source } : {}),
      blockedReason: row.blocked_reason,
      fields: [],
      createdAt: isoTimestamp(row.created_at),
      updatedAt: isoTimestamp(row.updated_at)
    });
    return parsed.success ? [parsed.data] : [];
  });
  const syncWorkAuthorization = Boolean(preferenceResult.data?.sync_work_authorization);
  const authRow = authorizationResult.data;
  const authorization =
    syncWorkAuthorization && authRow
      ? ({
          status: authRow.status,
          authorizationStart: authRow.authorization_start ?? "",
          authorizationEnd: authRow.authorization_end ?? "",
          currentlyAuthorized: authRow.currently_authorized,
          sponsorshipNow: authRow.sponsorship_now,
          sponsorshipFuture: authRow.sponsorship_future,
          confirmedAt: authRow.confirmed_at ? isoTimestamp(authRow.confirmed_at) : null
        } as WorkAuthorization)
      : emptyAuthorization;

  return { userId: id, library, resumes, authorization, syncWorkAuthorization, jobs, applications };
}

async function jobIdFor(job: JobSnapshot, id: string, owner: string) {
  const supabase = createClient();
  const existing = await supabase
    .from("jobs")
    .select("id,captured_at")
    .eq("user_id", owner)
    .eq("canonical_url", job.canonicalUrl)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const jobId = (existing.data?.id as string | undefined) ?? id;
  const bytes = new TextEncoder().encode(`${job.canonicalUrl}\n${job.title}\n${job.description}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const content_hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
  const row = {
    id: jobId,
    user_id: owner,
    ats: job.ats,
    provider: job.provider ?? job.ats,
    source_url: job.sourceUrl ?? null,
    attribution: job.attribution ?? null,
    external_id: job.externalId,
    canonical_url: job.canonicalUrl,
    apply_url: job.applyUrl,
    company: job.company,
    title: job.title,
    location: job.location,
    description: job.description,
    content_hash,
    captured_at: job.capturedAt,
    posted_date: job.postedDate ?? null,
    sponsorship_assessment: job.sponsorship ?? null,
    classification: job.classification ?? null
  };
  if (!existing.data) {
    const { error } = await supabase.from("jobs").upsert(row, {
      onConflict: "user_id,canonical_url",
      ignoreDuplicates: true
    });
    if (error) throw error;
  }
  const stored = await supabase
    .from("jobs")
    .select("id")
    .eq("user_id", owner)
    .eq("canonical_url", job.canonicalUrl)
    .single();
  if (stored.error) throw stored.error;
  if (!existing.data || new Date(job.capturedAt).getTime() >= new Date(existing.data.captured_at).getTime()) {
    const { id: _id, user_id: _owner, ...updates } = row;
    const { error } = await supabase
      .from("jobs")
      .update(updates)
      .eq("user_id", owner)
      .eq("id", stored.data.id);
    if (error) throw error;
  }
  return stored.data.id;
}

export async function persistResume(record: ResumeRecord, active: boolean) {
  const supabase = createClient();
  const owner = await userId();
  let existing = await supabase
    .from("resume_documents")
    .select("id,updated_at")
    .eq("user_id", owner)
    .eq("id", record.entry.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data && record.entry.contentHash) {
    existing = await supabase
      .from("resume_documents")
      .select("id,updated_at")
      .eq("user_id", owner)
      .eq("sha256", record.entry.contentHash)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing.error) throw existing.error;
  }
  const id = existing.data?.id ?? record.entry.id;
  const keepCloudProfile = Boolean(
    existing.data && new Date(existing.data.updated_at).getTime() > new Date(record.entry.updatedAt).getTime()
  );
  if (active) {
    const { error } = await supabase
      .from("resume_documents")
      .update({ active: false })
      .eq("user_id", owner)
      .eq("active", true);
    if (error) throw error;
  }
  if (keepCloudProfile) {
    if (active) {
      const { error } = await supabase
        .from("resume_documents")
        .update({ active: true })
        .eq("user_id", owner)
        .eq("id", id);
      if (error) throw error;
    }
    return id;
  }
  const row = {
    id,
    user_id: owner,
    storage_path: null,
    file_name: record.entry.name,
    display_name: record.entry.name,
    mime_type: null,
    byte_size: 0,
    sha256: record.entry.contentHash ?? null,
    status: "extracted",
    active,
    extraction: record.profile,
    schema_version: record.profile.schemaVersion,
    created_at: record.entry.createdAt,
    updated_at: record.entry.updatedAt,
    deleted_at: null
  };
  if (
    existing.data &&
    new Date(existing.data.updated_at).getTime() > new Date(record.entry.updatedAt).getTime()
  )
    return id;
  const { error } = await supabase.from("resume_documents").upsert(row, { onConflict: "id" });
  if (error) {
    // A second device may upload the same file hash at the same time.
    if (error.code === "23505" && record.entry.contentHash) {
      const duplicate = await supabase
        .from("resume_documents")
        .select("id")
        .eq("user_id", owner)
        .eq("sha256", record.entry.contentHash)
        .is("deleted_at", null)
        .single();
      if (duplicate.error) throw error;
      if (active) {
        const { error: activeError } = await supabase
          .from("resume_documents")
          .update({ active: true })
          .eq("user_id", owner)
          .eq("id", duplicate.data.id);
        if (activeError) throw activeError;
      }
      return duplicate.data.id;
    }
    throw error;
  }
  return id;
}

export async function persistJob(job: JobSnapshot) {
  return jobIdFor(job, job.id, await userId());
}

export async function persistApplication(application: Application, resumeId = application.resumeId ?? null) {
  const supabase = createClient();
  const owner = await userId();
  const jobId = await jobIdFor(application.job, application.job.id, owner);
  const existing = await supabase
    .from("applications")
    .select("id,updated_at")
    .eq("user_id", owner)
    .eq("job_id", jobId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const candidateId = existing.data?.id ?? application.id;
  const { error: insertError } = await supabase.from("applications").upsert(
    {
      id: candidateId,
      user_id: owner,
      job_id: jobId,
      resume_id: resumeId,
      status: application.status,
      queue_position: Math.min(application.queuePosition, 24),
      blocked_reason: application.blockedReason,
      opened_at: application.openedAt ?? null,
      confirmed_at: application.submissionConfirmedAt ?? null,
      submitted_at:
        application.status === "submitted"
          ? (application.submissionConfirmedAt ?? application.updatedAt)
          : null,
      outcome_source: application.outcomeSource ?? null,
      created_at: application.createdAt,
      updated_at: application.updatedAt
    },
    { onConflict: "user_id,job_id", ignoreDuplicates: true }
  );
  if (insertError) throw insertError;
  const stored = await supabase
    .from("applications")
    .select("id,updated_at")
    .eq("user_id", owner)
    .eq("job_id", jobId)
    .single();
  if (stored.error) throw stored.error;
  if (new Date(stored.data.updated_at).getTime() > new Date(application.updatedAt).getTime())
    return stored.data.id;
  const {
    id: _id,
    user_id: _owner,
    job_id: _jobId,
    ...updates
  } = {
    id: stored.data.id,
    user_id: owner,
    job_id: jobId,
    resume_id: resumeId,
    status: application.status,
    queue_position: Math.min(application.queuePosition, 24),
    blocked_reason: application.blockedReason,
    opened_at: application.openedAt ?? null,
    confirmed_at: application.submissionConfirmedAt ?? null,
    submitted_at:
      application.status === "submitted"
        ? (application.submissionConfirmedAt ?? application.updatedAt)
        : null,
    outcome_source: application.outcomeSource ?? null,
    created_at: application.createdAt,
    updated_at: application.updatedAt
  };
  const { error } = await supabase
    .from("applications")
    .update(updates)
    .eq("user_id", owner)
    .eq("id", stored.data.id);
  if (error) throw error;
  return stored.data.id;
}

export async function deleteCloudApplication(applicationId: string) {
  const supabase = createClient();
  const owner = await userId();
  const { error } = await supabase.from("applications").delete().eq("user_id", owner).eq("id", applicationId);
  if (error) throw error;
}

export async function importCloudWorkspace(input: {
  library: ResumeLibrary;
  resumes: ResumeRecord[];
  jobs: JobSnapshot[];
  applications: Application[];
  authorization?: WorkAuthorization;
}) {
  const owner = await userId();
  const current = await loadCloudWorkspace();
  const resumeIds = new Map<string, string>();
  for (const record of input.resumes) {
    const active = input.library.activeResumeId === record.entry.id;
    const cloudMatch = current.resumes.find(
      ({ entry }) =>
        entry.id === record.entry.id ||
        Boolean(record.entry.contentHash && entry.contentHash === record.entry.contentHash)
    );
    const chosen =
      cloudMatch &&
      new Date(cloudMatch.entry.updatedAt).getTime() > new Date(record.entry.updatedAt).getTime()
        ? cloudMatch
        : record;
    const mappedRecord = cloudMatch
      ? { ...chosen, entry: { ...chosen.entry, id: cloudMatch.entry.id } }
      : chosen;
    resumeIds.set(record.entry.id, await persistResume(mappedRecord, active));
  }
  const jobsByUrl = new Map(current.jobs.map((job) => [job.canonicalUrl, job]));
  for (const job of input.jobs) {
    const prior = jobsByUrl.get(job.canonicalUrl);
    if (!prior || new Date(job.capturedAt).getTime() > new Date(prior.capturedAt).getTime())
      jobsByUrl.set(job.canonicalUrl, job);
  }
  for (const application of input.applications) {
    const prior = jobsByUrl.get(application.job.canonicalUrl);
    if (!prior || new Date(application.job.capturedAt).getTime() > new Date(prior.capturedAt).getTime()) {
      jobsByUrl.set(application.job.canonicalUrl, application.job);
    }
  }
  const jobs = [...jobsByUrl.values()].filter(
    (job) =>
      input.jobs.some((item) => item.canonicalUrl === job.canonicalUrl) ||
      input.applications.some((item) => item.job.canonicalUrl === job.canonicalUrl)
  );
  for (const job of jobs) await jobIdFor(job, job.id, owner);
  for (const application of input.applications) {
    const currentApplication = current.applications.find(
      (item) => item.job.canonicalUrl === application.job.canonicalUrl
    );
    const chosen =
      currentApplication &&
      new Date(currentApplication.updatedAt).getTime() > new Date(application.updatedAt).getTime()
        ? currentApplication
        : application;
    const selectedResumeId =
      currentApplication && chosen === currentApplication
        ? (currentApplication.resumeId ?? null)
        : application.resumeId
          ? (resumeIds.get(application.resumeId) ?? null)
          : null;
    await persistApplication(chosen, selectedResumeId);
  }
  if (input.authorization) await saveAuthorizationSync(input.authorization, true);
  const verified = await loadCloudWorkspace();
  const verifiedResumeIds = new Set(verified.resumes.map(({ entry }) => entry.id));
  const verifiedResumeHashes = new Set(
    verified.resumes.map(({ entry }) => entry.contentHash).filter(Boolean)
  );
  const resumesVerified = input.resumes.every(
    (record) =>
      verifiedResumeIds.has(resumeIds.get(record.entry.id)!) ||
      Boolean(record.entry.contentHash && verifiedResumeHashes.has(record.entry.contentHash))
  );
  const verifiedApplications = new Set(
    verified.applications.map((application) => application.job.canonicalUrl)
  );
  const applicationsVerified = input.applications.every((application) =>
    verifiedApplications.has(application.job.canonicalUrl)
  );
  const selectedJobsVerified = input.jobs.every((job) =>
    verified.jobs.some((stored) => stored.canonicalUrl === job.canonicalUrl)
  );
  if (!resumesVerified || !applicationsVerified || !selectedJobsVerified) {
    throw new Error(
      "Some workspace items could not be verified in the account. Your local data is unchanged; retry the import."
    );
  }
  return verified;
}

export async function saveAuthorizationSync(value: WorkAuthorization, enabled: boolean) {
  const supabase = createClient();
  const owner = await userId();
  if (enabled) {
    const { error } = await supabase
      .from("work_authorizations")
      .upsert(toWorkAuthorizationRow(owner, value), { onConflict: "user_id" });
    if (error) throw error;
    const { error: prefError } = await supabase.from("user_sync_preferences").upsert(
      {
        user_id: owner,
        sync_work_authorization: true,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
    if (prefError) throw prefError;
    return;
  }
  const { error: deleteError } = await supabase.from("work_authorizations").delete().eq("user_id", owner);
  if (deleteError) throw deleteError;
  const { error: prefError } = await supabase.from("user_sync_preferences").upsert(
    {
      user_id: owner,
      sync_work_authorization: false,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (prefError) throw prefError;
}

export async function saveResumeLibraryCloud(library: ResumeLibrary, records: ResumeRecord[]) {
  const supabase = createClient();
  const owner = await userId();
  const current = await readAllPages<{ id: string }>(
    supabase
      .from("resume_documents")
      .select("id")
      .eq("user_id", owner)
      .is("deleted_at", null)
      .order("id", { ascending: true }) as unknown as PageQuery<{ id: string }>
  );
  const keepIds = new Set(records.map(({ entry }) => entry.id));
  const removed = current.filter((row) => !keepIds.has(row.id));
  for (const row of removed) {
    const used = await supabase
      .from("applications")
      .select("id")
      .eq("user_id", owner)
      .eq("resume_id", row.id)
      .limit(1)
      .maybeSingle();
    if (used.error) throw used.error;
    if (used.data) throw new Error("This resume is still linked to an application.");
    const { error } = await supabase.from("resume_documents").delete().eq("user_id", owner).eq("id", row.id);
    if (error) throw error;
  }
  const resumeIds = new Map<string, string>();
  for (const record of records) {
    resumeIds.set(record.entry.id, await persistResume(record, library.activeResumeId === record.entry.id));
  }
  return resumeIds;
}

export function hasLocalWorkspaceData(input: {
  library: ResumeLibrary;
  resumes: ResumeRecord[];
  authorization: WorkAuthorization;
  jobs: JobSnapshot[];
  applications: Application[];
}) {
  const hasResumeData = input.resumes.some(
    ({ profile }) =>
      profile.contact.legalName ||
      profile.contact.email ||
      profile.summary ||
      profile.experiences.length ||
      profile.educations.length ||
      profile.projects.length ||
      profile.skills.length ||
      profile.certifications.length
  );
  const hasAuthorization =
    input.authorization.confirmedAt !== null ||
    input.authorization.status !== "undisclosed" ||
    Boolean(
      input.authorization.authorizationStart ||
      input.authorization.authorizationEnd ||
      input.authorization.currentlyAuthorized ||
      input.authorization.sponsorshipNow ||
      input.authorization.sponsorshipFuture
    );
  return hasResumeData || hasAuthorization || input.jobs.length > 0 || input.applications.length > 0;
}

export function emptyCloudResume(): ResumeRecord {
  const now = new Date().toISOString();
  return {
    entry: { id: crypto.randomUUID(), name: "Untitled resume", createdAt: now, updatedAt: now },
    profile: emptyResume
  };
}
