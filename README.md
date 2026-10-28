# EVO Pitwall (`ac-evo-career`) — automated career for Assetto Corsa EVO

🐞 **Bug or idea?** [Open a GitHub issue](https://github.com/turbignox-hash/ac-evo-career/issues/new) — or use the “Report a problem” link in the tool sidebar: it opens the same form *already filled in* with build version, current series, recent errors and difficulty. · ☕ **Support the project:** [Ko-fi](https://ko-fi.com/turbigno) ·

A persistent, automated career for **Assetto Corsa EVO**, modelled after a career
app for Automobilista 2.

The original is not a content mod: it is an application that lives *outside* the
game. It decides the race, launches the simulator, then re-reads the results and
updates money, reputation, standings and the market. EVO works the same way,
with one important difference stated up front:

> **EVO accepts no command-line arguments and reads no session file written from
> the outside.** There is no equivalent of Assetto Corsa 1's `race.ini`. So the
> race is prepared in the game's own interface: the app tells you *exactly* what
> to set (one screen, two clicks) and opens the game for you. **Everything else
> is automatic**: the result is read from the game's own native files.
>
> **The only step still on your shoulders is picking the car by hand:** at the
> moment it cannot be set automatically, so you choose it in the game's
> interface — and the race card already tells you *which* one.

**The career is inspired by Apex to Zero, the Automobilista 2 career app — but
developed from scratch**: the ladder, economy, points, profiles, classes and
series are code and data written for EVO, not a reconstruction of the original
project.

## The four things you should know first

1. **The car is picked manually, for now.** Launching the session itself,
   calendar, entry fees, AI sliders, result import and everything downstream is
   automatic; only the car selection stays in the game's interface (see the race
   card — it lists the exact car).
2. **The progressive balance system learns while you race.** Multi-class
   championships that run cars of **the same category** together (e.g. a grid
   mixing two classes of the same series) get **ballast (kg) and time penalties
   (%)** calculated by the tool. Every real race result is recorded (append-only
   log, `data/grid-calibrazione.json`): the more laps you and your rivals
   complete, the more the system learns how far each car really is from the base
   and recalibrates the weights — with a per-track confidence score and caps, it
   never invents numbers out of thin air. You watch it converge on the **Grid**
   tab.
3. **The Mechanic computes every improvement currently possible** — tyre
   pressures with the 4 PSI rule, camber, ride height, bumpstops, brake bias,
   TC, fuel per lap — and tells you if, and why, a data source is missing (e.g.
   empty telemetry files): it prefers real telemetry from EVO's `.ld` files and
   falls back to estimates, and it never changes anything inside the game unless
   you click **Apply** (it writes a `*-EVO-consigliato.carsetup` file next to
   yours).
4. **No wet↔dry dynamic weather races yet — the game cannot do it.**Assetto Corsa EVO does not implement dynamic weather transitions (dry to wet and back) *inside a session* at the time of writing, so the app schedules fixed
   weather presets per round only. If Kunos adds in-session dynamic weather, the
   only files to touch are `src/weather.mjs` and the round profiles.

## Screenshots (every tab of the real interface)

The interface has 19 tabs. These are live screenshots of the tool running on a
real career save (interface set to English):

**Everything is clickable** (since 28/10, Football-Manager style): a car name
opens its spec sheet, a driver the rival card, a track the track book, a series
the Championships tab, and the ruler's date/money/rep/season jump to the right
tab. Page switches carry parameters: the search prefills itself and, if the
match is unique, the sheet opens on its own.

