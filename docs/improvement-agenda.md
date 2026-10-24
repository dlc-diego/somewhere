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

Status: **Complete**.

- [x] Offer balanced trivia rounds with one question per category.
- [x] Add difficulty tags and an optional harder selection.
- [x] Begin a renewed shuffled cycle after exhausting the question bank.
- [x] Record clues and continent hints used alongside guess statistics.
- [x] Offer spelling assistance for recognizable near misses without unfairly consuming Somehow attempts; keep ambiguous names distinct.
- [x] Track optimal Border Journey finishes and crossings beyond the shortest route. Preserve the five-crossing minimum, no artificial upper difficulty cap, and wins for all valid routes.

## Batch 3 — Content quality and admin tools (medium priority)

Status: **Deferred by the user**.

- [ ] Add question reporting and an admin review queue.
- [ ] Add source references and review dates, prioritizing reported or ambiguous entries.
- [ ] Track factual verification separately from merely adding metadata to the existing 400 questions.

## Batch 4 — Daily Mix (first new mode)

Status: **Complete**. Private invitation-only leaderboard approved; selected players appear even before attempting the day. Daily Mix lives in the main experience dropdown.

- [x] Provide the same daily selection of existing geography, trivia, and people challenges for both players.
- [x] Provide answer-free shareable results.
- [x] Keep Daily Mix separate from the existing manual daily check-in streak.
- [x] Provide a private board with invited players' Not started, In progress and Finished states, final scores and tied ranks.
- [x] Add administrator invitation/removal controls, bounded summary-only sharing and validated Firebase rules.
- [x] Finish regression checks, push this batch separately to `main`, and report the GitHub Pages link.

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

### Batch 2 — Gameplay rules and statistics

- New trivia rounds contain one question from each of ten categories. The optional harder selection uses 100 editorially tagged questions (ten per category); the standard mix retains all 400.
- Difficulty changes before an answer replace the untouched round. After an answer, the preference applies to the next round, keeping in-progress questions, choices, score and celebrations intact.
- Per-category shuffled cycles refill after their eligible pools are exhausted. Standard and harder selections keep independent local history, avoid the immediately preceding round, survive refresh, and preserve legacy sessions. No cross-device seen history was added.
- Optional validated statistics record clue use, continent hints, and the starting shortest route. The user statistics and admin player view show tracked solve averages and optimal-route records. Missing details on old records remain unknown; existing wins, guesses and streaks are preserved.
- Identify Me counts only its optional text clue (zero or one), not the initial portrait, and records portrait-only wins separately.
- Conservative one-edit/transposition spelling prompts check the entire mode catalog, reject short/ambiguous matches, preserve the typed input, and never count as automatic wins or consume attempts/hearts/items. All text mystery engines, including Somehow, use this behavior.
- Journey results label optimal finishes or extra crossings; detours still win, and new routes retain their existing Africa–Eurasia-only five-plus crossing policy.
- Updated instructions and README; no added service, dependency, cloud game save, or account-tracking fix.
- Verified: 196 unit tests; all 126 desktop/mobile gameplay browser scenarios; seven Auth/Firestore emulator browser scenarios; nine Firestore security-rule tests; narrow-screen light/dark accessibility; portrait licensing checks; formatting; production build. Final checks re-ran the affected help/difficulty/spelling screens and cloud detail statistics after text polish.
- Firebase: the project owner confirmed publication of the exact updated rules before the app push. Existing check-in and admin rules were retained.
- Delivery: pushed separately to main. Site: https://dlc-diego.github.io/somewhere/

### Batch 4 — Daily Mix

- A fifth main-dropdown experience offers the same five versioned daily challenges to both players: trivia, flag/shape, country/capital, Who am I and What am I. Content comes from the existing banks and licensed assets, with no new paid service or dependency.
- Noon America/Chicago rollover follows daylight saving time. Versioned pinned ID pools preserve daily selection when other banks grow. Geography slots have distinct answers; trivia choices are also deterministic.
- Explicit Start records an attempt; opening the page does not. Geography has five guesses, text mysteries three, and trivia one answer. Duplicate/invalid guesses are rejected, budgets reveal exhausted answers, and local progress survives refresh separately per account. Other mode saves remain untouched.
- Solved challenges earn 100 minus two per wrong guess and one per extra clue/continent hint; unsolved challenges earn zero. Equal final scores share a rank. Share text contains no answers. Correct-answer celebrations remain immediate and uninterrupted; a 500-point day queues the golden perfect-round effect.
- The invitation-only board sits beside challenges on desktop and below them on mobile. Invited roster members appear before participating. States reflect synced attempts, not online presence. Only enabled administrators can invite/remove; only members/admins can read the roster/results; only a player can write their own current-day summary. Final summaries cannot be overwritten by the app.
- The administrator joins the roster on visiting Daily Mix. Add the wife's profile through Admin panel → Private Daily Mix board → Add to private Daily Mix. Names/status/aggregate points are shared; answers, guesses, emails, authentication credentials and personal game histories are not included in board summaries.
- Active trials remain device-local; the board syncs summaries, not cloud game saves. Other installations display completed results or direct in-progress players to their original installation. Offline progress retries on reconnect/Refresh board; submissions for a previous daily period are rejected. Manual flame streaks are unchanged and are never claimed by Daily Mix.
- Signed-in daily statistics use one stable record per daily period, with challenges solved and fully solved days. Standalone solve averages remain separate. Guest play remains untracked. Existing personal statistics, streaks and admin access are preserved.
- Firebase: all 12 emulator security tests passed; the project owner confirmed publishing the exact rules before the app push. Eight Auth/Firestore browser scenarios passed, including two-account invitation, non-participation, live progress, equal ranks, refresh, finished-result recovery and revocation. The populated private board also passed 320px light/dark accessibility and overflow checks.
- Verified: all 201 unit tests and 266 desktop/mobile production browser scenarios passed; the eight Daily Mix browser scenarios and two-account private-board scenario passed again after final presentation polish. Production build, formatting, portrait-license verification and diff checks passed. Light/dark narrow-screen accessibility and visual checks used Chromium, not a physical iPhone.
- Delivery: pushed separately to main. Site: https://dlc-diego.github.io/somewhere/. GitHub API access is forbidden in this environment, so the automatic deployment status could not be verified here.

Progress: **3 of 5 batches complete** (1, 2 and 4). Batch 3 remains deferred by the user. Batch 5 — Additional game modes is not started and awaits the user's instruction.
