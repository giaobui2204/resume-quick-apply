import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

export async function createClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Cloud accounts are not configured for this deployment.");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    auth: { flowType: "pkce" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot mutate response cookies; middleware refreshes them.
        }
      }
    }
  });
}
