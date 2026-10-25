# Checklist di pubblicazione — ac-evo-career

Pubblicare è una sequenza di decisioni, non un'azione: l'ordine conta.

## Fase 1 — Scegliere il modello (prima di tutto)

- [ ] (a) Condivisione privata (amici, altro PC): basta lo zip, la lingua non entra.
- [ ] (b) Aperto a chiunque: tutte le fasi sotto valgono.
- [ ] Mappe KUNOS: nel caso (b) non escono dal pacchetto (LICENSE.md punto 3).
- [ ] Licenza per il caso scelto: LICENSE.md riscritto prima di contributi esterni.

## Fase 2 — Il pacchetto pubblicabile

- [ ] Zip nuovo DENTRO: src/, gui/, tools/, test/, README.md, LICENSE.md.
- [ ] FUORI: data/ (save), sessione-21-10/, demo/, node_modules/, dist/, .git.
- [ ] Restano personali: COME-RIPRISTINARE.txt, LEGGIMI-MAGAZZINO.txt.
- [ ] README in inglese o bilingue; nessun percorso reale nella documentazione.

## Fase 3 — Codice pronto al pubblico

- [ ] Igiene: niente nomi personali o percorsi reali (grep su C:\Users, Mauro).
- [ ] Primo avvio su PC vergine senza aiuti: setup trova EVO e apre la GUI.
- [ ] npm test passato per intero dentro la cartella estratta
      (203 test nelle build di fine ottobre 2026 — il numero cresce a ogni
      build: conta dal run vero, non dal ricordo).
- [ ] Canale di segnalazione sul repository.

## Fase 4 — Lingua inglese (solo per il modello (b), per ultime)

- [ ] Infrastruttura: già pronta (gui/js/lang.js, funzione tr(), selettore in
      Impostazioni, default italiano, scelta salvata nel browser).
- [ ] Viste una per una con la regola pigra scritta nel README (~770 testi stimati).
- [ ] Poi CLI (src/cli.mjs), server (src/webui.mjs), errori API e setup.
- [ ] npm test dopo ogni vista; controllo a mano in entrambe le lingue.

## Fase 5 — Uscita

- [ ] Versione nuova (0.2.0) e changelog separato.
- [ ] Zip pulito; launcher Pinokio facoltativo che chiama il progetto dove sta
      (mai git pull grezzi: passa da tools/aggiornamenti.mjs).
- [ ] Decidere se il controllo aggiornamenti resta sul repo privato attuale o
      passa al repository pubblico.
