# Installare la carriera su un altro PC (guida per un amico)

Questa guida vale per il caso «condivisione privata»: il progetto vive su GitHub
(`https://github.com/turbignox-hash/ac-evo-career`).
Il **save carriera non passa** con il repo: ogni PC si crea la propria carriera
(`data/` è fuori dal repository, di proposito).

## 0. IL MODO UNO: un solo file, zero dipendenze (dal 26/10)

Non esiste più il pacchetto da inviare a ogni amico: si passa **il file
doppioclick `installa.cmd`** (uno solo, in radice del progetto, pochi KB) e
è lui che installa TUTTO con un solo comando:

1. doppio click (da qualunque cartella: può stare sul Desktop);
2. Invio per la cartella di default (`%USERPROFILE%\EVO-Pitwall`);
3. se il PC non ha Node, scarica un **Node portatile** dentro quella stessa
   cartella — niente admin, niente winget;
4. chiede **una volta** il token di lettura (§5-bis) e lo salva in
   `data\.github-token`: gli aggiornamenti automatici del launcher sono
   già a posto da subito;
5. scarica il codice (zipball di `main`), lo estrae, scrive `build-id.txt`
   e fa passare `npm test`;
6. crea la scorciatoia «Carriera EVO» sul Desktop (icona compresa) e avvia
   il **wizard** di prima apertura.

Il friend non tocca terminali, git né zip: GitHub viene usato solo come
mezzo di scarico e poi per gli aggiornamenti.

## 0-ter. Disinstallare (da 26/10)

Accanto a `installa.cmd` c'è **`disinstalla.cmd`** (si può copiare anche dentro
la cartella installata, si gestisce da solo le installazioni):

1. Invio per la cartella di default (`%USERPROFILE%\EVO-Pitwall`);
2. se dentro `data\` c'è una **carriera**, chiede cosa farne:
   `[k]` la tiene (la sposta in `<cartella>-data`, accanto) o `[b]` via tutto;
3. toglie la scorciatoia «Carriera EVO» **solo se punta a quella cartella**
   (una scorciatoia di un'altra installazione resta al suo posto);
4. se il launcher è ancora aperto, te lo dice: chiudi (icona nella barra
   delle applicazioni) e ri-lanciate.

Il disinstallatore è protetto: una cartella che non assomiglia a un'installazione
di Carriera EVO (dentro manca `ac-evo-career.mjs`) non si tocca di suo gusto.

## 1. Cos' serve

- **Assetto Corsa EVO installato e avviato almeno una volta** (così esistono le
  sue cartelle dati: `Saved Games\ACE`).
- Più niente: **Node si scarica da solo** se manca e **Git non serve** (sono
  necessari solo per le vie «di sviluppatore» del capitolo 2).
- Un token di lettura al repo se questo resta **privato** (una volta sola, §5-bis).

## 2. Vie di sviluppatore (clone e zip)

Per chi lavora sul progetto, non per l'amico.

```bash
git clone https://github.com/turbignox-hash/ac-evo-career.git
cd ac-evo-career
git remote rename origin offsite     # così il controllo aggiornamenti guarda il repo giusto
```

`offsite` è il nome che il launcher cerca (`tools/aggiornamenti.mjs`), non serve
altro: senza quel passo il check dice «il remote offsite non risponde con un
commit» e l'app parte comunque (solo senza aggiornamenti).

**Via zip** (per chi non vuole installare Git): scarichi il pacchetto, lo estrai,
doppio click su `avvia.cmd` — il wizard di prima apertura fa il resto.
Gli aggiornamenti arrivano **automatici** anche così, dal 24/10: nel pacchetto
c'è `ac-evo-career/build-id.txt` e ad ogni avvio il launcher confronta quella
build con l'ultima su GitHub (`tools/aggiorna-zip.mjs` — scarica tarball via
API, sostituisce DI PROPOSITO solo codice e config e non tocca niente tuo).
Due note oneste: lo zip non elimina i file che il progetto ha levato
(merge vero solo col clone); su repo privato serve il token di lettura (§5-bis).

**Via «Download ZIP» di GitHub** (github.com → Code → Download ZIP): dal 26/10
vale lo stesso auto-aggiornamento — senza `build-id.txt` il PRIMO avvio guarda
main su GitHub e porta da solo l'installazione al passo (serve il token di
lettura su repo privato, §5-bis); da quel momento è identica alla via zip.

## 5-bis. Token di lettura (solo se il repo ri-passa privato)

Stato al 26/10: il repo è **pubblico** e non serve nessun token — l'installatore
accetta pure INVIO alla domanda. Se ripassasse privato: l'installatore chiede il
token, lo salva in `data\.github-token` e l'updater zip guasta da quel file.

1. Su GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained** → *Generate new token*: repository solo ac-evo-career,
   permessi **Contents: Read-only** (e *Metadata: Read*, che viene da sé).
2. Crea la cartella `data/` e dentro un file **`data/.github-token`** col token
   (una riga sola — oppure la variabile d'ambiente `GITHUB_TOKEN`).

Una volta sola: poi l'aggiornamento è silenzioso uguale al clone. Il `from-zip`
senza token resta «privato e senza token».

## 3. Primo avvio

Doppio click su **`avvia.cmd`**:

1. il launcher controlla aggiornamenti (silenzio se sei al passo; se GitHub è
   avanti chiede `s/N` — Invio o 15 secondi = no);
2. crea sul **Desktop** la scorciatoia «Carriera EVO» (solo se manca o è senza
   icona: i giri dopo tocca niente) — da lì avvii con un doppio click,
   l'icona è quella del programma;
3. apre l'interfaccia grafica nel browser su `http://127.0.0.1:8642`.

