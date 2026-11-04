# Presentation post — EN VERSION

> Translated from POST-PRESENTAZIONE-IT.md (1/11). Channel decision on the
> R1–R3 table: the long/tech post heads to the **EVO forum** first; this
> English version follows as a second step. The short subreddit cut lives in
> POST-PRESENTAZIONE-SUBREDDIT.md. On a plain-text forum (no markdown) the
> two images at the bottom are uploaded by hand: files are in
> `docs/screenshots/in-diretta/` (cruscotto.png, pitwall.png).

---

## Pitwall (ac-evo-career) — a desktop career for AC EVO, and a copilot who talks to you in the car

Hi all! Over the last few months, between races, I built the exact tool I
wanted for myself — and it is now ready to run under your own garage roof:
**Pitwall (`ac-evo-career`)**, the assisted career for Assetto Corsa EVO,
free, open source and self-updating:

**https://github.com/turbignox-hash/ac-evo-career**

The interface comes in both Italian and English. The copilot, however, only
speaks **Italian** — for now.

### Inside and outside the game

Pitwall prepares the career from your PC (grid, setups, planning,
statistics), and inside EVO it plugs in **two companion apps** — the
**Cruscotto** (drivers, races of the day, series you signed up for, a
mini-standings of the round, session clock) and the in-game **Pitwall**
(radio from the copilot during sessions, the end of day verdict, the
stint window, and the «Prepare & Have Fun» sync).

### «Pools drawn by seed · cap 20%» (Championships)

Championships are not a closed list: they are **five tiers** (from «Vintage»
to «Racing») born from a **reproducible draw** inside the game's own catalog.
The GUI shows you the **seed** (e.g. `819802402`): same seed, same draw —
**single-make** series, **multi-class** grids, and multi-class with
**automatic ballasts and penalties** computed from the ΔPI (not by eyeball:
declared cap is 20%, and they are recalibrated track by track from real
results by the grid-calibrating module). A new seed stirs a brand new mix:
road cars, Cup, GT and epic head-on battles, all at the same tier. The Pools
panel reads at a glance: seed, drawn pool, the ballast table with its cap
tag, and the calendar — everything clickable.

### Everything is clickable, Football Manager style

From 31/10 on, every reference opens its own card: the name of a car opens
the **Book of Cars** page (the search understands «Evo II» even when the
render is called «Evolution II»), of a driver the **rival dossier**, of a
track the **track book**, of a series the **Championships** tab; on the
ruler, the date, cash, rep and season entries jump straight to the right tab.

### Driver names are editable

From any recurring card (Championships standings, rival dossier), the
**✏️ Rename** button puts your nickname where the AI name used to be: the
save keeps its real history unharmed and the nickname applies everywhere
(cards, statistics, standings). **Bulk nicknames** fix a whole grid in one
window.

### The copilot only speaks Italian (for now)

During a session the copilot dictates **in Italian** (even with the UI in
English): deltas, fuel remaining, halfway point, weather — out loud, no
reading required while driving. On the dash board there's a **«♪ test»**
chip to hear it right away, without going on track.

### The grid that actually writes into the game

This is where the difference lies: Pitwall does not only read the career,
**it builds it**. It picks the AIs, puts them in cars (gradual matching
EXACT → CONTAINS → WORDS → ALIAS), applies per-track ballasts computed from
real results, and prepares the **customgrid** files of race weekends that EVO
then loads on its own. Every write happens **after** backup and verify: copy
first, check, then the game reads the result.

### The mechanic removes the «what tire pressure do I run?»

From the telemetry of **YOUR** laps the mechanic recommends pressure, aero
and fuel, shows a **preview** and writes the `.carsetup` — which EVO accepts
**hot, no restart** (extract it in the LOAD screen). And to start on a new
track there's the **🌉 track-to-track bridge**: the car's base setup gets
copied onto a track where that car has never been, in one click from the
garage overview.

### Save safety, quiet nights

Automatic backup of the EVO save **before every import**, an anti-duplicates
registry (the same file never pays twice), a career integrity check with safe
repairs, and an end-of-season review you can export.

### Free practice with a PB book

Every practice session EVO writes gets recorded on its own: a **PB book per
car × track**, plus the ideal lap summed from your best-ever sectors.

### One-file installation

`installa.cmd` and you're done: the release with the latest build's zip is on
GitHub ([v0.1.45](https://github.com/turbignox-hash/ac-evo-career/releases/tag/v0.1.45),
697 tests green in sandbox), and the app keeps itself updated: the
«Update now» bar downloads, runs the tests and never touches your save. All
open source, no subscriptions.

---

Frames from v0.1.45 — two **previews of the interface, rendered outside the
game on the real server** (the first one's «engine not available» banner
says so: it never shows in-game):

![Cruscotto — car swap log, pit-box tips, «Prepare & Have Fun»](docs/screenshots/in-diretta/cruscotto.png)

![Pitwall — live copilot radio in session, round armed with the auto-start](docs/screenshots/in-diretta/pitwall.png)

---

Thanks for reading — tried it? Tripped over a corner that doesn't work?
Let us know here, or on GitHub issues.
