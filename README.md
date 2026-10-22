# ApplyPilot

ApplyPilot is a careful resume-to-application MVP for international students. It extracts a verified career profile, identifies sponsorship evidence in Greenhouse and Lever postings, queues up to 25 jobs, and fills standard form fields through a Chrome extension.

It intentionally does **not** invent answers, bypass CAPTCHAs, fill protected demographic/legal questions, or submit without user confirmation.

## Run locally

```bash
cp .env.example apps/web/.env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The runnable MVP stores resume profiles in IndexedDB and other workspace data in browser-local storage. Supabase is not connected yet. Every profile field remains manually editable.

## Guided workflow and resume library

Continue with the Next and Back buttons through Resume → Review profile → Discover jobs → Applications. The sidebar remains available for revisiting stages. You can upload several resume variants or create a blank one, select the active version, rename it, and delete it. Each version keeps its own extracted profile; queued applications keep the resume ID/name chosen when queued.

The library reads lightweight metadata and loads only the selected profile. Profiles are stored as separate IndexedDB records; original PDFs/DOCX files are not retained. Upload bytes are hashed before extraction, so re-uploading an already saved document selects the existing record without calling AI again. Legacy single-profile data migrates on first use. This is single-browser storage, not cross-device cloud sync.

## Automatic job discovery

Opening Jobs automatically loads public vacancies from Anthropic and Figma (Greenhouse) and Palantir (Lever). Filter by title/company keywords, location, ATS source, experience level, work mode, and employment type. Experience options distinguish internship, entry/new-grad, explicit mid-level, senior, staff/lead, management, and Not specified; generic titles are never assumed to be entry or mid-level. Source metadata and explicit title signals are inspectable on each job. Submit changed criteria with Find jobs; applied chips show the current results. Filters run across the full cached feed before pagination. Search returns 30 jobs per page with matching totals and Load more, preserving applied filters even while a new query is still being typed; a five-minute per-board server cache and in-flight request sharing limit repeated upstream calls. Sources are fixed and bounded; failed boards are reported while successful boards remain usable. This is refresh-on-open/search, not an unattended background crawler or internet-wide search. Manual supported job-link import remains under its own expandable section.

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

## Load the Chrome extension

```bash
npm run build -w @quick-apply/extension
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/dist`.

The extension requests access only to Greenhouse and Lever. Open its popup, save verified contact facts, then visit a supported hosted application form.

## Production setup

1. Create a Supabase project and apply the migrations in `supabase/migrations` in order. The second migration adds multi-resume indexes, live-upload deduplication and an application/resume owner guard. These migrations have not been executed against a hosted database by the local checks.
2. Create a private `resumes` storage bucket.
3. Configure the values in `.env.example`. Use a server-accessible AI provider in hosted deployments; `127.0.0.1` refers to the deployment server, not the end user’s computer.
4. Replace the browser-local repository with authenticated Supabase queries.
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

Run `npm test` and `npm run typecheck`. With the dev server running and Google Chrome installed, run `npm run test:e2e` for existing browser regression checks `npm run test:e2e:guided` for Next-step navigation, multiple resumes, upload deduplication, migration, mobile layouts and deletion, and `npm run test:e2e:search` for level/advanced filters, applied criteria, pagination, empty/failure states and the redesigned search. Optionally set `RESUME_PATH` to a local PDF/DOCX path to include real extraction through the configured provider; the default local Ollama setup avoids hosted AI calls. No application is submitted by this suite.

See [the codebase review](docs/codebase-review.md) for prioritized findings, completed fixes, and remaining production blockers.

The [MVP v2 plan](docs/mvp-v2-plan.md) records acceptance criteria and the user-supplied PM/engineering prompt guidance used for this iteration.

Search research and implementation acceptance are in [job-search-redesign.md](docs/job-search-redesign.md); the UI handoff is in [job-search-design.md](docs/job-search-design.md).
