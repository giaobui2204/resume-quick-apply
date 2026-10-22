# Job search redesign: evidence-driven filtering

## Problem and desired outcome

The candidate sees a broad generic feed and cannot quickly isolate vacancies at a suitable experience level. The current three-board coverage is useful for proving discovery but is not personalized search. The goal of this iteration is an intentional search workspace: clear criteria, readable real-job results, and transparent limits, while retaining the existing review and application queue.

This is a product hypothesis rather than validated conversion research: explicit experience/work-mode/employment filters should reduce irrelevant scanning. Success is a candidate finding actual new-grad/intern or experienced roles without guessing keywords or seeing fabricated labels. No AI ranking, resume-derived experience inference, paid aggregator or new provider is required.

## Primary-source research

Research checked live public pages and official API documentation during this iteration. Postings can change; these are evidence of supported terminology, not permanent vacancy guarantees.

- [Figma early career](https://www.figma.com/careers/early-career/) separates internships from full-time early-career positions. Its current role list includes explicit intern and early-career titles, supporting distinct filters rather than interpreting all jobs as entry level.
- [Palantir public board](https://jobs.lever.co/palantir) exposes new-grad titles, workplace arrangements and employment commitments. A current software-engineer new-grad listing combines Hybrid and Full-time; internship listings are independently labeled. This supports three separate dimensions rather than one broad seniority tag.
- [Anthropic open roles](https://www.anthropic.com/careers/jobs) includes Staff and Senior titles alongside unlabeled engineering roles. Generic engineering titles do not establish a seniority level.
- [Lever Postings API](https://github.com/lever/postings-api) documents `workplaceType` and commitment categories. Structured ATS metadata is preferred to text inference.
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html) returns titles, location and optional metadata/content; it does not guarantee a universal seniority or work-mode field. Missing classification remains Not specified.

Planning follows the previously requested [Dean Peters user-story guidance](https://github.com/deanpeters/product-manager-prompts/blob/main/prompts/user-story-prompt-template.md): separate user outcomes, single triggering actions, testable acceptance and labeled assumptions. No external prompt source requires new paid services or a workflow approval gate here.

## Classification contract

Persist optional `classification` on job snapshots, with experience, workMode, employment and per-dimension evidence arrays. Legacy/imported records lacking it remain valid and are classified at one reusable boundary when necessary. One pure shared classifier/filter helper should power API filters, fixtures and result badges rather than repeating regex rules in components.

| Dimension | Values | Evidence rule |
| --- | --- | --- |
| Experience | intern, entry, mid, senior, lead, management, unknown | Explicit title/category signals only; management may be omitted only if grouped under an accurately named leadership label. |
| Work mode | remote, hybrid, onsite, unknown | Structured workplace metadata first, then explicit title/location wording; do not infer on-site merely from a city. |
| Employment | full_time, part_time, contract, internship, unknown | Structured commitment first, then explicit title/category wording; do not infer full-time from a generic title. |

Experience matching: Intern/Internship; Junior/Jr/New Grad/Early Career/Entry Level; explicit Mid-level/Intermediate; Senior/Sr; Staff/Principal/Lead; Manager/Director. Use word boundaries so Internal never means Intern. Bare Graduate can describe an academic field rather than hiring level; generic Software Engineer, Research Scientist and title numerals such as II remain unknown without explicit mapped evidence. Years alone do not define level, and arbitrary description mentions such as managing stakeholders do not establish management. Conflicting independent seniority cues remain unknown unless a deliberately tested combination is unambiguous. Internship takes precedence over academic or research wording.

Remote-friendly language may include geographic/travel restrictions. Preserve full original location/evidence beside the mode badge; a Remote label never means worldwide eligibility. Missing and ambiguous facts stay unknown rather than silently displayed as positive matches.

## UI and search strategy

1. Put role keywords/location in a focused search area, with experience level, work mode, employment and source visible as deliberate filters. Default is Any; do not assume the candidate is entry level from student-focused branding.
2. Make experience a primary control. A clearly labeled optional early-career preset can select intern/entry only; no hidden personalization.
3. Use an intentional results workspace with concise rows/cards, visible company/title/location, classification badges, source link and one queue action. Keep exact evidence inspectable and sponsorship separate from experience.
4. Show active criteria and an obvious Clear all action. A typed draft should not make the result list falsely appear already filtered; submitted and draft criteria must be clearly distinguished or filters must consistently apply immediately.
5. Display matching count and shown/page count from the same filter computation. Filtering occurs across all cached source jobs before result slicing, so a matching Palantir new-grad role is not hidden behind the first 30 alphabetic Anthropic jobs.
6. If pagination/load-more is used, preserve filters, use stable ordering, deduplicate canonical URLs and reset offset on criteria change. Changing filters reuses cached board data rather than fetching each source repeatedly.
7. Make unknown selectable as Not specified, and keep it out of a strict known-level match. A no-match state names the active constraint and offers clearing/broadening filters without substituting unrelated results.
8. Retain the three-board coverage notice, source-specific failures and five-minute cache disclosure. A source error must not be presented as proof that no jobs exist.
9. The designer owns visual direction and accessible responsive controls; engineer implements the agreed design with the classifier/API contract. Keep manual link import as a secondary compact action, rather than competing with the primary search.

## Acceptance stories

### Find explicitly early-career work

As a candidate seeking a first full-time role, I want an Entry/New grad filter so that I see roles with explicit supporting evidence. Given mixed generic, senior, intern and new-grad jobs, when I choose Entry/New grad, then only explicitly matching jobs appear, including matching records beyond the unfiltered first page.

### Separate flexibility from location

As a candidate who needs remote work, I want a work-mode filter so that I can distinguish remote from hybrid and unspecified roles. Given source metadata and a city-only job, when I select Remote, then only explicitly remote jobs appear with their original geographic restrictions visible.

### Understand a limited or empty result

As a candidate narrowing my search, I want truthful counts and removable criteria so that I can broaden a search deliberately. Given restrictive submitted filters or a failed board, when search finishes, then the interface displays matching totals and the applicable no-match/source-error explanation without invented vacancies.

## Engineering and verification

Engineer owns shared classification schema/helper, feed metadata retention, filters-before-limit API behavior, stable pagination if introduced, safe query validation and focused fixtures. Designer owns search composition, visual hierarchy, criteria controls, result badges/evidence, empty/loading/partial-failure states and mobile layout. Integration must preserve resume-bound queue behavior and avoid duplicate classifier implementations.

Required tests: explicit intern vs Internal; entry vs unknown generic; Senior/Staff/leadership; ambiguous numerals; structured Lever remote/hybrid and commitment; city-only unknown; no inference from unrelated description prose; combined filters; a matching result after record 30; stable nonduplicate pagination; clear/reset criteria; partial-source success; keyboard controls and 390px width. Browser checks should include one real live new-grad/intern role and distinguish live-feed validation from fixture-based UI tests.

Release blockers: false experience/work-mode labels, filtering only the visible first page, inconsistent submitted criteria/counts, duplicate results on load more, inaccessible search controls, or queue regressions. Honest limitations: three selected employers, a heuristic evidence-backed taxonomy, missing optional metadata, cached public feed freshness, and no claim of comprehensive market coverage.

## Delivered and verified

Implemented experience, work-mode and employment filters with optional evidence on legacy-compatible job snapshots. Management is separate from Staff/lead, and generic Product/Account/Contract Manager titles do not imply people-management level. Filters run before pagination; pagination retains submitted criteria even while the next query is being drafted. Applied filters are removable, unknown is explicit, manual-import counts are separate, and all-source failure is shown as an incomplete search rather than proof of no matches.

The Jobs-only redesign uses an ink/lime search workbench, level radio chips, progressive advanced filters, readable job metadata and evidence, and correctly ordered Load more controls. The removed duplicate client-side matching logic now relies on the API result order and canonical IDs; retired search-panel CSS was deleted.

Verification: 65 workspace unit tests pass, workspace typechecks pass, complete production build passes, and all three Chrome suites pass (original MVP, guided multi-resume flow, redesigned search). Search browser coverage includes matching records beyond the first page, applied-vs-draft pagination, combined facets, filter removal/reset, unknown, empty results, total source failure and 390px layouts. Desktop and mobile controls were independently visually reviewed; mobile result cards were also inspected. A live source check returned 38 Entry/New Grad matches with no source errors at that check; this is point-in-time validation, not a permanent availability guarantee. No paid AI/provider calls or application submissions were made.
