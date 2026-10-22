# Installare la carriera su un altro PC (guida per un amico)

Questa guida vale per il caso «condivisione privata»: il progetto vive su GitHub
(`https://github.com/turbignox-hash/ac-evo-career`) e l'amico clona lì.
Il **save carriera non passa** con il repo: ogni PC si crea la propria carriera
(`data/` è fuori dal repository, di proposito).

## 1. Cos' serve

- **Node.js 18 o superiore** (`node -v` per controllarlo): nessun'altra dipendenza.
- **Assetto Corsa EVO installato e avviato almeno una volta** (così esistono le
  sue cartelle dati: `Saved Games\ACE`).
- Git (basta quello che arriva con le GitHub Desktop o `git-scm.com`).

## 2. Clone (il modo che riceve gli aggiornamenti)

```bash
git clone https://github.com/turbignox-hash/ac-evo-career.git
cd ac-evo-career
git remote rename origin offsite     # così il controllo aggiornamenti guarda il repo giusto
```

`offsite` è il nome che il launcher cerca (`tools/aggiornamenti.mjs`), non serve
altro: senza quel passo il check dice «il remote offsite non risponde con un
commit» e l'app parte comunque (solo senza aggiornamenti).

Invece dello zip: il **clone è la via consigliata** — con lo zip i futuri
aggiornamenti vanno presi a mano (ri-scarico e ri-copia), col clone arrivano
dal launcher.

## 3. Primo avvio

Doppio click su **`avvia.cmd`**:

1. il launcher controlla aggiornamenti (silenzio se sei al passo; se GitHub è
   avanti chiede `s/N` — Invio o 15 secondi = no);
2. apre l'interfaccia grafica nel browser su `http://127.0.0.1:8642`.

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

## 4. Crea la tua carriera

Dalla voce **3** del menu `avvia.cmd`, o direttamente nel browser (schermata
Carriera / Impostazioni): nome pilota **come sei chiamato in EVO** (il
riconoscimento dei risultati si aggancia a quel nome) e nazione a 3 lettere.

Da lì il ciclo di una gara è sempre lo stesso:

```
scheda gara (checklist) → EVO: imposti i campi e scegli l'auto A MANO → corri
→ la guardia (watcher) importa il risultato da sola
```

L'unico intervento manuale resta la selezione dell'auto: la scheda gara dice
quale usare.

## 5. Ricevere gli aggiornamenti (dopo)

Ogni volta che parti da `avvia.cmd` (o apri l'interfaccia di nuovo):

- GitHub è al passo → il launcher resta zitto;
- ci sono aggiornamenti → `↑ Ci sono N aggiornamenti … Installare ora? [s/N]`
  (Invio o 15s = no): installare fa `fetch + merge --ff-only + npm test`, e
  consiglia di riavviare il launcher per usare il codice nuovo;
- il save in `data/` non si tocca mai: gli aggiornamenti toccano solo codice.

Dalla GUI c'è anche la banda **Aggiornamenti** sopra il Cruscotto, col bottone
**Aggiorna ora** per lo stesso gesto.

## Problemi tipici

| Sintomo | Cosa guardare |
| --- | --- |
| «il remote offsite non risponde con un commit» | manca `git remote rename origin offsite` (o sei offline: parte comunque) |
| il wizard non trova EVO | gioco mai avviato? cartelle dati non in `Saved Games\ACE`? forza con `setup --data ... --game ...` |
| `content --validate` lamenta auto/piste | l'installazione EVO non ha quel DLC/mod: sostituisci la serie o raggiorna il gioco |
| l'import dei risultati non parte col watcher | il nome pilota nel save deve coincidere col nome in EVO; guarda «Messaggi» o `node ac-evo-career.mjs import --inspect` |
