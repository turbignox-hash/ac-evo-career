# EVO Pitwall — Session Report (October 24, 2026, evening)
Version 0.1.11 · This report covers everything changed in this session, in plain English.

## 1. Car-pool guard — the "wrong seat" problem is solved
*(Mauro's request: "I took the tuned Sprinter instead of the 1600 and the UI never noticed — I could even take an F1 and it would hand me the win. Limit the choice to the cars the series actually offers.")*

EVO cannot be forced from the outside to put a specific car in your seat — the seat is picked by hand in the game. What we could do (and did) is make the tool notice and pay nothing for it:

- **New module `src/car-pool.mjs`** — the car-pool guard:
  - `carPoolOf(ladder, nodeId)` builds the allowed-car list for a series: the class's `poolAuto` list from `grid-classes.json` when the class declares one (multiclass series), otherwise the series' own `node.cars`; minus the presets excluded by `escludiAuto` (matched by preset tokens against both display name and car id).
  - `carInPool(car, allowed)` matches with tolerance: either normalized substring match (accents, extra years, spacing) **or** a digits+long-words match, so "Toyota Sprinter Trueno 1600 GT Apex" matches the pool entry "1600GT-Apex (AE86)" while the **tuned** Sprinter GT-Apex (missing "1600") is rejected. Same-letter-car techniques like taking a faster sibling no longer slip through.
- **At import** (`src/import.mjs`): if the result's car is outside the pool, the race is still archived for viewing but is registered **worth zero** — 0 points, 0 prize, 0 reputation, and the win/podium do not enter your career statistics (`src/state.mjs applyRaceResult`).
- **In the race card** (`src/race.mjs`): the seat pick now lists **only the allowed cars**, and an out-of-pool seat is flagged before you start.
- **Live & copilot** (`gui/js/viste-a.js`, `src/webui.mjs`): while on track the engineer panel shows a red banner: 🚫 *Car outside the series pool — allowed: … — scores 0 points and 0 prize at import*, and the copilot repeats it every 30 s until the seat is legal again. The live payload carries an `auto {ok, mine, ammesse, classe}` field for any client.
- **Tests**: new `test/car-pool.test.mjs` (5 tests: pool source, exclusions, mixed-name tolerance, F1 rejection, tuned-Sprinter rejection, no-pool means no judgement). The end-to-end watcher test also was fixed: its fake result used the default Ferrari 296 in a one-make Abarth/Golf/Alfa series, which — correctly! — was flagged as out-of-pool and scored zero; the test now races a legal car. Full suite: **187/187**.

## 2. Copilot polishing (two bugs Mauro heard on track, plus the language fix)
- **Constant "you are +0.3 slower than best" chatter** — the pace narrator spoke every 12 s even when the delta had not moved. Now it speaks only when the value actually changes by ≥ 0.4 s since its last spoken value (plus the 12 s minimum gap).
- **"Lap 1 completed" at race start** — the shared memory hands over the previous session's values at startup, so the lap narrator could announce a lap you hadn't driven. Now a "lap done" speech requires: a lap number higher than the last one observed live **and** a lap time never seen before in this run; every abnormal reattach (page opened mid-session, lap counter going backwards, server restart) re-seeds silently. The first delta value also seeds silently.
- **Copilot spoke Italian on the English UI** — root cause: the browser's voice list loads asynchronously (Chrome/Edge), so at the first speech `getVoices()` was empty and the engine stayed on the system default (an Italian voice). Fixed with a voice-list cache + `voiceschanged` reload + a 600 ms scan fallback, voice selection by UI language (exact match → language prefix → default), and a one-time toast if the active language has no voices installed at all (fix hint: Windows Settings → Speech → Add voices). All narrator texts already carry both `it:` and `en:` keys and follow `window.LINGUA`.

## 3. "Senza vincoli" (no-restrictions) mode re-scoped — money and reputation are back
*(Mauro's follow-up: "reintroduce the money and the reputation for the championships, then resume.")*

The original evening version of the mode opened everything and made seats free. As requested, it now keeps **one** perk only and everything else returns to the real career:

- **Still open** (while `data/senza-vincoli.json` exists): the **placement gates** of the ladder (the "needs a top-N finish in the feeder series" locks) — you can still enter any series for testing.
- **Back in force**:
  - `repRequired` is a real block again in both `gateStatus` and `enterNode` — entering a contract series you lack reputation for is refused (verified live: repRequired 50 with rep 0 → "reputazione 0/50 per un contratto ufficiale").
  -** Seats**: buying and renting a seat **charge money** again (the "free seat" branches were removed from `enterNode`).
  - Round **entry fees** are charged again (`race.mjs chargeEntry` uses the canonical `entryFee`), and the `senzaVincoli` import was dropped from `race.mjs`.
- Deleting the file still returns everything to 100% canonical career, as before.

## 4. Everything else verified before the sync
- **Full error scan**: `node --check` on every `.mjs`/browser script in `src/`, `tools/`, `test/`, `gui/js` — zero syntax failures; **test suite 187/187** (three times during the session: after the guard, after the copilot fixes, after the mode re-scope); no stray replacement characters in tracked sources.
- **Repository hygiene**: build zips (`pacchetti/`) and session probe scripts (`test/_probe-*.ps1`) added to `.gitignore` — the friend-package zip stays a local deliverable, and diagnostic probes don't ride along with commits anymore.
- Factory grid files under `config/griglie-fabbrica/` carry today's harmonized grids (see the grid/harmonica notes in NOTE-AUTOMAZIONE), and the ladder grid sizes match the EVO-native counts (the crash-safe cell-count gate learned on Oct 23).

## What is rolling into this build (git summary)
- Vigia del parco auto: car-pool guard + import zero-penalty + live banner + copilot speech (`src/car-pool.mjs`, `test/car-pool.test.mjs`, changes in `src/import.mjs`, `src/race.mjs`, `src/state.mjs`, `src/webui.mjs`, `gui/js/viste-a.js`).
- Copilot: pace-chatter and false "lap done" fixes; English voice selection.
- Money and reputation restored for championship entry, seats and round fees.
- Test fixes (`test/cli-watch.test.mjs`) and documentation (`NOTE-AUTOMAZIONE.md`).

*Generated as part of build v0.1.11; see the Italian technical log in [`NOTE-AUTOMAZIONE.md`](../NOTE-AUTOMAZIONE.md) for the full play-by-play.*
