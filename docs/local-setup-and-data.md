# Data sources and optional setup

## Job discovery

Opening Jobs queries the connected feeds. The employer registry covers 15 Greenhouse, Lever and Ashby boards, including Anthropic, Figma, Palantir, Ramp, Linear, Lovable, Affirm, SpaceX, Scale AI, ID.me, True Anomaly, Commure, Cursor, Replit and AiPrise. Ashby roles must be explicitly listed. Remotive, Remote OK and Himalayas add remote listings; they are discovery providers, not ATSs.

Search defaults to entry-level/new-grad roles. Filters cover title/company keywords, location, source, explicit experience level, work mode and employment type. Missing evidence stays “Not specified.” Applied chips describe the displayed results; submit draft changes with **Find jobs**. Direct-board and Remote OK results require an explicit US location signal. Himalayas uses US country eligibility rather than city locations, so city filters do not apply to that provider.

Filters run before pagination over the available result snapshot. Results rotate across feeds and, for Remotive, employers. **Load more** continues the current search. Himalayas supplies its newest page in All boards; **Browse more Himalayas jobs** opens its separate 20-result pages with an approximate provider total. The coverage panel reports checked, cached and unavailable feeds. A failed feed does not remove results from successful feeds.

Greenhouse/Lever data caches for five minutes; Ashby for 15 minutes. Remotive refreshes on search at most every six hours per server and delays listings upstream by 24 hours. Himalayas caches for 24 hours. These are on-demand requests, not an unattended crawler. A deployment with independent servers needs a shared refresh lock/cache to enforce provider-wide limits.

Source links and attribution remain on each card. [Remotive’s terms](https://github.com/remotive-com/remote-jobs-api) require attribution and forbid gating listings behind email/signup collection; [Remote OK](https://remoteok.com/faq) and [Himalayas](https://himalayas.app/api) also supply source links. Verify production data-use permissions before redistributing provider data. No paid job-data service is enabled.

LinkedIn and Indeed buttons open external searches with the applied keywords and location. Their listings are not scraped or imported. You can also import supported individual job links manually.

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

## Deployment notes

The web app can query published DOL filing aggregates when Supabase is configured; candidate profiles, packages and application outcomes remain in the browser. Apply the repository migrations before importing filing data. Keep `SUPABASE_DB_URL` private and outside `NEXT_PUBLIC_` variables.

Hosted resume extraction needs a model reachable from the deployment server. `127.0.0.1` points to that server, not the user’s computer. Production work still includes candidate auth/storage integration, retention controls and Chrome Web Store review. No resume bucket or extension pairing service is connected in this build.
