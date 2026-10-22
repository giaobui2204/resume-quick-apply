# ApplyPilot codebase review

> Follow-up: the guided flow, IndexedDB multi-resume library, and public-feed discovery were implemented after this baseline review. See [MVP v2 delivery and validation](mvp-v2-plan.md) for current behavior and remaining boundaries.

## 1. Executive Summary

The repository is a small local MVP with useful foundations: strict TypeScript, shared runtime schemas, explicit authorization confirmation, and an extension that leaves final submission to the user. The review found and fixed concrete failures in resume extraction, contact readiness, persisted-data validation, job deduplication, sequential queue handling, extension bundling, and contact-field matching. The largest remaining risks are stale extension state, misleading persistence/provider assumptions, whole-page job scraping, and public-deployment security gaps; the Supabase schema is scaffold rather than an integrated persistence layer. The dominant maintainability issue is concentration of UI, persistence, and workflow rules in one dashboard file, alongside separate schema/profile contracts. This review covers every source, test, configuration, migration, and documentation area; production readiness and real hosted-form extension behavior are not implied by passing local tests.

Review basis: working branch `fix/mvp-flow-review`, October 21–22, 2026. Findings below describe remaining work unless explicitly marked **fixed**. No user resume contents or credentials are included.

## 2. Prioritised Action Items

Priority definitions: **P0** — confirmed data loss, security breach, or production crash; **P1** — likely bugs or meaningful UX/performance degradation; **P2** — compounding technical debt, refactors, and pattern inconsistencies; **P3** — polish and minor developer-experience improvements. Deployment-only risks are identified explicitly rather than presented as active local exploits.

### P0

No confirmed exploitable P0 was established in the local MVP. Dependency audit reports critical advisories, but exploit prerequisites and deployment applicability require assessment under P1-01; severity labels alone are not proof of an exploit in this application.

### P1

#### P1-01 — Resolve vulnerable dependency versions before hosting

- **Affected files/functions:** `package-lock.json`, root/workspace `package.json` manifests.
- **Problem:** `npm audit --json` reports 12 affected packages: 3 critical, 5 high, 4 moderate. These include Next, Sharp, XML parsing, Vite, Vitest/Tinypool, and transitive utilities. Some are development-only or platform/feature-dependent; the application currently does not use every vulnerable feature. Blind `audit fix --force` can introduce incompatible major upgrades or even a Mammoth downgrade.
- **Fix prompt:** “Audit the locked dependencies in this npm-workspace ApplyPilot repository. Separate production paths from development tooling and assess the actual advisory prerequisites. Update compatible Next/Sharp/XML/tooling versions first, then plan necessary major migrations without using `npm audit fix --force` blindly. Preserve PDF/DOCX extraction and extension bundling. Run audit, workspace tests/typechecks/build, and the localhost E2E script; document residual advisories and their reachability.”

#### P1-02 — Refresh extension profile, form fields, and CAPTCHA at action time

- **Affected files/functions:** `apps/extension/src/content.ts`, `mount`, fill click handler.
- **Problem:** Profile, fields, and CAPTCHA are captured once. Saving a profile after opening a page, asynchronous forms, SPA navigation, or a later CAPTCHA leave stale state. The fill button disables after one action, including zero successful fills; a dismissed panel has no reopen control.
- **Fix prompt:** “In `apps/extension/src/content.ts`, reload the verified profile and rediscover eligible fields/CAPTCHA immediately before each explicit fill click. Refresh on relevant storage changes and bounded/debounced form changes, support retry when forms change, and provide a clear reopen mechanism. Keep all submission manual and add lifecycle tests for delayed fields, profile edits, zero fills, and later CAPTCHA insertion.”

#### P1-03 — Make Chrome storage fallback match its promise

