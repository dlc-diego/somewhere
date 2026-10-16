# Somewhere

A small, polished geography guessing game. Choose countries, capital cities, or flags, explore a draggable globe, and follow the warmer-or-colder feedback until you find the mystery location.

**React + TypeScript + Vite, with an SVG globe powered by D3 Geo. Entirely static. No accounts, keys, backend, database, analytics, or runtime map APIs.**

## Run locally

Use **Node 22.12+** (Node 24 is also supported) and npm.

```sh
npm ci
npm run dev
```

Open the address printed by Vite. To run and check the deployable build:

```sh
npm test
npm run build
npm run preview
```

The `dist/` directory is the complete website. Keep its `assets/` and `data/` directories together. Do not open `index.html` directly from the filesystem; use a web server.

In the Codex cloud machine, npm’s default home cache is unavailable. Use `npm --cache /tmp/wep-app-npm ci` there. No secrets or environment variables are needed by the app.

## How it plays

- Choose **Countries**, **Capitals**, or **Flags** above the search field. Each mode keeps a separate saved round, so you can switch without losing any journey. A random answer is selected once per round, and new rounds exclude that mode’s immediately previous answer. Country saves from the earlier version are migrated automatically.
- In country mode, search a name, ISO code, or alias such as `UK`, `UAE`, `Turkey`, or `Ivory Coast`. In capital mode, search a city name or spelling variant such as `Paris`, `Washington DC`, or `Kiev`; suggestions include the city’s country. Select a suggestion, then press **Make a guess**. With a keyboard, Enter selects the highlighted suggestion; a second Enter submits it.
- In **Flags**, identify the displayed flag image by guessing a country name or alias. Suggestions hide their flag images to avoid giving away the match. The globe, distances, heat, duplicate protection, closest-first history, reveal, and green answer animation work as in Countries. **Hint: reveal continent** shows a continent without using a guess, marking the map, or ending the round. The clue remains visible through refresh and mode switches, and resets with a new flag round. A hint-only round also asks before restarting. Used continent hints remain visible after completion.
- Drag the globe to rotate it and pinch to zoom up to 32×. Map taps never select or submit guesses; all guesses go through the search interface. Keyboard users can focus the globe and use arrows, `+`, `-`, and `Home`.
- Each guess colors its country and displays the great-circle distance to the answer. Country and flag modes use representative country centers; capital mode uses the two cities’ coordinates and adds a marker for every guessed capital. Text labels and symbols supplement color.
- Cold: **7,000 km or more**. Cool: **3,000–6,999 km**. Warm: **1,000–2,999 km**. Hot: **under 1,000 km**. Countries sharing a land border—and capitals belonging to those countries—are marked **Adjacent** with the hottest, darkest-red feedback regardless of center distance. This does not count as a correct guess. Thresholds use unrounded distances; displayed kilometers are rounded.
- Only an exact country or selected-capital match wins. A tiny nonzero distance is displayed as `<1 km`.
- Guess history is sorted by unrounded distance for the selected mode, closest first, with original guess numbers preserved. The closest row has a highlighted background and a “Closest guess” badge; it stays pinned while the desktop list scrolls. Distance ties keep the original guess order. Tap a history entry to center it on the globe. Duplicate guesses are rejected. On phones, search sits above the globe; submitting a guess closes the keyboard and smoothly centers the globe on screen. After a short pause, the globe glides to your guess and zooms based on country area: smaller countries get a closer view, larger ones retain regional context. Automatic zoom ranges from 1.3× to 16×; manual controls reach 32×. Capital guesses use the area of their country while centering the city. Only after that movement finishes, the guessed country and any capital/tiny-country marker blink slowly in their heat color three times (about four seconds), then stay solid. A new guess, manual rotation, or resetting cancels the previous cue. Reduced-motion preferences skip both movement and blinking. Correct guesses and revealed answers blink green. Correct answers launch their victory effect immediately when submitted, independently of the globe’s movement and green blink; no result popup opens.
- **A heart for Val:** hold the heart next to “Built for Val” for about two-thirds of a second. It beats, then a warm wave spreads from the heart across the background in the logo’s orange accent and fades back after a moment. Release after it starts and it will finish on its own. Keyboard users can focus the heart and hold Space or Enter. Short taps and canceled holds leave the game alone. Reduced-motion preferences use a still, subtle tint.
- The **Give up and reveal answer** button is below the guesses and above the footer. It ends the current mode’s round, reveals the answer on the globe in green, and preserves the guess history. The reveal uses the same size-aware zoom. After the globe arrives, the answer and its marker blink three times, then stay green. It does not add a winning guess or count as a win, and it works before any guesses. Other modes are unaffected.
- Correct guesses in all three modes get one of six full-screen victory effects: **Confetti shower**, **Fireworks**, **Emoji parade**, **Heart fountains**, **Shooting stars**, or **Rainbow bubbles**. A shuffled bag shared across modes uses all six before reshuffling and prevents an immediate repeat at the boundary. Effects begin immediately on a correct guess (or as soon as an earlier queued effect finishes), last 4.8 seconds of visible playback, and leave controls clickable. Wrong guesses, give-up reveals, refocusing a history row, and refreshing a completed game do not launch effects. Starting another round, resetting the map, switching modes, making guesses or earning another win does not cancel or restart an active celebration. Additional wins queue and play in order, each for its full duration. Globe loading, rotation, zoom and blinking never delay or cancel the celebration. Hiding the tab pauses playback until you return; enabling reduced motion during an effect pauses it until motion is allowed again. Players who already prefer reduced motion when guessing correctly get the static win screen. The transient queue ends when the page is refreshed or closed; saved rounds remain intact. Emoji parade uses standard celebration/heart/globe emojis, with no flag emoji dependency.
- A completed round keeps the answer, guess count, replay controls, and copy-result button on the page, without a popup. A new round during an active game requires confirmation.
- All three rounds, all guesses, the selected mode, and revealed/completed states are saved in this browser’s `localStorage`. Invalid saves recover with a message. If storage is disabled or full, gameplay continues with a warning. Progress is local to the browser and is not synced between devices or tabs.

