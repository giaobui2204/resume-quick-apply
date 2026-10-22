# Jobs search design

## Direction and scope

ApplyPilot’s Jobs screen should feel like a focused career workspace: editorial typography, warm paper, a confident ink search surface, and readable decision-making information. Preserve the existing ink/green/lime palette and sidebar identity; replace the oversized generic white search panel and green success notice. Keep resume, profile, applications, navigation, automatic initial discovery, and manual job import working.

Guidance: [design-first-ui-prompting](https://github.com/mengto/skills/blob/main/agent-skills/ui/design-first-ui-prompting/SKILL.md), [no-ai-design-slop](https://github.com/mengto/skills/blob/main/agent-skills/ui/no-ai-design-slop/SKILL.md), and [audit-ai-design-slop](https://github.com/mengto/skills/blob/main/agent-skills/ui/audit-ai-design-slop/SKILL.md), adapted in [uiux-guidelines.md](uiux-guidelines.md). This design uses hierarchy and useful state rather than imagery, decorative graphics, animation, or new libraries.

## Layout and exact hierarchy

1. **Masthead:** small `JOB DISCOVERY` label; heading **Find your next move.**; supporting copy **Real openings. Clear sponsorship evidence.** Keep the existing active-resume context and guided step controls. Heading 40–46px desktop / 34px mobile, slightly tight tracking, no forced line break. Do not repeat the giant sponsorship headline inside the search area.
2. **Search workbench:** ink surface, restrained 6–8px radius, 24px desktop / 18px mobile padding. No nested card or large promotional heading. First row: labeled **Job keywords** input, **Location** input, lime **Find jobs →** button. Placeholders: `Role, skill, or company` and `City or Remote`. Desktop grid `minmax(0,1.4fr) minmax(0,1fr) auto`, gap 12px. Labels are light readable text, inputs paper-colored with ink text; 44–48px control height.
3. **Primary experience facet:** visible below the search row, separated by 20px space and a subtle light divider. Fieldset legend **Experience level**. Single-choice radio chips: **Any level**, **Internship**, **Entry / new grad**, **Mid level**, **Senior**, **Staff / lead**, **Not specified**. Native radios may be visually styled but remain keyboard reachable; checked state uses lime background/ink text plus a checked indicator, not color alone. Use 13px labels and 40–44px targets; wrap naturally rather than a clipped horizontal carousel.
4. **Secondary filters:** compact labeled **Job source** select with `All sources / Greenhouse / Lever`; native disclosure **More filters** containing **Work mode** and **Employment type** selects. Work mode: `Any / Remote / Hybrid / On-site / Not specified`. Employment: `Any / Full-time / Part-time / Contract / Internship / Not specified`. Secondary filters must remain visually subordinate to experience. If More filters has applied values, show its count and keep the disclosure open after applying.
5. **Coverage caption:** one quiet readable line: `Anthropic · Figma · Palantir · Public boards · Cached up to 5 min`. Use actual configured source names when available. Search time below/alongside results; never imply continuous crawling, complete market coverage, or a fresh source fetch on each cached request.
6. **Applied filter strip:** below the workbench, render only applied nondefault values as removable chips with explicit accessible labels, e.g. `Remove experience filter: Entry / new grad`. Follow with **Clear all**. The strip reflects the displayed results, not unsent input. Changing/clearing a chip must actually rerun the matching request or apply the same backend predicate; it cannot be decorative.
7. **Results header:** **Opportunities** with the visible matching count in strong type; secondary line `Showing 30 of 124 matches · Checked 10:42 AM`. Distinguish displayed results and source total; do not include unrelated saved jobs in a search count. Place **Import a job link** as a secondary disclosure/action, retaining the existing textarea and import behavior. No full-width success banner for routine search completion.
8. **Job results:** repeated flat paper/white rows with a strong shared alignment and a thin border/divider. Company and source on a subdued 12px top line; role title 20–22px; location, work mode, employment at 13px beneath. Experience label at 12–13px in a neutral capsule; **Not specified** stays neutral. Sponsorship labels use readable 12px sentence case and semantic tones; label plus text carries meaning. Keep **Review sponsorship evidence** collapsed by default. Bottom row: **View posting ↗** and primary **Add to queue** / disabled **In queue**. Keep sponsorship evidence and experience evidence separate; neither implies a legal guarantee.
9. **Pagination:** **Load more jobs** after results if API `hasMore`; show an incremental pending state without clearing existing rows. New search/filter resets pagination; canonical URL dedup prevents duplicates.

## Matching and interaction rules

- Default to Any experience/work mode/employment and All sources. Do not infer the user’s seniority from their resume or silently enable early-career filtering.
- Classify only from explicit posting/title evidence and preserve **Not specified**. Generic `Software Engineer` does not establish entry or mid level; unknown postings do not match a specific known level. Evidence details explain classification when available.
- Initial Jobs entry still discovers automatically. Search is submitted by its button or Enter. Draft filter changes become applied on Find jobs; reflect this distinction consistently in chip/status state. An optional immediate-apply implementation is acceptable only if all controls behave consistently and requests are cancelled/coalesced.
- Preserve valid results while a new request runs. Indicate **Searching job boards…** in a stable inline status with `aria-live=polite`; disabled state should not move the button or erase typed input. Abandoned/stale requests cannot overwrite newer criteria/results.
- Empty state: **No matches for these filters** + **Try a broader role or include “Not specified” experience.** Provide **Clear filters**. A failed source is a warning, not a fabricated zero-match conclusion.
- Partial failure: compact visible warning with source name and retry action; retain successful matches. Total failure: explicit error and **Try again**. Never substitute unrelated matches to fill the list.

## Responsive and accessibility acceptance

At 390px, use 20px page gutters, one-column keyword/location/button, wrapped experience chips, stacked secondary filters, and full-width primary search. Results should begin without an oversized promotional block. Cards wrap metadata and sponsorship labels; links/actions remain comfortably reachable. Avoid fixed action bars that cover content. At tablet widths the search grid may become two columns before the mobile stack.

Use visible labels, semantic form/fieldset/legend, native keyboard radio behavior, strong focus indicators on dark and light surfaces, and targets of about 44px. Keep functional text at least 12px and normal control/body text 13–16px. Validate long titles/locations, unknown classifications, selected filters, loading, partial errors, empty results, queued jobs, and expanded evidence at desktop, 390px, and 200% zoom.

## Engineering handoff

- `apps/web/components/job-discovery-panel.tsx`: workbench controls, experience facet, secondary filters, applied criteria, request status.
- `apps/web/components/dashboard.tsx` (`JobsView`, `JobCard`): masthead, applied chips/result count coordination, pagination, readable metadata/evidence, existing queue/import behavior.
- `apps/web/app/styles.css`: scoped Jobs/workbench/row styles using existing tokens; avoid changing unrelated page styling.
- Discovery API/shared classification contract: engineer owns implementation; filter enums and unknown behavior must match browser controls. Extract focused filter/metadata components only where they reduce repeated logic.

A successful implementation visibly replaces the old generic panel, makes experience level a first-class control, and lets a user understand why each job appears without sacrificing truthful evidence or fast navigation.