- **Affected files/functions:** `apps/extension/src/profile-storage.ts`, `loadVerifiedProfile`, `saveVerifiedProfile`; `popup.html`.
- **Problem:** Sync read/write rejection prevents local recovery despite the UI promising an offline local backup. Parallel save writes can partly succeed but still report failure, and success verification checks Sync only.
- **Fix prompt:** “Choose and implement one persistence policy in `apps/extension/src/profile-storage.ts`: local authoritative storage with optional Sync, or an accurately described Sync-only policy. If local fallback remains, rejecting Sync calls must not prevent valid local loads/saves. Report actual durability/sync status and test read rejection, write rejection, partial success, stale copies, and malformed records.”

#### P1-04 — Import actual job records rather than complete HTML pages

- **Affected files/functions:** `apps/web/app/api/jobs/import/route.ts`, `importJob`, `cleanHtml`, `pathCompany`.
- **Problem:** Generic page title, URL slug, blank location, and flattened full-page text are treated as job facts. Navigation and application questions contaminate sponsorship analysis; HTTP 200 does not establish a readable open vacancy. A real Greenhouse import succeeded but retained a generic “Job Application for …” title and page-wide text.
- **Fix prompt:** “Replace whole-page scraping in `apps/web/app/api/jobs/import/route.ts` with Greenhouse/Lever adapters using authoritative ATS data or validated structured content. Extract actual title/company/location/description/apply URL and reject closed, missing, or unreadable jobs rather than inventing placeholder records. Analyze only job-description text. Add fixtures for both ATSs, closed jobs, and 200-status JS shells.”

#### P1-05 — Bound job-import latency, memory, and duplicate work

- **Affected files/functions:** job import route `POST`, `importJob`.
- **Problem:** Twenty-five serial ten-second fetches can consume roughly 250 seconds. Upstream text is unbounded and canonical-equivalent tracking URLs are still fetched separately, although UI result deduplication is fixed. Already-imported links are also re-fetched before being discarded.
- **Fix prompt:** “Refactor `apps/web/app/api/jobs/import/route.ts` to canonicalize/deduplicate before fetching, use a small bounded-concurrency pool with deterministic results and per-link errors, cap upstream body size, and enforce a total request budget. Preserve the HTTPS host allowlist and redirect rejection. Have `JobsView` avoid unnecessary imports of known canonical URLs. Test timeout/partial-success/oversized-body and duplicate-link cases.”

#### P1-06 — Prevent stale requests from restoring deleted or superseded data

- **Affected files/functions:** `dashboard.tsx`, `ResumeView.upload`, `JobsView.analyze`, `SettingsView` reset callback.
- **Problem:** Navigating away does not cancel requests. Upload completion can overwrite later manual edits; deleting local data during an outstanding request can be followed by a stale callback restoring profile/jobs. Remounting a view also resets its local busy guard while old work continues.
- **Fix prompt:** “Give resume extraction and job import in `apps/web/components/dashboard.tsx` an AbortController and operation-generation guard owned at the appropriate state boundary. Cancel/invalidate operations on reset and unmount; discard stale responses, and prevent extraction from silently overwriting a newer edited profile. Use functional state updates when merging async results. Test delayed responses after navigation, manual edits, repeated requests, and Delete local data.”

#### P1-07 — Protect expensive endpoints before public deployment

- **Affected files/functions:** resume extraction and job import API `POST` handlers; deployment instructions.
- **Problem:** Any caller reaching the server can trigger parsing, local inference, hosted AI charges if configured, and downstream batches. There is no authentication or request/concurrency limiting. This is a hosting blocker, not evidence of a compromise of this local development session.
- **Fix prompt:** “Before hosting ApplyPilot publicly, protect resume extraction and job import before buffering bodies or calling providers. Define supported local versus hosted behavior, require real authorization in hosted mode, and enforce bounded per-user/IP request and concurrency budgets. Do not equate unused Supabase environment values with implemented auth. Test unauthorized hosted calls and resource-budget exhaustion.”

#### P1-08 — Delete hosted provider resume copies after extraction

- **Affected files/functions:** `apps/web/app/api/resumes/extract/route.ts`, `extractWithOpenAI`.
- **Problem:** Files uploaded through the optional hosted provider are never deleted, including inference/schema failures. Browser deletion does not remove remote copies. The current E2E used local Ollama, so this path was reviewed statically.
- **Fix prompt:** “In `extractWithOpenAI` in `apps/web/app/api/resumes/extract/route.ts`, release the uploaded file in `finally` after success or failure. Keep cleanup errors from masking the original result; make response retention intentional and disclose hosted processing accurately. Mock success, inference failure, parse failure, and cleanup failure. Verify the provider’s current official SDK contract before implementing.”