| Tab | What you get |
| --- | --- |
| ![Dashboard](docs/screenshots/01-dashboard.png) | **Dashboard** — season stats (wins, podiums, points, round chart), the race card with the exact session to set in EVO, and next-race reminder in the header. |
| ![Race centre](docs/screenshots/02-race-centre.png) | **Race centre** — the seasonal calendar strip, the rounds you can still run, and the next race sheet. |
| ![Setup](docs/screenshots/03-setup.png) | **Setup** — the Mechanic's advice (pressures → the 4 PSI rule, camber, ride height, bumpstops, brakes, TC, fuel), the **lap chart** with MoTeC telemetry, setup history, telemetry diagnostics per car. |
| ![Messages](docs/screenshots/04-messages.png) | **Messages** — the agent's mail: contract offers, challenges, urgent races. |
| ![Championships](docs/screenshots/05-championships.png) | **Championships** — your series, the seasonal gate and progress; at the bottom the folded **World Ranking — prestige** panel (the 369 drivers of the world, yours included). |
| ![Grid](docs/screenshots/06-grid.png) | **Grid** — the progressive balance screen: ballast kg and penalty % per car, per-track proposals, AI range, learned calibration. |
| ![Rivals](docs/screenshots/08-rivals.png) | **Rivals** — head-to-head, form, nemesis and rival classifications. |
| ![Analysis](docs/screenshots/09-analysis.png) | **Analysis** — lap delta autopsies, rival dossiers, the five pilot tools. |
| ![Tracks](docs/screenshots/10-tracks.png) | **Tracks** — the track book: history, nicknames, mastery level, personal bests. |
| ![Cars](docs/screenshots/11-cars.png) | **Cars** — the car book with official renders and performance index. |
| ![Garage](docs/screenshots/12-garage.png) | **Garage** — cars you own or won, appraisals and sales. |
| ![Results](docs/screenshots/13-results.png) | **Results** — one-click import of the last compatible race (or manual entry). |
| ![Archive](docs/screenshots/14-archive.png) | **Archive** — every session written by EVO, searchable, with full classifications. |
| ![Online](docs/screenshots/14-archive.png) | **Online** — the multiplayer races (`_MP_` tag) in a tab of their own: a clickable grid for every online session, plus the **online rivals book** (stable identity via the game's `driver_id`). |
| ![Free laps](docs/screenshots/19-free-laps.png) | **Free laps** — the pure test-day mode: pick PRACTICE, track and car in EVO and just drive; every session the game writes lands in the hotlap book by itself, with the PB book per car × track and the ideal lap built from your best-ever sectors. The career is never touched. |
| ![Stats](docs/screenshots/15-stats.png) | **Stats** — trophy hall, sigils, points and position charts. |
| ![Finances](docs/screenshots/16-finances.png) | **Finances** — the flow ledger: prizes, sponsors, entries. |
| ![Difficulty](docs/screenshots/17-difficulty.png) | **Difficulty** — per-series AI bands, adaptive trim, everything written to the game sliders. |
| ![Settings](docs/screenshots/18-settings.png) | **Settings** — career slots, language (Italiano / English), installation checks. |

The interface language is chosen in **Settings** and stored in the browser; the
CLI honours `EVO_LANG` (`it`/`en`).

## Screenless-but-simple cycle

```
node ac-evo-career.mjs next      what's next, and what to set in the game
node ac-evo-career.mjs race      pay the entry fee, mark the race, open EVO
   ... go race ...
node ac-evo-career.mjs import    read the native result and update the career
```

With the GUI (`apri-gui.cmd`, or voice **1** in `avvia.cmd`) the cycle is still
simpler: the **Get everything ready and have fun** button writes hour, laps,
weather, grid, car and rules into EVO for you, the **import is
automatic** at race end (watcher), and the header shows the countdown to the
next race.

## Update bar and build version (visible in the GUI)

- The side footer of every screen shows the **build version**: `build 0.1.2 ·
  809ea00` (semver from `package.json` + 7-digit commit hash). It changes on
  every project save: `sincronizza-git.cmd` bumps the version automatically
  (tools/bump-versione.mjs) before committing, so a new build can never be
  mistaken for an old one. `node tools/bump-versione.mjs --check` prints the
  current number.
- The **update banner** compares the GitHub `offsite` remote against the disk at
  every GUI start. Behind the banner: GitHub ahead → yellow banner with "Update
  now" (git fetch + merge --ff-only + npm test, always with your consent, your
  save in `data/` untouched); equal or offline → silent. The command-line
  version is `node tools/aggiornamenti.mjs` (`s/N` prompt, Invio/15 s = no).

## What's new in the recent builds

Highlights of the **0.1.13–0.1.18** line (every save writes a readable
changelog under [report/](report/), with the real test-suite result inside):

- **Fully procedural championships, with procedural intelligent balancing.**
  Five tiers (Epoca → Corsa) come out of a seeded draw (`tools/_genera-stili.mjs`):
  each level draws at random from the car catalog within its PI band — mono-brand
  series, multiclass, classics and GTs drawn freely together («what it draws
  will be completely random»), and `--seed N` reproduces the same draw. The
  balance is procedural too: ballast and restrictor penalties computed from the
  PI delta (slope calibrated on real data; the 20% game cap declared for
  out-of-formula cars — the first race decides), then per-track recalibration
  learned from your real race results by grid-calib. Even before signing a seat,
  the Championships tab shows the five draw sheets — seed, pool, rules and
  calendar, all clickable.
