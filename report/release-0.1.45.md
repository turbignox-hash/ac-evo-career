## EVO Pitwall v0.1.45

### In questa build

- **La banda di serie comanda nel customgrid**: `aiBandSerie` nel builder —
  aiBand (evento) > classe pinnata > banda di serie > ladder — calcolata con la
  STESSA formula del pannello Difficoltà (`bandaSerieSlider`), tirata sia dal
  «Prepara tutto» sia dalla CLI `griglia`. La scheda Griglia non dice più
  «AI 82–92» per la Peugeot mentre i cursori di serie sono 84–85 (customgrid
  già riallineato).
- **Il weekend ha il cielo per sessione** (`weatherPlanFor` + rotta
  `wx-session`): piano deterministico — prove min(r−2, 2), gare r−1, gara r —
  peggiora verso la gara, EVO lo legge a ogni avvio sessione; «Metti» chiama la
  rotta e scrive il cielo sul gamemodesave, il «Prepara tutto» arma la prima
  sessione da sé. Icone meteo (WX_ICON) nei chip del Bollettino e nei toast.
- **Orologio di giornata nelle app in gioco**: `agendaOra` nel payload del
  Cruscotto («⏰ ore 16 · mattino presto» + ora di partenza in card gara) e del
  Pitwall, con le due porte ⌛ `portaChiusa` e ⏳ «in ritardo».
- **Il ponte 🌉 parte anche dal quadro «Tutto il garage»**: `setup-cover`
  `all:true` porta il sorgente (`srcFile`/`srcName`/`srcTrack`) per ogni pista
  girata senza setup; dove l'auto ha un base setup, il chip ✖ diventa
  «🌉 Pontalo» che chiama `setup-bridge` con LA SUA auto (dataset
  `data-cover-car`), non quella in mano al meccanico. Senza base setup il chip
  resta secco, com'è giusto.
- Lint Biome pulita (0 diagnostica su 298 file).

### Verifiche

- Suite completa in sandbox: **697/697 verdi** (da 682), 0 cadute; test nuovi:
  `gridbuilder-banda-serie.test.mjs`, `ponte-setup.test.mjs` (3 casi).
- Lint Biome 0 diagnostica; `npm run check` exit 0.
- Prova live: server riavviato sulla 0.1.45, `boot` vivo sulla carriera,
  `setup-cover all:true` con i sorgenti nuovi; quadro copertura fotografato
  ([screenshot/copertura-garage-0145.png](screenshot/copertura-garage-0145.png))
  e payload del click «🌉 Pontalo» verificato nel DOM con l'auto della riga.
- Danza del PC amico vergine: **24/24 verifiche verdi** (zip 535 file con i
  test che passano dentro la cartella estratta, installer unitario con le app
  in gioco, primo e secondo avvio puliti).

### Pacchetto

- `pacchetti/ac-evo-career-amico-v0.1.45-6f796e1.zip` — commit `6f796e1`,
  535 file, 9 520 KB.
- SHA-256: `c82bb1fb373ffda419b8db76513bc5583a2c8b4387c09e61ddca04c94be0814a`

Puoi aggiornare dal launcher (clone) o prendere questo zip — dentro c'è
GUIDA-AMICO.md con l'installazione. Su off-site manca ancora il push:
`sincronizza-git.cmd` lo porta con il report di build.