#### P1-09 — Bound document parsing before resource exhaustion

- **Affected files/functions:** resume route `POST`; `apps/web/lib/resume-text.ts`.
- **Problem:** Multipart input is buffered before the ten-megabyte check. Compressed DOCX or many-page PDFs can greatly expand; parsing finishes before silently truncating text to 100,000 characters. Missing facts from truncation are not disclosed.
- **Fix prompt:** “Bound resume ingestion in the extraction route and `lib/resume-text.ts`: enforce request limits before buffering where supported, reject empty files, define decompression/text/page/time budgets, and stop parsing when exceeded. Return a clear rejection or explicit warning rather than silent truncation. Test malformed PDFs/DOCX, expanded content, many pages, and normal valid files.”

#### P1-10 — Enforce owner-consistent database references before integration

- **Affected files/functions:** `supabase/migrations/0001_initial.sql`, applications/events foreign keys and RLS.
- **Problem:** Ownership of a new row does not require its job/resume/device/application references to have the same owner. This is a latent cross-user association/cascade risk when Supabase is activated; the current dashboard does not connect to it.
- **Fix prompt:** “Add a forward Supabase migration enforcing same-user ownership for application job/resume/device references and event application references, including updates and nullable relationships. Use composite owner-aware constraints or explicit owner checks while preserving intended deletion behavior. Test two authenticated users: same-owner references succeed and cross-owner references fail even with known UUIDs.”

#### P1-11 — Make resume review and manual correction complete

- **Affected files/functions:** `dashboard.tsx`, `ResumeView`, `ProfileEditor`.
- **Problem:** Extracted collections are now editable, but users cannot add a missing experience/education/project or remove a fabricated/duplicate entry. The skills input splits/trims on every keystroke, making a trailing comma disappear before a next item can be typed normally. Resume upload completion has no direct action to reach the full editor, while its compact editor omits collections/warnings.
- **Fix prompt:** “Finish manual resume correction in `dashboard.tsx`: add clear full-review navigation after extraction, show warnings immediately, allow adding/removing collection entries with stable IDs, and keep raw skills text during editing so delimiters are not destroyed. Normalize only on an explicit commit or blur. Test adding the second skill by ordinary typing, fixing missing extraction entries, and removing a wrong entry. Keep missing facts blank until the user supplies them.”

### P2

#### P2-01 — Separate UI, persistence, and workflow transitions

- **Affected files/functions:** `apps/web/components/dashboard.tsx` (all views, save handlers, queue rules).
- **Problem:** One file owns all navigation, editing, async requests, storage keys, statuses, queue caps, and cards. Status sets and counts repeat, which makes behavior drift likely; repeated `applications.some` per job is quadratic as history grows. Memoizing every component would add complexity without fixing ownership.
- **Fix prompt:** “Extract focused views and small pure workflow helpers from `dashboard.tsx`. Centralize active/terminal statuses, the queue cap, contact readiness, merge-by-canonical-URL, and status transitions; use one persistence hook/adapter for browser state. Precompute queued URL membership where needed. Preserve current local behavior and E2E contracts, avoid a generic state framework or speculative memoization.”

#### P2-02 — Align queue history, positions, outcomes, and metrics

- **Affected files/functions:** `JobsView.queue`, `ApplicationsView`, `Overview`; shared `ApplicationSchema`; SQL queue constraint.
- **Problem:** Active queue cap is 25, but `queuePosition` uses all-history length and can exceed SQL's 0–24 constraint. Completed jobs stay labeled “In queue,” and both overview/application review counters count `review_required`, a state the local UI cannot reach. Imported legacy statuses can block progression without recovery controls. General “Needs manual help” sets `blocked` without a reason.
- **Fix prompt:** “Define the local queue/history contract across `dashboard.tsx`, shared application schemas, and the future SQL boundary. Keep active positions within the intended range independently of history, label completed jobs accurately, derive metrics from reachable workflow states, and support intentional recovery for stored in-progress states. Capture a useful manual blocked reason without inventing a technical failure. Test history beyond 25 items and legacy states.”