- **The copilot always speaks Italian — and makes sense.** From 27/10 the
  voice is always it-IT even with an English interface (English UI serves
  Paddock, the voice no longer follows it). At startup it waits a few beats
  for the browser's asynchronous voice list, only speaks when a *value*
  actually changes, never repeats a phrase within 20 s and stays silent for
  the first seconds after a session switch. The **♪ test** chip on the
  dashboard speaks one line on demand to verify the Italian voice.
- **Grids now build themselves for every series.** The "harmonic" variant
  system (a unique livery per cell — EVO crashes on schedules with repeated
  cells) applies to **every car** of a series, not a single chosen one. Series
  templates land in the save's warehouse (`data/grid-templates/`), factory
  templates fill the gaps, and a fresh PC needs no manual "N liveries + APPLY"
  ritual anymore. Progress of the learned balance on the **Grid** tab.
- **Free laps — the test-day mode.** In EVO pick PRACTICE, any track, any car
  and just drive: every session the game writes lands in the hotlap book by
  itself, with the PB book per car × track, sector deltas against your best
  ever, the ideal lap built from best-ever sectors and telemetry analysis.
  The career is never touched.
- **One-file install for a friend.** `installa.cmd` (a single file, a few KB)
  installs everything on a Windows PC — portable Node downloaded if missing,
  code from GitHub, `build-id.txt` written, tests run, desktop shortcut with
  the program icon and the first-launch wizard. `disinstalla.cmd` undoes it
  cleanly and refuses folders that don't look like an installation. Both are
  covered by sandbox tests.
- **Old closing messages stay readable.** Paddock and grid-calibration notes
  written back when the career ran in Italian are translated on display in
  the English interface — the save file is still never modified.
- **The in-game «Cruscotto» widget (from 27/10).** The first widget inside the
  game: it quietly reads the server dashboard and shows your driver, today's
  races and entered series in the ACEUIAppLoader app — install with
  `node tools/installa-cruscotto.mjs`, kept fresh by the publisher
  (`src/uiapp-pub.mjs`). From 28/10 it also shows the mini-standings of your
  current series and the world-skill panel, plus a button that opens the full
  Mondiale in the browser GUI — all computed with the same server formulas
  (`standingsFor`, `playerWorldSkill`) so the numbers can never diverge.
- **Paddock and car classes (26–27/10).** The class engine now pairs series
  with the car park actually on disk: with the right classes per-track ballast
  has lost its bite (latest races: zero escapes from the base, no penalty
  above 8%, the 20% cap never reached).

## Installation

For a friend's install on another PC (first setup, updates from the launcher,
typical issues) there is a dedicated guide: [GUIDA-AMICO.md](GUIDA-AMICO.md).

Worth reading even for the shortest path: **copy `installa.cmd` to the other
PC and double-click it** — portable Node (if missing), code, desktop shortcut
and first-launch wizard are all handled, and `disinstalla.cmd` undoes the
whole thing later. For the way via clone or ZIP-from-GitHub, **Node.js 18+** is
the only prerequisite. Either way: Assetto Corsa EVO installed and started
at least once (so its data folders exist).

```bash
node ac-evo-career.mjs setup
```

`setup` finds on its own:

| What | Searched where |
| --- | --- |
| data folders | `%USERPROFILE%\Saved Games\ACE` (0.5+) and `%USERPROFILE%\Documents\ACE` (older) |
| results | `<data folders>\Results\*.sessionresults.json` |
| logs | `<data folders>\Logs` |
| executable | `AssettoCorsaEVO.exe` in every Steam library (`libraryfolders.vdf`) |

Different paths? Force them once:

```bash
node ac-evo-career.mjs setup --data "D:\Data\ACE" --game "D:\Steam\steamapps\common\Assetto Corsa EVO\AssettoCorsaEVO.exe"
```

Then verify the career ladder mentions content you **actually have**:

```bash
node ac-evo-career.mjs content --validate   # problems + three nearest IDs for each
node ac-evo-career.mjs content --list       # all content seen in the install
node ac-evo-career.mjs content --search gt3
```

### Starting out

```bash
node ac-evo-career.mjs new --name "Your Name" --nation ITA
node ac-evo-career.mjs status
```

