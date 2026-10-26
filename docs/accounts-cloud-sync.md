# Accounts and cloud workspace

Guest workspaces stay in browser storage. After sign-in, ApplyPilot offers an explicit import of this device’s resume profiles, application queue, optional current job results, and optional work authorization answers. A failed import leaves local data in place. Once imported, the account database supplies the workspace on other devices.

Cloud sync stores extracted resume profiles and labels, not original PDF or DOCX files. Discovery results and prepared answer packages stay on the device. Work authorization answers remain local until the user separately opts in; turning sync off deletes the cloud copy.

## Supabase setup

1. Create a Supabase project and apply every migration in `supabase/migrations`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Next.js host. `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains supported for existing projects.
3. Set `SUPABASE_SERVICE_ROLE_KEY` as a server-only host secret for account deletion. Never expose it to browser code.
4. Set Supabase Auth’s Site URL to the production site and allow the exact `/auth/callback` URL. Add localhost and deployment preview callbacks for development.
5. Configure a custom SMTP service for email confirmation and password recovery. Supabase’s default mail service is limited to project-team addresses and low-volume testing. Set `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true` only after sending and recovery links work end to end; otherwise existing email/password users can sign in, but registration and recovery remain unavailable.
6. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` after adding a Google web client ID and secret to Supabase Auth. Set `NEXT_PUBLIC_AUTH_APPLE_ENABLED=true` only after Apple sign-in works in Supabase.

Google needs a web OAuth client and the Supabase callback URL in Google’s allowed redirects. Apple needs an Apple Developer account, App ID and Services ID, verified domain, callback URL, Team ID, Key ID, and signing key. Apple web OAuth secrets expire every six months and need rotation. Keep the Apple button unavailable until this setup is complete.

## Local development

Use Node.js 22 or newer. Start the local database with `npm exec -- supabase start`, then copy the printed local API URL and publishable or anon key into `.env.local`. Local email links appear in Mailpit at `http://127.0.0.1:54324`. Local OAuth providers still need provider credentials; without them, the UI explains that the provider is not configured.
