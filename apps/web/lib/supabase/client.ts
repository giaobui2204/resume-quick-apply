"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Cloud accounts are not configured for this deployment.");
  client ??= createBrowserClient(config.url, config.key, { auth: { flowType: "pkce" } });
  return client;
}
