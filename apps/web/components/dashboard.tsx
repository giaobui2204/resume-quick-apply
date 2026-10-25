"use client";

import {
  canonicalAssistUrl,
  type Application,
  type ApplicationAssistPackage,
  type JobSnapshot,
  type ResumeExtraction,
  type WorkAuthorization
} from "@quick-apply/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { emptyAuthorization, emptyResume } from "@/lib/demo-data";
import {
  browserDraftResumeSchema,
  storedAuthorizationSchema,
  storedJobsSchema,
  storedApplicationsSchema,
  readLocal,
  writeLocal
} from "@/lib/storage";

import {
  loadResumeLibrary,
  addResume,
  updateResume,
  selectResume,
  deleteResume,
  renameResume,
  loadResumeProfile,
  clearResumeLibrary,
  hashResumeFile,
  findResumeByHash,
  type ResumeLibrary
} from "@/lib/resume-library";

import { StepNavigation, flow, type View } from "./step-navigation";
import { mergeJobs } from "@/lib/job-workspace";
import { JobDiscoveryPanel } from "./job-discovery-panel";
import { ResumeLibraryPanel } from "./resume-library-panel";
import { ApplicationAssistReview, downloadAssistPackage } from "./application-assist-review";
import { SponsorshipHistoryPanel } from "./sponsorship-history-panel";
const validContact = (profile: ResumeExtraction) =>
  Boolean(profile.contact.legalName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contact.email));
const profileKey = "applypilot.profile";
const authorizationKey = "applypilot.authorization";
const jobsKey = "applypilot.jobs";
const applicationsKey = "applypilot.applications";

