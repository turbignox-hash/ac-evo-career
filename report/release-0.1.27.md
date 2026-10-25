# EVO Pitwall — release v0.1.27
_Data: 2026-10-25 · Aggiornamento da **v0.1.26**_

## Correzioni e novità
- **Le guide di «Prepara tutto» dicono il RIMEDIO, non solo il problema** (lezione dell'installazione vergine del PC 2, ore 15:29): quando il weekend di carriera non esiste ancora sul disco, il bottone ora scrive «l'EVO non ha ancora il weekend di carriera: entra nel weekend del round UNA volta (basta la schermata del weekend, NON la sessione di pratica), poi ripremi Prepara tutto»; lo stesso per il garage vergine con l'auto da scegliere a mano. Prima spingeva l'avviso muto «pista da impostare a mano»: l'amico non sapeva CHE fare e la raccomandazione restava nel README.
- **La schermata «/Single Player» è fuori bersaglio, e lo diciamo**: l'app scrive il file del weekend di CARRIERA — la schermata Single Player del gioco non la legge per costruzione, e i suoi giri/pista restano sempre Pratica + Mount Panorama. Il pannello in vista lo avvisa già; adesso anche i segmenti del toast portano la destinazione giusta (nel weekend, non in Single Player).
- **Ora/giri nel toast al dettaglio del server**: se la scrittura dell'ora o dei giri fallisce, la ragione esatta esce nel toast invece del generico «da impostare a mano».
- **Test danneggiati dal PC vergine riparati**: `game-sandbox.test.mjs` seminava i file di gioco dalla cartella REALE di questo PC: con `Saved Games\ACE` senza `GameModes` crollava per una condizione fuori dal codice. Ora la semina parte solo se la cartella esiste (npm test qui: 217/217, in una simulazione di installazione pulita maternata e provata).

## Come si aggiorna
- **Installazione-zip (pacchetto-amico)**: barra «Aggiornamenti di progetto pronti su GitHub» → bottone **Aggiorna ora** (zipball + copia + test; il server si riavvia da solo). Il repo è pubblico dal 24/10: nessun token.
- **Clone git**: barra «Aggiorna ora» o `sincronizza-git.cmd`.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