#### P2-03 — Distinguish contact completeness from verified approval

- **Affected files/functions:** `validContact`, `ProfileEditor`, overview step completion; extension profile handoff.
- **Problem:** Name plus syntactically valid email marks the profile ready and the verification step complete; no explicit resume-fact approval is stored. Authorization has an explicit confirmation timestamp, while contact readiness follows another convention. The independent extension profile still requires reentry.
- **Fix prompt:** “Clarify the profile contract in `dashboard.tsx`: label name/email checks as completeness, or persist explicit user review approval and invalidate it when relevant facts change. Do not claim unreviewed AI output is verified. Explain the separate extension profile setup at the handoff and keep authorization approval independent. Add tests showing extraction alone does not falsely imply review.”

#### P2-04 — Recover safely from browser persistence failures and multiple tabs

- **Affected files/functions:** `lib/storage.ts`; dashboard `persist`, reset/hydration callbacks.
- **Problem:** Read validation and write-error reporting are fixed. The warning remains permanently after a failure, successful saves do not retry earlier unsaved keys, reset `removeItem` can still throw, invalid stored data silently becomes empty state, and separate tabs can overwrite whole arrays/profile snapshots without change coordination.
- **Fix prompt:** “Complete the small browser repository in `lib/storage.ts` and dashboard: return explicit load/save/remove results, expose recoverable corruption/storage failure state, retry unsaved keys before clearing warnings, and define last-writer behavior or listen to storage events for multiple tabs. Handle denied deletion without claiming durable erasure. Test partial save failure, successful recovery, denied reset, invalid shapes, and cross-tab updates without introducing a fallback data source.”

#### P2-05 — Use one extraction contract and predictable API errors

- **Affected files/functions:** shared `ResumeExtractionSchema`, `lib/resume-schema.ts`, `lib/parse-resume.ts`, provider helpers, resume route.
- **Problem:** Provider JSON Schema and runtime schema are manually maintained. Scheme-less URL normalization and safe validation errors are now shared, but malformed JSON/SDK errors still use inconsistent messages and multipart parsing occurs outside the route's controlled error boundary.
- **Fix prompt:** “Make the shared resume runtime schema the source of the provider-generation contract, preserving strict provider object requirements and deliberate missing-field defaults. In resume API/provider helpers, return stable safe JSON errors for malformed multipart, model JSON, validation, configuration, timeout, and SDK failures. Keep useful Ollama startup/pull guidance and avoid logging or returning resume values/keys. Test contract agreement and malformed-request cases.”

#### P2-06 — Strengthen extension stored-profile validation and recovery

- **Affected files/functions:** `profile-storage.ts`, `isProfile`; `popup.ts`, `init`, `formatTime`.
- **Problem:** Empty names/emails and invalid timestamps pass type-only storage validation. Formatting an invalid timestamp can throw before form handlers register, preventing correction; any nonempty timestamp can unlock content behavior.
- **Fix prompt:** “Validate trimmed required contact fields, email syntax, and a finite parseable verification timestamp in `apps/extension/src/profile-storage.ts`. Register popup edit/save handlers independently of saved-record presentation so corrupt storage is recoverable. Test invalid dates, blank fields, malformed email, and rejected loads; invalid data must not unlock autofill.”

#### P2-07 — Isolate panel styling and make status accessible

- **Affected files/functions:** `apps/extension/src/content.ts`, panel markup/CSS.
- **Problem:** Host-page CSS can affect nested header/main/button elements despite root `all: initial`. A fixed 300px panel plus margins can overflow very narrow pages, and completion is only button text. Summary counts include fields that will be skipped. Inherited disabled fieldsets also need `:disabled` checks in the mapper.
- **Fix prompt:** “Mount the extension panel in an isolated shadow root with accessible status/close controls, responsive width, and scoped highlighting. Derive fillable/already-populated/review counts from the same eligibility logic as filling, disable zero-work actions with an explanation, and check inherited disabled state via `:disabled`. Test aggressive host CSS, narrow layouts, keyboard use, fieldset disabling, and accurate completion announcements.”

