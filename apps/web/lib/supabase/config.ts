export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export function configuredAuthProviders() {
  return {
    google: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true",
    apple: process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED === "true",
    emailDelivery: process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED === "true"
  };
}