You can also start directly in the interface: it opens on the signup form where
you write the driver name (the same one used in EVO) and the nation.

You enter on a level-1 series with 6,000 in pocket. The entry discipline is
chosen with `--discipline entry|touring|single|gt|endurance|strada`, otherwise
you start in Coppa Città.

```bash
node ac-evo-career.mjs series --discipline gt    # the ladder: what's open, what's missing
node ac-evo-career.mjs enter gt4_open            # change series by renting or buying
node ac-evo-career.mjs enter gt4_open --buy      # buy it instead of renting
```

**Driver name:** the name you give to `new` is also how the import recognises
you in the game's results. If EVO knows you under another name, use **the game's
one** (`new --name "Mauro Turbigno"`, or fix it later with
`rinomina --name "Mauro Turbigno"`). The game looks for the in-game badge first,
then the name, then the only driver without the `•` marker (EVO's AIs carry the
dot) — the name EVO uses for you appears in `Logs\log-*.txt` on the line
`Creating Car (Name Surname ...)`.

**Your first race, end to end, in five steps:**

1. `next` — read the race card: track, laps, weather, and the car.
2. `race` — entry fee paid, race marked, EVO launches itself.
3. In the game, set the fields of the race card and **pick the car by hand** —
   that is the entire manual part.
4. ... go race ...
5. `import` — or let the GUI watcher do it: money, standings, rivals, upgrades
   and the mechanic's advice all refresh by themselves.

**On a fresh PC, the first-launch dance, in order** (from the friend guide,
§3-bis — the two gestures the tool cannot do from outside):

1. **In EVO, once only: the round's WEEKEND screen.** Open EVO → Career →
   current round → **reach the Race Weekend screen** (nothing to play: it is
   enough that the screen appears) and go back to the EVO menu. The tool
   writes hour, laps and weather INTO the weekend save file, and on a virgin
   PC EVO has not created it yet — this very screen generates it.
2. **Get everything ready and have fun** (the yellow button): hour, laps,
   weather and grid get written automatically. The red message «EVO has no
   career weekend yet» means step 1 is missing: enter the weekend once and
   press the button again.
3. **Pick the car by hand inside the EVO weekend** — the first race teaches
   the app which car is yours; from the second race on it picks it alone.

⚠️ **First MULTICLASS race, once only:** in the Race Weekend menu move
**Grid Type from AUTOMATIC to CUSTOM** and press **Apply**, then never touch
the selector again. A fresh install starts AUTOMATIC and the tool cannot
flip it from outside; if the gesture is missing, the red message walks you
through it. From the next race on the yellow button rewrites the grid,
ballast and penalties by itself.

## The career: how it is built

**79 series, 6 disciplines, 7 levels, 4 tiers** — not a straight line but a tree
crossed through seat offers.

| Tier | Levels | What you drive |
| --- | --- | --- |
| Rookie | 1–2 | compacts, one-makes, MX-5, GT86 |
| Semi-pro | 3–4 | classic turbos, touring, GT4, Group B |
| Pro | 5–6 | GT3, GT2, pro touring, Formula 2004, endurance |
| Elite | 7 | Formula Elite (SF-25), GT Elite, Endurance Elite, Strada Elite |

The six disciplines are **Entry Level, Touring, Single-seater, Grand Touring,
Endurance, Road and Rally**.

- **Gates by position.** Each series demands a top-*N* finish in a lower one
  (e.g. `top: 5`); without it the seat is unavailable, and `series` says what's
  missing.
- **Open or closed access.** `open` series are bought or rented; `closed` ones
  (Formula, GT, Endurance and Strada Elite) are closed parks needing
  reputation and a contract.
- **Per-series economy.** `pocket`, `sponsor`, `factory`, `heritage` models with
  buy price, rent, race fee, per-position prize, champion bonus, and a boosted
  (×1.5) prize on **iconic races** (Sebring 12h, Bathurst 12h).
- **Real points systems.** `club`, `one_make`, `f1_2003`, `f1_modern`, `sro_gtwc`,
  `wec`, `historic_endurance`.
- **Calendar with format.** Every round has time of day, laps and weather
  preset; the series profile decides practice, qualifying, start type and
  mandatory pit.
- **Living world.** 240 AI drivers with skill, aggression, consistency, character
  archetype, aging and retirements, hot form and legendary row.
