"use client";

import type {
  Application,
  JobSnapshot,
  ResumeExtraction,
  WorkAuthorization
} from "@quick-apply/shared";
import { useEffect, useMemo, useState } from "react";
import { emptyAuthorization, emptyResume } from "@/lib/demo-data";
import { readLocal, writeLocal } from "@/lib/storage";

type View = "overview" | "resume" | "profile" | "jobs" | "applications" | "settings";
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProfile(readLocal(profileKey, emptyResume));
    setAuthorization(readLocal(authorizationKey, emptyAuthorization));
    setJobs(readLocal(jobsKey, []));
    setApplications(readLocal(applicationsKey, []));
    setReady(true);
  }, []);

  function saveProfile(next: ResumeExtraction) {
    setProfile(next);
    writeLocal(profileKey, next);
  }

  function saveAuthorization(next: WorkAuthorization) {
    setAuthorization(next);
    writeLocal(authorizationKey, next);
  }

  function saveJobs(next: JobSnapshot[]) {
    setJobs(next);
    writeLocal(jobsKey, next);
  }

  function saveApplications(next: Application[]) {
    setApplications(next);
    writeLocal(applicationsKey, next);
  }

  const profileReady = Boolean(profile.contact.legalName && profile.contact.email);
  const activeCount = applications.filter((item) =>
    !["submitted", "failed", "skipped", "expired"].includes(item.status)
  ).length;

  if (!ready) return <main className="loading">Preparing your workspace…</main>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <div><strong>ApplyPilot</strong><small>Quick apply, verified</small></div>
        </div>
        <nav aria-label="Main navigation">
          {([
            ["overview", "Overview"],
            ["resume", "Resume"],
            ["profile", "Application profile"],
            ["jobs", "Jobs"],
            ["applications", "Applications"],
            ["settings", "Settings"]
          ] as [View, string][]).map(([key, label]) => (
            <button className={view === key ? "nav-item active" : "nav-item"} key={key} onClick={() => setView(key)}>
              <span className="nav-dot" />{label}
            </button>
          ))}
        </nav>
        <div className="privacy-note">
          <span>◎</span>
          <div><strong>Your facts stay yours</strong><small>AI never invents application answers.</small></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><p className="eyebrow">INTERNATIONAL STUDENT CAREER TOOL</p></div>
          <div className="status-pill"><span /> Local preview</div>
        </header>
        {view === "overview" && <Overview profileReady={profileReady} jobs={jobs} applications={applications} navigate={setView} />}
        {view === "resume" && <ResumeView profile={profile} onSave={saveProfile} />}
        {view === "profile" && <ProfileView profile={profile} authorization={authorization} onProfile={saveProfile} onAuthorization={saveAuthorization} />}
        {view === "jobs" && <JobsView jobs={jobs} applications={applications} onJobs={saveJobs} onApplications={saveApplications} />}
        {view === "applications" && <ApplicationsView applications={applications} onApplications={saveApplications} />}
        {view === "settings" && <SettingsView onReset={() => {
          [profileKey, authorizationKey, jobsKey, applicationsKey].forEach((key) => localStorage.removeItem(key));
          setProfile(emptyResume); setAuthorization(emptyAuthorization); setJobs([]); setApplications([]);
        }} />}
      </main>
    </div>
  );
}