Alla prima apertura la GUI mostra il **wizard**: trova da solo le cartelle dati
(`%USERPROFILE%\Saved Games\ACE`), il gioco in Steam (`AssettoCorsaEVO.exe`) e
fa la scansione dei contenuti. Se qualcosa non viene trovato, si forzano i
percorsi da terminale:

```bash
node ac-evo-career.mjs setup --data "D:\Dati\ACE" --game "D:\Steam\steamapps\common\Assetto Corsa EVO\AssettoCorsaEVO.exe"
```

Verifica che la scala carriera citi auto e piste **che hai davvero**:

```bash
node ac-evo-career.mjs content --validate   # problemi + i tre ID più simili per ognuno
node ac-evo-career.mjs content --list       # tutto il contenuto visto nell'installazione
```

Se manca del contenuto che possiedi, l'installazione va ritoccata prima di
giocare: la validazione dice esattamente cosa.

## 3-bis. La danza del primo avvio, in ordine (la sequenza da rifare a ogni nuovo PC)

Questa è la sequenza COMPLETA, nell'ordine giusto — identica su ogni PC
nuovo, così «Prepara tutto» parte al primo colpo. Quattro gesti in EVO,
due schermate nella GUI:

1. **installa.cmd** → **avvia.cmd** → wizard: cerca da solo le cartelle di
   EVO, il gioco in Steam e crea la carriera (nome + nazione).
2. **In EVO, una volta sola: la schermata del WEEKEND.** Entra in EVO →
   Carriera → round attuale → **arriva alla schermata del WEEKEND**
   (niente da giocare, basta che la schermata appaia) e torna indietro al
   menu di EVO. Serve perché il tool scrive ora, giri e meteo DENTRO il file
   del weekend, e su un PC vergine EVO non l'ha ancora creato: questa
   schermata lo genera.
3. **GUI → Prepara tutto e divertiti** (bottone giallo): ora, giri, meteo e
   griglia finiscono nel file da soli. Se appare il messaggio rosso «EVO non
   ha ancora un career weekend», significa che il passo 2 non è fatto: entra
   una volta nel weekend del round e ri-premi il bottone.
4. **Dentro il weekend di EVO si sceglie l'auto con il mouse** (l'unico
   gesto che il tool non può fare da fuori): la scheda gara dice qual'è.
   È VOLUTO: alla prima gara l'app IMPARA la tua auto dal garage, e nelle
   gare dopo la seleziona da sola.
5. **In pista!** Al traguardo il watcher importa il risultato da solo:
   soldi, rep, punti e copilota fanno il resto. Dalla seconda gara in poi:
   SOLO il bottone giallo, l'auto si sceglie da sola, zero gesti manuali.

⚠️ **La prima gara MULTICLASSE aggiunge un gesto, UNA SOLA volta:** nel menu
Race Weekend sposta **Grid Type da AUTOMATIC a CUSTOM** e premi **Applica**,
poi NON TOCCARE PIÙ il selettore. A installazione nuova EVO nasce AUTOMATIC e
il tool non ne può cambiare il valore da fuori: se manca il gesto, il
messaggio rosso lo spiega passo-passo al momento giusto. Dalla gara dopo il
bottone giallo riscrive griglia, zavorre e penalità in automatico.

### 3-bis (English version) — The first-launch dance, step by step

This is the COMPLETE sequence, in the right order — identical on every new
PC, so «Get everything ready» works at the first press. Four gestures in EVO,
two screens in the GUI:

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
Weekend menu move **Grid Type from AUTOMATIC to CUSTOM** and press **Apply**,
then NEVER TOUCH the selector again. On a fresh install EVO starts
AUTOMATIC and the tool cannot change it from outside: if the gesture is
missing, the red message walks you through it at the right moment. From the
next race on the yellow button rewrites the grid, ballast and penalties by
itself.

