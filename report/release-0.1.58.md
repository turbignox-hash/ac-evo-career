## EVO Pitwall v0.1.58

I fix del 4/11 sulla GUI, più le due prove automatiche che impediscono il
ritorno degli stessi difetti. Nessuna modifica ai dati di gioco: si aggiorna
solo il codice, la carriera resta dov'è.

### In questa build

**La tab Griglia torna viva**

- La vista si apriva con `$(...).forEach is not a function`: `$` restituisce
  un nodo, la lista è `$$`. Corretto in tutti e sei i riquadri della
  costruzione weekend; il pannello ora riassume sessioni, meteo, ronde e
  dettagli (auto ammesse, distanza, difficoltà AI, trim).

**Bollettino del weekend leggibile**

- Via i quattro tasti «Metti» che non servivano più: le sessioni restano con
  etichetta, icona, orario e stato («a posto», «al cambio ronda», «in
  automatico»). Il testo del rituale non promette più un bottone che non c'è.

**Un solo «Verdetto di giornata»**

- Il Cruscotto ne mostrava due con lo stesso titolo (uno calcolato da solo,
  uno nella scheda gara col tasto «Calcola»). Resta quello automatico: un
  aggregato, un pannello.

**Tipografia e tabelle**

- 117 token `font-size` sotto 11.5px in viste e CSS base portati al pavimento
  deciso il 4/11; chip con padding 1px 7px.
- In Analisi la tabella dei sedili (10 colonne, 1032px) sfondava la pagina di
  38px: ora ogni tabella più larga del pannello entra in `.tscroll` e scorre
  dentro il pannello, senza allargare il documento.

**Le prove che mancavano**

- `test/tab-sane-gui.test.mjs`: apre le 19 tab della GUI su server vero, con
  save in cartella temporanea, e pretende contenuto, zero errori JavaScript e
  zero overflow orizzontale (13,5 s). È la riga «collaudo vergine delle schede»
  della release checklist, in automatico.
- `test/guardia-dollar-lista.test.mjs`: guardia statica che fallisce su
  `$(...).forEach/.map/.filter` escludendo `$$`, con prova di rottura nel test
  stesso. La classe di errore della tab Griglia non può più passare in
  silenzio.

### Verifiche

- `npm test` **916/916**.
- `npm run lint` **374 file, 0 warning**.
- Dal vivo: 16 schede misurate con 0 overflow, Cruscotto con 0 testi sotto
  11.5px, 0 errori JS.

### Installer

- `EVO-Pitwall-Setup.exe` (online, ~109 KB) e
  `EVO-Pitwall-Setup-Offline.exe` (offline, ~40 MB) costruiti dalla 0.1.58,
  non firmati: è una pre-release, aspettati SmartScreen.
- `EVO-Pitwall-v0.1.58-Windows.zip` con entrambi gli EXE, i due `.sha256` e
  `LEGGIMI-INSTALLER.txt`.