#### P2-08 — Keep sponsorship uncertainty conservative

- **Affected files/functions:** `lib/job-intelligence.ts`, `assessSponsorship`; job evidence UI.
- **Problem:** Screening questions, unrelated negation, category isolation, and explicit timing received regression fixes. Remaining clause splitting can lose coordinated phrases such as “OPT and CPT candidates welcome,” and uncommon conditional/time wording remains heuristic. UI shows only future H-1B even though the model has separate now/future fields; fixed confidence numbers are rule constants rather than calibrated probabilities.
- **Fix prompt:** “Extend conservative sponsorship tests in `lib/job-intelligence.ts` for coordinated categories, pronoun/conditional scope, and temporal synonyms; preserve exact evidence and default to unknown when scope is unclear. In the job card show explicit H-1B now/future labels when distinguished. Do not present rule constants as calibrated probabilities or add fallback invented conclusions.”

#### P2-09 — Resolve PDF runtime assets by installed package identity

- **Affected files/functions:** `lib/resume-text.ts`, `resolvePdfWorker`; `next.config.ts`.
- **Problem:** Worker lookup probes cwd and two ancestor node_modules directories. That works for the current hoisted workspace but is fragile for standalone/traced deployment layouts.
- **Fix prompt:** “Resolve the PDF.js worker relative to installed `pdfjs-dist` rather than three cwd paths, and include it in production deployment output where needed. Validate a real PDF from workspace dev and production build/start. Preserve worker/document cleanup and avoid embedding machine-specific paths.”

#### P2-10 — Tighten domain constraints at the correct boundary

- **Affected files/functions:** shared `WorkAuthorizationSchema`, `ApplicationSchema`; authorization UI.
- **Problem:** Authorization dates accept arbitrary strings and inconsistent ranges; queue bounds differ from SQL. Confirmation can be applied to contradictory/invalid date data. Local/model item IDs are intentionally not database UUIDs, so blanket UUID coercion would break valid local behavior.
- **Fix prompt:** “Align shared schemas and profile UI with optional valid calendar dates, coherent authorization ranges, and the chosen queue-position invariant. Validate database UUIDs only at persistence boundaries, keeping generated extraction/local IDs supported. Surface actionable input errors and test boundaries without inferring anyone's legal status.”

#### P2-11 — Complete database operations only when integrating them

- **Affected files/functions:** initial SQL migration; README production instructions.
- **Problem:** No updated-at triggers, child-FK indexes, storage-bucket policies, or explicit append-only event policy exist. The README describes future production work; no runtime DB queries currently exist, so N+1 queries/`select *` overfetching are not current issues.
- **Fix prompt:** “Before adding Supabase queries, create forward migrations for reliable updated_at values, application child-FK indexes used by actual reads/cascades, intended event-history permissions, and owner-scoped private resume storage. Validate as authenticated users. Keep the current local MVP honest and avoid speculative indexes or unused caching layers.”

#### P2-12 — Simplify dynamic editor fields without losing types

- **Affected files/functions:** `ProfileEditor`, collection `Object.entries`/computed-property updates.
- **Problem:** Generic key rendering reduces code repetition but hides field-specific behavior, renders every string as a plain input, and weakens section/key correspondence. Collection labels repeat across entries; dates/highlights/descriptions have different editing needs.
- **Fix prompt:** “Extract small typed collection editors or typed field descriptors from `ProfileEditor`. Preserve section/key type correspondence, unique accessible labels, stable IDs, multiline descriptions/highlights, and explicit date/current behavior. Avoid a broad form-builder abstraction; test actual user edits to each collection.”

#### P2-13 — Make browser validation reproducible across environments