## 4. Crea la tua carriera

Dalla voce **3** del menu `avvia.cmd`, o direttamente nel browser (schermata
Carriera / Impostazioni): nome pilota **come sei chiamato in EVO** (il
riconoscimento dei risultati si aggancia a quel nome) e nazione a 3 lettere.

Da lì il ciclo di una gara è sempre lo stesso:

```
scheda gara (checklist) → EVO: l'app imposta già tutto col tasto «Prepara tutto» → corri
→ la guardia (watcher) importa il risultato da sola
```

L'auto si imposta da sola (e dalle gare dopo apprende le nuove dal garage): se
una non è nel dizionario, la scheda gara te lo dice e la scegli a mano quella volta.

### Prima gara multiclasse: Grid Type su CUSTOM, una volta sola

A installazione nuova il menu di EVO nasce con **Grid Type = AUTOMATIC**.
Va bene così per le serie con una sola auto (tutti alla pari, niente da
regolare). Ma alla **prima gara con più di un modello in pista** (serie
multiclasse: la scheda gara te lo dice con la riga "Tipo griglia (Grid
Type)"):

1. entra nel weekend della ronda in EVO, apri il menu Race Weekend;
2. sposta **Grid Type da AUTOMATIC a CUSTOM** e premi **Applica**;
3. finito: **non toccarlo più** — resta CUSTOM per tutta la carriera.

Serve per le zavorre e le penalità di classe in griglia. Dalla gara dopo il
bottone **Prepara tutto** riscrive la griglia da solo, e se la scrittura da
fuori non passa un messaggio rosso ti guida di nuovo al gesto.

## 5. Ricevere gli aggiornamenti (dopo)

