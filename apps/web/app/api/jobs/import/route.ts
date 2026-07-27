import type { SponsorshipAssessment } from "@quick-apply/shared";
import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { urls?: unknown } | null;
  if (!Array.isArray(body?.urls) || body.urls.length > 25) return NextResponse.json({ error: "Provide up to 25 URLs." }, { status: 400 });
  const jobs = [];
  const errors: string[] = [];
  for (const raw of body.urls) {
    if (typeof raw !== "string") continue;
    try { jobs.push(await importJob(raw)); }
    catch (error) { errors.push(`${raw}: ${error instanceof Error ? error.message : "could not import"}`); }
  }
  return NextResponse.json({ jobs, errors });
}

async function importJob(raw: string) {
  const url = new URL(raw);
  const ats = detectAts(url);
  const canonicalUrl = canonicalize(url);
  const response = await fetch(canonicalUrl, { headers: { "user-agent": "ApplyPilot/0.1 job preview" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`posting returned ${response.status}`);
  const html = await response.text();
  const text = cleanHtml(html);
  const title = extract(html, /<title[^>]*>(.*?)<\/title>/is) || "Untitled position";
  const company = ats === "greenhouse" ? hostnameCompany(url.hostname) : pathCompany(url);
  return {
    id: randomUUID(),
    ats,
    externalId: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 16),
    canonicalUrl,
    applyUrl: canonicalUrl,
    company,
    title: decode(title).replace(/\s+\|\s+.*$/, "").trim(),
    location: "",
    description: text.slice(0, 50000),
    capturedAt: new Date().toISOString(),
    sponsorship: assessSponsorship(text)
  };
}

function detectAts(url: URL): "greenhouse" | "lever" {
  if (url.hostname.includes("greenhouse.io")) return "greenhouse";
  if (url.hostname === "jobs.lever.co" || url.hostname === "jobs.eu.lever.co") return "lever";
  throw new Error("only Greenhouse and Lever are supported");
}
function canonicalize(url: URL) { url.search = ""; url.hash = ""; return url.toString(); }
function hostnameCompany(host: string) { return host.split(".")[0]?.replace(/^boards$/, "Greenhouse employer") || "Employer"; }
function pathCompany(url: URL) { return url.pathname.split("/").filter(Boolean)[0]?.replaceAll("-", " ") || "Employer"; }
function extract(value: string, pattern: RegExp) { return value.match(pattern)?.[1]?.trim() ?? ""; }
function cleanHtml(html: string) { return decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim(); }
function decode(value: string) { return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", "\"").replaceAll("&#39;", "'"); }

function assessSponsorship(text: string): SponsorshipAssessment {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const negative = sentences.filter((s) => /(?:cannot|can't|unable to|do not|does not|not able to|without).{0,45}(?:sponsor|sponsorship)|no.{0,20}(?:visa|sponsorship)|must be.{0,40}authorized.{0,40}without/i.test(s));
  const positive = sentences.filter((s) => /(?:will|can|may|offer|provide).{0,35}(?:sponsor|sponsorship)|(?:h-?1b|opt|cpt).{0,40}(?:welcome|eligible|support)/i.test(s));
  const opt = sentences.filter((s) => /\b(?:stem[- ]?opt|opt|cpt)\b/i.test(s));
  const now = new Date().toISOString();
  const dimension = (kind: "general" | "opt") => {
    const evidence = kind === "opt" ? opt : [...negative, ...positive];
    if (negative.length) return { label: "likely_not_supported" as const, confidence: 0.82, evidence: negative.slice(0, 2), explanation: "The posting contains language indicating sponsorship is unavailable." };
    if (positive.length) return { label: "likely_supported" as const, confidence: 0.78, evidence: positive.slice(0, 2), explanation: "The posting contains language indicating sponsorship support." };
    if (kind === "opt" && opt.length) return { label: "likely_supported" as const, confidence: 0.68, evidence: opt.slice(0, 2), explanation: "The posting explicitly mentions this work authorization category." };
    return { label: "unknown" as const, confidence: 0, evidence: [], explanation: "The posting does not provide enough direct evidence." };
  };
  return { cpt: dimension("opt"), opt: dimension("opt"), stemOpt: dimension("opt"), h1bNow: dimension("general"), h1bFuture: dimension("general"), analyzedAt: now, model: "evidence-rules-v1" };
}
