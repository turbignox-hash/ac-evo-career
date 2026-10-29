# Installing the EVO Pitwall career on another PC (guide for a friend)

This guide covers the «private sharing» case: the project lives on GitHub
(`https://github.com/turbignox-hash/ac-evo-career`).
The **career save does NOT travel with the repo**: every PC creates its own
career (`data/` is outside the repository, on purpose).

This is the English version of [GUIDA-AMICO.md](GUIDA-AMICO.md)
inside the project. Same steps, same order, in English.

## 0. THE ONE WAY: a single file, zero dependencies (since 26/10)

There is no longer a package to send around: you hand over **the
double-clickable `installa.cmd`** (one single file, in the project root, a few
KB) and it does the whole install with one command:

1. double click (from any folder: it can sit on the Desktop);
2. Enter for the default folder (`%USERPROFILE%\EVO-Pitwall`);
3. if the PC has no Node, it downloads a **portable Node** inside that same
   folder — no admin rights, no winget;
4. it asks **once** for the read token (§5-bis) and saves it into
   `data\.github-token`: the launcher's automatic updates work from day one;
5. it downloads the code (zipball of `main`), extracts it, writes
   `build-id.txt` and runs `npm test`;
6. it creates the «Carriera EVO» shortcut on the Desktop (icon included) and
   starts the **first-run wizard**.

The friend touches no terminal, no git, no zip: GitHub is only the download
channel and then the update channel.

## 0-ter. Uninstalling (since 26/10)

Next to `installa.cmd` there is **`disinstalla.cmd`** (it can also be copied
into the installed folder; it manages installations on its own):

1. Enter for the default folder (`%USERPROFILE%\EVO-Pitwall`);
2. if `data\` contains a **career**, it asks what to do with it:
   `[k]` keep it (moves it to `<folder>-data`, next door) or `[b]` delete all;
3. it removes the «Carriera EVO» shortcut **only if it points to that folder**
   (a shortcut belonging to another installation stays where it is);
4. if the launcher is still open it tells you so: close it (system tray icon)
   and run it again.

The uninstaller is guarded: a folder that does not look like a Carriera EVO
installation (`ac-evo-career.mjs` missing inside) is not touched on its own.

## 1. What you need

- **Assetto Corsa EVO installed and run at least once** (so its data folders
  exist: `Saved Games\ACE`).
- Nothing else: **Node downloads itself** if missing and **Git is not
  needed** (they are only for the «developer» routes of chapter 2).
- A read token for the repo if it stays **private** (once only, §5-bis).

## 2. Developer routes (clone and zip)

For people working on the project, not for the friend.

```bash
git clone https://github.com/turbignox-hash/ac-evo-career.git
cd ac-evo-career
git remote rename origin offsite     # so the update check watches the right repo
```

`offsite` is the remote name the launcher looks for (`tools/aggiornamenti.mjs`);
without that rename the check says «the offsite remote does not answer with a
commit» and the app still starts (just without updates).

**Zip route** (for anyone who does not want to install Git): grab the package,
extract it, double click `avvia.cmd` — the first-run wizard does the rest.
Updates arrive **automatically** here too, since 24/10: the package carries
`ac-evo-career/build-id.txt` and at every start the launcher compares that
build with the latest on GitHub (`tools/aggiorna-zip.mjs` — downloads the
tarball via the API and replaces, ON PURPOSE, code and config only; it never
touches anything of yours). Two honest notes: the zip cannot delete files that
the project removed (a real merge only happens with the clone); on a private
repo the read token is needed (§5-bis).

**GitHub's «Download ZIP» route** (github.com → Code → Download ZIP): since
26/10 the same self-update applies — without `build-id.txt` the FIRST start
looks at `main` on GitHub and brings the install up to speed by itself (the
read token is needed on a private repo, §5-bis); from then on it is identical
to the zip route.

## 5-bis. Read token (only if the repo goes private again)

State as of 26/10: the repo is **public** and no token is needed — the
installer even accepts plain Enter at the prompt. If it goes private again:
the installer asks for the token, saves it in `data\.github-token`, and the
zip updater reads it from that file.

1. On GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained** → *Generate new token*: repository only ac-evo-career,
   permission **Contents: Read-only** (and *Metadata: Read*, which comes
   along on its own).
2. Create the `data/` folder and inside it a file
   **`data/.github-token`** with the token (a single line — or the
   `GITHUB_TOKEN` environment variable).

Once is enough: from then on the update is as silent as with the clone. A
`from-zip` install without a token stays «private and tokenless».

## 3. First launch

Double click **`avvia.cmd`**:

1. the launcher checks for updates (silent if you are at the latest; if
   GitHub is ahead it asks `y/N` — Enter or 15 seconds = no);
2. it creates the **«Carriera EVO»** shortcut on the Desktop (only if missing
   or icon-less: later runs touch nothing) — from there you start with a
   double click, the icon is the program's;
3. it opens the graphical interface in the browser at
   `http://127.0.0.1:8642`.

