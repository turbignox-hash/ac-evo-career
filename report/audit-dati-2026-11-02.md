# Audit di coerenza dati — 2/11/2026

Ripetizione di [audit-dati-2026-11-01.md](audit-dati-2026-11-01.md) con una sonda
nuova, sola lettura: [tmp/_audit-quaderno-log-1102.mjs](../tmp/_audit-quaderno-log-1102.mjs).
Zero scritture su `data/`, nessun tocco al server vivo. Esito finale:
**16 verifiche verdi · 8 note · 0 difetti**.

## 1. Il quaderno (data/hotlaps.json)

144 sessioni registrate, 29 righe PB nel libro:

- **tutte le 144 sessioni** hanno il loro file Risultati — nessuna sessione persa;
- ogni riga PB è il migliore vero del suo gruppo auto|pista;
- i giri ideali (somma dei minimi per settore) rispettano la legge ≤ best;
- le **81 sessioni con giri ma `best_lap: ""`** non sono un difetto del quaderno:
  la stringa vuota la scrive il GIOCO nei file delle sessioni brevi/abbandonate
  (es. 261101-2222: 2 giri, best vuoto). Il quaderno rispecchia il grezzo.

## 2. Quaderno ↔ log del gioco

Il gioco **ruota i log**: dei giorni scorsi non resta traccia, in cartella ci sono
solo gli 11 file di oggi (261102). Le 4 sessioni recenti con i splits del best
non si ritrovano nel log per due motivi legittimi:

- 3 sono di giorni **già ruotati** (Monza 30/10, Donington 29/10, Brands 28/10);
- la quarta è di oggi, ma le **pratiche** ora scrivono «On Split … splittime»
  invece del vecchio «Split completed for car…»: il lettore del margine
  (margine-log.mjs) conosce solo il formato vecchio. Visto sul vivo, 2/11,
  log-261102-161308.

Nessuna sessione persa: i file Risultati ci sono sempre.

## 3. Quaderno ↔ save della carriera

Le differenze di scope spiegano tutte le differenze di numero:

- **il quaderno tiene UNA riga PB per auto** (con la pista dove quel PB è stato fatto);
- **il save tiene il best della PISTA** (auto qualsiasi, aggiornato solo all'import
  di una GARA; le pratiche non lo muovono).

Su 29 piste in comune:

| Caso | N | Spiegazione |
| --- | --- | --- |
| best della pista tenuto da un'ALTRA auto | 23 | auto da gara più veloci (es. Hyundai i30 N a Brands Hatch 1:47.934 vs le Ferrari del quaderno) |
| stessa auto, save PIÙ VELOCE | 4 | il save conta anche le GARE importate (es. COTA 2:21.042 vs PB di pratica 2:22.551, stessa 911 GT3 RS) |
| stessa auto, quaderno PIÙ VELOCE | 2 | pratiche non ancora passate nel best di pista (Donington 1:37.284 vs 1:37.992, stessa 911 GT3 RS); il Suzuka 0:55.335 è un resto pre-canone del 16/4, variante corta |

Nessun caso in cui una fonte perda la testa.

## 4. Save della carriera

Nodo campionato_aperto, stagione 14 ronda 1, cassa €626.342, rep 726.
81 risultati archiviati su 16 chiavi di serie. `bestLaps` su 14 piste, tutte
leggibili con la chiave «time».

## 5. Conclusione

Restano due annotazioni colte sul vivo che NON sono difetti nei dati:

1. il formato nuovo dei splits delle pratiche nel log (nota 2) — un giorno si
   potrà aggiungere al lettore del margine, una leva per volta;
2. le 81 sessioni con best vuoto (nota 1) — rumore del gioco, nessuna cura.

Prossima ripetizione: dopo il prossimo update del gioco o un reset del save.
