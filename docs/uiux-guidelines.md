# ApplyPilot UI/UX guidance

Reviewed 2026-10-21. This document adapts selected guidance from [MengTo/Skills](https://github.com/mengto/skills) to ApplyPilot. It is a reusable workspace reference, not model training or an installed skill package. No downloaded scripts, dependencies, or implementation changes are required by these notes.

## Sources studied

Catalog: [README.md](https://github.com/mengto/skills/blob/main/README.md).

- [design-first-ui-prompting](https://github.com/mengto/skills/blob/main/agent-skills/ui/design-first-ui-prompting/SKILL.md): define the task, audience, success criteria, hierarchy, type, palette, and constraints before changing UI; iterate one variable at a time.
- [no-ai-design-slop](https://github.com/mengto/skills/blob/main/agent-skills/ui/no-ai-design-slop/SKILL.md): preserve the product's visual direction, make relationships and state visible, and remove elements that add no information or useful action.
- [audit-ai-design-slop](https://github.com/mengto/skills/blob/main/agent-skills/ui/audit-ai-design-slop/SKILL.md): ground findings in specific evidence, distinguish usability defects from unnecessary decoration, and recommend the smallest correction.
- Supporting [No Design Slops pattern library](https://github.com/mengto/skills/blob/main/agent-skills/ui/no-ai-design-slop/ARTICLE.md): studied the opening principles and sections 1–6, particularly composition, containers, typography, and semantic color.

These external references provide design guidance. User instructions, repository requirements, and the actual product task take precedence. Their marketing effects, game workflows, image sourcing, and publishing procedures are outside this task.

## ApplyPilot principles

- Preserve the existing cream/paper, ink/green, and lime visual system. Improve hierarchy and spacing before introducing new styles, assets, or dependencies.
- Keep one dominant action per step and contextual Next/Back navigation. Use proximity to group related fields; avoid adding a card or decorative label to every block.
- Show truthful operational state: active resume, application-bound resume, pending save, partial source failures, cached results, and unknown sponsorship evidence. Preserve useful data during failures.
- Verify actual desktop/mobile renders, keyboard access, long content, and loading/error/empty states. Source inspection cannot establish visual accessibility or usability.

## Prioritized future refinements

These proposals are grounded in current source; this reading task did not include a fresh browser audit or implementation changes.

| Priority | Evidence and proposed refinement | Acceptance |
|---|---|---|
| P1 | **Readable functional labels.** `.sponsor`, `.state`, `.verified`, and `.unverified` in `apps/web/app/styles.css` use 8px text. Increase decision-critical label size and compact-control padding consistently. | Sponsorship, application state, and actions remain readable and unclipped on desktop/mobile and at 200% zoom. |
| P1 | **Explain the displayed job collection.** `job-discovery-panel.tsx` reports retrieved match counts; `JobsView` in `dashboard.tsx` merges results into stored jobs and renders matching stored entries. Distinguish retrieved matches, saved entries, and freshness. | Repeated searches and partial-source failures show counts and explanations consistent with the visible list, while existing jobs stay accessible. |
| P2 | **Keep Next reachable on long steps.** `StepNavigation` follows all profile fields or job cards. Evaluate a compact top Next action or unobtrusive mobile action area using existing navigation logic. | Users continue without the sidebar or extensive scrolling; controls never cover content or errors. |
| P2 | **Rename resumes inline.** `resume-library-panel.tsx` uses `window.prompt`. Replace it with a labeled inline input and Save/Cancel, preserving deletion safeguards. | Keyboard users can rename, cancel, and correct invalid input; focus returns to the row. |
| P3 | **Consolidate repeated labels.** Step header, page eyebrow, discovery eyebrow, source badge, and supporting copy can repeat context. Apply the removal test before adding decoration. | Task, step position, source limitations, and active resume stay clear with less repeated text. |

## Reusable workflow

For future UI edits, specify the task, primary action, desired outcome, existing tokens, required states, and desktop/mobile acceptance examples. Change one or two related variables, inspect the rendered result, and retain only changes supported by that evidence. Start with functional-label readability and accurate job-result counts.
