# Technical approach

## Reference and scope

The requested inspiration is Globle’s guess → proximity feedback → repeat loop. The reference website was requested read-only from the cloud environment but the network proxy returned HTTP 403, so live inspection was unavailable. The user’s detailed specification supplies the interaction requirements. Somewhere has its own visual design, copy, icons, and color palette; no reference-site code or assets are used.

The first release is a single-player random-round game with country/capital modes and separate saved rounds: no accounts, daily challenge, timers, leaderboard, audio, or infrastructure. The globe is the visual centerpiece; search and history sit alongside it on desktop; on phones, search appears above the globe and history below it. The screen is personalized with a compact “Built for Val” title and heart. Submitting a guess scrolls the mobile globe into the center of the viewport and triggers a short, delayed rotation to the guessed country. Manual controls interrupt the rotation, and reduced-motion preferences skip it. There is no idle animation apart from the loading indicator.

## Stack decision

| Option                          | Benefits                                                                                                                          | Costs / decision                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| React + TypeScript + Vite       | Clear component and state boundaries; types for country identities and rounds; small static build; good browser-test tooling      | React has a runtime cost, but is useful for synchronized search, history, globe and dialog state. Selected.                                  |
| Plain TypeScript                | Less UI runtime                                                                                                                   | More manual UI and focus-state coordination for this component-rich game. Viable, but not preferable here.                                   |
| D3 Geo + SVG orthographic globe | Accurate geographic clipping, topology support, touch and keyboard controls without WebGL, inspectable vectors, no idle rendering | Shaded globe rather than true 3D; recomputes projected paths during drag. Simplified boundaries and memoization keep work bounded. Selected. |
| react-globe.gl / Three.js       | True 3D lighting, camera controls and GPU rendering; useful for richer scenes                                                     | Adds a larger rendering stack, WebGL/GPU requirements and lifecycle complexity. More than this game needs.                                   |
| MapLibre flat map               | Familiar pan/zoom and strong mapping ecosystem                                                                                    | Tile/style/service setup is unnecessary for a one-screen globe, and offline boundary coloring still needs data decisions. Not selected.      |
| Plain CSS                       | No styling runtime or configuration beyond Vite; responsive layout is easy to inspect                                             | Requires maintaining design tokens and selectors. Selected instead of a utility framework.                                                   |

React, React DOM, D3 Geo, TopoJSON client, and tree-shaken Lucide icons are the application dependencies. Data-processing, TypeScript, Vite, and test tooling are development dependencies. Lockfile installation and a successful production build verify compatibility in Node 24; supported runtime requirements begin at Node 22.12.

## Boundaries between modules

1. Generate a checked-in 195-country list with one documented selected capital/government-seat point per country from `world-countries`, plus simplified 50m Natural Earth topology from `world-atlas`. Do not fetch gameplay metadata from a live service.
2. Keep alpha-3 IDs canonical in game state. Join map features by ISO numeric code. Keep names exclusively for display and search.
3. Keep Haversine, shared-land-border adjacency, temperature thresholds, distance ranking, duplicate checks, win detection and saved-state validation in pure functions.
4. Let the app display one round and preserve separate country and capital rounds. Persist IDs, mode, reveal state, and answer in versioned browser storage; migrate version-1 country saves without changing guesses or answer. Giving up ends a round without winning or adding a guess; derive distances from validated metadata, rather than trusting stored distances.
5. Pass guessed countries/city points to the globe. Pass an answer location only after an explicit give-up reveal and use a separate gold answer marker instead of a winning guess. Globe taps never select or submit a guess; all guessing uses the search interface. History interactions focus already-guessed countries.
6. Use native modal dialogs for focus containment and Escape support. Offer a complete keyboard search path and text/symbol temperature labels.
7. Build static assets and verify both root and project-subdirectory serving before documenting deployment.

## Accuracy and privacy

Adjacent guesses receive the hottest feedback independently of distance, using an explicit symmetric ISO alpha-3 land-border graph (including documented overseas mappings and data corrections). History sorts by center distance and highlights/pins the closest entry without changing saved chronological guess order. Center-to-center Haversine meets the requested rule and stays consistent for archipelagos and disconnected countries, but it differs from nearest-border distance. Metadata centers can be approximate and need not be inside every component. Natural Earth boundaries are generalized and make specific choices in disputed areas. This game does not settle geopolitical questions; the explicit UN-plus-observers answer list and all data limitations are documented in the README and in-game guide.

A browser-only game can keep the answer out of visible UI and out of the globe’s inputs, but cannot keep it secret from developer tools. A serverless answer/guess service could improve secrecy later, at the cost of an API, round/session handling, abuse controls and hosting quotas. That is unnecessary for this personal project.

## Cost and hosting

Cloudflare Pages is the recommendation: connect Git, build with `npm run build`, publish `dist`, and share its HTTPS `pages.dev` URL. There are no API keys, map requests to third parties, paid assets, or mandatory custom domains. Free hosting is subject to the platform’s current limits. GitHub Pages and Netlify are compatible alternatives. An optional GitHub Pages Actions workflow is included, but nothing is published by running the local build.

## Validation and performance approach

- Unit tests exercise known distances, identical coordinates, antipodes, poles, the date line, temperature boundaries, aliases, country ID uniqueness, duplicate prevention, exact-match wins, round stability and invalid saved data.
- Browser tests exercise actual production assets at desktop and Pixel 7 viewport sizes. They cover the full game and map behavior, errors and retry, and accessibility checks. Phone emulation does not replace a physical-device or Safari test.
- Initial production JavaScript is about 99 kB gzipped; the separately loaded globe module is about 12 kB gzipped. CSS is about 5 kB gzipped. The simplified boundary asset is approximately 623 kB uncompressed and is fetched once per globe mount with normal browser caching. These are build measurements, not claims about slow-device frame rates or network latency.
- No continuous animation, imagery, fonts, or render loop runs while the globe is idle. Rotation recomputes simplified projected geometry. Search stays usable while map loading is pending or fails.
- There are no development-only answer controls in the shipped application. Tests seed local storage externally. Before a correct guess or explicit give-up reveal, browser checks assert the answer’s map fill remains neutral and only submitted countries/capitals are marked. Tests verify reveal states never award wins, round history is preserved, and switching modes does not discard either round.

Real hosting credentials and publication remain with the user. The README describes a repeatable deployment, but no claim of a deployed URL or successful fresh-cloud snapshot is made.
