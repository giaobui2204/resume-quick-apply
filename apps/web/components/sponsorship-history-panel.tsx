"use client";

import {
  SponsorshipHistoryResponseSchema,
  type JobSnapshot,
  type SponsorshipHistoryResponse
} from "@quick-apply/shared";
import { useRef, useState } from "react";

const FISCAL_YEARS = [2024, 2025, 2026];

type LookupState = "not_checked" | "loading" | "ready" | "unavailable";
type SponsorshipSignal = NonNullable<JobSnapshot["sponsorship"]>["h1bNow"];

export function SponsorshipHistoryPanel({ job }: { job: JobSnapshot }) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState(job.company);
  const [title, setTitle] = useState(job.title);
  const [fiscalYears, setFiscalYears] = useState<number[]>(FISCAL_YEARS);
  const [legalEmployerName, setLegalEmployerName] = useState("");
  const [lookupState, setLookupState] = useState<LookupState>("not_checked");
  const [response, setResponse] = useState<SponsorshipHistoryResponse | null>(null);
  const requestId = useRef(0);
  const result = response?.results[0];

  async function searchHistory(nextLegalEmployerName = legalEmployerName) {
    if (!company.trim() || !title.trim() || fiscalYears.length === 0) return;
    const activeRequest = ++requestId.current;
    setLookupState("loading");
    setResponse(null);
    try {
      const res = await fetch("/api/sponsorship/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: [
            {
              id: job.id,
              company: company.trim(),
              title: title.trim(),
              ...(nextLegalEmployerName ? { legalEmployerName: nextLegalEmployerName } : {})
            }
          ],
          fiscalYears
        })
      });
      if (!res.ok) throw new Error("History service unavailable");
      const data = SponsorshipHistoryResponseSchema.parse(await res.json());
      if (activeRequest !== requestId.current) return;
      if (!data.release || !data.results?.length) throw new Error("History response is incomplete");
      setResponse(data);
      setLookupState("ready");
    } catch {
      if (activeRequest !== requestId.current) return;
      setLookupState("unavailable");
    }
  }

  function updateQuery(update: () => void) {
    requestId.current += 1;
    update();
    setResponse(null);
    setLookupState("not_checked");
    setLegalEmployerName("");
  }

  function toggleFiscalYear(year: number) {
    updateQuery(() =>
      setFiscalYears((current) =>
        current.includes(year) ? current.filter((item) => item !== year) : [...current, year].sort()
      )
    );
  }

  return (
    <details
      className="sponsorship-evidence"
      onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setOpen(isOpen);
        if (isOpen && lookupState === "not_checked") void searchHistory();
      }}
    >
      <summary>
        Sponsorship evidence{" "}
        <span className="history-summary-state">· {summaryState(lookupState, result?.status)}</span>
      </summary>
      {open && (
        <div className="sponsorship-evidence-body">
          <section className="posting-sponsorship-evidence" aria-labelledby={`posting-evidence-${job.id}`}>
            <div className="sponsorship-section-heading">
              <h4 id={`posting-evidence-${job.id}`}>This job posting</h4>
              <span>Job-specific language</span>
            </div>
            <div className="jd-signals">
              <PostingSignal label="CPT" signal={job.sponsorship?.cpt} />
              <PostingSignal label="OPT" signal={job.sponsorship?.opt} />
              <PostingSignal label="STEM OPT" signal={job.sponsorship?.stemOpt} />
              <PostingSignal label="H-1B now" signal={job.sponsorship?.h1bNow} />
              <PostingSignal label="H-1B future" signal={job.sponsorship?.h1bFuture} />
            </div>
          </section>

          <section className="employer-sponsorship-history" aria-labelledby={`employer-history-${job.id}`}>
            <div className="sponsorship-section-heading">
              <h4 id={`employer-history-${job.id}`}>Employer filing history</h4>
              <span>Public DOL case records · not a promise for this job</span>
            </div>
            <p className="history-linked-job">
              Current opening:{" "}
              <a href={job.applyUrl} target="_blank" rel="noreferrer">
                {job.title} at {job.company} ↗
              </a>
            </p>

            <form
              className="sponsorship-history-search"
              onSubmit={(event) => {
                event.preventDefault();
                void searchHistory("");
              }}
            >
              <label>
                Company or legal employer
                <input
                  value={company}
                  maxLength={120}
                  onChange={(event) => updateQuery(() => setCompany(event.target.value))}
                />
              </label>
              <label>
                Job title
                <input
                  value={title}
                  maxLength={180}
                  onChange={(event) => updateQuery(() => setTitle(event.target.value))}
                />
              </label>
              <fieldset className="fiscal-year-filters">
                <legend>Fiscal years</legend>
                {FISCAL_YEARS.map((year) => (
                  <label key={year}>
                    <input
                      type="checkbox"
                      checked={fiscalYears.includes(year)}
                      onChange={() => toggleFiscalYear(year)}
                    />
                    FY{year}
                  </label>
                ))}
              </fieldset>
              <button
                className="secondary small"
                type="submit"
                disabled={
                  !company.trim() || !title.trim() || !fiscalYears.length || lookupState === "loading"
                }
              >
                {lookupState === "loading" ? "Searching…" : "Search filings"}
              </button>
            </form>

            {lookupState === "loading" && (
              <p className="history-status" role="status">
                Searching Department of Labor records…
              </p>
            )}
            {lookupState === "unavailable" && (
              <div className="history-message unavailable" role="alert">
                <strong>History unavailable right now.</strong> Try again later. Job-posting language above is
                still shown separately.
              </div>
            )}
            {lookupState === "ready" && response && result && (
              <HistoryResults
                response={response}
                company={company}
                title={title}
                fiscalYears={fiscalYears}
                onSelectEmployer={(name) => {
                  setLegalEmployerName(name);
                  void searchHistory(name);
                }}
              />
            )}
            {lookupState === "not_checked" && (
              <p className="history-status muted">
                Edit the search above, then search the selected fiscal years.
              </p>
            )}

            <div className="external-history-links">
              <span>Other research sources</span>
              <a href={h1bDataUrl(company, title)} target="_blank" rel="noreferrer">
                H1BData.info ↗
              </a>
              <a href="https://www.myvisajobs.com/employers/search.aspx" target="_blank" rel="noreferrer">
                MyVisaJobs ↗
              </a>
              <a
                href="https://www.dol.gov/agencies/eta/foreign-labor/performance"
                target="_blank"
                rel="noreferrer"
              >
                Official DOL files ↗
              </a>
            </div>
          </section>
        </div>
      )}
    </details>
  );
}

