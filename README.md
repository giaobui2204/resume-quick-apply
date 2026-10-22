# ApplyPilot

ApplyPilot is a careful resume-to-application MVP for international students. It extracts a verified career profile, identifies sponsorship evidence in Greenhouse and Lever postings, queues up to 25 jobs, and fills standard form fields through a Chrome extension.

It intentionally does **not** invent answers, bypass CAPTCHAs, fill protected demographic/legal questions, or submit without user confirmation.

## Run locally

```bash
cp .env.example apps/web/.env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Without hosted credentials, the web app uses browser-local storage and every profile field remains manually editable.

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

1. Create a Supabase project and apply `supabase/migrations/0001_initial.sql`.
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

Run `npm test` and `npm run typecheck`. With the dev server running and Google Chrome installed, run `npm run test:e2e` for isolated browser checks. Optionally set `RESUME_PATH` to a local PDF/DOCX path to include real extraction through the configured provider; the default local Ollama setup avoids hosted AI calls. No application is submitted by this suite.

See [the codebase review](docs/codebase-review.md) for prioritized findings, completed fixes, and remaining production blockers.
