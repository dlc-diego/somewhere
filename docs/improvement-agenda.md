# Improvement agenda

Agreed scope: five batches. Work one batch at a time, test it, and push it separately. Preserve existing statistics, daily streaks, saved progress, full celebration playback, and free hosting. Track Firebase console requirements explicitly when a future batch needs them.

## Batch 1 — Mobile and Somehow interface (high priority)

Status: **Complete**.

- [x] Expand the current route section by default; allow completed and upcoming sections to be inspected without showing the entire map at once.
- [x] Preview a reachable stop's goal, attempt budget, heart risk, and potential reward before committing to it.
- [x] Enlarge the footer help touch target to at least 44 × 44 CSS pixels.
- [x] Verify saved-run compatibility, route progression, preview cancellation, mobile layouts, accessibility, and celebration continuity; run unit tests and production build.
- [x] Push this batch to `main` and report the GitHub Pages link.

## Batch 2 — Gameplay rules and statistics (high priority)

Status: **Not started**.

- [ ] Offer balanced trivia rounds with one question per category.
- [ ] Add difficulty tags and an optional harder selection.
- [ ] Begin a renewed shuffled cycle after exhausting the question bank.
- [ ] Record clues and continent hints used alongside guess statistics.
- [ ] Offer spelling assistance for recognizable near misses without unfairly consuming Somehow attempts; keep ambiguous names distinct.
- [ ] Track optimal Border Journey finishes and crossings beyond the shortest route. Preserve the five-crossing minimum, no artificial upper difficulty cap, and wins for all valid routes.

## Batch 3 — Content quality and admin tools (medium priority)

Status: **Not started**.

- [ ] Add question reporting and an admin review queue.
- [ ] Add source references and review dates, prioritizing reported or ambiguous entries.
- [ ] Track factual verification separately from merely adding metadata to the existing 400 questions.

## Batch 4 — Daily Mix (first new mode)

Status: **Not started**.

- [ ] Provide the same daily selection of existing geography, trivia, and people challenges for both players.
- [ ] Provide answer-free shareable results.
- [ ] Keep Daily Mix separate from the existing manual daily check-in streak.

## Batch 5 — Additional game modes (expansion)

Status: **Not started**.

- [ ] What Came First? — compare or order historical events.
- [ ] Border Journey: Waypoints — travel through required countries using valid land crossings.
- [ ] Where Am I? — identify countries from landmark photographs, with clues and a globe reveal. Verify and retain licensing/attribution for every image.

## Explicitly excluded

The user removed the original account/deployment and cross-device continuity batches. Do not implement guest-to-account tracking changes, directory retries/refresh, additional deployment pipeline checks, cloud saves for active games, or cross-device question history as part of this agenda. Statistics reset remains excluded.

## Delivery log

### Batch 1 — Mobile and Somehow interface

- Current-section focus and expandable completed/upcoming sections retain all 13 stops and 31 nodes.
- Inline goal/budget/risk/reward previews require Begin to commit. Canceling preserves the saved run and returns keyboard focus to the node. No random question or mystery is selected during preview.
- The route automatically focuses the next section after gates/rest, including after reload. Existing active encounters and legacy saves continue normally.
- Footer help touch targets are at least 44×44 CSS pixels in all four experiences.
- Verified: 187 unit tests; all 62 desktop/mobile adventure browser scenarios; 320px light/dark accessibility and layout; older-save migration; celebration continuity; production build; formatting.
- Manual 390px dark-theme check: initial page height reduced from approximately 2,015px to 1,381px. This is a Chromium measurement, not a physical iPhone performance claim.
- Delivery: this batch is pushed separately to main. Site: https://dlc-diego.github.io/somewhere/
- No Firebase rules or console configuration changes are needed.

Progress: **1 of 5 batches complete**. Next: Batch 2, pending the user's instruction.
