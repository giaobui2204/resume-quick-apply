import { NextResponse } from "next/server";
import { discoverJobs } from "@/lib/job-discovery";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") ?? "all";
  const limit = Number(params.get("limit") ?? "30");
  const q = params.get("q") ?? "";
  const location = params.get("location") ?? "";
  if (!["all", "greenhouse", "lever"].includes(source) || !Number.isInteger(limit) || limit < 1 || limit > 50 || q.length > 120 || location.length > 120) return NextResponse.json({ error: "Invalid discovery filters." }, { status: 400 });
  const result = await discoverJobs({ q, location, source, limit });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