function PostingSignal({ label, signal }: { label: string; signal?: SponsorshipSignal }) {
  const hasEvidence = Boolean(signal?.evidence.length);
  const value =
    !signal || (signal.label === "unknown" && !hasEvidence)
      ? "Not stated in this posting"
      : signal.label === "likely_supported"
        ? "Support language found"
        : signal.label === "likely_not_supported"
          ? "Posting says support is not offered"
          : "Unclear or mixed language";
  return (
    <div className="jd-signal">
      <strong>{label}</strong>
      <span className={`jd-signal-value ${signal?.label ?? "unknown"}`}>{value}</span>
      {signal?.evidence.map((quote, index) => (
        <blockquote key={index}>“{quote}”</blockquote>
      ))}
    </div>
  );
}

function HistoryResults({
  response,
  company,
  title,
  fiscalYears,
  onSelectEmployer
}: {
  response: SponsorshipHistoryResponse;
  company: string;
  title: string;
  fiscalYears: number[];
  onSelectEmployer: (name: string) => void;
}) {
  const result = response.results[0];
  if (!result) {
    return (
      <div className="history-message unavailable" role="alert">
        History response was incomplete. Try again later.
      </div>
    );
  }
  if (result.status === "possible_matches") {
    return (
      <div>
        <div className="history-message possible-matches">
          <strong>Choose the employer record to inspect.</strong>
          <p>
            These are possible legal-name matches only. We have not combined their filings; choose a name to
            inspect its records.
          </p>
          <div className="possible-employer-list">
            {result.possibleEmployers?.map((employer) => (
              <button
                key={employer.legalName}
                className="text-button"
                onClick={() => onSelectEmployer(employer.legalName)}
              >
                Use {employer.legalName}
              </button>
            ))}
            {!result.possibleEmployers?.length && <p>Edit the company name and search again.</p>}
          </div>
        </div>
        <ReleaseProvenance response={response} fiscalYears={fiscalYears} />
      </div>
    );
  }
  if (result.status === "no_match") {
    return (
      <div>
        <div className="history-message no-match">
          <strong>No matching employer record in the selected DOL files.</strong>
          <p>
            The employer may file under another legal name. This is not evidence that it does not sponsor
            workers.
          </p>
        </div>
        <ReleaseProvenance response={response} fiscalYears={fiscalYears} />
      </div>
    );
  }

  const matchedEmployer = result.matchedEmployer;
  return (
    <div className="history-results">
      <div className="history-provenance">
        <p>
          Matched employer: <strong>{matchedEmployer?.legalName ?? company}</strong>
          {matchedEmployer && (
            <span className="match-note">
              {matchedEmployer.match === "exact"
                ? "Exact legal-name match"
                : matchedEmployer.match === "curated_alias"
                  ? "Verified company alias"
                  : "Selected legal name"}
            </span>
          )}
        </p>
        {result.status === "available_company_only" && (
          <p className="history-message no-title-match">
            Employer filings found. No exact “{title}” title match in the selected years.
          </p>
        )}
      </div>
      <div className="filing-program-grid">
        <FilingProgram
          name="H-1B labor condition applications (LCA)"
          years={result.programs.lca.years}
          response={response}
          program="lca"
        />
        <FilingProgram
          name="PERM labor certifications"
          years={result.programs.perm.years}
          response={response}
          program="perm"
        />
      </div>
      <ReleaseProvenance response={response} fiscalYears={fiscalYears} />
      <p className="history-caveat">
        LCA counts are filings, not people, hires, or USCIS approvals. PERM is a labor-certification step, not
        a green-card grant. Historical employer records do not confirm sponsorship for this opening.
      </p>
    </div>
  );
}

