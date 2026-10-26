import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !secret)
    return NextResponse.json({ error: "Account deletion is not configured." }, { status: 503 });

  try {
    const sessionClient = await createClient();
    const { data: auth, error: authError } = await sessionClient.auth.getUser();
    if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const { data: session } = await sessionClient.auth.getSession();
    const admin = createSupabaseClient(config.url, secret, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    });
    if (session.session?.access_token) {
      const { error } = await admin.auth.admin.signOut(session.session.access_token, "global");
      if (error)
        return NextResponse.json({ error: "Could not revoke account sessions. Try again." }, { status: 503 });
    }
    const { error } = await admin.auth.admin.deleteUser(auth.user.id);
    if (error)
      return NextResponse.json({ error: "Could not delete account data. Try again." }, { status: 503 });
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Account deletion is unavailable right now." }, { status: 503 });
  }
}
