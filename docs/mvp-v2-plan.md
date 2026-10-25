# MVP v2: guided workflow, resume library, job discovery

## Product intent

Make the complete application-preparation journey usable without repeatedly returning to the navigation menu. Let a candidate maintain several truthful resume variants without duplicating large payloads or overwriting queued work. Discover real vacancies from multiple supported public employer feeds, while keeping source evidence, user review, and final submission explicit.

The current application is a local MVP: profiles, jobs and applications use browser persistence; `supabase/migrations/0001_initial.sql` is an unconnected hosted-database scaffold. This iteration must improve the runnable local product and the future database contract without presenting a migration file as a live database integration. It must not enable paid providers, change billing configuration, or submit applications.

## Roles and implementation ownership

- Product manager: `docs/mvp-v2-plan.md`; scope, acceptance criteria, edge cases, and implementation handoff.
- Engineer: `apps/web/lib`, API routes, shared schemas, forward SQL migrations, focused backend/storage tests. Own reusable resume persistence and ATS adapters.
- UI designer/engineer: `apps/web/components/dashboard.tsx`, focused UI components, and `apps/web/app/styles.css`. Own the guided journey, resume library controls, discovery controls and responsive/accessibility behavior.
- Integrator: coordinate contracts, resolve cross-area integration issues, run complete regression checks and independent review, document remaining limits, and use a separate branch/PR targeting `develop` under the existing authorization.

Agree on repository/adapter return shapes before connecting UI. Prefer small domain helpers and focused components; do not build a generic workflow engine, universal crawler, form framework or speculative remote-data cache.

## 1. Guided application journey

Primary sequence: **Resume → Review profile → Discover jobs → Application queue**. Overview is a starting/re-entry page; Settings remains separate.

Acceptance criteria:

1. Each primary stage displays its position, purpose, Back where applicable, and a contextual Next button. A first-time user can reach the queue using these controls without clicking the sidebar.
2. Resume upload success offers direct full-profile review. Existing resumes can be selected; users can also continue with manually entered facts rather than being forced to upload.
3. Readiness checks use actual domain state: a valid nonblank name/email, deliberate authorization confirmation, and at least one queued job where relevant. A disabled action explains the exact missing prerequisite and offers its corrective action. Discovery browsing itself should remain possible without legal-answer entry; preparing an application must require reviewed inputs.
4. Extracted data is described as unreviewed until the candidate reviews it. Never infer authorization from a resume or use contact completeness as proof of review.
5. Busy extraction and discovery states cannot trigger duplicate requests. Switching stages or resetting data invalidates obsolete asynchronous responses so they cannot restore deleted data or overwrite a newer profile.
6. Back/Next navigation preserves valid edits. The selected resume is visible wherever the user prepares or queues an application. Switching it does not silently change previously queued/submitted application records.
7. Buttons have accessible names, keyboard focus treatment and live status/error feedback. At a 390px viewport the flow, source controls, library and footer do not overflow.
8. Existing sidebar navigation remains useful for revisiting stages; no artificial click-through requirement is added for already-completed setup.

## 2. Multiple resumes and efficient persistence

### Local MVP contract

Use an asynchronous browser repository appropriate for growing records (IndexedDB), rather than adding base64 PDFs or an ever-growing array of complete extracts to localStorage. Separate lightweight resume-list metadata from individual extracted profiles and any retained document blobs. Do not retain originals unless an actual product capability needs them; explain the chosen behavior.

Acceptance criteria:

1. A resume record has a stable ID, user-visible filename/name, creation/update timestamps, content hash when uploaded, and its own extracted profile. Active selection references a record ID rather than duplicating its content.
2. List reads load metadata only. Opening/selecting a resume loads that profile alone. Editing it writes that record, not the entire library. Original files are never encoded into localStorage.
3. Hash a file before inference and reuse an existing completed record on duplicate upload; do not call the extraction provider again for identical bytes. An in-flight/error extraction must not count as a successfully reusable record.
4. At least two different resume variants survive reload, can be selected and edited independently, and have clear active-state feedback. Failed uploads and persistence failures preserve the previously selected usable resume.
5. Existing `applypilot.profile` data migrates without dropping manually edited/incomplete fields. Persist the new record and active reference successfully before removing any legacy data. A failed migration remains recoverable and does not repeatedly create duplicate records.
6. Queue entries capture the selected resume ID (and a stable profile snapshot/version if required by the existing local contract). Selecting another active resume never rewrites queued history. Deleting a referenced record is either blocked with a clear reason or preserves the necessary historical snapshot; no accidental cascade loss.
7. Delete and Delete local data include the resume repository. Report failed deletion honestly. Async completion after deletion cannot restore a resume.
8. Browser storage unavailable/full/corrupt states produce actionable feedback; never claim a successful durable save while only displaying session memory. Personal resume contents, fixtures and original files are not committed to Git.

### Hosted database contract

Add a forward migration rather than rewriting the applied initial migration. Keep binary originals in owner-scoped object storage and references/extraction data in database rows; use list projections, lazy profile reads and cursor pagination when queries are integrated. A unique live `(user_id, sha256)` constraint prevents repeated document storage; an owner/date/id index supports metadata listing. Retain at most one active live resume per owner, ensure application/resume references have the same owner, and preserve intended deletion behavior. No credentials or hosted provisioning are implied by this work.

A SQL migration can be reviewed statically here; claiming database performance, authorization or migration execution requires a real database test. Document this limitation when such a runtime is unavailable.

## 3. Automatic job discovery

### Scope

Use public ATS job-board APIs for Greenhouse and Lever, across a small explicit set of employer boards. These are different ATS sources and multiple employers, not a promise of internet-wide search. Source configuration must be validated and bounded; never fetch arbitrary user-supplied hosts or bypass access controls. Keep manual supported job-link import as an optional secondary path.

Acceptance criteria:

1. Opening discovery retrieves current public vacancies from configured sources; manual refresh and a truthful last-refreshed indicator are available. Describe refresh-on-open/manual-refresh honestly: no background scheduler or continuous crawl is implemented unless one actually runs.
2. Render real title, employer, location, canonical/apply URL and ATS provenance from authoritative records. Analyze only actual job descriptions. Missing, closed or malformed vacancies are omitted with a useful source error; do not invent titles, fallback jobs or sponsorship evidence.
3. Discover jobs before requiring individual URL entry. Provide keyword/location filtering and source visibility; a no-match empty state explains how to broaden filters. If result counts are capped or cover selected employers only, disclose this in the interface.
4. Canonical URLs/external IDs deduplicate discovery, manual imports and queued jobs. Refresh updates existing jobs rather than adding duplicates. Existing queue/submitted status remains understandable.
5. Network requests have bounded source count, concurrency, time and response size. Repeated reads reuse a bounded short-lived server cache; refresh behavior does not allow unlimited cache growth or duplicate upstream work. Show source failures independently so one failed board does not hide valid results.
6. Delay/missing-source/timeout/429 cases produce honest retryable status. Do not silently substitute stale or fabricated jobs. If cached results are returned, their timestamps and cache semantics must remain accurate.
7. Sponsorship labels remain conservative with exact supporting evidence and unknown where absent. Do not describe a keyword classifier as employer verification or calibrated certainty.
8. Queue flow retains the 25-active-application cap and sequential preparation. Discovery never auto-submits or opens dozens of application tabs.

## Verification and review checklist

- Unit tests: resume record validation, legacy migration success/failure, hash dedup, metadata/profile separation, deletion and referenced-history semantics; feed adapters with real-shaped fixtures, malformed records, canonical duplicates, timeout, partial failures and bounded response/cache behavior.
- Browser flow: fresh storage → upload or manual profile → review/authorization → discovery → queue using Next/Back only; two resumes, switch/edit/reload/delete; duplicate upload avoiding extraction; reset while extraction/discovery pending; mobile width and keyboard navigation.
- Integration: run workspace tests, typechecks and production build, then E2E with optional user-authorized resume. Live ATS smoke checks supplement fixtures and must be identified separately from mocked tests.
- Review: inspect all changed code for correctness, deletion safety, PII retention, SSRF, bounded network/storage work, stale async updates, reusable contracts, unnecessary abstractions and misleading UI copy.
- Report actual executed checks and remaining boundaries. Hosted database, installed-extension handoff, broad internet crawling and unattended scheduling remain separate work unless explicitly implemented and validated.