function ReleaseProvenance({
  response,
  fiscalYears
}: {
  response: SponsorshipHistoryResponse;
  fiscalYears: number[];
}) {
  const selectedSources = response.release.sources.filter((source) =>
    fiscalYears.includes(source.fiscalYear)
  );
  return (
    <div className="release-provenance">
      <p>
        DOL data release {response.release.version}
        {response.release.publishedAt ? ` · published ${formatDate(response.release.publishedAt)}` : ""}
      </p>
      <div>
        {selectedSources.map((source) => (
          <a
            key={`${source.program}-${source.fiscalYear}-${source.checksum}`}
            href={source.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {sourceLabel(source)}
            {source.partial ? " (partial)" : ""} · through {formatDate(source.dataThrough)} ↗
          </a>
        ))}
      </div>
    </div>
  );
}

function sourceLabel(source: SponsorshipHistoryResponse["release"]["sources"][number]) {
  if (source.program === "perm" && source.fiscalYear === 2024) {
    const filename = new URL(source.sourceUrl).pathname.split("/").pop()?.toLowerCase() ?? "";
    return filename.includes("new_form") ? "PERM FY2024 new-form file" : "PERM FY2024 original-form file";
  }
  return `${source.program.toUpperCase()} FY${source.fiscalYear} ${source.quarter} DOL file`;
}

function FilingProgram({
  name,
  years,
  response,
  program
}: {
  name: string;
  years: Array<{
    fiscalYear: number;
    employerCaseCount: number;
    employerStatusCounts: Array<{ status: string; count: number }>;
    exactTitleCount: number;
    exactTitleStatusCounts: Array<{ status: string; count: number }>;
    wageStatsByUnit?: Array<{
      unit: string;
      sampleCount: number;
      minFrom: number | null;
      medianFrom: number | null;
      maxTo: number | null;
    }>;
  }>;
  response: SponsorshipHistoryResponse;
  program: "lca" | "perm";
}) {
  const sourceForYear = (year: number) =>
    response.release.sources.find((source) => source.program === program && source.fiscalYear === year);
  return (
    <section className={`filing-program ${program}`}>
      <h5>{name}</h5>
      {years.length === 0 ? (
        <p className="muted">
          No matching {program === "lca" ? "LCA" : "PERM"} records in the selected years.
        </p>
      ) : (
        years.map((year) => {
          const source = sourceForYear(year.fiscalYear);
          return (
            <article className="filing-year" key={year.fiscalYear}>
              <div className="filing-year-heading">
                <strong>FY{year.fiscalYear}</strong>
                {source?.quarter && <span>{source.quarter}</span>}
                {source?.partial && <span className="partial-year">Partial</span>}
                {source?.dataThrough && <span>Through {formatDate(source.dataThrough)}</span>}
              </div>
              <p className="filing-counts">
                Employer-wide: {formatCount(year.employerCaseCount)} cases · Exact title:{" "}
                {formatCount(year.exactTitleCount)} cases
              </p>
              <StatusCounts label="Employer-wide outcomes" counts={year.employerStatusCounts} />
              {year.exactTitleCount > 0 && (
                <StatusCounts label="Exact-title outcomes" counts={year.exactTitleStatusCounts} />
              )}
              {year.wageStatsByUnit?.map((wage) => (
                <p key={wage.unit} className="wage-stat">
                  Exact-title DOL-filed wage ({wage.unit}): median “from” {formatMoney(wage.medianFrom)} ·
                  observed “from” to “to” {formatMoney(wage.minFrom)}–{formatMoney(wage.maxTo)} ·{" "}
                  {formatCount(wage.sampleCount)} records. Not annualized or this job’s offered pay.
                </p>
              ))}
            </article>
          );
        })
      )}
    </section>
  );
}

function StatusCounts({
  label,
  counts
}: {
  label: string;
  counts: Array<{ status: string; count: number }>;
}) {
  const nonzeroCounts = counts.filter(({ count }) => count > 0);
  return (
    <div className="case-status-counts">
      <strong>{label}</strong>
      {nonzeroCounts.length ? (
        <ul>
          {nonzeroCounts.map(({ status, count }) => (
            <li key={status}>
              {formatStatus(status)}: {formatCount(count)}
            </li>
          ))}
        </ul>
      ) : (
        <p>No cases in the selected years.</p>
      )}
    </div>
  );
}

function summaryState(state: LookupState, resultStatus?: string) {
  if (state === "loading") return "searching DOL records";
  if (state === "unavailable") return "history unavailable";
  if (state === "not_checked") return "not checked yet";
  if (resultStatus === "no_match") return "no matching employer record";
  if (resultStatus === "available_company_only") return "employer records found · no exact title match";
  if (resultStatus === "possible_matches") return "choose employer record";
  return "filings found";
}

function h1bDataUrl(company: string, title: string) {
  const params = new URLSearchParams({ em: company, job: title });
  return `https://h1bdata.info/index.php?${params.toString()}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatMoney(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
        value
      );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