function Overview({ profileReady, jobs, applications, navigate }: {
  profileReady: boolean; jobs: JobSnapshot[]; applications: Application[]; navigate: (view: View) => void;
}) {
  const submitted = applications.filter((a) => a.status === "submitted").length;
  const review = applications.filter((a) => a.status === "review_required").length;
  return <section className="page">
    <div className="hero">
      <div>
        <span className="tag">CONTROLLED AUTOMATION</span>
        <h1>Apply faster.<br /><em>Stay truthful.</em></h1>
        <p>Build one verified career profile, understand sponsorship language, and prepare job applications without repetitive typing.</p>
        <div className="hero-actions">
          <button className="primary" onClick={() => navigate(profileReady ? "jobs" : "resume")}>{profileReady ? "Add job links" : "Upload your resume"} <span>→</span></button>
          <button className="secondary" onClick={() => navigate("profile")}>Review profile</button>
        </div>
      </div>
      <div className="hero-card">
        <p>YOUR APPLICATION ENGINE</p>
        <div className="metric"><strong>{jobs.length}</strong><span>jobs analyzed</span></div>
        <div className="metric"><strong>{review}</strong><span>ready to review</span></div>
        <div className="metric"><strong>{submitted}</strong><span>submitted</span></div>
        <div className="safe-row"><span>✓</span> Final confirmation always required</div>
      </div>
    </div>
    <div className="section-heading"><div><p className="eyebrow">GET STARTED</p><h2>Three careful steps</h2></div></div>
    <div className="steps">
      <Step number="01" title="Verify your story" text="Upload a resume, inspect every extracted fact, and correct anything that needs attention." action="Open resume" onClick={() => navigate("resume")} done={profileReady} />
      <Step number="02" title="Check sponsorship" text="Paste Greenhouse or Lever links and see evidence-based CPT, OPT, STEM OPT, and H-1B signals." action="Add jobs" onClick={() => navigate("jobs")} done={jobs.length > 0} />
      <Step number="03" title="Fill, review, submit" text="The extension fills verified answers. You review every application before the final action." action="View queue" onClick={() => navigate("applications")} done={submitted > 0} />
    </div>
  </section>;
}

function Step({ number, title, text, action, onClick, done }: { number: string; title: string; text: string; action: string; onClick: () => void; done: boolean }) {
  return <article className="step-card">
    <div className="step-top"><span>{number}</span>{done && <b>COMPLETE</b>}</div>
    <h3>{title}</h3><p>{text}</p><button className="text-button" onClick={onClick}>{action} →</button>
  </article>;
}

