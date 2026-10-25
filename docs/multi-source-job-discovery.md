# Multi-source job discovery

Research and product direction, updated 2026-10-25. The request is to show a broad mix of US job postings—like the breadth candidates find on LinkedIn and Indeed—with new-grad/junior roles first. This is about discovery sources, not broadening the ATS form autofill feature.

## Current state

The Jobs view now searches 15 verified employer boards across Greenhouse, Lever and Ashby, plus Remotive, Remote OK and Himalayas. The employer registry includes Affirm, SpaceX, Scale AI, ID.me, True Anomaly, Commure, Cursor, Replit and AiPrise. Search defaults to entry-level/new-grad, limits results to explicit US evidence (or a provider's US eligibility filter), and has page-number navigation. LinkedIn and Indeed remain external search shortcuts, not imported feeds; these sources still do not cover the whole market.

## Access reality for LinkedIn and Indeed

| Source | What official access currently provides | Practical decision |
| --- | --- | --- |
| LinkedIn | Its documented Job Posting API is a partner integration for employers, ATSs and distributors to publish/manage jobs. LinkedIn says it is not accepting new Job Posting API partnerships. The API is not a general job-seeker search feed. LinkedIn's terms prohibit automated scraping/data extraction without written authorization. | Do not scrape or claim an integrated LinkedIn feed. Add a clearly labeled **Search on LinkedIn** shortcut using the user's current query/location. Pursue licensed data access only if an approved program becomes available. |
| Indeed | The official Publisher JavaScript Plugin can display Indeed search UI on an approved publisher site. It needs Indeed-provisioned partner app and placement IDs and returns Indeed-rendered UI/cards; it is not a documented raw listing API for merging into ApplyPilot's custom result cards. | Add **Search on Indeed** as an external shortcut now. Treat the publisher plugin as a separate partner integration, subject to Indeed access and display terms, not as an ordinary source adapter. |

These restrictions mean we should not promise a unified LinkedIn/Indeed inventory from direct API calls today. Scraping tools or third-party data sellers do not automatically grant the right to redistribute the data; any paid feed needs a checked license, attribution rules, retention limits and explicit activation.

## Source options to broaden coverage

| Source | Coverage and access | Good fit / limitation |
| --- | --- | --- |
| Remotive | Public remote-job API; its guidance requires attribution and linking back, delays jobs by 24 hours, recommends no more than four fetches per day, and says the feed must not be gated behind signup. | A low-cost first integrated source for remote roles. It does not represent onsite/hybrid openings or the whole US market, and needs source-specific cache/freshness handling. |
| Remote OK | Public JSON feed with a request to credit Remote OK and link directly to each Remote OK posting. Feed coverage is remote-only and the current sample frequently omits a country/location. | Integrated with a six-hour cache; ambiguous worldwide/remote records are excluded from US-only results unless their location explicitly indicates US eligibility. |
| Ashby public job board API | Documented GET endpoint returns currently published postings for a known organization job-board name, including listing/apply URLs, workplace type, employment type and publication date when available. | A bounded registry can add verified employers with a single request per board. Start with Ramp, Linear and Lovable; only listed postings are shown. The 15-minute cache is ApplyPilot policy, not a published Ashby quota. Keep source and apply URLs distinct and keep ATS autofill capability explicit. |
| Himalayas | Public no-auth remote-jobs API supports country, seniority, employment type and 20-result pages. It permits display in an app operated by us, requires the unchanged application link, visible Himalayas source link, and removal of expired jobs. | Integrated as a US-eligible remote source with source-specific pagination and approximate totals. Its city-level filter is unavailable; it is not a replacement for onsite/hybrid boards. |
| SimplifyJobs New-Grad-Positions | Community-maintained README of new-grad roles, with mixed US/Canada/remote entries and ATS application links; no repository-wide content reuse license or public search API was identified. | Use as an employer discovery radar, not a job-feed mirror. Verify live direct ATS board IDs, query those employer feeds, and apply the US eligibility filter to live results. |
| Jobright | Its public search UI demonstrates US-only scope, company/experience/job-type/work-model/date filters, and resume-based match scores. The site describes pulling from public company ATS boards and remote aggregators; it does not document a public data API for republishing its listings. | Use as a product reference for scope, filters, freshness and fit explanations. Do not scrape Jobright or import its inventory. |
| The Muse | Public jobs API has filters and test access; broader/production use requires registration under its terms. | Potential structured source to evaluate after approval and access conditions are clear. |
| Adzuna | Search API supports keyword/location listings and requires app credentials. Its terms describe no-payment evaluation access, then a 14-day commercial trial followed by licensing for commercial use. | Strong aggregator candidate if its coverage is useful and licensing/pricing fit. Do not ship a paid connector enabled by default or assume evaluation terms cover production. |
| Jooble | Search API requires a key and region-specific setup. | Another aggregator to evaluate for coverage, rights, freshness and commercial terms before integration. |
| USAJOBS | Official search API with an API key; US federal announcements only. | Useful optional source for federal roles, not a broad private-sector replacement. |
| Greenhouse, Lever, Ashby and other ATS career boards | Public postings can be fetched per employer/board when the board identifier is known. | Expand the direct-employer registry to add verified employers across industries, locations and levels. It improves direct-source breadth but is not a global index by itself. |

The current mix is 15 direct employer boards plus three integrated remote feeds, with external LinkedIn/Indeed search shortcuts. The Jobs page has a selected-source coverage disclosure and numbered pages; the default level is entry/new-grad. Next, expand employer boards from reviewed new-grad directories and school/community lists, but pull live roles from each employer ATS. Evaluate USAJOBS as a federal source after its API-key request is approved; it supports a Recent Graduates hiring path. Evaluate broader paid aggregators only after reviewing pricing and downstream display rights. Keep LinkedIn as an external search destination unless authorized inventory access becomes available.

## Recommended architecture

Discovery should become a provider adapter pipeline. Each adapter owns its request format, credentials, quota, refresh interval, attribution/link requirements and error mapping. A shared normalizer handles common job fields, but source-specific terms must not be lost.

Keep these identities separate:

- **Discovery provider** — where ApplyPilot found the listing: Remotive, Adzuna, a named company career site, etc.
- **Original listing URL** — the source link whose attribution or redirect behavior must be preserved.
- **Application URL and destination** — where the candidate goes to apply; this may be a different domain or ATS.
- **ATS** — only set when known; never label an aggregator result as Greenhouse/Lever simply because its apply link redirects there.

Add optional provider ID, provider name, provider URL, source posted date, first-seen/fetched timestamps, and attribution metadata to job records. Preserve the provider's canonical destination and tracking URL where required. Do not strip an aggregator redirect unless the provider terms permit it.

Deduplicate exact provider IDs first, then verified employer requisition IDs or canonical application destinations. Similar company/title/location is only a possible duplicate signal; do not merge roles based on text similarity alone. Preserve all original source links when verified duplicate postings are grouped. Keep jobs with different requisitions, locations or employment variants separate.

For common feeds, refresh centrally and serve cached normalized results to users. Apply each source's own cache interval and quota; do not reuse the current five-minute ATS-board cache blindly. For paginated sources, don't report a global exact match count if only one upstream page was fetched. Return honest loaded counts/cursors or maintain a bounded indexed cache with known coverage.

## Search experience

- Replace the current one-source dropdown with a **Sources** control that lists only real integrations. Include **Search on LinkedIn** and **Search on Indeed** as visibly external actions, not result sources, until integrated access exists.
- Show **Searching N connected sources** with a coverage disclosure listing each provider/employer, supported geography, last successful fetch and current status. Never make an unsupported source look connected with an empty result set.
- Keep current filters, numbered pagination and sort state consistent across providers. A source outage must preserve results from working sources and show which source failed.
- Preserve attribution in every card: **Found on [source]**, **Posted [date]** only when supplied, and the correct **Apply on employer site** or **View on [board]** destination. Show **Checked** separately from **Posted**; do not make stale data look new.
- Group duplicate listings only when identity evidence is strong, displaying **Also listed on N sources** and keeping original links. A broken source link is not enough evidence that the job is closed.
- Build LinkedIn/Indeed URLs from the applied query/location and open them in a new tab. Clearly label them **External search**; their counts and results remain outside ApplyPilot's feed and application queue until the user imports an individual supported job link.
- Keep Saved searches distinct from job alerts. Save exact applied criteria first; do not promise background notifications before scheduled fetching and delivery exist.

Detailed UI treatment and edge states from the design agent are in [multi-source-job-feed-ux.md](multi-source-job-feed-ux.md).

## Prioritized implementation sequence

### P0 — broaden discovery honestly without paid services

1. **Done:** LinkedIn and Indeed external search shortcuts preserve the applied query/location and are clearly excluded from ApplyPilot's integrated result count.
2. **Done:** job snapshots separate discovery provider from ATS; every integrated source retains its original URL, attribution and application destination.
3. **Done:** add and verify more direct employer boards using Simplify's community list as a discovery reference; use live Greenhouse/Ashby feeds and filter to explicit US location evidence.
4. **Done:** Remotive is integrated with attribution/linkback, its 24-hour upstream delay disclosed, and refresh throttled/cached for six hours in this single-server preview.
5. **Done:** partial-source failures keep successful results; matching records are filtered before stable pagination and interleaved across feeds. Live results exposed an initial Anthropic-only page; deterministic round-robin now displays each connected feed early and rotates Remotive employers.
6. **Done:** Ashby adapter adds verified employer boards, filters explicitly unlisted jobs, retains secondary locations and valid publication dates, and maps supported workplace/employment metadata. Ashby remains outside extension autofill support.
7. **Done:** Himalayas and Remote OK add attributed US-eligible remote listings. Himalayas uses its country/seniority filters and source pagination; Remote OK records without an explicit US location are dropped.
8. **Done:** the Jobs view defaults to entry/new-grad, and page navigation replaces the displayed page while preserving the applied search and filters.
7. **Done:** source coverage shows only the feeds actually selected, per-feed checked/cache/error state, and the last successful server response time. The general results timestamp is labeled as a search time, not a job-feed publication time.

### Delivered in the first slice

Himalayas source search uses a country and seniority query; its API reports an estimated total and can return fewer than 20 rows on a page, so the UI labels the total approximate and allows traversal until an empty page. All boards includes its newest Himalayas page; the coverage panel links to the source-specific paginated view for more. Remote OK asks for its name and a direct followed link on each job. Direct boards with a generic “Remote” location are excluded from US-only results unless the listing states a US restriction. These sources still do not cover all jobs available on LinkedIn, Indeed or the wider market.

Known gaps in this slice: the employer registry remains finite, Remote OK often omits country restrictions, and Himalayas is remote-only. LinkedIn and Indeed are external searches, not imported results. Per-feed timestamps describe the last successful response checked by the app; provider/CDN data may itself be cached upstream. Remotive refresh happens on search requests, at most once per six hours per server; it is not a scheduled crawler. Ashby uses a 15-minute app cache policy and Himalayas a 24-hour policy. A multi-instance production deployment still needs shared cache/coordination for consistent freshness and provider request control.

### P1 — evaluate wider aggregators

1. Measure unique relevant employers, explicit intern/entry-level roles, geographic coverage, duplicate rate, stale/broken links and source success rate from the P0 source mix.
2. Request/evaluate The Muse, Adzuna and Jooble access. Record coverage, quotas, display attribution, retention/deletion terms and cost before coding each adapter.
3. Add only sources whose authorized listing rights and UX fit are clear. Keep API keys server-side and allow each connector to be disabled independently.
4. Consider USAJOBS as an optional US federal source after obtaining its key.

### P2 — partner-dependent distribution

1. Ask Indeed about Publisher Plugin eligibility and target-region support. If approved, render its UI as an attributed, separate Indeed module rather than pretending it is normalized feed data.
2. Revisit LinkedIn if an official authorized job-seeker search or licensed redistribution product becomes available.
3. Add scheduled saved-search refresh/alerts only after queueing, dedup, stale-job removal and delivery preferences are implemented.

## Roadmap acceptance criteria

These criteria describe the complete multi-source roadmap, not claims that the initial delivered slice already meets every item. The known remaining gaps are listed above and in the prioritized implementation sequence.

- LinkedIn and Indeed shortcuts open real external searches populated from the user's applied keywords/location; the app never claims their results were fetched into the unified feed.
- Every connected feed reports success/failure and checked/fetched time. Partial failure retains successful results; all-source failure is not shown as “no matching jobs.”
- Each integrated job retains discovery provider, original listing URL, apply URL, known ATS, provider ID and posted/fetched timestamps where available.
- Duplicate provider IDs collapse; likely matches with uncertain identity remain separate or are visibly flagged for review. Distinct requisitions/locations never disappear through fuzzy dedup.
- Provider-specific attribution, freshness, pagination, quota and refresh requirements are respected.
- Existing title/location/experience/work-mode/employment filters still operate on normalized feed results; missing metadata remains unspecified.
- No scraper, paid service, partner account, API billing or background polling is turned on without configured access and explicit product settings.

## Official references reviewed

- [LinkedIn API access and partner programs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [LinkedIn Job Posting API overview](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview?view=li-lts-2026-04) — restricted partner publishing API and partnership availability notice
- [LinkedIn API Terms of Use](https://www.linkedin.com/legal/l/api-terms-of-use)
- [Indeed Publisher JavaScript Plugin](https://docs.indeed.com/indeed-plus/publisher-js-plugin) — Indeed-rendered search UI, provisioned partner/placement IDs, display behavior and limits
- [Indeed Plugin Terms](https://docs.indeed.com/legal-terms/plugin-terms)
- [Remotive remote jobs API](https://github.com/remotive-com/remote-jobs-api)
- [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Himalayas Remote Jobs API and attribution terms](https://github.com/Himalayas-App/remote-jobs-api)
- [Remote OK API and reuse instructions](https://remoteok.com/faq)
- [SimplifyJobs New-Grad-Positions](https://github.com/SimplifyJobs/New-Grad-Positions)
- [Jobright US job search](https://jobright.ai/jobs/search)
- [USAJOBS API request and terms](https://developer.usajobs.gov/apirequest/index)
- [The Muse API](https://www.themuse.com/developers/api/v2) and [API terms](https://www.themuse.com/developers/api/v2/terms)
- [Adzuna API overview](https://developer.adzuna.com/overview), [search endpoint](https://developer.adzuna.com/docs/search), and [terms](https://developer.adzuna.com/docs/terms_of_service)
- [Jooble REST API](https://jooblehelpcenter.freshdesk.com/en/support/solutions/articles/60001448238-rest-api-documentation)
- [USAJOBS Search API](https://developer.usajobs.gov/api-reference/get-api-search) and [authentication](https://developer.usajobs.gov/guides/authentication)
