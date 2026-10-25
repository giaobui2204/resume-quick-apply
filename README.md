# ApplyPilot

ApplyPilot is a careful resume-to-application MVP for international students. It extracts a verified career profile, identifies sponsorship evidence in Greenhouse and Lever postings, queues up to 25 jobs, and fills standard form fields through a Chrome extension.

It intentionally does **not** invent answers, bypass CAPTCHAs, fill protected demographic/legal questions, or submit without user confirmation.

## Run locally

```bash
cp .env.example apps/web/.env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Resume profiles remain in IndexedDB and other workspace data remains in browser-local storage. The optional H‑1B/PERM history drawer uses Supabase only when a database is configured and a DOL release has been imported; otherwise it reports that history is unavailable. Every profile field remains manually editable.

## Guided workflow and resume library

Continue with the Next and Back buttons through Resume → Review profile → Discover jobs → Applications. The sidebar remains available for revisiting stages. You can upload several resume variants or create a blank one, select the active version, rename it, and delete it. Each version keeps its own extracted profile; queued applications keep the resume ID/name chosen when queued.

The library reads lightweight metadata and loads only the selected profile. Profiles are stored as separate IndexedDB records; original PDFs/DOCX files are not retained. Upload bytes are hashed before extraction, so re-uploading an already saved document selects the existing record without calling AI again. Legacy single-profile data migrates on first use. This is single-browser storage, not cross-device cloud sync.

## Automatic job discovery

Opening Jobs automatically loads vacancies from Anthropic and Figma (Greenhouse), Palantir (Lever), Ramp, Linear and Lovable (Ashby), and Remotive's remote-only feed. LinkedIn and Indeed shortcuts open external searches with the current applied keywords and location; those results are not imported into ApplyPilot. Filter by title/company keywords, location, source, experience level, work mode, and employment type. Experience options distinguish internship, entry/new-grad, explicit mid-level, senior, staff/lead, management, and Not specified; generic titles are never assumed to be entry or mid-level. Source metadata and explicit title signals are inspectable on each job. Submit changed criteria with Find jobs; applied chips show the current results. Filters run across the full cached feed before pagination, and results round-robin across available boards before paging so one employer feed cannot fill the first page. Search returns 30 jobs per page with matching totals and Load more. Greenhouse/Lever feeds use a five-minute cache; Ashby boards use a 15-minute cache policy; Remotive listings are delayed by 24 hours and refresh on search at most every six hours per server. Sources are fixed and bounded; failed boards are reported while successful boards remain usable. This is refresh-on-open/search, not an unattended background crawler or internet-wide search. Manual supported job-link import remains under its own expandable section.

## Free local AI with Ollama

Install [Ollama](https://ollama.com/download), then download the default development model:

```bash
ollama pull qwen3:4b
ollama serve
```

Copy `.env.example` to `apps/web/.env.local`. The defaults use Ollama at `http://127.0.0.1:11434`, so no API key is required:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
```

PDF and DOCX text is extracted inside the application before it is sent to the local Ollama process. Scanned image-only PDFs are not supported yet.

OpenAI remains an optional provider:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-terra
```

## H‑1B and PERM employer history

Job-description language and historical employer filings are separate signals. The filing history index is built from DOL OFLC LCA and PERM disclosure workbooks for FY2024, FY2025, and partial FY2026. The importer filters LCA rows to H‑1B, deduplicates cases by program and fiscal year, combines the two FY2024 PERM form files, and stores only employer/title/status aggregates plus LCA wage summaries in the filed unit. Raw workbooks and case identifiers are temporary ETL inputs; the database does not store them. Source snapshots and cut-off dates are recorded with every release.

Counts are distinct DOL cases, not workers or job offers. LCA filings can include extensions, transfers, and amendments; they do not show USCIS approval or prove sponsorship for a specific opening. DOL-filed wages are shown by their original units and are not a job's salary or total compensation. PERM history is separate from H‑1B and does not mean a green card was granted. The importer and browser API use exact normalized legal names and explicit aliases; possible name matches require user confirmation.

### Local database and import

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker, then start the local database and apply the migrations:

```bash
supabase start
supabase db reset
```

Copy the local API URL and anon key from `supabase status` into `apps/web/.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Export Supabase's local database URL for the importer (typically `postgresql://postgres:postgres@127.0.0.1:54322/postgres`):

```bash
export SUPABASE_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
```