- **Realistic simulated standings.** Standings for the rounds you skip are no
  longer a formality: every seat carries a deterministic **seasonal form**
  (series+season+driver hash) whose amplitude scales with the skill gap between
  the top two seats (×1.6, capped at 0.10), so any grid size still leaves room
  for upsets. Reference measurement (`node tools/_misure-realismo.mjs`): seat 1
  wins ~61% of the races in the GT4 Cup and ~63% in Formula Elite, and titles
  are shared across the top three seats — before the fix it was 100% to the
  nose seat. The rounds you do drive remain reality: standings use YOUR true
  result.
- **Layered difficulty.** `total = base + trim + offClass + offTrack`, clamped
  70–120 and mapped to the game's AI slider; adaptive trim adapts to you, and
  anomalies wait for your accept/reject instead of applying silently.
- **Progressive multi-class balance.** Same-category championships mixing
  classes earn **ballast kg and penalty %** that converge as results are
  recorded — the data-driven calibration described above.
- **Sponsors, contracts, challenges, sigils.** Reputation-triggered sponsors,
  season-long contract objectives, per-round mini-challenges, permanent personal
  sigils — all in the ledger and trophy hall.
- **Season duel and nemesis.** The tool picks a rival for the season's
  standings; two losses in a row makes him a nemesis, beating him closes the
  feud for a trophy.
- **Flow ledger.** Every prize, sponsor, entry and bonus is written to
  `data/flows.jsonl`; the checker reconstructs money and reputation from it.
- **Journal.** Season review exports to `data/journal/stagione-N.md`.

## Schedule: day and weather per round

The scheduler (tab **Race centre**, CLI `piano`) suggests when to sign, rent and
run each round so nothing lapses, with per-round time-of-day and weather preset.
**Fixed presets only:** since EVO cannot yet morph dry weather into wet during
the session (see note 4 above), rounds are scheduled with one weather target,
and the race card tells you the exact name to pick in the game's interface.

## Why a race cannot be started via file

Verified on the real install, not hearsay:

- `AssettoCorsaEVO.exe` **accepts no arguments** loading a session or season.
- The session definition is **binary protobuf** (`last_season.seasondefinition`,
  `GameModes\GameModeType_*.gamemodesave`). The `.json` twin next to them is a
  readable copy written by the game, not a documented input.
- **The result format, on the other hand, is plain reliable JSON**:
  `Results\<yyyymmdd-hhmmss>_SP_<Session>.sessionresults.json` with standings,
  laps, fastest lap, gaps, stops and penalties — that is what the app reads
  (positions are 0-based: first = 0, the import detects it).

So the compromise is: **one settings screen to apply in the game (the race
card), everything else automatic.** If Kunos ever expose a real input, the only
piece to replace is `src/race.mjs`.

## Online races (community): the archive that forgets nothing

Recent builds have EVO writing results **for online races too**: every
multiplayer session drops an `_MP_Race.sessionresults.json` into the same
`Results` folder. The **Online** tab of the GUI gathers them all — and keeps
them apart from the rest of the career:

- **No points, no money**: the save in `data/` stays untouched
  (safeguarded both in the watcher and in manual import, since 31/10). Online
  races never count toward the career championship: they stay as **memory**.
- **Every row is the full session**: date/time, community/server, track+layout,
  weather and in-game time, drivers on the grid, your finish with best lap,
  the winner. Click a row → the complete classification with timings, gaps
  and penalties, like in Archive.
- **Online rivals book** — the part community servers love: who you met most
  often, how many times they beat you and where, recent form (last meetings,
  green/red tags), their favoured track, usual car and the last shared
  session. Identities come from the game's **driver_id**: it survives
  different nicknames, communities and servers; the normalized name is the
  fallback. Only sessions where you were BOTH on the grid, so no ghosts.
- **PC-wide scope**: the "show the whole PC" toggle adds races born under
  OTHER career slots (Results is per PC), like in Archive.