At first open the GUI shows the **wizard**: it finds the data folders on its
own (`%USERPROFILE%\Saved Games\ACE`), the game in Steam
(`AssettoCorsaEVO.exe`) and scans the content. If something is not found, the
paths can be forced from a terminal:

```bash
node ac-evo-career.mjs setup --data "D:\Data\ACE" --game "D:\Steam\steamapps\common\Assetto Corsa EVO\AssettoCorsaEVO.exe"
```

Check that the career ladder mentions cars and tracks **you actually own**:

```bash
node ac-evo-career.mjs content --validate   # problems + the three closest IDs for each
node ac-evo-career.mjs content --list       # all the content seen in the install
```

If content you own is missing, the installation has to be fixed before
playing: the validation says exactly what.

## 3-bis. The first-launch dance, in order (repeat on every new PC)

This is the COMPLETE sequence, in the right order — identical on every new
PC, so «Get everything ready» works at the first press. Four gestures in
EVO, two screens in the GUI:

1. **installa.cmd** → **avvia.cmd** → wizard: it finds the EVO data folders
   and the Steam game on its own, then creates the career (driver name +
   nation).
2. **In EVO, once only: the WEEKEND screen.** Open EVO → Career → current
   round → **reach the round's Race Weekend screen** (nothing to play, it is
   enough that the screen appears) and go back to the EVO menu. This is
   needed because the tool writes hour, laps and weather INTO the weekend
   save file, and on a fresh PC EVO has not created it yet: this very
   screen generates it.
3. **GUI → Get everything ready and have fun** (the yellow button): hour,
   laps, weather and grid get written into that file automatically. If the
   red message «EVO has no career weekend yet» appears, step 2 is missing:
   enter the round's weekend once and press the button again.
4. **Inside the EVO weekend you pick the car with the mouse** (the only
   gesture the tool cannot do from outside): the race sheet tells you which
   one. This is intentional: the first race teaches the app which car is
   yours — from the garage — and in every later race it picks it alone.
5. **Go racing!** At the finish line the watcher imports the result
   automatically: money, rep, points and the copilot do the rest. From the
   second race on: ONLY the yellow button, the car is picked automatically,
   zero manual gestures.

⚠️ **The first MULTICLASS race adds one gesture, ONCE only:** in the Race
Weekend menu move **Grid Type from AUTOMATIC to CUSTOM** and press
**Apply**, then NEVER TOUCH the selector again. On a fresh install EVO
starts AUTOMATIC and the tool cannot change it from outside: if the gesture
is missing, the red message walks you through it at the right moment. From
the next race on the yellow button rewrites the grid, ballast and penalties
by itself.

🎙️ **The copilot always speaks Italian** (since 27/10 the voice is it-IT even
with the interface in English). The dashboard has the **♪ prova** chip:
one click says a line and checks copilot + Italian voice on the spot. If
the accent is wrong, add an Italian voice in Windows: Control Panel →
Speech Recognition → Text to Speech.

🎚️ **The copilot's radio has three levels** — switch from the «radio»
dropdown on the «🎧 Engineer LIVE» bar (or in Settings): essential (pit,
fuel, flags, penalties, race end), normal (+ half race, tyres, positions),
full (+ pace deltas and gap to the car ahead). In single-player races the
gap stays silent anyway: EVO leaves those fields empty.

## 4. Create your career

From item **3** of the `avvia.cmd` menu, or right in the browser
(Career / Settings screen): driver name **exactly as EVO knows you** (the
result import latches onto that name) and the 3-letter nation.

From there the cycle of a race is always the same:

```
race card (checklist) → EVO: you set the fields and pick the car BY HAND →
race → the guard (watcher) imports the result on its own
```

The only manual step left is the car pick: the race sheet says which one.

### First multiclass race: Grid Type on CUSTOM, once only

On a fresh install the EVO menu starts with **Grid Type = AUTOMATIC**.
That is fine for single-car series (everyone equal, nothing to tune). But at
the **first race with more than one model on track** (multiclass series: the
race sheet says so with the «Grid Type» line):

1. enter the round's weekend in EVO, open the Race Weekend menu;
2. move **Grid Type from AUTOMATIC to CUSTOM** and press **Apply**;
3. done: **never touch it again** — it stays CUSTOM for the whole career.

It is what brings class ballast and penalties to the start grid. From the
next race the **Get everything ready** button rewrites the grid on its own,
and if the write-from-outside does not go through, a red message walks you
through the manual move again.

## 5. Getting the updates (afterwards)

Every time you start from `avvia.cmd` (or open the interface again):

- GitHub is at the same commit → the launcher stays silent;
- there are updates → `↑ N updates available … Install now? [y/N]`
  (Enter or 15s = no): installing runs `fetch + merge --ff-only + npm test`,
  and suggests restarting the launcher to use the new code;