Install the pinned importer packages and run:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r scripts/requirements-sponsorship.txt
python scripts/import_dol_sponsorship.py
```

`python scripts/import_dol_sponsorship.py --dry-run` downloads and validates the source files without writing to Postgres. Workbooks are downloaded to a temporary directory and removed after import. The importer stages a new release, validates row counts, then switches the published release in one transaction; a failed import leaves the previous release active.

The manual **Refresh DOL sponsorship history** GitHub Action uses the same pinned importer. Before running it, apply all migrations to the hosted Supabase project, set `SUPABASE_DB_URL` as a GitHub Actions secret, and configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the web app. Update `scripts/dol-sponsorship-sources.json` only after a newer official DOL quarterly disclosure is available. The current FY2026 Q3 files cover determinations through June 30, 2026. No service-role key is used by the web API; the private database URL is used by the importer only.

## Load the Chrome extension

```bash
npm run build -w @quick-apply/extension
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/dist`.

The extension requests access only to Greenhouse and Lever. Open its popup, save verified contact facts, then visit a supported hosted application form.

## Production setup

1. Create a Supabase project and apply the migrations in `supabase/migrations` in order. Migration 0003 adds privacy-minimized DOL release tables, read-only policies, indexes, and the search RPC. The preview does not connect candidate profiles or applications to Supabase yet.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the web app. These permit read-only queries of published public filing aggregates under RLS.
3. Set `SUPABASE_DB_URL` only as a GitHub Actions secret for the importer, then run the manual refresh workflow. Do not expose it to the browser or set it as a `NEXT_PUBLIC_` variable.
4. Create a private `resumes` storage bucket. Use a server-accessible AI provider in hosted deployments; `127.0.0.1` refers to the deployment server, not the end user’s computer.
5. Complete privacy policy, retention policy, security review, extension pairing, and Chrome Web Store review.

## Checkpoints

- MVP 0: runnable dashboard and shared schemas.
- MVP 1: PDF/DOCX upload and structured extraction.
- MVP 2: verified candidate and work-authorization profile.
- MVP 3: Greenhouse/Lever job intake and evidence labels.
- MVP 4: safe Greenhouse/Lever contact-field autofill.
- MVP 5: persistent sequential queue and blocked handoff.

See [docs/acceptance.md](docs/acceptance.md) for the manual checkpoint script.

## Validation

Run `npm run format` to format application, package and script code with Prettier, or `npm run format:check` to check it. Run `npm test` and `npm run typecheck` for correctness checks. With the dev server running and Google Chrome installed, run `npm run test:e2e` for browser regression checks, `npm run test:e2e:guided` for Next-step navigation, multiple resumes, upload deduplication, migration, mobile layouts and deletion, and `npm run test:e2e:search` for level/advanced filters, applied criteria, source attribution/coverage, pagination, empty/failure states and search UX. Optionally set `RESUME_PATH` to a local PDF/DOCX path to include real extraction through the configured provider; the default local Ollama setup avoids hosted AI calls. No application is submitted by this suite.

See [the codebase review](docs/codebase-review.md) for prioritized findings, completed fixes, and remaining production blockers.

The [MVP v2 plan](docs/mvp-v2-plan.md) records acceptance criteria and the user-supplied PM/engineering prompt guidance used for this iteration.

Search research and implementation acceptance are in [job-search-redesign.md](docs/job-search-redesign.md); the UI handoff is in [job-search-design.md](docs/job-search-design.md).

The multi-source job discovery research, provider access limits, and staged integration plan are in [multi-source-job-discovery.md](docs/multi-source-job-discovery.md); the UI handoff is in [multi-source-job-feed-ux.md](docs/multi-source-job-feed-ux.md).

### Additional discovery sources

Discovery also includes [Remotive's public remote-job feed](https://github.com/remotive-com/remote-jobs-api). Remotive results retain the source link and attribution, display a validated source publication calendar date when available (not the fetch date or a claim about the employer’s original posting date), and are delayed by 24 hours upstream. The feed refreshes on search requests at most once every six hours per running server; successful responses also use Next.js's six-hour data cache. Do not place these listings behind an email/signup requirement. A production deployment with multiple independent instances needs a shared refresh lock/cache to keep the provider-wide request budget; the current preview has one server.

The verified employer registry covers 15 Greenhouse, Lever and Ashby boards, including Affirm, SpaceX, Scale AI, ID.me, True Anomaly, Commure, Cursor and Replit. Board IDs are checked against live public endpoints and results retain their direct source and application links. Ashby contributes Ramp, Linear, Lovable, Commure, Cursor, Replit and AiPrise; only explicitly listed roles are included. The 15-minute Ashby cache is an ApplyPilot refresh policy, not a published quota.

The search defaults to entry-level / new-grad jobs and filters direct-board and Remote OK results to records with an explicit US location signal. It includes [Remote OK's public JSON feed](https://remoteok.com/faq) with the required source label and link to each Remote OK posting; generic worldwide listings without US evidence are dropped. [Himalayas](https://himalayas.app/api) adds US-eligible remote roles with a US country query, a 24-hour cache, source attribution, and its unchanged application URL. In All boards, the newest Himalayas page is included and the coverage panel offers **Browse more Himalayas jobs**; selecting Himalayas opens its own 20-result pages and labels the provider's total approximate. City filters are not applied to that source because its API exposes country eligibility rather than city locations. Other connected feeds are paginated over the app's current result snapshot.

Discovery provider and application ATS are separate fields. Remotive, Remote OK and Himalayas are not mislabeled as ATSs. Extension filling remains limited to Greenhouse and Lever forms. LinkedIn and Indeed buttons open external searches with the applied keywords/location; their listings are not scraped or imported. Jobright is a product reference for US scope, experience/work filters, freshness and fit explanations; its job feed is not used as a data source. No paid API, account, or subscription is enabled by these integrations.