function ResumeView({ profile, onSave }: { profile: ResumeExtraction; onSave: (profile: ResumeExtraction) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setMessage("");
    const form = new FormData(); form.append("resume", file);
    try {
      const response = await fetch("/api/resumes/extract", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not parse resume");
      onSave(body.profile);
      setMessage("Resume extracted. Review every field before using it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally { setBusy(false); }
  }

  return <section className="page narrow">
    <PageTitle eyebrow="MVP 1 · RESUME" title="Turn your resume into verified facts" text="PDF and DOCX up to 10 MB. Extracted details are never trusted until you review them." />
    <label className="upload-zone">
      <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => upload(e.target.files?.[0])} />
      <span className="upload-icon">↥</span>
      <strong>{busy ? "Reading your resume…" : "Choose a resume"}</strong>
      <small>or drop PDF / DOCX here</small>
    </label>
    {message && <div className="notice">{message}</div>}
    <ProfileEditor profile={profile} onSave={onSave} compact />
  </section>;
}

function ProfileView({ profile, authorization, onProfile, onAuthorization }: {
  profile: ResumeExtraction; authorization: WorkAuthorization;
  onProfile: (value: ResumeExtraction) => void; onAuthorization: (value: WorkAuthorization) => void;
}) {
  return <section className="page narrow">
    <PageTitle eyebrow="MVP 2 · VERIFIED PROFILE" title="Only approved information gets reused" text="Work authorization is entered explicitly and never inferred from your resume." />
    <ProfileEditor profile={profile} onSave={onProfile} />
    <div className="panel">
      <div className="panel-heading"><div><p className="eyebrow">WORK AUTHORIZATION</p><h3>Your current situation</h3></div><span className={authorization.confirmedAt ? "verified" : "unverified"}>{authorization.confirmedAt ? "VERIFIED" : "NOT VERIFIED"}</span></div>
      <div className="form-grid">
        <Field label="Current status">
          <select value={authorization.status} onChange={(e) => onAuthorization({ ...authorization, status: e.target.value as WorkAuthorization["status"], confirmedAt: null })}>
            <option value="undisclosed">Prefer not to specify</option><option value="cpt">CPT</option><option value="opt">OPT</option>
            <option value="stem_opt">STEM OPT</option><option value="h1b">H-1B</option><option value="other">Other</option>
          </select>
        </Field>
        <Field label="Authorization end date"><input type="date" value={authorization.authorizationEnd} onChange={(e) => onAuthorization({ ...authorization, authorizationEnd: e.target.value, confirmedAt: null })} /></Field>
      </div>
      <Check label="I am currently authorized to work in the United States" checked={authorization.currentlyAuthorized} onChange={(value) => onAuthorization({ ...authorization, currentlyAuthorized: value, confirmedAt: null })} />
      <Check label="I require employer sponsorship now" checked={authorization.sponsorshipNow} onChange={(value) => onAuthorization({ ...authorization, sponsorshipNow: value, confirmedAt: null })} />
      <Check label="I will require employer sponsorship in the future" checked={authorization.sponsorshipFuture} onChange={(value) => onAuthorization({ ...authorization, sponsorshipFuture: value, confirmedAt: null })} />
      <button className="primary" onClick={() => onAuthorization({ ...authorization, confirmedAt: new Date().toISOString() })}>Confirm authorization answers</button>
    </div>
  </section>;
}

function ProfileEditor({ profile, onSave, compact = false }: { profile: ResumeExtraction; onSave: (value: ResumeExtraction) => void; compact?: boolean }) {
  const contact = profile.contact;
  const update = (key: keyof typeof contact, value: string) => onSave({ ...profile, contact: { ...contact, [key]: value } });
  return <div className="panel">
    <div className="panel-heading"><div><p className="eyebrow">PERSONAL INFORMATION</p><h3>Contact details</h3></div><span className={contact.legalName && contact.email ? "verified" : "unverified"}>{contact.legalName && contact.email ? "READY" : "INCOMPLETE"}</span></div>
    <div className="form-grid">
      <Field label="Legal name"><input value={contact.legalName} onChange={(e) => update("legalName", e.target.value)} placeholder="Your full legal name" /></Field>
      <Field label="Preferred name"><input value={contact.preferredName} onChange={(e) => update("preferredName", e.target.value)} placeholder="What should employers call you?" /></Field>
      <Field label="Email"><input type="email" value={contact.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" /></Field>
      <Field label="Phone"><input value={contact.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 555 123 4567" /></Field>
      <Field label="Location"><input value={contact.location} onChange={(e) => update("location", e.target.value)} placeholder="San Francisco, CA" /></Field>
      <Field label="LinkedIn"><input value={contact.linkedIn} onChange={(e) => update("linkedIn", e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
    </div>
    {!compact && <>
      <Field label="Professional summary"><textarea rows={4} value={profile.summary} onChange={(e) => onSave({ ...profile, summary: e.target.value })} /></Field>
      <Field label="Skills (comma separated)"><input value={profile.skills.join(", ")} onChange={(e) => onSave({ ...profile, skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></Field>
    </>}
  </div>;
}

function JobsView({ jobs, applications, onJobs, onApplications }: {
  jobs: JobSnapshot[]; applications: Application[];
  onJobs: (jobs: JobSnapshot[]) => void; onApplications: (applications: Application[]) => void;
}) {
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    const list = urls.split(/\s+/).filter(Boolean).slice(0, 25);
    if (!list.length) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/jobs/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls: list }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not import jobs");
      const known = new Set(jobs.map((job) => job.canonicalUrl));
      onJobs([...jobs, ...body.jobs.filter((job: JobSnapshot) => !known.has(job.canonicalUrl))]);
      setUrls("");
      if (body.errors.length) setError(body.errors.join(" · "));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed"); }
    finally { setBusy(false); }
  }

  function queue(job: JobSnapshot) {
    if (applications.some((item) => item.job.canonicalUrl === job.canonicalUrl)) return;
    const now = new Date().toISOString();
    onApplications([...applications, { id: crypto.randomUUID(), job, status: "queued", queuePosition: applications.length, blockedReason: null, fields: [], createdAt: now, updatedAt: now }]);
  }

  return <section className="page">
    <PageTitle eyebrow="MVP 3 · JOB INTELLIGENCE" title="Read sponsorship language before you apply" text="Add Greenhouse or Lever links. Every conclusion shows evidence—or honestly says unknown." />
    <div className="url-box">
      <textarea rows={4} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={"Paste up to 25 job links, one per line\nhttps://boards.greenhouse.io/…\nhttps://jobs.lever.co/…"} />
      <button className="primary" onClick={analyze} disabled={busy}>{busy ? "Analyzing…" : "Analyze jobs"} <span>→</span></button>
    </div>
    {error && <div className="notice warning">{error}</div>}
    <div className="job-list">
      {jobs.length === 0 && <Empty title="No jobs analyzed yet" text="Paste a supported job link above to begin." />}
      {jobs.map((job) => <JobCard key={job.id} job={job} queued={applications.some((a) => a.job.canonicalUrl === job.canonicalUrl)} onQueue={() => queue(job)} />)}
    </div>
  </section>;
}

function JobCard({ job, queued, onQueue }: { job: JobSnapshot; queued: boolean; onQueue: () => void }) {
  const labels: [string, string][] = job.sponsorship ? [
    ["CPT", job.sponsorship.cpt.label], ["OPT", job.sponsorship.opt.label],
    ["STEM OPT", job.sponsorship.stemOpt.label], ["H-1B", job.sponsorship.h1bFuture.label]
  ] : [];
  return <article className="job-card">
    <div className="job-main"><span className="ats">{job.ats}</span><h3>{job.title}</h3><p>{job.company} · {job.location || "Location not listed"}</p></div>
    <div className="sponsor-labels">{labels.map(([name, label]) => <span key={name} className={`sponsor ${label}`}>{name}: {label.replaceAll("_", " ")}</span>)}</div>
    {job.sponsorship?.h1bFuture.evidence[0] && <blockquote>“{job.sponsorship.h1bFuture.evidence[0]}”</blockquote>}
    <div className="job-actions"><a href={job.applyUrl} target="_blank" rel="noreferrer">View posting ↗</a><button className="primary small" onClick={onQueue} disabled={queued}>{queued ? "In queue" : "Add to queue"}</button></div>
  </article>;
}

function ApplicationsView({ applications, onApplications }: { applications: Application[]; onApplications: (items: Application[]) => void }) {
  const counts = useMemo(() => ({
    queued: applications.filter((a) => a.status === "queued").length,
    review: applications.filter((a) => a.status === "review_required").length,
    submitted: applications.filter((a) => a.status === "submitted").length,
    blocked: applications.filter((a) => a.status === "blocked").length
  }), [applications]);
  const update = (id: string, status: Application["status"]) => onApplications(applications.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item));
  return <section className="page">
    <PageTitle eyebrow="MVP 5 · CONTROLLED QUEUE" title="One focused application at a time" text="The extension prepares each form. Unknown answers stop for review instead of being guessed." />
    <div className="count-row">{Object.entries(counts).map(([label, count]) => <div className="count-card" key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
    <div className="queue">
      {applications.length === 0 && <Empty title="Your queue is empty" text="Analyze a job and add it to the queue." />}
      {applications.map((application, index) => <article className="queue-item" key={application.id}>
        <span className="queue-number">{String(index + 1).padStart(2, "0")}</span>
        <div><h3>{application.job.title}</h3><p>{application.job.company} · {application.job.ats}</p></div>
        <span className={`state ${application.status}`}>{application.status.replaceAll("_", " ")}</span>
        <div className="queue-actions">
          {application.status === "queued" && <button onClick={() => update(application.id, "ready")}>Prepare</button>}
          {application.status === "ready" && <a href={application.job.applyUrl} target="_blank" rel="noreferrer">Open form ↗</a>}
          <button className="ghost-danger" onClick={() => onApplications(applications.filter((a) => a.id !== application.id))}>Remove</button>
        </div>
      </article>)}
    </div>
  </section>;
}

function SettingsView({ onReset }: { onReset: () => void }) {
  return <section className="page narrow">
    <PageTitle eyebrow="SETTINGS" title="Privacy and local preview" text="This development build stores profile and queue data in your browser. Configure Supabase before production use." />
    <div className="panel"><h3>Browser extension</h3><p className="muted">Build the extension, load its <code>dist</code> folder in Chrome, and open a supported application page.</p><code className="command">npm run build -w @quick-apply/extension</code></div>
    <div className="panel danger-panel"><h3>Delete preview data</h3><p className="muted">Remove the resume profile, authorization answers, analyzed jobs, and queue from this browser.</p><button className="danger" onClick={onReset}>Delete local data</button></div>
  </section>;
}

function PageTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><span>◇</span><h3>{title}</h3><p>{text}</p></div>; }