Ogni volta che parti da `avvia.cmd` (o apri l'interfaccia di nuovo):

- GitHub è al passo → il launcher resta zitto;
- ci sono aggiornamenti → `↑ Ci sono N aggiornamenti … Installare ora? [s/N]`
  (Invio o 15s = no): installare fa `fetch + merge --ff-only + npm test`, e
  consiglia di riavviare il launcher per usare il codice nuovo;
- (via **zip** invece) l'installazione è silenziosa: l'updater prende la build
  nuova su GitHub, la mette al posto del codice in `ac-evo-career/`, e avvisa
  «**avvia il launcher ancora una volta** per usare il nuovo»;
- idem la GUI: la banda Aggiornamenti mostra la build remota e lo stesso
  bottone **Aggiorna ora**;
- il save in `data/` non si tocca mai: gli aggiornamenti toccano solo codice.

Dalla GUI c'è anche la banda **Aggiornamenti** sopra il Cruscotto, col bottone
**Aggiorna ora** per lo stesso gesto.

## Problemi tipici

| Sintomo | Cosa guardare |
| --- | --- |
| l'installatore si blocca sul download di Node | rete o antivirus che filtra nodejs.org: prova di nuovo, oppure installa Node manualmente da nodejs.org e ri-lancia |
| l'installatore dice «token scaduto o senza accesso» | il token è vecchio o non ha *Contents: Read-only* su questo repo: §5-bis |
| «il remote offsite non risponde con un commit» | (solo vie clone) manca `git remote rename origin offsite` (o sei offline: parte comunque) |
| lo zip non si auto-aggiorna | il file `ac-evo-career/build-id.txt` manca nel pacchetto (vecchio bundle) → ri-scarichi una volta lo zip nuovo; (repo privato) manca `data/.github-token` → §5-bis; (offline) parte lo stesso, riproverà all'avvio dopo |
| l'aggiorno-zip dice «c'è lavoro sul disco che la copia leva» | hai file tuoi dentro le cartelle codice/config: spostali fuori da `ac-evo-career/` (o mettili in una cartella nuova data/ o）： la copia non tocca mai `data/` né alcun tuo file fuori da quelle cartelle |
| il wizard non trova EVO | gioco mai avviato? cartelle dati non in `Saved Games\ACE`? forza con `setup --data ... --game ...` |
| `content --validate` lamenta auto/piste | l'installazione EVO non ha quel DLC/mod: sostituisci la serie o raggiorna il gioco |
| l'import dei risultati non parte col watcher | il nome pilota nel save deve coincidere col nome in EVO; guarda «Messaggi» o `node ac-evo-career.mjs import --inspect` |

---

## Appendice — FAQ e problemi frequenti

Le risposte di use quotidiano, le stesse del README con qualche caso in più
tipico del primo avvio su un PC nuovo. Se qui manca il tuo sintomo, il README
(it) ha la sezione completa: [README.it.md](README.it.md).

**Ho installato su un PC vergine e «Prepara tutto» dice «ora/giri da impostare a mano».**
In un save nuovo EVO non ha ANCORA il file del weekend di carriera: le
impostazioni della ronda (ora, giri, meteo) si scrivono SOLO dentro quello.
Fai una volta questa danza: apri EVO → Carriera → il round attuale → arrivare
alla schermata del WEEKEND (niente da giocare, basta che il file nasca) →
chiudi o torna al menu → ri-premi **Prepara tutto e divertiti** nella GUI:
di nuovo ora e giri finiscono nel file da soli (a schermata giusta la
verifica live ti dice «Configurazione corretta!»).
Stesso rimedio se il PC ha profilo o gioco su un disco diverso da C: e vedi
strani «gamemodesave non trovato»: il tool guarda la cartella "Saved Games" di
Windows anche se è stata spostata; un'uscita di soccorso sono i percorsi
completi in ACE_DATA e ACE_GAME_SAVEDIR (Impostazioni).

**L'import dice «risultato non letto / posizioni sbagliate».** Controlla che il
file sia uno nativo (`Results\*.sessionresults.json`, non una copia risalvata)
e che il nome del pilota combaci con `Logs\log-*.txt` (`Creating Car (Nome…)`).
EVO scrive le posizioni da 0 e l'import lo gestisce, ma un file modificato a
mano rompe il formato: in quel caso entra la gara a mano con
`import --position N --cars M`.

**Il copilota dimentica di dire una posizione che non c'entra (8 in pista → «sei P6»).**
Corretto dalla v0.1.30: la posizione live esce già come la vedi nell'HUD del
gioco (la memoria del gioco conta da 0, la voce conta da 1 come l'HUD). Se lo
senti ancora, riavvia il launcher e ricarica la pagina (Ctrl+F5).

**«Prepara tutto» dice che l'auto «non è nel dizionario» ma la gara parte lo stesso.**
È VOLUTO, non un guasto: la pista, l'ora e i giri sono scritte, solo
l'auto — che l'app deve conoscere per selezionarla da sola — non lo è ancora
(succede su un PC nuovo o dopo un reset dei dati personali). Scegli l'auto a
mano nel weekend COME SEMPRE: alla fine della gara l'app IMPARA l'auto dal
garage e nelle gare successive la seleziona da solo, senza più toccare niente.

**Il Meccanico dice che manca una fonte.** Vuol dire che per quell'auto non c'è
ancora telemetria `.ld` usabile (o il file è vuoto): fai un giro netto in gioco
e alla prossima analisi i consigli nascono su dati veri. Spiega sempre quale
fonte manca e su quale stima ripiega.

**Due auto della stessa classe si contendono la gara a fatica.** Le griglie di
stessa categoria prendono zavorre e penalità dalla calibrazione, non a stima:
hanno bisogno prima di un po' di gare vere, poi ricalibrano con confidenza per
pista. La convergenza si segue nel tab **Griglia** (`griglia-calib` è la versione
da terminale).

**La GUI mostra «cerca su disco» invece di leggere una cartella.** È voluto:
i dialoghi del browser non restituiscono i percorsi scelti, quindi il cercatore
sfoglia le unità del PC. Arriva fino alla cartella Risultati e conferma lì.

**Ho aggiornato il gioco / spostato la libreria Steam.** Rilancia
`node ac-evo-career.mjs setup` (oppure correggi i percorsi vivi in
Impostazioni, senza riavviare) e passa `content --validate` per verificare che
la scala combaci ancora.

**Ho clonato ma il launcher dice «offsite non risponde».** Manca
`git remote rename origin offsite` (capitolo 2). Onestamente: parte lo stesso,
diciamo che gli aggiornamenti restano muti finché il remote non ha quel nome.

**Ho aggiornato il codice ma la GUI è rimasta com'era.** Il codice nuovo si usa
al prossimo riavvio del launcher: chiudi la finestra del terminale e ri-doppio
click su `avvia.cmd`. Il piè di pagina mostra sempre la build attiva
(`build x.y.z · hash`): se non cambia, il launcher è ancora quello vecchio.

**La lingua si può cambiare?** Sì, in **Impostazioni**: vale per la GUI e anche
per il terminale (una scelta sola, salvata nel progetto, non nel tuo save).

**Perdo la carriera se aggiornano il tool?** No: gli aggiornamenti toccano solo
codice; il save in `data/` sta fuori dal repository e non si tocca mai. Per
prudenza il launcher tiene comunque copie del save (cartella `data/backups/`).