## Deferred work

Authenticated Supabase runtime integration and storage policies; paid job aggregators; LinkedIn/Indeed scraping; scheduled background collection; ranking trained on personal history; automatic tailored-resume generation; auto-submission; generic search infrastructure. These require separate product/security/operational decisions and are not necessary to validate this iteration.

## Product-management source and evidence discipline

At the user's request, planning guidance was read from Dean Peters' [Product Manager Prompts](https://github.com/deanpeters/product-manager-prompts). The repository README distinguishes copy/paste prompts from its companion skills repository; its sole current `SKILL.md` concerns unrelated PM archetypes, so it was not invoked. Relevant sources are [user-story-prompt-template.md](https://github.com/deanpeters/product-manager-prompts/blob/main/prompts/user-story-prompt-template.md), [user-story-splitting-prompt-template.md](https://github.com/deanpeters/product-manager-prompts/blob/main/prompts/user-story-splitting-prompt-template.md), and [prd-prompt-template.md](https://github.com/deanpeters/product-manager-prompts/blob/main/prompts/prd-prompt-template.md). Their guidance informed persona-focused acceptance, workflow/dependency splits, and explicit evidence/assumptions; no repository scripts were run and no packages were installed.

Evidence: the candidate explicitly reported that progression currently requires navigation clicks, asked how several resumes should be managed, and requested jobs appear without pasting individual postings. Source inspection confirms a single profile key, whole-array browser persistence and an unconnected Supabase scaffold. There are no observed conversion or performance baselines; the checks below are release acceptance targets rather than invented user metrics.

Assumptions to validate: selected employer boards are useful enough for the first discovery release; browser-local resume storage meets the immediate single-device use case; metadata-only listing and bounded source fetches are sufficient at local-MVP scale. Cross-device access, large-scale employer coverage and job relevance ranking remain unvalidated.

## Six delivery stories and ownership

### Story 1: Continue without menu hunting

- **As a** candidate preparing an application,
- **I want to** choose the next action within my current step,
- **So that** I can progress without rediscovering the navigation menu.
- **Given** a usable profile or a clearly identified missing prerequisite,
- **When** I choose the contextual Next action,
- **Then** I reach the next useful stage or its specific corrective action with my edits preserved.
- **Owner:** UI designer; domain predicates reviewed by engineer.

### Story 2: Keep independent resume variants

- **As a** candidate applying to different kinds of roles,
- **I want to** select a saved resume variant,
- **So that** the relevant version can be reviewed without losing my other variants.
- **Given** two successfully persisted resume records,
- **When** I select one record,
- **Then** that record's own editable profile becomes active while the other record remains unchanged.
- **Owner:** engineer repository contract; designer library controls.

### Story 3: Reuse an identical upload

- **As a** candidate re-uploading a document,
- **I want to** reuse its existing successful extraction,
- **So that** I do not wait or incur provider work for identical bytes.
- **Given** a completed stored document with the same SHA-256 hash,
- **When** I upload that file again,
- **Then** its existing resume record is selected without another extraction call.
- **Owner:** engineer hashing/repository; designer feedback.

### Story 4: Preserve application resume history

- **As a** candidate with prepared applications,
- **I want to** change my active resume safely,
- **So that** prior applications retain their intended resume association.
- **Given** an application queued against resume A,
- **When** I select resume B,
- **Then** the queued application still references A with an understandable historical label.
- **Owner:** engineer shared application contract; designer queue display.

### Story 5: Discover real vacancies automatically

- **As a** candidate seeking supported application forms,
- **I want to** open job discovery,
- **So that** real public vacancies appear without individual posting URLs.
- **Given** configured supported employer boards and at least one reachable source,
- **When** I open discovery,
- **Then** a bounded deduplicated list of real source-attributed vacancies appears with truthful loading and source-error feedback.
- **Owner:** engineer adapters/API; designer discovery experience.

### Story 6: Narrow discovered jobs

- **As a** candidate reviewing a source feed,
- **I want to** filter discovered jobs by keyword and location,
- **So that** I can find relevant vacancies and queue selected ones efficiently.
- **Given** discovered jobs with actual source metadata,
- **When** I change a filter,
- **Then** matching vacancies or an actionable no-match state appear without redundant upstream requests.
- **Owner:** designer filters; engineer stable metadata contract.

Implementation order: agree contracts, deliver independent persistence and ATS adapters in parallel, connect guided UI, then run integrated acceptance. Do not expand the frozen six-story scope with unattended scheduling or hosted integration during implementation; log those as follow-up work.

## Release signals and open risks

Targets: complete the primary journey with zero required sidebar clicks; persist and switch two independent resumes after reload; make zero extraction calls on a completed duplicate upload; preserve the resume association of an existing queued application; show valid discovered jobs despite one failed source; keep the mobile viewport free of horizontal overflow. These are directly testable targets, not measured adoption improvements.

Failure signals: profile overwrite after switching, stale request restoring deleted records, inferred or fabricated sponsorship claims, unsaved data presented as durable, unbounded source requests, whole-library rewrite on each field edit, or a discovery UI claiming coverage beyond its configured boards.

The highest remaining product assumption is useful employer coverage. The least expensive validation is a candidate reviewing one real refreshed feed from each supported ATS and attempting the full guided journey with two resume variants. The data-safety risk is more serious than cosmetic polish and must block release if queue/history or migration tests fail. Hosted-database ownership/performance remains a separate validation boundary until real SQL execution is available.

Self-review: acceptance and role boundaries are concrete; candidate-demand evidence is direct but job relevance evidence is thin. Validate board usefulness and two-resume behavior before adding more sources or infrastructure.

## Delivered verification and scope

Implemented separate components for guided navigation, resume-library controls, and discovery; IndexedDB metadata/profile stores; pre-inference hash deduplication; authoritative Greenhouse/Lever feed adapters; bounded five-minute board caching with coalesced requests; current-result filtering and refreshed-job merging; application resume association and protected deletion. Deleting the final unreferenced resume creates a durable blank record. Browsing jobs does not require authorization confirmation; Prepare requires valid reviewed contact/authorization and the queued resume selection, with a direct review action.

Executed: 43 workspace unit tests, all workspace typechecks, and the complete production build pass. Both Chrome browser suites pass, including existing queue behavior, guided Next flow, two independent resumes, reload, duplicate upload avoiding extraction, rename, referenced-resume deletion protection, last-resume deletion durability, partial discovery errors, all mobile stages, local reset, legacy incomplete-draft migration, corrupt legacy recovery, and migration idempotence. Discovery live smoke returned five shown of 452 matching jobs across Anthropic/Figma/Palantir with no source errors at check time; this is a point-in-time check, not a promise of future availability. Browser extraction in this iteration uses fixtures to avoid unnecessary AI work; the real PDF extraction path was verified in the preceding iteration.

The SQL migration was statically reviewed, not executed against a Supabase/Postgres instance. The library does not retain original files, sync across devices, or freeze immutable profile contents for application history; referenced resumes cannot be deleted while applications reference them. Editing a referenced profile still edits that saved variant, and full immutable application snapshots remain future work alongside actual extension pairing.

The engineer also read the user-supplied [Prompts for Software Engineers](https://github.com/wycoconut/Prompts-For-Software-Engineers), specifically README optimization/review guidance and [AI-Assisted-Coding.md](https://github.com/wycoconut/Prompts-For-Software-Engineers/blob/main/AI-Assisted-Coding.md). It is prompt guidance rather than an installed skill; no downloaded scripts or packages were executed.