- (**zip** route instead) the install is silent: the updater takes the new
  build from GitHub, puts it in place of the code in `ac-evo-career/`, and
  says «**start the launcher once again** to use the new one»;
- the GUI too has the **Updates** bar above the Dashboard, with the
  **Update now** button for the same gesture;
- the save in `data/` is never touched: updates touch code only.

## Typical problems

| Symptom | What to look at |
| --- | --- |
| the installer stalls on the Node download | network or antivirus filtering nodejs.org: try again, or install Node manually from nodejs.org and run the installer again |
| the installer says «expired token or no access» | the token is old or lacks *Contents: Read-only* on this repo: §5-bis |
| «the offsite remote does not answer with a commit» | (clone routes only) missing `git remote rename origin offsite` (or you are offline: it starts anyway) |
| the zip does not self-update | `ac-evo-career/build-id.txt` is missing from the package (old bundle) → download a fresh zip once; (private repo) `data/.github-token` missing → §5-bis; (offline) it starts anyway, it will retry after the next start |
| the updater says «there is work on disk the copy would remove» | you have your own files inside the code/config folders: move them out of `ac-evo-career/` (or into a fresh `data/` folder): the copy never touches `data/` nor any file of yours outside those folders |
| the wizard cannot find EVO | game never started? data folders not in `Saved Games\ACE`? force with `setup --data ... --game ...` |
| `content --validate` complains about cars/tracks | the EVO install lacks that DLC/mod: change the series or update the game |
| the result import does not start with the watcher | the driver name in the save must match the name in EVO; check «Messages» or run `node ac-evo-career.mjs import --inspect` |

---

## Appendix — FAQ and frequent problems

Typical of the first start on a new PC. If your symptom is not here, the
README has the full section: [README.md](README.md).

**I installed on a virgin PC and «Get everything ready» says «hour/laps to be set by hand».**
On a new save EVO does not have the career weekend file YET: the round's
settings (hour, laps, weather) are written only inside it. Do this dance
once: open EVO → Career → the current round → reach the WEEKEND screen
(nothing to play: what matters is that the file is born) → close or go back
to the menu → press **Get everything ready and have fun** again in the GUI:
hour and laps land in the file by themselves (on the right screen the live
check says «Configuration correct!»). Same remedy if the PC keeps its
profile or game on a drive other than C: and you see odd «gamemodesave not
found»: the tool looks in the Windows "Saved Games" folder even when it has
been moved; the escape hatch is the full paths in ACE_DATA and
ACE_GAME_SAVEDIR (Settings).

**The import says «result not read / wrong positions».**
Check that the file is a native one (`Results\*.sessionresults.json`, not a
re-saved copy) and that the driver name matches `Logs\log-*.txt`
(`Creating Car (Name…)`). EVO writes positions from 0 and the import handles
it, but a hand-edited file breaks the format: in that case use the manual
race entry with `import --position N --cars M`.

**«Get everything ready» says the car «is not in the dictionary» but the race starts anyway.**
This is WANTED, not a fault: the track, hour and laps are written; only the
car — which the app must know to select it by itself — is not known yet
(it happens on a new PC or after a reset of the personal data). Pick the car
by hand in the weekend AS ALWAYS: at the end of the race the app LEARNS the
car from the garage, and in the next races it selects it by itself without
touching anything.

**The Mechanic says a source is missing.**
It means that for that car there is no usable `.ld` telemetry yet (or the
file is empty): do one clean lap in the game and the next analysis is built
on real data. It always says which source is missing and which estimate it
falls back to.

**Two cars of the same class fight each other all race long.**
Same-category grids take ballast and penalties from the calibration, not
from a guess: they need a few real races first, then they recalibrate with
confidence per track. You can follow the convergence in the **Grid** tab
(`griglia-calib` is the terminal version).

**The GUI shows «search on disk» instead of reading a folder.**
It is intentional: browser dialogs do not give back the chosen paths, so the
browsing tool walks the PC's drives. It goes up to the Results folder and
confirms there.

**I updated the game / moved the Steam library.**
Run `node ac-evo-career.mjs setup` again (or fix the live paths in
Settings, no restart needed) and run `content --validate` to check that the
ladder still matches.

**I cloned but the launcher says «offsite does not answer».**
Missing `git remote rename origin offsite` (chapter 2). Honestly: it starts
anyway, the updates just stay mute until the remote has that name.

**I updated the code but the GUI stayed as it was.**
The new code is used at the next restart of the launcher: close the terminal
window and double-click `avvia.cmd` again. The footer always shows the
active build (`build x.y.z · hash`): if it does not change, the launcher is
still the old one.

**Can the language be changed?**
Yes, in **Settings**: it applies to the GUI and the terminal alike (a
single choice, saved in the project, not in your save).

**Do I lose the career if the tool updates?**
No: the updates touch code only; the save in `data/` sits outside the
repository and is never touched. As a precaution the launcher keeps copies
of the save anyway (`data/backups/` folder).

---

Questions about the project? The references live in the README
(`README.md` inside the installed folder).
