import { assessSponsorship, normalizeJobUrl } from "@/lib/job-intelligence";
import { classifyJob } from "@/lib/job-classification";
import { postingText } from "@/lib/job-text";
import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { urls?: unknown } | null;
  if (!Array.isArray(body?.urls) || body.urls.length === 0 || body.urls.length > 25 || body.urls.some((url) => typeof url !== "string")) return NextResponse.json({ error: "Provide up to 25 URLs." }, { status: 400 });
  const jobs = [];
  const errors: string[] = [];
  for (const raw of new Set(body.urls)) {
    if (typeof raw !== "string") continue;
    try { jobs.push(await importJob(raw)); }
    catch (error) { errors.push(`${raw}: ${error instanceof Error ? error.message : "could not import"}`); }
  }
  return NextResponse.json({ jobs, errors });
}

async function importJob(raw: string) {
  const { url, ats } = normalizeJobUrl(raw);
  const canonicalUrl = url.toString();
  const response = await fetch(canonicalUrl, { headers: { "user-agent": "ApplyPilot/0.1 job preview" }, redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`posting returned ${response.status}`);
  const html = await response.text();
  const text = postingText(html);
  const title = extract(html, /<title[^>]*>(.*?)<\/title>/is) || "Untitled position";
  const company = pathCompany(url);
  return {
    id: randomUUID(),
    ats,
    provider: ats,
    sourceUrl: canonicalUrl,
    externalId: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 16),
    canonicalUrl,
    applyUrl: canonicalUrl,
    company,
    title: postingText(title).replace(/\s+\|\s+.*$/, "").trim(),
    location: "",
    classification: classifyJob(postingText(title).replace(/\s+\|\s+.*$/, "").trim(), ""),
    description: text.slice(0, 50000),
    capturedAt: new Date().toISOString(),
    sponsorship: assessSponsorship(text)
  };
}

function pathCompany(url: URL) { return url.pathname.split("/").filter(Boolean)[0]?.replaceAll("-", " ") || "Employer"; }
function extract(value: string, pattern: RegExp) { return value.match(pattern)?.[1]?.trim() ?? ""; }