export function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [profile, setProfile] = useState<ResumeExtraction>(emptyResume);
  const [authorization, setAuthorization] = useState<WorkAuthorization>(emptyAuthorization);
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [library, setLibrary] = useState<ResumeLibrary>({ activeResumeId: null, resumes: [] });
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [savingResume, setSavingResume] = useState(false);
  const pendingSaves = useRef(0);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");

  function persist<T>(key: string, value: T) {
    if (!writeLocal(key, value))
      setStorageError(
        "Changes are only saved for this session. Browser storage is unavailable or full; keep this tab open and enable local storage before refreshing."
      );
  }

  useEffect(() => {
    let mounted = true;
    const legacy = readLocal(profileKey, emptyResume, browserDraftResumeSchema);
    void loadResumeLibrary(legacy)
      .then(async (next) => {
        const active = next.activeResumeId ? await loadResumeProfile(next.activeResumeId) : legacy;
        if (mounted) {
          setLibrary(next);
          setProfile(active);
        }
      })
      .catch(() => {
        if (mounted) {
          setProfile(legacy);
          setStorageError(
            "Resume library is unavailable. Changes cannot be saved; check your browser storage settings."
          );
        }
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    setAuthorization(readLocal(authorizationKey, emptyAuthorization, storedAuthorizationSchema));
    setJobs(readLocal<JobSnapshot[]>(jobsKey, [], storedJobsSchema));
    setApplications(readLocal<Application[]>(applicationsKey, [], storedApplicationsSchema));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);

  function saveProfile(next: ResumeExtraction) {
    if (libraryBusy || !library.activeResumeId) return;
    setProfile(next);
    if (library.activeResumeId) {
      pendingSaves.current++;
      setSavingResume(true);
      void updateResume(library.activeResumeId, next)
        .then((saved) => setLibrary((current) => ({ ...current, resumes: saved.resumes })))
        .catch(() =>
          setStorageError(
            "Your resume changes could not be saved. Keep this tab open and check browser storage."
          )
        )
        .finally(() => {
          pendingSaves.current--;
          if (!pendingSaves.current) setSavingResume(false);
        });
    }
  }

  function saveAuthorization(next: WorkAuthorization) {
    setAuthorization(next);
    persist(authorizationKey, next);
  }

  function saveJobs(next: JobSnapshot[]) {
    setJobs(next);
    persist(jobsKey, next);
  }

  function saveApplications(next: Application[]) {
    setApplications(next);
    persist(applicationsKey, next);
  }

  async function changeLibrary(action: () => Promise<ResumeLibrary>) {
    setLibraryBusy(true);
    try {
      const next = await action();
      const active = next.activeResumeId ? await loadResumeProfile(next.activeResumeId) : emptyResume;
      setLibrary(next);
      setProfile(active);
      return true;
    } catch {
      setStorageError(
        "Could not update your resume library. Your current resume is unchanged. Check browser storage and try again."
      );
      return false;
    } finally {
      setLibraryBusy(false);
    }
  }

  const profileReady = validContact(profile);

  if (!ready) return <main className="loading">Preparing your workspace…</main>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <div>
            <strong>ApplyPilot</strong>
            <small>Quick apply, verified</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {(
            [
              ["overview", "Overview"],
              ["resume", "Resume"],
              ["profile", "Application profile"],
              ["jobs", "Jobs"],
              ["applications", "Applications"],
              ["settings", "Settings"]
            ] as [View, string][]
          ).map(([key, label]) => (
            <button
              aria-current={view === key ? "page" : undefined}
              className={view === key ? "nav-item active" : "nav-item"}
              key={key}
              onClick={() => setView(key)}
            >
              <span className="nav-dot" />
              {label}
            </button>
          ))}
        </nav>
        <div className="privacy-note">
          <span>◎</span>
          <div>
            <strong>Your facts stay yours</strong>
            <small>AI never invents application answers.</small>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">INTERNATIONAL STUDENT CAREER TOOL</p>
          </div>
          <div className="status-pill">
            <span /> Local preview
          </div>
        </header>
        {storageError && (
          <div className="notice warning" role="alert">
            {storageError}
          </div>
        )}
        {flow.some(([step]) => step === view) && (
          <div className="flow-header" aria-label="Application steps">
            {flow.map(([step, label], index) => (
              <span
                key={step}
                className={view === step ? "flow-step current" : "flow-step"}
                aria-current={view === step ? "step" : undefined}
              >
                <b>{index + 1}</b>
                {label}
              </span>
            ))}
          </div>
        )}
        {flow.some(([step]) => step === view) && view !== "resume" && (
          <div className="resume-context">
            <span>
              Active resume:{" "}
              <strong>
                {library.resumes.find((item) => item.id === library.activeResumeId)?.name ??
                  "No saved resume"}
              </strong>
            </span>
            <button className="text-button" onClick={() => setView("resume")}>
              Change resume
            </button>
          </div>
        )}
        {view === "overview" && (
          <Overview profileReady={profileReady} jobs={jobs} applications={applications} navigate={setView} />
        )}
        {view === "resume" && (
          <ResumeView
            editorDisabled={libraryBusy || !library.activeResumeId}
            referencedResumeIds={
              new Set(applications.map((item) => item.resumeId).filter((id): id is string => Boolean(id)))
            }
            profile={profile}
            onSave={saveProfile}
            library={library}
            libraryBusy={libraryBusy || savingResume}
            onUpload={(value, name, hash) => changeLibrary(() => addResume(value, name, hash))}
            onExisting={(id) => changeLibrary(() => selectResume(id))}
            onSelect={(id) => void changeLibrary(() => selectResume(id))}
            onAdd={() => void changeLibrary(() => addResume(emptyResume, "Untitled resume"))}
            onRename={(id, name) => void changeLibrary(() => renameResume(id, name))}
            onDelete={(id) => {
              if (applications.some((item) => item.resumeId === id)) {
                setStorageError(
                  "This resume is used by application history. Remove those applications before deleting it."
                );
                return;
              }
              void changeLibrary(() => deleteResume(id));
            }}
          />
        )}
        {view === "profile" && (
          <fieldset className="profile-editing" disabled={libraryBusy || !library.activeResumeId}>
            <ProfileView
              profile={profile}
              authorization={authorization}
              onProfile={saveProfile}
              onAuthorization={saveAuthorization}
            />
          </fieldset>
        )}
        {view === "jobs" && (
          <JobsView
            resumeId={library.activeResumeId}
            resumeName={library.resumes.find((item) => item.id === library.activeResumeId)?.name}
            jobs={jobs}
            applications={applications}
            onJobs={saveJobs}
            onApplications={saveApplications}
          />
        )}
        {view === "applications" && (
          <ApplicationsView
            applications={applications}
            profile={profile}
            onApplications={saveApplications}
            canPrepare={profileReady && Boolean(authorization.confirmedAt) && !libraryBusy && !savingResume}
            activeResumeId={library.activeResumeId}
            activeResumeName={library.resumes.find((item) => item.id === library.activeResumeId)?.name}
            onReview={(id) => {
              void (
                id && id !== library.activeResumeId
                  ? changeLibrary(() => selectResume(id))
                  : Promise.resolve(true)
              ).then((ok) => {
                if (ok) setView("profile");
              });
            }}
          />
        )}
        {view === "settings" && (
          <SettingsView
            busy={libraryBusy || savingResume}
            onReset={() => {
              setLibraryBusy(true);
              void clearResumeLibrary()
                .then(() => {
                  [profileKey, authorizationKey, jobsKey, applicationsKey].forEach((key) =>
                    localStorage.removeItem(key)
                  );
                  setLibrary({ activeResumeId: null, resumes: [] });
                  setProfile(emptyResume);
                  setAuthorization(emptyAuthorization);
                  setJobs([]);
                  setApplications([]);
                  return loadResumeLibrary(emptyResume);
                })
                .then(setLibrary)
                .catch(() =>
                  setStorageError("Could not clear your local data. Check browser storage and try again.")
                )
                .finally(() => setLibraryBusy(false));
            }}
          />
        )}

        {flow.some(([step]) => step === view) && (
          <StepNavigation view={view} navigate={setView} jobCount={applications.length} />
        )}
      </main>
    </div>
  );
}

function Overview({
  profileReady,
  jobs,
  applications,
  navigate
}: {
  profileReady: boolean;
  jobs: JobSnapshot[];
  applications: Application[];
  navigate: (view: View) => void;
}) {
  const submitted = applications.filter((a) => a.status === "submitted").length;
  const review = applications.filter((a) => a.status === "review_required").length;
  return (
    <section className="page">
      <div className="hero">
        <div>
          <span className="tag">CONTROLLED AUTOMATION</span>
          <h1>
            Apply faster.
            <br />
            <em>Stay truthful.</em>
          </h1>
          <p>
            Build one verified career profile, understand sponsorship language, and prepare job applications
            without repetitive typing.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={() => navigate(profileReady ? "jobs" : "resume")}>
              {profileReady ? "Discover jobs" : "Upload your resume"} <span>→</span>
            </button>
            <button className="secondary" onClick={() => navigate("profile")}>
              Review profile
            </button>
          </div>
        </div>
        <div className="hero-card">
          <p>YOUR APPLICATION ENGINE</p>
          <div className="metric">
            <strong>{jobs.length}</strong>
            <span>jobs analyzed</span>
          </div>
          <div className="metric">
            <strong>{review}</strong>
            <span>ready to review</span>
          </div>
          <div className="metric">
            <strong>{submitted}</strong>
            <span>submitted</span>
          </div>
          <div className="safe-row">
            <span>✓</span> Final confirmation always required
          </div>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">GET STARTED</p>
          <h2>Your guided application journey</h2>
        </div>
      </div>
      <div className="steps">
        <Step
          number="01"
          title="Verify your story"
          text="Upload a resume, inspect every extracted fact, and correct anything that needs attention."
          action="Open resume"
          onClick={() => navigate("resume")}
          done={profileReady}
        />
        <Step
          number="02"
          title="Check sponsorship"
          text="Discover jobs across supported company boards and inspect evidence for sponsorship signals."
          action="Find jobs"
          onClick={() => navigate("jobs")}
          done={jobs.length > 0}
        />
        <Step
          number="03"
          title="Fill, review, submit"
          text="The extension fills verified answers. You review every application before the final action."
          action="View queue"
          onClick={() => navigate("applications")}
          done={submitted > 0}
        />
      </div>
    </section>
  );
}

function Step({
  number,
  title,
  text,
  action,
  onClick,
  done
}: {
  number: string;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
  done: boolean;
}) {
  return (
    <article className="step-card">
      <div className="step-top">
        <span>{number}</span>
        {done && <b>COMPLETE</b>}
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="text-button" onClick={onClick}>
        {action} →
      </button>
    </article>
  );
}

function ResumeView({
  editorDisabled,
  referencedResumeIds,
  profile,
  onSave,
  library,
  libraryBusy,
  onUpload,
  onExisting,
  onSelect,
  onAdd,
  onRename,
  onDelete
}: {
  editorDisabled: boolean;
  referencedResumeIds: Set<string>;
  profile: ResumeExtraction;
  onSave: (profile: ResumeExtraction) => void;
  library: ResumeLibrary;
  libraryBusy: boolean;
  onUpload: (profile: ResumeExtraction, name: string, hash: string) => Promise<boolean>;
  onExisting: (id: string) => Promise<boolean>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const uploading = useRef(false);
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => uploadController.current?.abort(), []);

  async function upload(file?: File) {
    if (!file || uploading.current || libraryBusy) return;
    if (file.size > 10 * 1024 * 1024) {
      setMessage("Resume must be 10 MB or smaller.");
      return;
    }
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setMessage("Only PDF and DOCX resumes are supported.");
      return;
    }
    uploading.current = true;
    const controller = new AbortController();
    uploadController.current = controller;
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.append("resume", file);
    try {
      const hash = await hashResumeFile(file);
      const existing = await findResumeByHash(hash);
      if (controller.signal.aborted) return;
      if (existing) {
        if (await onExisting(existing.id))
          setMessage(
            "This resume is already saved. Switched to the existing version without extracting it again."
          );
        return;
      }
      const response = await fetch("/api/resumes/extract", {
        method: "POST",
        body: form,
        signal: controller.signal
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not parse resume");
      if (controller.signal.aborted) return;
      if (!(await onUpload(body.profile, file.name.replace(/\.(pdf|docx)$/i, ""), hash))) return;
      setMessage("Resume extracted. Review every field before using it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="page narrow">
      <PageTitle
        eyebrow="STEP 1 · RESUME"
        title="Turn your resume into verified facts"
        text="PDF and DOCX up to 10 MB. Extracted details are never trusted until you review them."
      />
      <ResumeLibraryPanel
        referencedResumeIds={referencedResumeIds}
        library={library}
        busy={busy || libraryBusy}
        onAdd={onAdd}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={onDelete}
      />
      <label
        className="upload-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files[0]);
        }}
        aria-busy={busy}
      >
        <input
          type="file"
          aria-label="Choose a resume"
          disabled={busy || libraryBusy}
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className="upload-icon">↥</span>
        <strong>{busy ? "Reading your resume…" : "Choose a resume"}</strong>
        <small>or drop PDF / DOCX here</small>
      </label>
      {message && <div className="notice">{message}</div>}
      <fieldset className="profile-editing" disabled={editorDisabled}>
        <ProfileEditor profile={profile} onSave={onSave} compact />
      </fieldset>
    </section>
  );
}

function ProfileView({
  profile,
  authorization,
  onProfile,
  onAuthorization
}: {
  profile: ResumeExtraction;
  authorization: WorkAuthorization;
  onProfile: (value: ResumeExtraction) => void;
  onAuthorization: (value: WorkAuthorization) => void;
}) {
  return (
    <section className="page narrow">
      <PageTitle
        eyebrow="STEP 2 · VERIFIED PROFILE"
        title="Only approved information gets reused"
        text="Work authorization is entered explicitly and never inferred from your resume."
      />
      <ProfileEditor profile={profile} onSave={onProfile} />
      <div className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">WORK AUTHORIZATION</p>
            <h3>Your current situation</h3>
          </div>
          <span className={authorization.confirmedAt ? "verified" : "unverified"}>
            {authorization.confirmedAt ? "VERIFIED" : "NOT VERIFIED"}
          </span>
        </div>
        <div className="form-grid">
          <Field label="Current status">
            <select
              value={authorization.status}
              onChange={(e) =>
                onAuthorization({
                  ...authorization,
                  status: e.target.value as WorkAuthorization["status"],
                  confirmedAt: null
                })
              }
            >
              <option value="undisclosed">Prefer not to specify</option>
              <option value="cpt">CPT</option>
              <option value="opt">OPT</option>
              <option value="stem_opt">STEM OPT</option>
              <option value="h1b">H-1B</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Authorization end date">
            <input
              type="date"
              value={authorization.authorizationEnd}
              onChange={(e) =>
                onAuthorization({ ...authorization, authorizationEnd: e.target.value, confirmedAt: null })
              }
            />
          </Field>
        </div>
        <Check
          label="I am currently authorized to work in the United States"
          checked={authorization.currentlyAuthorized}
          onChange={(value) =>
            onAuthorization({ ...authorization, currentlyAuthorized: value, confirmedAt: null })
          }
        />
        <Check
          label="I require employer sponsorship now"
          checked={authorization.sponsorshipNow}
          onChange={(value) =>
            onAuthorization({ ...authorization, sponsorshipNow: value, confirmedAt: null })
          }
        />
        <Check
          label="I will require employer sponsorship in the future"
          checked={authorization.sponsorshipFuture}
          onChange={(value) =>
            onAuthorization({ ...authorization, sponsorshipFuture: value, confirmedAt: null })
          }
        />
        <button
          className="primary"
          onClick={() => onAuthorization({ ...authorization, confirmedAt: new Date().toISOString() })}
        >
          Confirm authorization answers
        </button>
      </div>
    </section>
  );
}

function ProfileEditor({
  profile,
  onSave,
  compact = false
}: {
  profile: ResumeExtraction;
  onSave: (value: ResumeExtraction) => void;
  compact?: boolean;
}) {
  const contact = profile.contact;
  const update = (key: keyof typeof contact, value: string) =>
    onSave({ ...profile, contact: { ...contact, [key]: value } });
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PERSONAL INFORMATION</p>
          <h3>Contact details</h3>
        </div>
        <span className={validContact(profile) ? "verified" : "unverified"}>
          {validContact(profile) ? "READY" : "INCOMPLETE"}
        </span>
      </div>
      <div className="form-grid">
        <Field label="Legal name">
          <input
            value={contact.legalName}
            onChange={(e) => update("legalName", e.target.value)}
            placeholder="Your full legal name"
          />
        </Field>
        <Field label="Preferred name">
          <input
            value={contact.preferredName}
            onChange={(e) => update("preferredName", e.target.value)}
            placeholder="What should employers call you?"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={contact.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Phone">
          <input
            value={contact.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+1 555 123 4567"
          />
        </Field>
        <Field label="Location">
          <input
            value={contact.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder="San Francisco, CA"
          />
        </Field>
        <Field label="LinkedIn">
          <input
            value={contact.linkedIn}
            onChange={(e) => update("linkedIn", e.target.value)}
            placeholder="https://linkedin.com/in/…"
          />
        </Field>
        <Field label="GitHub">
          <input value={contact.github} onChange={(e) => update("github", e.target.value)} />
        </Field>
        <Field label="Portfolio">
          <input value={contact.portfolio} onChange={(e) => update("portfolio", e.target.value)} />
        </Field>
      </div>
      {!compact && (
        <>
          <Field label="Professional summary">
            <textarea
              rows={4}
              value={profile.summary}
              onChange={(e) => onSave({ ...profile, summary: e.target.value })}
            />
          </Field>
          <Field label="Skills (comma separated)">
            <input
              value={profile.skills.join(", ")}
              onChange={(e) =>
                onSave({
                  ...profile,
                  skills: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                })
              }
            />
          </Field>
          <Field label="Certifications (one per line)">
            <textarea
              value={profile.certifications.join("\n")}
              onChange={(e) => onSave({ ...profile, certifications: e.target.value.split("\n") })}
            />
          </Field>
          {(["experiences", "educations", "projects"] as const).map((section) => (
            <section key={section}>
              <h3>
                {section === "experiences"
                  ? "Experience"
                  : section === "educations"
                    ? "Education"
                    : "Projects"}
              </h3>
              {profile[section].length === 0 && <p className="muted">No entries extracted.</p>}
              {profile[section].map((entry, index) => (
                <fieldset key={entry.id}>
                  <legend>
                    {section === "experiences"
                      ? "Experience"
                      : section === "educations"
                        ? "Education"
                        : "Project"}{" "}
                    {index + 1}
                  </legend>
                  {Object.entries(entry)
                    .filter(([key]) => key !== "id")
                    .map(([key, value]) => {
                      const label = key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (letter) => letter.toUpperCase());
                      const change = (next: string | boolean | string[]) =>
                        onSave({
                          ...profile,
                          [section]: profile[section].map((item, i) =>
                            i === index ? { ...item, [key]: next } : item
                          )
                        });
                      if (typeof value === "boolean")
                        return <Check key={key} label={label} checked={value} onChange={change} />;
                      return (
                        <Field key={key} label={Array.isArray(value) ? `${label} (one per line)` : label}>
                          {Array.isArray(value) ? (
                            <textarea
                              value={value.join("\n")}
                              onChange={(e) => change(e.target.value.split("\n"))}
                            />
                          ) : (
                            <input value={value} onChange={(e) => change(e.target.value)} />
                          )}
                        </Field>
                      );
                    })}
                </fieldset>
              ))}
            </section>
          ))}
          {profile.warnings.length > 0 && (
            <div className="notice warning" role="status">
              {profile.warnings.join(" · ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function JobsView({
  jobs,
  applications,
  onJobs,
  onApplications,
  resumeId,
  resumeName
}: {
  resumeId: string | null;
  resumeName?: string;
  jobs: JobSnapshot[];
  applications: Application[];
  onJobs: (jobs: JobSnapshot[]) => void;
  onApplications: (applications: Application[]) => void;
}) {
  const [discovering, setDiscovering] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [visibleUrls, setVisibleUrls] = useState<Set<string> | null>(null);
  const importController = useRef<AbortController | null>(null);
  useEffect(() => () => importController.current?.abort(), []);
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    const list = [...new Set(urls.split(/\s+/).filter(Boolean))];
    if (!list.length) {
      setError("Paste at least one job link.");
      return;
    }
    if (list.length > 25) {
      setError("Analyze up to 25 links at a time.");
      return;
    }
    const controller = new AbortController();
    importController.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/jobs/import", {
        signal: controller.signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: list })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not import jobs");
      if (controller.signal.aborted) return;
      onJobs(mergeJobs(jobs, body.jobs));
      setVisibleUrls(new Set(body.jobs.map((job: JobSnapshot) => job.canonicalUrl)));
      setImportedCount(new Set(body.jobs.map((job: JobSnapshot) => job.canonicalUrl)).size);
      setUrls("");
      if (body.errors.length) setError(body.errors.join(" · "));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function queue(job: JobSnapshot) {
    if (applications.some((item) => item.job.canonicalUrl === job.canonicalUrl)) return;
    if (
      applications.filter((item) => !["submitted", "failed", "skipped", "expired"].includes(item.status))
        .length >= 25
    ) {
      setError("The queue holds up to 25 active applications.");
      return;
    }
    const now = new Date().toISOString();
    onApplications([
      ...applications,
      {
        id: crypto.randomUUID(),
        job,
        resumeId,
        resumeName,
        status: "queued",
        queuePosition: applications.length,
        blockedReason: null,
        fields: [],
        createdAt: now,
        updatedAt: now
      }
    ]);
  }

  const jobsByUrl = new Map(jobs.map((job) => [job.canonicalUrl, job]));
  const visibleJobs = visibleUrls
    ? [...visibleUrls].flatMap((url) => {
        const job = jobsByUrl.get(url);
        return job ? [job] : [];
      })
    : jobs;

  return (
    <section className="page jobs-page">
      <div className="jobs-masthead">
        <p className="eyebrow">STEP 3 / YOUR NEXT CHAPTER</p>
        <h1>
          Find your next <em>move.</em>
        </h1>
        <p>Real openings. Clear sponsorship evidence. A search built around you.</p>
      </div>
      <JobDiscoveryPanel
        importedCount={importedCount}
        disabled={busy}
        onBusy={setDiscovering}
        onError={setError}
        onResults={(found, append) => {
          setImportedCount(null);
          setVisibleUrls(
            (previous) =>
              new Set([...(append && previous ? previous : []), ...found.map((job) => job.canonicalUrl)])
          );
          onJobs(mergeJobs(jobs, found));
        }}
      >
        <details className="manual-import">
          <summary>Have a specific job link? Import it manually</summary>
          <div className="url-box">
            <textarea
              aria-label="Job links"
              rows={4}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={
                "Paste up to 25 job links, one per line\nhttps://boards.greenhouse.io/…\nhttps://jobs.lever.co/…"
              }
            />
            <button className="primary" onClick={analyze} disabled={busy || discovering}>
              {busy ? "Analyzing…" : "Analyze jobs"} <span>→</span>
            </button>
          </div>
        </details>
        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}
        <div className="job-list">
          {visibleJobs.length === 0 && !discovering && (
            <Empty
              title={error ? "No results could be shown" : "No matches for these filters"}
              text={
                error
                  ? "Check the source error above and try again."
                  : "Try a broader role, Any level, or Not specified. You can also import a specific posting."
              }
            />
          )}
          {discovering && (
            <p role="status" className="muted">
              Searching supported boards…
            </p>
          )}
          {visibleJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              queued={applications.some((a) => a.job.canonicalUrl === job.canonicalUrl)}
              onQueue={() => queue(job)}
            />
          ))}
        </div>
      </JobDiscoveryPanel>
    </section>
  );
}

function JobCard({ job, queued, onQueue }: { job: JobSnapshot; queued: boolean; onQueue: () => void }) {
  const labels: [string, string][] = job.sponsorship
    ? [
        ["CPT", job.sponsorship.cpt.label],
        ["OPT", job.sponsorship.opt.label],
        ["STEM OPT", job.sponsorship.stemOpt.label],
        ["H-1B now", job.sponsorship.h1bNow.label],
        ["H-1B future", job.sponsorship.h1bFuture.label]
      ]
    : [];
  return (
    <article className="job-card">
      <div className="job-main">
        <div className="job-card-kicker">
          <span className="ats">{job.provider ?? job.ats ?? "External"}</span>
          <span className="experience-badge">
            {
              {
                intern: "Internship",
                entry: "Entry / new grad",
                mid: "Mid level",
                senior: "Senior",
                lead: "Staff / lead",
                management: "Management",
                unknown: "Level not specified"
              }[job.classification?.experience ?? "unknown"]
            }
          </span>
        </div>
        <h3>{job.title}</h3>
        <p>
          {job.company} · {job.location || "Location not listed"}
        </p>
        <div className="job-meta">
          <span>
            {
              { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "Work mode not specified" }[
                job.classification?.workMode ?? "unknown"
              ]
            }
          </span>
          <span>
            {
              {
                full_time: "Full-time",
                part_time: "Part-time",
                contract: "Contract",
                internship: "Internship",
                unknown: "Employment not specified"
              }[job.classification?.employment ?? "unknown"]
            }
          </span>
          {job.postedDate && (
            <time dateTime={job.postedDate}>
              {job.provider === "remotive" ? "Published on Remotive" : "Source publication date"}:{" "}
              {job.postedDate}
            </time>
          )}
        </div>
        {job.classification && (
          <details className="classification-evidence">
            <summary>How this role is classified</summary>
            {Object.entries(job.classification.evidence).map(([key, evidence]) => (
              <p key={key}>
                <strong>
                  {key === "workMode" ? "Work mode" : key === "experience" ? "Level" : "Employment"}:
                </strong>{" "}
                {evidence.length ? evidence.join(" · ") : "Not specified by a clear employer signal."}
              </p>
            ))}
          </details>
        )}
      </div>
      {labels.length > 0 && (
        <div className="sponsor-labels">
          {labels.map(([name, label]) => (
            <span key={name} className={`sponsor ${label}`}>
              {name}: {label.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      )}
      {job.provider && !["greenhouse", "lever"].includes(job.provider) && (
        <p className="muted external-apply-note">
          Apply through the source posting. Extension filling is supported only on Greenhouse and Lever forms.
        </p>
      )}
      <SponsorshipHistoryPanel job={job} />
      <div className="job-actions">
        {job.attribution && (
          <a className="job-attribution" href={job.attribution.url} target="_blank" rel="noreferrer">
            Source: {job.attribution.label}
          </a>
        )}
        <a href={job.applyUrl} target="_blank" rel="noreferrer">
          {job.provider === "remotive"
            ? "View on Remotive ↗"
            : job.provider === "ashby"
              ? "Apply on Ashby ↗"
              : job.provider === "himalayas"
                ? "View on Himalayas ↗"
                : job.provider === "remoteok"
                  ? "View on Remote OK ↗"
                  : "View posting ↗"}
        </a>
        <button className="primary small" onClick={onQueue} disabled={queued}>
          {queued ? "In queue" : "Add to queue"}
        </button>
      </div>
    </article>
  );
}

function ApplicationsView({
  applications,
  profile,
  onApplications,
  canPrepare,
  activeResumeId,
  activeResumeName,
  onReview
}: {
  applications: Application[];
  profile: ResumeExtraction;
  onApplications: (items: Application[]) => void;
  canPrepare: boolean;
  activeResumeId: string | null;
  activeResumeName?: string;
  onReview: (id?: string | null) => void;
}) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"submitted" | "submission_unknown" | "blocked">(
    "submission_unknown"
  );
  const [outcomeConfirmed, setOutcomeConfirmed] = useState(false);
  const reviewing = applications.find((item) => item.id === reviewingId);
  function replace(id: string, patch: Partial<Application>) {
    onApplications(
      applications.map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
      )
    );
  }
  function confirmPackage(value: ApplicationAssistPackage) {
    replace(value.applicationId, {
      assistPackage: value,
      resumeId: value.resume.id,
      resumeName: value.resume.name,
      status: "ready"
    });
    downloadAssistPackage(value);
    setReviewingId(null);
  }
  const labels: Partial<Record<Application["status"], string>> = {
    queued: "Not prepared",
    review_required: "Review required",
    ready: "Package prepared",
    submitted: "Submitted · self-reported",
    submission_unknown: "Outcome unknown",
    blocked: "Needs manual help"
  };
  return (
    <section className="page">
      <PageTitle
        eyebrow="STEP 4 · APPLICATION ASSIST"
        title="Review your facts, then apply"
        text="Prepare a reviewed package for the extension. Fill selected fields on a matching Greenhouse or Lever form, attach your resume, and click the employer’s Submit button yourself."
      />
      <p className="notice">
        Downloading a package or opening a form does not submit an application. Import the JSON in the
        extension, review detected fields, then choose Fill selected fields. Record the outcome here
        afterward.
      </p>
      {reviewing && activeResumeId && (!reviewing.resumeId || reviewing.resumeId === activeResumeId) && (
        <ApplicationAssistReview
          key={reviewing.id}
          application={reviewing}
          profile={profile}
          resumeId={activeResumeId}
          resumeName={activeResumeName ?? "Selected resume"}
          onConfirm={confirmPackage}
          onCancel={() => {
            setReviewingId(null);
            if (!reviewing.assistPackage) replace(reviewing.id, { status: "queued" });
          }}
        />
      )}
      {!canPrepare && applications.length > 0 && (
        <p className="notice">
          Review the selected resume’s contact details and confirm your authorization answers before preparing
          a package. Sensitive answers stay manual on the employer’s form.
        </p>
      )}
      <div className="queue">
        {applications.length === 0 && (
          <Empty title="Your queue is empty" text="Find a job and add it to the queue." />
        )}
        {applications.map((application, index) => {
          const supported = Boolean(canonicalAssistUrl(application.job.canonicalUrl));
          const wrongResume = Boolean(application.resumeId && application.resumeId !== activeResumeId);
          return (
            <article className="queue-item" key={application.id}>
              <span className="queue-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{application.job.title}</h3>
                <p>
                  {application.job.company} · {application.job.provider ?? application.job.ats ?? "External"}
                </p>
                {application.resumeName && <small className="muted">Resume: {application.resumeName}</small>}
                {application.assistPackage && (
                  <small className="muted">
                    {" "}
                    · Snapshot: {new Date(application.assistPackage.reviewedAt).toLocaleString()}
                  </small>
                )}
              </div>
              <span className={`state ${application.status}`}>
                {application.status === "ready" && !application.assistPackage
                  ? "Application opened manually"
                  : (labels[application.status] ?? application.status.replaceAll("_", " "))}
              </span>
              <div className="queue-actions">
                {supported && application.status !== "submitted" && (
                  <button
                    disabled={!canPrepare || wrongResume || !activeResumeId}
                    onClick={() => {
                      setReviewingId(application.id);
                      replace(application.id, { status: "review_required" });
                    }}
                  >
                    {application.assistPackage ? "Review new snapshot" : "Prepare"}
                  </button>
                )}
                {supported && (!canPrepare || wrongResume) && (
                  <button onClick={() => onReview(application.resumeId)}>Review this resume</button>
                )}
                {application.assistPackage && (
                  <button onClick={() => downloadAssistPackage(application.assistPackage!)}>
                    Download saved package
                  </button>
                )}
                <a
                  href={application.job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    replace(application.id, {
                      openedAt: new Date().toISOString(),
                      ...(!supported ? { status: "ready" } : {})
                    })
                  }
                >
                  {supported ? "Open form ↗" : "Open application manually ↗"}
                </a>
                {!supported && <small>Extension autofill is unavailable for this source.</small>}
                <button
                  disabled={
                    !application.openedAt ||
                    application.status === "queued" ||
                    application.status === "review_required"
                  }
                  onClick={() => {
                    if (
                      !application.openedAt ||
                      application.status === "queued" ||
                      application.status === "review_required"
                    )
                      return;
                    setOutcomeId(application.id);
                    setOutcome("submission_unknown");
                    setOutcomeConfirmed(false);
                  }}
                >
                  Record outcome
                </button>
                <button
                  className="ghost-danger"
                  onClick={() => {
                    if (reviewingId === application.id) setReviewingId(null);
                    if (outcomeId === application.id) setOutcomeId(null);
                    onApplications(
                      applications
                        .filter((item) => item.id !== application.id)
                        .map((item, queuePosition) => ({ ...item, queuePosition }))
                    );
                  }}
                >
                  Remove
                </button>
              </div>
              {outcomeId === application.id && (
                <div className="outcome-review" role="group" aria-label="Confirm application outcome">
                  <p>
                    Record what happened on the employer’s website. ApplyPilot cannot verify its submission.
                  </p>
                  <label className="field">
                    <span>Application outcome</span>
                    <select
                      aria-label="Application outcome"
                      value={outcome}
                      onChange={(event) => {
                        setOutcome(event.target.value as typeof outcome);
                        setOutcomeConfirmed(false);
                      }}
                    >
                      <option value="submission_unknown">I cannot confirm the outcome</option>
                      <option value="submitted">I submitted on the employer’s website</option>
                      <option value="blocked">I need manual help</option>
                    </select>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={outcomeConfirmed}
                      onChange={(event) => setOutcomeConfirmed(event.target.checked)}
                    />
                    I confirm this is my report of the external application outcome.
                  </label>
                  <button
                    disabled={!outcomeConfirmed}
                    onClick={() => {
                      replace(application.id, {
                        status: outcome,
                        outcomeSource: "self_report",
                        ...(outcome === "submitted"
                          ? { submissionConfirmedAt: new Date().toISOString() }
                          : { submissionConfirmedAt: undefined })
                      });
                      setOutcomeId(null);
                    }}
                  >
                    Save confirmed outcome
                  </button>
                  <button onClick={() => setOutcomeId(null)}>Cancel</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SettingsView({ onReset, busy }: { onReset: () => void; busy: boolean }) {
  return (
    <section className="page narrow">
      <PageTitle
        eyebrow="SETTINGS"
        title="Privacy and local preview"
        text="This development build stores profile and queue data in your browser. Configure Supabase before production use."
      />
      <div className="panel">
        <h3>Browser extension</h3>
        <p className="muted">
          Build the extension, load its <code>dist</code> folder in Chrome, and open a supported application
          page.
        </p>
        <code className="command">npm run build -w @quick-apply/extension</code>
      </div>
      <div className="panel danger-panel">
        <h3>Delete preview data</h3>
        <p className="muted">
          Remove the resume profile, authorization answers, analyzed jobs, and queue from this browser.
        </p>
        <button
          className="danger"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Delete all local resume, profile, job, and application data? This cannot be undone."
              )
            )
              onReset();
          }}
        >
          Delete local data
        </button>
      </div>
    </section>
  );
}

function PageTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="page-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Check({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span>◇</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