Daily challenges are deliberately deferred; replayable random rounds cover the core experience without timezone rules or additional infrastructure.

## Deploy free: Cloudflare Pages

Cloudflare Pages serves this app as static files with HTTPS and a free `pages.dev` address. There is no custom domain requirement and no game server to run. Hosting and build quotas remain subject to the provider’s current free-plan terms; the app itself makes no metered map or country API calls.

1. Commit this project and push it to your GitHub repository, `dlc-diego/somewhere`. The initial checkout was empty; the full application must be present on the connected branch before deployment.
2. Sign in to Cloudflare and create a **Pages** project connected to that Git repository. Choose the branch containing the app (normally `main`).
3. Configure:

   | Setting                | Value                                                    |
   | ---------------------- | -------------------------------------------------------- |
   | Framework              | Vite (or no preset with the settings below)              |
   | Root directory         | Repository root                                          |
   | Build command          | `npm run build`                                          |
   | Build output directory | `dist`                                                   |
   | Node version           | Set `NODE_VERSION` to `22` or `24` in the build settings |

4. Deploy. The platform installs dependencies and builds the project. Open its assigned HTTPS URL on your phone and computer.
5. Verify the globe loads, make a guess, refresh to check persistence, and start another round. Share the assigned URL with your wife.

Future pushes to the connected production branch rebuild the site. There are no runtime secrets to enter. The app includes responsive layouts, a mobile viewport declaration, touch rotation and pinch gestures, and 16px mobile inputs to avoid focus zoom on iOS. A phone needs a current browser with JavaScript enabled.

## Deploy free: GitHub Pages (simplest with this repository)

A deployment workflow is included at [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml). GitHub Pages availability for private repositories depends on your GitHub plan; Cloudflare Pages is a useful alternative if you want the source repository to stay private.

1. Push the app to `main` in your GitHub repository.
2. In the repository’s **Settings → Pages**, choose **GitHub Actions** as the deployment source.
3. In **Actions**, run **Deploy to GitHub Pages**, or push another commit to `main`.
4. Wait for the deployment job to succeed, then use the URL provided by GitHub Pages (typically `https://dlc-diego.github.io/somewhere/`).

Vite’s relative base (`./`) and relative map-data paths support both domain-root hosting and the `/somewhere/` project path. No client-side router or rewrite rules are needed. The app’s nested-path loading is covered by a browser test.

### Netlify alternative

