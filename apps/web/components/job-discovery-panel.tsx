"use client";

import type { JobSnapshot } from "@quick-apply/shared";
import { useEffect, useRef, useState } from "react";

export type DiscoveryCriteria = { query: string; location: string; source: string };

export function JobDiscoveryPanel({ disabled, onBusy, onResults, onError }: { disabled: boolean; onBusy: (busy: boolean) => void; onResults: (jobs: JobSnapshot[], criteria: DiscoveryCriteria) => number; onError: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [lastChecked, setLastChecked] = useState("");
  const lock = useRef(false);
  const generation = useRef(0);
  const callbacks = useRef({ onBusy, onResults, onError });
  callbacks.current = { onBusy, onResults, onError };
  useEffect(() => {
    const controller = new AbortController();
    void discover(controller.signal);
    return () => { controller.abort(); generation.current++; lock.current = false; };
  }, []);

  async function discover(signal?: AbortSignal) {
    if (lock.current) return;
    lock.current = true;
    const request = ++generation.current;
    setBusy(true); onBusy(true); setMessage(""); onError("");
    try {
      const params = new URLSearchParams({ q: query, location, source, limit: "30" });
      const response = await fetch(`/api/jobs/discover?${params}`, { signal });
      const body = await response.json();
      if (request !== generation.current) return;
      if (!response.ok) throw new Error(body.error ?? "Could not discover jobs");
      const added = callbacks.current.onResults(body.jobs, { query, location, source });
      setLastChecked(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setMessage(body.jobs.length ? `Showing ${body.jobs.length} of ${body.total ?? body.jobs.length} matching jobs · ${added} added to your workspace.` : body.errors?.length ? "Some sources could not be checked. Try searching again." : "No matches on the configured boards. Try broader keywords or a different location.");
      if (body.errors?.length) callbacks.current.onError(body.errors.join(" · "));
    } catch (cause) { if (request === generation.current) callbacks.current.onError(cause instanceof Error ? cause.message : "Discovery failed. Try again."); }
    finally { if (request === generation.current) { lock.current = false; setBusy(false); callbacks.current.onBusy(false); } }
  }

  return <form className="panel discovery-panel" onSubmit={(event) => { event.preventDefault(); if (!disabled) void discover(); }}>
    <div className="panel-heading"><div><p className="eyebrow">FIND YOUR NEXT ROLE</p><h3>One search, multiple job boards</h3></div><span className="verified">GREENHOUSE + LEVER</span></div>
    <p className="muted">Jobs load automatically from Anthropic, Figma, and Palantir public boards. Refine your search below; coverage is limited to these supported boards. Results may be cached for up to five minutes.</p>
    <div className="discovery-filters">
      <label className="field"><span>Job keywords</span><input value={query} maxLength={120} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. software engineer" /></label>
      <label className="field"><span>Location</span><input value={location} maxLength={120} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. San Francisco or Remote" /></label>
      <label className="field"><span>Job source</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sources</option><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option></select></label>
    </div>
    <div className="discovery-actions"><button className="primary" disabled={busy || disabled}>{busy ? "Searching job boards…" : "Find jobs"}<span>→</span></button>{lastChecked && <small className="muted">Last searched {lastChecked}</small>}</div>
    {message && <p role="status" className="notice">{message}</p>}
  </form>;
}