For community friends: everything runs LOCALLY, on the driver's PC — the tool
never sends anything online, accepts no inbound connections (the local
server's Origin/Host defence) and only reads the JSONs the game is already
writing. The career save stays segregated.

## Commands

| Command | What it does |
| --- | --- |
| `setup [--data <path>] [--game <exe>]` | detect and store install paths |
| `content [--validate\|--list\|--search <text>]` | content seen in the install / ladder check |
| `new --name "Name" [--nation ITA] [--discipline gt] [--force]` | start a career |
| `rinomina --name "Name Surname"` | change driver name (must match EVO's) |
| `status` | dashboard: money, reputation, seat, tier, position |
| `series [--discipline gt] [--all]` | full ladder with gates and locked series |
| `enter <nodeId> [--buy] [--force]` | change series by rent or purchase |
| `calendar` | season calendar with time and weather per round |
| `standings` | series standings |
| `paddock [--all]` | rival drivers: archetype, age, difficulty band |
| `messages` | agent mail and paddock news |
| `next [--car <id>]` | next race with the exact in-game card |
| `race [--car <id>] [--dry-run] [--no-launch] [--force-launch]` | pay entry, mark the race, open EVO |
| `import` | read the native result and update the career |
| `import --position N --cars M [--dnf] [--fl]` | manual entry if the file is not enough |
| `import --inspect [--full]` / `--ledger` | inspect result files / import log |
| `import --allow-any` / `--force` | search all races / force re-import (know why first) |
| `difficulty [--mode adaptive\|fixed\|custom] [--value N]` | how AI is computed |
| `difficulty --lock <node>` / `--unlock <node>` | lock a series' difficulty |
| `difficulty --accept` / `--reject` | answer a pending suggestion |
| `griglia-calib [--convalida]` | the balance calibration: summary, per-track confidence |
| `season-end [--force]` | close the season, pay titles, open the market |
| `review [--season N]` | season review: races, rivals, duels, prizes |
| `dottore [--fix]` | career integrity check (and repair) |
| `accept <n>` | accept a seat offer |

Language on the CLI: `set EVO_LANG=en` (CMD) / `export EVO_LANG=en` (Bash) —
English everywhere without touching the save.

## Customizing the ladder

Everything lives in `config/career.evo.ladder.json`: disciplines, levels, gates,
economy, points systems, session profiles, name pools, and the 79 series. Cars
and tracks use the folder IDs inside `content\cars` and `content\tracks`
(e.g. `ks_ferrari_296_gt3`, `imola`).

```json
{
  "nodeId": "gt3_serie_a",
  "display": "GT3 Serie A",
  "discipline": "gt",
  "level": 5,
  "access": "open",
  "requires": { "nodeId": "gt3_coppa", "top": 5 },
  "points": "sro_gtwc",
  "profile": "feature",
  "gridSize": 20,
  "ai": [90, 101],
  "econ": { "buy": 550000, "rent": 55000, "entry": 8000, "prize": 65000, "champion": 190000, "model": "sponsor", "icon": "" },
  "cars": ["ks_ferrari_296_gt3", "ks_bmw_m4_gt3"],
  "calendar": [{ "track": "imola", "name": "Imola - Opener", "laps": 11, "hour": 13, "weather": 0 }]
}
```

`ai` is the grid band (strongest on top) — the series' average difficulty is
band centre, plus adaptive trim and offsets; the conversion to the game's slider
lives in `aiSlider`.

**With modded content**: the catalog is rebuilt from what the game writes, so
mods installed after the last launch may not show in `content --list`. Write
their IDs in the ladder anyway; `content --validate` will only tell you it has
not seen them yet. The mod itself installs as usual (`.kspkg` in
`Saved Games\ACE\mods`).

## Trying everything without the game

```bash
node tools/evo-demo.mjs                     # fake install with the ladder's content
ACE_DATA="demo/ace" node ac-evo-career.mjs content --validate
ACE_DATA="demo/ace" node ac-evo-career.mjs new --name "Mauro Sgamer" --nation ITA
ACE_DATA="demo/ace" node ac-evo-career.mjs race --no-launch
ACE_DATA="demo/ace" node tools/evo-fake-result.mjs --position 3 --cars 12 --track Imola --fl
ACE_DATA="demo/ace" node ac-evo-career.mjs import
```

`tools/evo-fake-result.mjs` writes a result file **in the real format**
(0-based positions, `•` on AIs, empty `total_time` for retirements), with
`--position N --cars M`, `--fl` and `--dnf` modes. `ACE_DATA` is an exclusive
override: with it set, the app looks **only** at that folder.

## Code quality gate (Biome)

The repo carries its own [biome.jsonc](biome.jsonc): `npx @biomejs/biome@2.3.12 check src gui`
exits 0 and is the lint gate before any commit. Three deliberate choices are
written in that file, so nobody re-fights them:

- **the formatter is permanently off** and so is import auto-organizing:
  the existing style is the project's style (35k working lines are not
  rewritten by a sentence);
- the rules that would punish intentional idioms are **off**: the
  `(m[k] ??= seed).push(…)` pattern, `btn.onclick = () => {}` arrow bodies
  inside `forEach`, `'use strict'` in the GUI's plain `<script>` files
  (in a classic script it is **not** redundant, unlike in modules), plus
  template-literal/exponent/arrow-preference rules that are pure taste;
- `noUnusedVariables`/`noUnusedImports`/`noUnusedFunctionParameters` stay at
  **warning** level and honestly report known false positives: the GUI files
  share globals across `<script>` tags (e.g. `drawAnalisi` is drawn from
  `gui/js/core.js`), and module helpers keep unused-looking parameters only
  to keep every helper's signature uniform (`(ladder, state, node)`).

## Project files

The GUI server is `src/webui.mjs` (JSON API + page in `gui/index.html`): same
views as the CLI, same save file `data/evo-career.save.json`.

```
ac-evo-career.mjs                      entry point
config/career.evo.ladder.json         the ladder: disciplines, levels, gates, economy, points, series
src/paths.mjs                          data folders, executable, game launch
src/content.mjs                        content catalog, ID check, suggestions
src/world.mjs                          rival drivers, series band, simulation, evolution
src/state.mjs                          save, gates, standings, economy, difficulty
src/results.mjs                        native result file reading
src/import.mjs                         single import (GUI+CLI+watcher): dup guards, auto backup, log
src/race.mjs                           race card, entry fee, pending race, launch
src/motec.mjs / src/lapdelta.mjs       telemetry (.ld) reading, lap comparisons
src/grid-calib.mjs / grid-apply.mjs    progressive balance: calibration ledger and writes
src/webui.mjs + gui/                   the graphical interface (local server, 127.0.0.1:8642)
tools/bump-versione.mjs                build-version bump (called by sincronizza-git.cmd)
tools/aggiornamenti.mjs                GitHub update check + install
tools/evo-demo.mjs / evo-fake-result.mjs  fake install and fake results for tests
data/evo-career.save.json              your career (one file, copy or share freely)
data/grid-calibrazione.json            append-only balance calibration from real results
data/results-archive/                  raw result copy of every imported race
```

## FAQ and troubleshooting

**The import says "result not read / positions wrong".** Check the file is a
native one (`Results\*.sessionresults.json`, not a re-saved copy) and that your
driver name matches `Logs\log-*.txt` (`Creating Car (Name ...)`). EVO writes
positions 0-based and the import handles it, but a manually edited file breaks
the format — use `import --position N --cars M` to enter the race by hand.

**The copilot calls a wrong position (you are P8, you pass, it says "P6").**
That was an off-by-one in telemetry, fixed since v0.1.30: the live position
now matches the in-game HUD (EVO's shared memory counts from 0; the voice and
dashboard count from 1). If you still hear it: restart the launcher and
Ctrl+F5 the page.

**"Get everything ready" shows the car "not in the dictionary" in red, yet the
race is set.** Not a failure: track, hour and laps are written — only the car,
which the app must know to pick it by itself, is missing (new PC or a reset of
personal data). Pick the car by hand as usual: at the race end the app learns
the car from the garage and picks it by itself in later races.

**The Mechanic says a source is missing.** It means no usable `.ld` telemetry
for that car yet (or an empty file): drive one clean lap in the game and the
advice builds on real data at the next scan. It always explains which source is
missing and what estimate it falls back to.

**Two cars of the same class fight in vain.** Same-category grids get ballast
and penalties from the calibration, not from guesswork: it needs a few real
races first, then revises with per-track confidence. Check the convergence on
the **Grid** tab (`griglia-calib` gives the terminal summary). From 26/10,
with the Paddock class engine, series are born with the right classes
already: in the latest races no penalty exceeds 8% and no car escapes from
the base.

**The GUI shows a browser tab instead of a saved folder.** The picker walks the
whole disk because browser dialogs don't return chosen paths; keep clicking
through the drives to your results folder and confirm there.

**I changed game version / moved Steam library.** Re-run
`node ac-evo-career.mjs setup` (or fix the paths live in Settings — no restart
needed) and `content --validate` to confirm the ladder still matches.

## Limits, stated plainly

- **The race cannot be launched via file.** EVO ignores command-line arguments
  and reads sessions only from its interface. The app gives you the exact screen
  to set and opens the game; **the car is picked by hand** (see note 1).
- **AI difficulty is set in-game.** The app computes it and adapts it per series,
  but you move the slider: the game takes it from nowhere else. Adaptive
  suggestions wait for accept/reject.
- **No in-game overlay or VR panel.** The project never touches the game
  process; you alternate terminal/GUI and simulator.
- **No dynamic weather transitions (dry→wet→dry) in races — EVO does not
  implement it yet.** Rounds use fixed weather presets, and a session keeps the
  preset it started with. When the game adds it, the app will follow.
- **EVO's native career stays untouched.** This is a parallel progression, not a
  replacement.
- **Weather preset and text names.** The app names EVO's exact preset (e.g.
  "Scattered clouds" → "Overcast"); exact interface names can change between
  versions.
