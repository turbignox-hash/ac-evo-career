# Short version for the subreddit (English) — r/assettocorsaevo

> Cut short from the long post (POST-PRESENTAZIONE-IT.md, 1/11) — same body as
> [POST-PRESENTAZIONE-SUBREDDIT.md](POST-PRESENTAZIONE-SUBREDDIT.md), English.
> The two screenshots go at the top: upload them manually on Reddit
> (`docs/screenshots/in-diretta/cruscotto.png` and `pitwall.png`) — on Reddit
> the first thing seen is the image.

---

![Cruscotto — car-swap log, pit-wall advice, "Prepara e Divertiti" (Prepare and Have Fun)](docs/screenshots/in-diretta/cruscotto.png)

![Pitwall — copilot radio live in session, timed stint armed with auto-start](docs/screenshots/in-diretta/pitwall.png)

*(Previews of the v0.1.45 interface, rendered outside the game on the real
server — the "engine not available" strip on the first shot is the marker:
it doesn't appear in game.)*

**Pitwall (ac-evo-career) — the AC EVO career managed from your desktop, and on track your copilot speaks Italian**

https://github.com/turbignox-hash/ac-evo-career

Free, open source, self-updating. I've been building it for months between races — here's what it does:

- **A real career for EVO**: championships drawn from a reproducible, seeded draw through the game's catalog (five tiers, mono-brand and multiclass series, ballast and penalties computed from the ΔPI with a declared 20% cap — never by eye).
- **The grid gets written INTO the game**: Pitwall picks the AI, seats them in cars and prepares the race-weekend customgrids; every write follows backup + verification.
- **The mechanic kills the "what pressure do I run?"**: it reads the telemetry of YOUR laps, advises pressures/aero/fuel and writes the `.carsetup` that EVO accepts hot — no restart.
- **🌉 Bridge between tracks**: the car's base setup copies over to a track it has never visited — without rebuilding the setup from scratch.
- **Voice copilot, always in Italian**: deltas, fuel, mid-race, weather — spoken during the session, nothing to read while driving.
- **Driver names editable** (single or bulk rename), everything clickable Football-Manager style: cars, drivers, tracks, series.
- **Save safety**: backup before every import, an anti-double-import ledger, integrity check with safe repairs.
- **PB book** per car×track, with the ideal lap summed from best-ever sectors.

One-file install (`installa.cmd`); [v0.1.45](https://github.com/turbignox-hash/ac-evo-career/releases/tag/v0.1.45) on GitHub with 697 green tests.

Tried it and stumbled on something? GitHub issues or below — thanks!
