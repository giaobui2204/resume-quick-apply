# Application assist v1

A user reviews an application-bound snapshot, downloads it as JSON, imports it into the Chrome extension, and selects detected fields before filling them. The employer’s final Submit button remains manual. Recording “Submitted” requires an explicit self-report confirmation in the web app.

## Supported facts

Contact fields include legal/given/family names, email, phone, LinkedIn and location. Given/family names are entered explicitly. Users may choose one education and one experience record and opt into school, degree, field of study, current company/title and skills. Non-current experience values start unchecked. Export includes selected facts and provenance, job/resume identifiers and review timestamps. It excludes the original attachment, authorization answers and the rest of the resume.

Packages use a strict versioned schema. The extension imports at most 100 KB and stores one package in `chrome.storage.local`; it does not use Chrome Sync. Host-page DOM receives only the fields the user chooses to fill. Profile values and the export JSON are never inserted into an employer-page preview or logged.

## Filling and outcomes

Only matching Greenhouse/Lever canonical job URLs are accepted. Legacy Greenhouse hosted domains normalize to the current host, and Lever’s `/apply` suffix normalizes to the posting. Each inspect/fill command rescans the live form and checks its target. Native empty controls with exact unique reviewed keys are eligible; existing, repeated, protected, disabled, unsupported and non-exact select options remain manual. The popup shows proposed values, provenance and unresolved required controls. Nothing starts selected.

The content script reports filled/skipped/failed counts and checks values after input/change dispatch and a short render delay. This is not a guarantee that a site will retain an answer forever. Rescan after a conditional form change or new step. Iframes, shadow widgets, uploads and complex repeated sections are not automated.

The dashboard stores prepared snapshots separately from mutable resumes. Downloading/opening never marks an application submitted. Outcomes are user reports, not employer confirmations; unknown and manual-help states remain available.

## Release automation

`.github/workflows/validate-web.yml` validates PRs/pushes on develop/main. A successful main push enables a separate release job with `contents: write`. `scripts/release-main.cjs` creates a generated-notes release for the workflow’s exact SHA using the package major/minor and workflow run number as patch. It skips an existing matching release, refuses a mismatched tag/commit, and propagates network/auth lookup errors. No release runs for PRs, develop pushes, or failed validation.

## README edit review

The full README was edited using `no-ai-slop/SKILL.md` and checked against its `eval.md`. Editing principles 1–11, word checks, pattern checks 1–9 and final-read checks 1–4 passed; the detect-only item is not applicable. Setup/import commands and filing-history caveats remain. Repeated discovery descriptions, dated milestone claims and promotional phrasing were removed. The updated README is the full edited artifact; this paragraph records what changed.