- **Road & Rally disciplines use circuits.** Rally in EVO is not app-drivable;
  rally and legendary road cars race on tracks with dedicated profiles.
- **The content catalog is observed, not certified** — official content ships in
  `content.kspkg`; the app reads IDs the game writes to its own files.
- **The save format is tied to this version** (`version: 1`): if the model
  changes, the app tells you and asks to start over instead of breaking midway.

## Backup: the four copies

| copy | what it saves | where |
| --- | --- | --- |
| disk | code, data, work docs, git history | project folder on the Desktop |
| OneDrive | full zip (code, git, personal saves, maps) and portable | OneDrive folders |
| warehouse on L: | the same two zips with SHA-256 fingerprints | L:\CarrieraEVO |
| off-site (configured) | git history only | private repo on GitHub (`ac-evo-career`) |

`AggiornaMagazzino.cmd` (on L:) refreshes the zips and fingerprints;
`controlla-magazzino.cmd` warns after 21 days or uncovered commits;
`avvia.cmd` runs the same check at launch; `aggiornamenti.mjs` is the update
check; `sincronizza-git.cmd` is the off-site copy **and** the build-version
bumper. Each full zip contains COME-RIPRISTINARE.txt (restore steps).

### The `data/` folder: what lives there, what goes to Git (audit 28/10)

