# ApplyPilot

ApplyPilot extracts resume facts, searches connected job feeds, and prepares selected facts for a Chrome extension to fill on Greenhouse and Lever forms. You review the values and submit on the employer’s website. Application outcomes are explicitly confirmed user reports.

## Run locally

Use Node.js 22 or later:

```bash
cp .env.example apps/web/.env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. Resume extraction defaults to [Ollama](https://ollama.com/download); install it and download the model before uploading:

```bash
ollama pull qwen3:4b
ollama serve
```

The defaults use `http://127.0.0.1:11434` and `qwen3:4b`. The optional hosted provider uses `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL`; hosted API usage can incur charges. PDF/DOCX text extraction supports text documents, not scanned image-only PDFs.

## Prepare an application

Follow Resume → Review profile → Discover jobs → Applications:

1. Upload or create a resume, review the extracted facts, and enter authorization answers yourself. You can save and select several resume versions.
2. Search jobs and add them to the queue. Choose **Prepare** for a Greenhouse or Lever posting and review its bound resume.
3. Edit the package preview and check each fact to include. Enter given/family names explicitly; optionally select one education and one experience record and skills. Confirm the target and download the JSON snapshot.
4. Import the package in the extension. On the matching employer form, choose **Review form fields**, select fields, then **Fill selected fields**. Review filled, skipped and failed results.
5. Attach the original resume, complete remaining questions and click the employer’s Submit button yourself. After opening the form, use **Record outcome** in ApplyPilot to confirm what happened.

Downloading or opening never submits an application. Later resume edits do not change a saved package; review a new snapshot to update it.

## Load the extension

```bash
npm run build -w @quick-apply/extension
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/dist`. Reload the extension and employer tab after rebuilding.

The extension fills exact, unique native text/textarea/select fields. It preserves existing answers and skips repeated or ambiguous fields. Legal, demographic, salary, authorization, sponsorship, consent, essays, uploads and unsupported widgets stay manual. Embedded or multi-step forms may need manual completion. The extension never clicks Next or Submit or bypasses CAPTCHA. Other providers, including Ashby, open for manual applications.

## Storage and job coverage

Guest resume profiles use IndexedDB; jobs, application snapshots and authorization answers use local browser storage. After sign-in in a configured deployment, you can import resume profiles and application data to sync across devices. Cloud sync stores extracted profiles, not original resume files; work authorization answers stay local unless separately opted in. See [account setup and data behavior](docs/accounts-cloud-sync.md).

Exported JSON contains selected facts and job/resume identifiers. Keep it private. The extension stores one imported package locally with a delete control; delete downloaded files separately. There is no automatic web-to-extension sync.

Search includes curated employer boards and remote-job feeds, with explicit source attribution and partial-failure reporting. Filters use available evidence; missing experience/work details stay “Not specified.” LinkedIn/Indeed buttons open external searches; their results are not imported. The optional Supabase-backed DOL history drawer reports unavailable when no database/release is configured.

See [source coverage, cache limits, DOL import commands and deployment notes](docs/local-setup-and-data.md). Production account sync needs the Supabase migration and Auth providers configured as described in the account setup guide. Hosted extraction needs a model reachable from the server; `127.0.0.1` points to that server.

## Validate and release

```bash
npm run format:check
npm test
npm run typecheck
npm run build
```

With the app running and Google Chrome installed:

```bash
npm run test:e2e
npm run test:e2e:guided
npm run test:e2e:search
BASE_URL=http://localhost:3000 npm run test:e2e:assist
```

The assist suite needs the built extension and uses intercepted forms with synthetic facts; it submits no real applications. Set `RESUME_PATH` to include extraction in the other browser checks. Use `npm run format` to apply Prettier.

CI validates PRs and pushes on `develop`/`main`. A successful `main` push creates one generated-notes GitHub Release tagged `v<package major>.<minor>.<workflow run number>` (for example, `v0.1.42`). Reruns reuse the same tag; only the release job has write permission. Vercel deploys the app from `main`; the GitHub Release does not publish the Chrome extension.

Details: [application assist](docs/application-assist.md), [manual acceptance](docs/acceptance.md), [code review](docs/codebase-review.md), and [job-source research](docs/multi-source-job-discovery.md).
