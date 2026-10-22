# Multi-source job discovery UX

Research handoff, 2026-10-22. Scope: jobs appearing in ApplyPilot from job boards and company careers pages, not application-form filling. Proposed behavior below is design guidance, not a claim that LinkedIn/Indeed integrations already exist.

## Primary-source observations

- [Indeed’s application guide](https://support.indeed.com/hc/en-gb/articles/204652920-How-to-apply-to-a-job-on-Indeed) distinguishes applying on Indeed from being redirected to the company website. ApplyPilot should similarly separate where a job was discovered from where its application happens.
- [LinkedIn’s job-alert guide](https://www.linkedin.com/help/linkedin/answer/a508396) creates alerts from the current search and provides frequency/channel controls. Adopt explicit saved criteria; do not imply alerts until scheduling and delivery exist.
- [Indeed’s preference guide](https://support.indeed.com/hc/en-gb/articles/32603395892109-Adding-or-editing-job-search-preferences) separates qualifications from job preferences. Keep user-selected filters visible and separate from any future inferred recommendations.
- [Indeed’s saved-job guide](https://support.indeed.com/hc/en-gb/articles/14087165677837-My-Jobs-Saving-a-Job) lets users revisit the original posting. Preserve source links even when grouping duplicate listings.
- [Indeed’s unavailable-job guidance](https://www.indeed.com/help/employers/articles/unavailable-jobs-on-indeed?co=US&hl=en) treats expired listings and broken destinations as distinct problems. ApplyPilot should distinguish confirmed closure from a source that simply could not be checked.

## Recommended experience

Keep the existing ink search workbench, experience facet, and readable Jobs cards. Evolve the single ATS source selector into **Sources**: Company careers, LinkedIn, Indeed, and other providers only as actually available. A compact caption says **Searching 3 connected sources** with **View coverage**; the coverage drawer identifies specific providers/companies, region limits, last successful check, and one status per source.

Source states must be literal: **Included**, **Not selected**, **Temporarily unavailable**, and **External search only**. An external-search-only source offers **Search on LinkedIn ↗** or **Search on Indeed ↗**, carrying supported query/location parameters; it does not contribute to integrated-result counts. Explain when a source needs setup. Avoid a grid of provider logos that implies nonexistent access.

### Feed and attribution

Use one opportunity card per verified canonical employer requisition. Display company, title, location, level/work mode, posted date when known, and **Found on [source]**. Keep **Apply on company site ↗** or **View on [board] ↗** accurate to the destination. An ATS such as Greenhouse is application infrastructure, not interchangeable with the discovery source LinkedIn.

Group exact cross-source matches under **Also listed on 2 sources** with accessible original links. Merge only when canonical destination/requisition identity supports it; similar title/company/location alone is insufficient proof. Preserve distinct requisitions, locations, and employment variants. A grouped source that disappears does not make the employer job closed if another authoritative listing remains open. Saving/queueing any grouped copy updates the same opportunity state.

Show **Checked 10:42 AM** separately from **Posted 2 days ago**. If only a first-seen timestamp exists, call it **First seen**, not posted or newly published. Cached results remain useful with an explicit timestamp; refreshing must not manufacture freshness or reset a known posting date.

### Filters and saved searches

Keep keyword/location and explicit experience/work-mode/employment filters. Sources is multi-select; all available sources is the default. Applied chips, Clear all, count, pagination, and saved criteria must describe the same result set. Unknown metadata remains **Not specified** and does not silently satisfy a specific level or salary requirement. Do not convert a resume fact into a hidden hard filter.

**Save search** stores its name and the exact applied criteria: query, location, selected source IDs, experience, work mode, employment, and any supported posted-date/salary filters. Show **Saved searches** as a compact switcher above results. Loading one restores criteria and performs a new search; counts remain loading/unknown until retrieval completes. Keep **Saved jobs** distinct from **Application queue**. Initially use **Run search**; add notification frequency, delivery, and pause controls only when real background alerts exist.

## Result and error states

| Situation | UX |
|---|---|
| All selected sources succeeded | `30 opportunities shown · 84 unique matches` only if the backend can establish that unique total. Otherwise show `30 opportunities loaded` and avoid summing overlapping provider totals. |
| Some sources failed | Preserve successful cards; `Results from 2 of 3 selected sources · Indeed unavailable` plus Retry source. No empty success state. |
| All sources failed, previous data exists | Retain it as `Previously loaded · last checked…`; clear warning and Retry. Do not silently relabel it current. |
| Zero valid matches | Explain active criteria and offer Clear filters / another source. No unrelated fallback feed. |
| Confirmed expired/closed job | Remove from default active feed; saved/queued copy remains visibly Closed with original link/history. |
| Broken link or source timeout | Mark `Could not verify availability`; avoid a false Closed label and preserve user notes/queue. |
| Redirect to another domain | Show the actual application destination; keep discovery attribution available. Never mark a redirect as an application submission. |

## Prioritized implementation scope

- **P0:** truthful source coverage and capability labels; discovery-versus-application attribution; canonical identity dedup; per-source status/freshness; partial failure that preserves results; honest unique-count semantics.
- **P1:** source multi-select, external-source search links where integration is absent, saved jobs separate from queue, named saved searches with exact applied criteria, load-more and source-specific retries.
- **P2:** real scheduled alerts, provider-aware date/salary filters, reviewed uncertain-duplicate groups, saved-search change notifications, and documented provider coverage limits. Expand integrations through a reusable source contract rather than source-specific page logic.

Mobile: coverage opens a readable disclosure/drawer; source choices wrap or stack with 44px targets; attribution and stale status remain visible on cards. Preserve the current search layout and progressive filters instead of adding another large dashboard panel. Validate a duplicate across three sources, a same-title distinct requisition, one failed source, a closed saved job, an external-only provider, and switching between saved searches with different coverage.