Measured inventory in [report/audit-dati-2026-10-28.md](report/audit-dati-2026-10-28.md).
Summary:

- **Git carries only the static car catalogs** (`car-images.json`,
  `car-specs*.json`, `car-prices.json`, `car-guids.json`) and
  `samples/garage/map.json` — 7 files, verified with `git ls-files data`.
  Everything else in `data/` (career save, backups, calibration logs,
  snapshots) stays local by design: updates and friend installs never touch
  it.
- **The automatic save backup lives in `data/salva-save/`**: rotated
  slot-1/slot-2 zips (max 4 kept), written by `tools/salva-save.mjs` when the
  last one is older than 36 hours. Known caveat (audit A1): the zip covers
  the WHOLE `Saved Games\ACE` folder (MoTec, replays, logs, mods), so a
  backup can weigh hundreds of MB; trimming it to save-only content is the
  first open recommendation.
- One-shot `.bak-*` files in `data/` are guard copies of finished repair
  jobs; they are safe to delete once the tool change is verified.

## References

- **Apex to Zero**, the Automobilista 2 career app the idea comes from
  (everything else is developed from scratch).
- **Assetto Corsa EVO**, result format: `Results\*.sessionresults.json`.
- **ACE Career Mode** (acecareermode.com), a third-party EVO career using `.rpy`
  replays — a useful comparison; here the native result is read, no uploads nor
  accounts.

## Language

The whole app (CLI, server, GUI) works in Italian and English; the interface
choice lives in Settings (browser storage), the CLI in `EVO_LANG`. Saved story
texts (contract clauses, letters, family-memory chapters) are bilingual by
design. **The full version of this document in Italian is in
[README.it.md](README.it.md).**

Guides for a friend:

- **Italian full guide:** [GUIDA-AMICO.md](GUIDA-AMICO.md) — the §3-bis
  «first-launch dance» is bilingual inside; the English version lives right
  after the Italian one.
- **English full guide:** [FRIEND-GUIDE-EN.md](FRIEND-GUIDE-EN.md) — the whole
  friend guide translated end to end (install, first launch, multiclass
  gesture, updates, FAQ); it also travels inside the friend package.

## License

Private work: **© 2026 Mauro Turbigno — all rights reserved** (full text in
[LICENSE.md](LICENSE.md)). No redistribution, publication or reuse in other
products without written permission; the official car and track images
(`gui/carmaps/`, `gui/trackmaps/`) remain KUNOS's and are not redistributable.
