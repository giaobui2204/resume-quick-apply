import { NextResponse } from "next/server";
import { discoverJobs } from "@/lib/job-discovery";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") ?? "all";
  const limit = Number(params.get("limit") ?? "30");
  const offset = Number(params.get("offset") ?? "0");
  const experience = params.get("experience") ?? "all";
  const workMode = params.get("workMode") ?? "all";
  const employment = params.get("employment") ?? "all";
  const q = params.get("q") ?? "";
  const location = params.get("location") ?? "";
  if (
    !["all", "intern", "entry", "mid", "senior", "lead", "management", "unknown"].includes(experience) ||
    !["all", "remote", "hybrid", "onsite", "unknown"].includes(workMode) ||
    !["all", "full_time", "part_time", "contract", "internship", "unknown"].includes(employment) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 15000 ||
    !["all", "greenhouse", "lever", "ashby", "remotive"].includes(source) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    q.length > 120 ||
    location.length > 120
  )
    return NextResponse.json({ error: "Invalid discovery filters." }, { status: 400 });
  const result = await discoverJobs({ q, location, source, limit, offset, experience, workMode, employment });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