Import the Git repository, set build command `npm run build`, publish directory `dist`, and use Node 22 or 24. Netlify provides an HTTPS `netlify.app` address. Review its current free-plan credits and limits before choosing it. No functions or paid add-ons are required.

## Verification

```sh
npm test                     # geographic calculations, game rules, data, persistence validation
npm run build                # strict TypeScript check and Vite production build
npx playwright install chromium
npm run test:e2e             # desktop and mobile Chromium against the production build
```

On Linux you may need Playwright’s documented browser system dependencies. In this cloud environment Chromium is already available:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

Browser tests cover country, capital, and flag win/replay journeys, flag hint persistence, hidden autocomplete flags, image loading/retry, and flag assets under repository subpaths, giving up (including with no guesses), preserving separate modes, old-save migration, duplicate handling, aliases and keyboard input, refresh persistence, restart confirmation, globe movement without map-based guess selection, adjacent-country heat, closest-first ranking and highlighting, tiny-island markers, map loading failure and retry, background-renderer failure fallback, corrupt storage, responsive overflow, animated guess arrival, post-arrival heat-color blinking and automatic stop, mobile globe centering, reduced-motion behavior, full-screen rendering of all six victory effects, animation cleanup, uninterrupted queued wins through restarts/mode switches, and hidden-tab/reduced-motion pause and resume, the long-press heart surprise (touch, keyboard, cancellation, automatic reset and reduced motion), and automated accessibility checks. Tests inject a known round through browser storage; the production app contains no answer override or test-only endpoint. The tests do not establish Safari/iOS compatibility or real-device performance; those still deserve a quick check on the phone used to play.

## Data, accuracy, and licensing