- **Affected files/functions:** `scripts/test-mvp.cjs`, package scripts; missing CI configuration; acceptance docs.
- **Problem:** The new E2E script runs isolated Chrome and optionally a caller-supplied real resume, but requires installed Google Chrome and a separately running server. Job UI tests intentionally use fixtures and do not validate live ATS parsing, installed extension behavior, hosted AI, or Supabase. No persisted CI job enforces the checks.
- **Fix prompt:** “Document and automate `npm test`, `npm run typecheck`, production build, and `npm run test:e2e`. Make the browser/server prerequisites explicit or add a minimal Playwright runner setup for CI; keep RESUME_PATH optional and private. Add separate ATS adapter and installed-extension lifecycle checks as those contracts stabilize. Do not describe mocked job UI tests as live-site E2E coverage.”

### P3

#### P3-01 — Match environment instructions to workspace execution

- **Affected files/functions:** README setup, `.env.example`, web workspace scripts.
- **Problem:** **Fixed in this branch:** instructions now copy `.env.example` to `apps/web/.env.local`, which Next actually loads. Unused Supabase/encryption placeholders still imply capabilities that are not implemented.
- **Fix prompt:** “Preserve `apps/web/.env.local` in ApplyPilot setup instructions. Mark unused database/pairing values as reserved or remove them until integration, and verify dev/build/start all receive an explicit provider override without exposing secrets.”

#### P3-02 — Improve navigation, feedback, and local privacy wording

- **Affected files/functions:** dashboard navigation, notices, Settings; `styles.css` font import.
- **Problem:** View state is memory-only, so reload/back/deep links do not preserve navigation. Several async notices lack live announcements or consistent error styling; Delete local data gives no explicit success feedback. External Google Fonts create a network dependency, while copy makes broad privacy/AI accuracy claims. No resume facts are sent by the font request, but the dependency should be intentional.
- **Fix prompt:** “Improve local dashboard feedback with consistent status/alert semantics, visible save/delete outcomes, and intentional URL navigation if deep links/back are required. Make privacy copy accurately describe browser storage, Ollama versus hosted processing, separate extension storage, and AI review limitations. Prefer system/self-hosted fonts if external requests are unnecessary. Preserve current visual hierarchy and test keyboard/mobile flows.”

#### P3-03 — Remove misleading names and build/test scaffolding

- **Affected files/functions:** `lib/demo-data.ts`; shared/package/web manifests; `ollama.test.ts`; unused application route.
- **Problem:** Initial empty values are named demo data; shared build emits dist while exports/types still point to source; `--passWithNoTests` hides accidental loss of web tests; an unused API returns 201 without persistence; environment cleanup deletes rather than restores an existing test variable.
- **Fix prompt:** “Batch safe cleanup in ApplyPilot: rename demo-data to initial-state, choose deliberate source-only or dist-backed shared exports/build, remove passWithNoTests while tests exist, use vi.stubEnv/unstubAllEnvs, and delete the unused echo-only application endpoint after verifying no callers. Update imports/lockfile/scripts consistently and run tests/typechecks/build.”

### Fixed and verified during this review

- Real-PDF extraction failure from LinkedIn/GitHub URLs without schemes: shared normalization adds only HTTPS syntax to existing domain URLs; invalid fields fail with a safe message.
- Invalid email previously displayed READY: name/email readiness validation fixed.
- Hidden extraction collections: existing experience/education/project/certification/GitHub/portfolio facts now have editor controls.
- Mobile sidebar intrinsic-width overflow fixed; navigation stays within a 390px viewport.
- Resume picker keyboard access, drag/drop, same-file retry, size/type checks, and same-instance overlapping upload guard fixed.
- Duplicate jobs within import response, duplicate queued jobs, empty/over-limit imports, and the 25-active-application cap handled.
- Sequential preparation enforced; user-recorded submission, manual-help handoff, retry, removal/reindexing added. This does not automate actual submission.
- Sponsorship evidence displayed per category; rule regressions fixed for screening questions, negation, category isolation, and explicit timing.
- Job hostname substring matching replaced with strict HTTPS host/path allowlists; redirects rejected.
- Corrupt/old local JSON shapes validated; incomplete drafts remain editable; denied writes now show a session-only warning.
- Extension content script emitted as a standalone classic-compatible IIFE; dependency changes included in build watch.
- Broad name substring autofill replaced with conservative contact whitelist, supported-control checks, native label resolution, protected-field exclusion, matching select options, and actual-value success verification.

