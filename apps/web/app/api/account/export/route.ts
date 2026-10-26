import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tables = [
  "candidate_profiles",
  "resume_documents",
  "work_authorizations",
  "user_sync_preferences",
  "jobs",
  "applications",
  "application_fields",
  "application_events",
  "answer_library",
  "extension_devices"
] as const;
const pageSize = 500;
const maxRows = 50_000;

async function exportTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: (typeof tables)[number]
) {
  const rows: unknown[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const orderBy = table === "user_sync_preferences" ? "user_id" : "id";
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
  throw new Error("The account export exceeds the safe row limit.");
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const entries = await Promise.all(
      tables.map(async (table) => [table, await exportTable(supabase, table)] as const)
    );
    return new NextResponse(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          user: { id: auth.user.id, email: auth.user.email },
          data: Object.fromEntries(entries)
        },
        null,
        2
      ),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": 'attachment; filename="applypilot-account-export.json"',
          "cache-control": "no-store"
        }
      }
    );
  } catch {
    return NextResponse.json({ error: "Account export is unavailable right now." }, { status: 503 });
  }
}
