import { SponsorshipHistoryResponseSchema } from "@quick-apply/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_QUERY_COUNT = 25;
const MAX_REQUEST_BYTES = 32_000;
const SUPPORTED_FISCAL_YEARS = new Set([2024, 2025, 2026]);
const UNAVAILABLE = { status: "unavailable", message: "Employer filing history is unavailable right now." };

type HistoryQuery = {
  id?: string;
  company: string;
  title: string;
  legalEmployerName?: string;
};

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES)
    return NextResponse.json({ error: "History request is too large." }, { status: 413 });

  const parsedBody = await readBoundedJson(request);
  if (parsedBody === "too_large")
    return NextResponse.json({ error: "History request is too large." }, { status: 413 });
  const body = parsedBody as {
    queries?: unknown;
    fiscalYears?: unknown;
  } | null;
  if (
    !body ||
    !Array.isArray(body.queries) ||
    body.queries.length < 1 ||
    body.queries.length > MAX_QUERY_COUNT
  ) {
    return NextResponse.json({ error: "Provide between 1 and 25 job lookups." }, { status: 400 });
  }

  const queries: HistoryQuery[] = [];
  for (const value of body.queries) {
    if (!value || typeof value !== "object") {
      return NextResponse.json(
        { error: "Each lookup must include a company and job title." },
        { status: 400 }
      );
    }
    const query = value as Record<string, unknown>;
    if (
      typeof query.company !== "string" ||
      query.company.trim().length < 1 ||
      query.company.length > 120 ||
      typeof query.title !== "string" ||
      query.title.trim().length < 1 ||
      query.title.length > 180 ||
      (query.id !== undefined && (typeof query.id !== "string" || query.id.length > 100)) ||
      (query.legalEmployerName !== undefined &&
        (typeof query.legalEmployerName !== "string" || query.legalEmployerName.length > 240))
    ) {
      return NextResponse.json({ error: "Company or job title is invalid." }, { status: 400 });
    }
    queries.push({
      ...(typeof query.id === "string" ? { id: query.id } : {}),
      company: query.company.trim(),
      title: query.title.trim(),
      ...(typeof query.legalEmployerName === "string"
        ? { legalEmployerName: query.legalEmployerName.trim() }
        : {})
    });
  }

  const fiscalYears = body.fiscalYears === undefined ? [2024, 2025, 2026] : body.fiscalYears;
  if (
    !Array.isArray(fiscalYears) ||
    fiscalYears.length < 1 ||
    fiscalYears.length > 3 ||
    fiscalYears.some((year) => !Number.isInteger(year) || !SUPPORTED_FISCAL_YEARS.has(year))
  ) {
    return NextResponse.json(
      { error: "Choose one or more supported fiscal years (2024–2026)." },
      { status: 400 }
    );
  }
  const selectedFiscalYears = [...new Set(fiscalYears as number[])].sort((a, b) => a - b);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json(UNAVAILABLE, { status: 503 });

  let baseUrl: URL;
  try {
    baseUrl = new URL(supabaseUrl);
    const localHttp = baseUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(baseUrl.hostname);
    if (baseUrl.protocol !== "https:" && !localHttp) return NextResponse.json(UNAVAILABLE, { status: 503 });
  } catch {
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }

  const rpcUrl = new URL("/rest/v1/rpc/get_sponsorship_history", baseUrl);
  const rpcQueries = queries.map((query) => ({
    ...(query.id ? { id: query.id } : {}),
    company: query.company,
    title: query.title,
    companyNorm: normalizeForLookup(query.company),
    titleNorm: normalizeForLookup(query.title),
    ...(query.legalEmployerName ? { legalEmployerNorm: normalizeForLookup(query.legalEmployerName) } : {})
  }));

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({ p_queries: rpcQueries, p_fiscal_years: selectedFiscalYears }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return NextResponse.json(UNAVAILABLE, { status: 503 });
    const payload: unknown = await response.json();
    if (!payload) return NextResponse.json(UNAVAILABLE, { status: 503 });

    const parsed = SponsorshipHistoryResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.results.length !== queries.length) {
      return NextResponse.json(UNAVAILABLE, { status: 503 });
    }
    return NextResponse.json(parsed.data, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return NextResponse.json(UNAVAILABLE, { status: 503 });
  }
}

function normalizeForLookup(value: string) {
  return value
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

async function readBoundedJson(request: Request): Promise<unknown | "too_large" | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return "too_large";
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