- **Playable list:** 195 entries: 193 UN member states plus Palestine and Vatican City. This is an explicit gameplay scope, rather than a statement about sovereignty. Dependent territories and other disputed states, including Taiwan and Kosovo, are not answers in this version. The guide explains this scope before play.
- **Metadata:** [mledoze/countries](https://github.com/mledoze/countries), provided by `world-countries`. Each playable country has a canonical ISO 3166-1 alpha-3 identifier. Names and useful aliases are normalized for case, diacritics, punctuation, and whitespace. The two Congos have distinct display names.
- **Adjacency:** Shared land borders are generated from `world-countries` ISO alpha-3 border lists, made symmetric, and restricted to playable countries. Explicit territory mappings include French Guiana/Saint Martin → France, Sint Maarten → Netherlands, Gibraltar → United Kingdom, and Hong Kong/Macau → China. Canada–Denmark’s 2022 Hans Island land border is added; the source’s one-sided India–Sri Lanka entry is removed because Palk Strait is not a land border. Sea crossings and maritime borders alone do not count. The graph follows source border claims elsewhere and is independent of simplified map geometry.
- **Flags and continent hints:** Flags use bundled 4:3 SVG images from [flag-icons](https://github.com/lipis/flag-icons), pinned as a development dependency and copied to `public/flags/<ISO-alpha-3>.svg` by the data generator. Only the 195 playable images are included, with the upstream MIT license in `public/flags/LICENSE.txt`. Images load from the same static site, not a third-party CDN or API, so they display independently of device emoji support. A failed challenge image offers a retry without resetting the round or hint. Some flags (such as Chad and Romania) remain very similar; only the exact country wins, and continent/distance clues can help. Screen readers get a neutral “Mystery flag” label until completion so the accessible name does not disclose the answer; this remains a visual recognition game. Continents follow the metadata’s region classification, with the Americas split using subregion: South America stays South America; Central America, the Caribbean and North America use North America. Oceania is the regional continent label. Transcontinental countries use one classification (Russia → Europe; Türkiye → Asia); overseas territories do not change the hint.
- **Capitals:** One selected capital/government seat per playable country, using representative public-domain Natural Earth populated-place coordinates joined to canonical country IDs. Choices include Pretoria (South Africa), Sucre (Bolivia), Amsterdam (Netherlands), Mbabane (Eswatini), Sri Jayawardenepura Kotte (Sri Lanka), and Ramallah as Palestine’s administrative seat. Yaren is Nauru’s government district, not an official capital, and uses a documented approximate point. Other co-capitals are not separate answers; aliases refer to the same selected city. The source can lag relocations (for example Jakarta follows the source during Indonesia’s transition). See [capital source notes](scripts/data/README.md) for the full policies, source details, and exceptions. City markers identify actual city points rather than country centers.
- **Boundaries:** Natural Earth 1:50m via [world-atlas](https://github.com/topojson/world-atlas). Country features are joined through zero-padded ISO numeric codes and then matched to alpha-3 records; names are never used for matching. MultiPolygon features preserve disconnected regions. Some dataset IDs repeat across associated regions; rendering uses separate feature keys while matching all their parts to the same country.
- **Rendering:** The generator simplifies topology, preserving shared borders and disconnected polygon records. Outlines are approximate and small islands may be visually reduced or degenerate at this scale. Tiny guessed countries receive a center marker; Tuvalu, which has no boundary in this dataset, always receives one. Before guessing, tiny countries can be selected reliably through search.
- **Disputes:** Borders reflect the source dataset’s choices and vintage. Areas without a matching numeric code remain neutral and unplayable. Claims, overseas dependencies, and disputed areas are not reassigned by inference from their labels.
- **Centers and distance:** Metadata supplies representative latitude and longitude, which are not calculated land centroids, capitals, or nearest border points. The same coordinates are used consistently for all guesses and answers. Large or island countries can produce unintuitive center distances; overseas regions do not change the chosen center. Haversine uses mean Earth radius **6,371.0088 km**, handles the date line and poles, and clamps floating-point error. The Earth is treated as a sphere.
- **Licenses:** Natural Earth geography is public domain; the `world-atlas` package has an ISC license. Country metadata is ODbL. The adapted metadata database is distributed under ODbL at `public/data/countries.json`, alongside the complete license. Flag images are MIT-licensed; their attribution and full license are shipped with the site. Original sources and download links are credited in the game guide. No assets, branding, or code were copied from Globle.

Generated datasets are committed, bundled, and served from your site. Updating npm dependencies does not silently change geography. To deliberately update them:

```sh
npm run data:generate
npm test
npm run build
```

Review the resulting data changes and attribution. `scripts/generate-data.mjs` is deterministic and validates list membership. Routine builds use committed data and do not need to regenerate it.

## Architecture and trade-offs

See [docs/technical-plan.md](docs/technical-plan.md) for the library comparison and implementation choices.

```text
src/
  lib/            Country lookup, geographic math, game rules, saved-state validation
  components/     Globe, accessible country/capital search, guess history, native dialog
  data/           Playable countries, selected capitals, and border metadata
  App.tsx         Round state and the game screen
  styles.css      Responsive plain CSS and reduced-motion support
public/data/      Lazy-loaded boundaries, adapted metadata, attribution licenses
scripts/          Reproducible dataset preparation
tests/            Browser tests using production assets
```

**Answer privacy:** The globe receives guesses and only receives the answer location after the player explicitly gives up; correct guesses already appear in the guess list. It does not pan to or mark an answer before a correct guess or giving up. However, a fully static game must calculate distances in the browser, so the answer exists in memory and saved storage. A player using developer tools can find it. Obfuscation would not solve this. Strong secrecy requires a server to hold the answer and evaluate guesses; that complexity is intentionally avoided for this personal game.

**Performance:** Country boundaries and D3 are loaded separately from the initial game UI. Search works while the map loads and after map failures. Geometry is simplified ahead of time. A bundled Web Worker projects country outlines away from the UI thread, skipping offscreen shapes and obsolete camera frames. Paths, markers and ocean zoom update together, and the heat blink waits for the final displayed frame. If workers are unavailable, rendering falls back to the main thread. There is no animation/render loop when idle, and no remote imagery or web fonts. Victory effects use a short-lived canvas with a capped pixel ratio and particle count; no animation runs after the effect completes. SVG is a shaded orthographic projection with 3D-like rotation, not a WebGL 3D scene. Current measurements and limits are recorded in the technical plan.

Once GitHub Pages is configured to use GitHub Actions, pushes to `main` automatically rebuild and deploy the site. The deployment workflow reports its published URL. A local build alone does not publish the app.

Zoom framing uses an area-based estimate, not a guarantee that every island or elongated border fits on screen. Zooming magnifies the bundled Natural Earth boundaries; it cannot add detail absent from that data. Tiny-country markers remain visible, and reset restores the full globe. Manual zoom cancels an active flight or blink.
