# EVO Pitwall — report build 0.1.12 (b4a45e0)
_Data: 2026-10-24 · Aggiornamento da **v0.1.11**_

## Correzioni e novità
- report-build: il runner di test è node --test, npm via execFileSync falliva da solo su Windows (npm = .cmd → EINVAL); riga di test del report v0.1.11 corretta in «passati» (reale 187/187). · f947c37
- Conteggio suite corretto: node --test SENZA glob becca 6 helper non-test (_flows-sandbox, test-mode, test-f2-insert, 2 copie in dist/, _game-sandbox) → 187; il glob canonico di npm test dà la suite vera 181/181. report-build usa il glob e legge il conteggio dal run reale (niente più numeri a mano nei report). · e6063db
- Aggiornamento AUTOMATICO anche via zip: l'amico non si aggiorna più a mano · 2364d57
- Chiove l'await alla CLI di aggiornamenti.mjs: entrava "[!] undefined" · b4a45e0


## Come si aggiorna
- **Dalla GUI:** la barra in alto dice "Aggiornamenti di progetto pronti su GitHub" → bottone **Aggiorna ora** (fetch + merge + test; il server si riavvia da solo).
- **Da console:** ri-doppio click su `avvia.cmd` → conferma `s` alla domanda.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
