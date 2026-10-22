"use client";

import type { JobSnapshot } from "@quick-apply/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type DiscoveryCriteria = { query: string; location: string; source: string; experience: string; workMode: string; employment: string };
export const emptyDiscoveryCriteria: DiscoveryCriteria = { query: "", location: "", source: "all", experience: "all", workMode: "all", employment: "all" };
const levels = [["all", "Any level"], ["intern", "Internship"], ["entry", "Entry / new grad"], ["mid", "Mid level"], ["senior", "Senior"], ["lead", "Staff / lead"], ["management", "Management"], ["unknown", "Not specified"]];
const modes = [["all", "Any work mode"], ["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"], ["unknown", "Not specified"]];
const employmentOptions = [["all", "Any employment type"], ["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"], ["internship", "Internship"], ["unknown", "Not specified"]];
export function JobDiscoveryPanel({ children, importedCount, disabled, onBusy, onResults, onError }: { children: ReactNode; importedCount: number | null; disabled: boolean; onBusy: (busy: boolean) => void; onResults: (jobs: JobSnapshot[], append: boolean) => void; onError: (message: string) => void }) {
  const [draft, setDraft] = useState(emptyDiscoveryCriteria);
  const [applied, setApplied] = useState(emptyDiscoveryCriteria);
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [sourceErrors, setSourceErrors] = useState(false);
  const [lastChecked, setLastChecked] = useState("");
  const lock = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const callbacks = useRef({ onBusy, onResults, onError });
  callbacks.current = { onBusy, onResults, onError };
  useEffect(() => { void discover(emptyDiscoveryCriteria); return () => { controller.current?.abort(); generation.current++; lock.current = false; }; }, []);
  useEffect(() => { if (importedCount !== null) { setDraft(emptyDiscoveryCriteria); setApplied(emptyDiscoveryCriteria); } }, [importedCount]);
  function update(key: keyof DiscoveryCriteria, value: string) { setDraft((current) => ({ ...current, [key]: value })); }
  async function discover(criteria: DiscoveryCriteria, offset = 0) {
    if (lock.current || disabled) return;
    lock.current = true;
    const request = ++generation.current;
    controller.current = new AbortController();
    setBusy(true); callbacks.current.onBusy(true); callbacks.current.onError("");
    try {
      const params = new URLSearchParams({ q: criteria.query, location: criteria.location, source: criteria.source, experience: criteria.experience, workMode: criteria.workMode, employment: criteria.employment, limit: "30", offset: String(offset) });
      const response = await fetch(`/api/jobs/discover?${params}`, { signal: controller.current.signal });
      const body = await response.json();
      if (request !== generation.current) return;
      if (!response.ok) throw new Error(body.error ?? "Could not discover jobs");
      callbacks.current.onResults(body.jobs, offset > 0);
      setSourceErrors(Boolean(body.errors?.length));
      setApplied(criteria); setTotal(body.total ?? body.jobs.length); setLoaded(offset + body.jobs.length); setHasMore(Boolean(body.hasMore));
      setLastChecked(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (body.errors?.length) callbacks.current.onError(body.errors.join(" · "));
    } catch (cause) { if (request === generation.current) callbacks.current.onError(cause instanceof Error ? cause.message : "Discovery failed. Try again."); }
    finally { if (request === generation.current) { lock.current = false; setBusy(false); callbacks.current.onBusy(false); } }
  }
  const advancedCount = Number(applied.workMode !== "all") + Number(applied.employment !== "all");
  const active = Object.entries(applied).filter(([key, value]) => value && (key === "query" || key === "location" || value !== "all"));
  const labelFor = (key: string, value: string) => key === "experience" ? levels.find(([id]) => id === value)?.[1] : key === "workMode" ? modes.find(([id]) => id === value)?.[1] : key === "employment" ? employmentOptions.find(([id]) => id === value)?.[1] : value;
  return <>
    <form className="search-workbench" onSubmit={(event) => { event.preventDefault(); void discover(draft); }}>
      <div className="search-main-row">
        <label className="field"><span>What do you want to do?</span><input aria-label="Job keywords" value={draft.query} maxLength={120} onChange={(event) => update("query", event.target.value)} placeholder="Job title or company" /></label>
        <label className="field"><span>Where?</span><input aria-label="Location" value={draft.location} maxLength={120} onChange={(event) => update("location", event.target.value)} placeholder="City, country, or Remote" /></label>
        <button className="search-submit" disabled={busy || disabled}>{busy ? "Searching…" : "Find jobs"}<span aria-hidden="true">↗</span></button>
      </div>
      <fieldset className="experience-filter"><legend>YOUR EXPERIENCE LEVEL</legend><div>{levels.map(([id, label]) => <label key={id} className={`level-chip ${draft.experience === id ? "selected" : ""}`}><input type="radio" name="experience" value={id} checked={draft.experience === id} onChange={() => update("experience", id!)} /><span>{label}</span></label>)}</div></fieldset>
      <div className="search-secondary-row">
        <label className="source-select">Source <select aria-label="Job source" value={draft.source} onChange={(event) => update("source", event.target.value)}><option value="all">All boards</option><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option></select></label>
        <details className="more-filters"><summary>More filters{advancedCount ? ` (${advancedCount})` : ""} <span aria-hidden="true">＋</span></summary><div><label className="field"><span>Work mode</span><select aria-label="Work mode" value={draft.workMode} onChange={(event) => update("workMode", event.target.value)}>{modes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="field"><span>Employment type</span><select aria-label="Employment type" value={draft.employment} onChange={(event) => update("employment", event.target.value)}>{employmentOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div></details>
      </div>
      <p className="coverage-caption">Anthropic · Figma · Palantir <span> / </span> Public boards · cached up to 5 min. Levels use explicit title signals; missing details stay “Not specified”.</p>
    </form>
    {active.length > 0 && <div className="applied-filters"><span>FILTERED BY</span>{active.map(([key, value]) => <button key={key} aria-label={`Remove ${key} filter`} disabled={busy || disabled} onClick={() => { const next = { ...applied, [key]: key === "query" || key === "location" ? "" : "all" }; setDraft(next); void discover(next); }}>{labelFor(key, value)} <span>×</span></button>)}<button className="clear-filters" disabled={busy || disabled} onClick={() => { setDraft(emptyDiscoveryCriteria); void discover(emptyDiscoveryCriteria); }}>Clear all</button></div>}
    <div className="opportunities-heading"><h2>{importedCount !== null ? "Imported jobs" : total === 0 && sourceErrors ? "Search incomplete" : total === null ? "Your opportunities" : `${total} opportunit${total === 1 ? "y" : "ies"}`}</h2><p role="status">{busy ? "Searching supported boards…" : importedCount !== null ? `Showing ${importedCount} imported job${importedCount === 1 ? "" : "s"}` : total === 0 ? sourceErrors ? "Some sources could not be checked. Try again." : "No matches. Try broader filters." : total === null ? "" : `Showing ${loaded} of ${total}${lastChecked ? ` · Updated ${lastChecked}` : ""}`}</p></div>
    {children}
    {importedCount === null && hasMore && <button className="secondary load-more-jobs" disabled={busy || disabled} onClick={() => void discover(applied, loaded)}>{busy ? "Loading…" : "Load more jobs"}</button>}
  </>;
}