## 3. Quick Wins

Batch prompt:

> In this ApplyPilot npm workspace, make only low-risk cleanup: remove unused `@quick-apply/shared` from the extension manifest dependencies, remove unused `activeTab` permission, delete the uncalled echo-only application API and unused `VerificationSchema`, remove `--passWithNoTests`, rename `lib/demo-data.ts` to `initial-state.ts` with import updates, and replace Ollama test environment deletion with restore-safe stubbing. Mark unused Supabase/pairing env settings explicitly as future-only or remove them. Avoid changing runtime workflow. Update the lockfile and run workspace tests, typechecks, and extension build.

Other small changes: fix `fieldset :disabled` eligibility; add live status roles to async notices; provide a direct full-profile-review button after resume upload; consolidate repeated status sets and terminal-status names. Shared dist output should only be removed after deliberately choosing source exports.

## 4. Redundancy Removal Log

- **Candidate:** `apps/web/app/api/applications/route.ts` — no callers; validates and echoes with 201 but persists nothing.
- **Candidate:** `packages/shared/src/index.ts` `VerificationSchema` — exported without any consumers or runtime usage.
- **Candidate:** `apps/extension/package.json` dependency `@quick-apply/shared` — extension imports none of it.
- **Candidate:** `apps/extension/public/manifest.json` permission `activeTab` — no tabs/scripting API usage; static content scripts already target supported sites.
- **Candidate:** `.env.example` `APP_ENCRYPTION_KEY` — unused future-pairing placeholder.
- **Candidate:** `.env.example` `SUPABASE_SERVICE_ROLE_KEY` — unused privileged configuration; retain only when implemented server integration requires it.
- **Candidate:** `.env.example` public Supabase URL/anon key — unused current integration scaffolding; remove or explicitly reserve.
- **Candidate:** web test script flag `--passWithNoTests` — tests exist and should not disappear silently.
- **Conditional candidate:** shared generated `dist` and root shared emit step — unused while package exports resolve source; choose package convention first.
- **Conditional candidate:** `content.ts` module-global `matches` — action/panel-local state is sufficient after lifecycle refactoring.
- **Removed:** dashboard `activeCount` — computed but unused.
- **Removed:** job-route inline ATS/canonicalization/sponsorship helper copies — replaced with reusable tested job-intelligence boundary.
- **Removed:** extension broad name substring matcher and ineffective `autocomplete.*name` alternation — unsafe/redundant inference replaced with exact supported-field rules.
- **Removed:** repeated whole-document label scans in extension mapper — native `.labels` and `aria-labelledby` provide direct association.

### Coverage and validation notes

Reviewed: all web entrypoints/styles/dashboard views; every web API/library/test; every extension source/test/HTML/manifest/build/test configuration; the complete shared package; the full Supabase migration; root/workspace manifests and TypeScript/Next configuration; README, acceptance checklist, `.env.example`, `.gitignore`, and dependency lock/audit results. No runtime database queries, server cache, or remote profile-sync implementation exists to evaluate for N+1/egress; adding those speculatively would be over-engineering. Small local counts do not justify broad memoization, virtualization, or a new state-management framework.

Validation includes focused regression tests, all-workspace tests/typechecks, extension production build and classic-script parsing, isolated Chrome UI flow checks, a public Greenhouse import, and a real user-supplied PDF through local Ollama. See the PR for final executed results and any failure limitations; fixtures do not prove live ATS/extension compatibility. The original PDF and extracted personal data are not committed.

Final results: 38 workspace tests pass; workspace typechecks and full production build pass. Real-PDF extraction/profile persistence and queue transitions passed in Chrome; that run identified mobile overflow, which was fixed and followed by a complete passing no-resume browser regression run across all six mobile views and local deletion. Independent agent review approved the scoped local-MVP changes.
