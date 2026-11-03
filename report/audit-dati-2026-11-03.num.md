# Audit numerico dei dati — 2026-11-03 08:49
> Autogenerato da tmp/_audit-dati-1101.mjs --report · sola lettura dei DATI; l'unico scritto è questo file e la potatura dei .num.md oltre i 3 più recenti.
> Righe al/oltre un limite noto portano ⚠: messaggi cap 60 (state.mjs) · zips cap 2 (tools/salva-save.mjs) · trim ±20 (cli.mjs) · bestLaps doppie grafie (normalizza-bestlaps).
> Precedente generato: [report/audit-dati-2026-11-02.num.md](report/audit-dati-2026-11-02.num.md).


== DISCO: cartelle di data/ (dimensione · file) ==
  data/backups                         4.1 MB ·    22 file
  data/bak                             1.0 MB ·     5 file
  data/car-specs.json                  0.4 MB
  data/copilot-8642-24-10.aria-del-loop-2026-10-28.jsonl  0.1 MB
  data/copilot-8642-24-10.jsonl        0.9 MB
  data/copilot-voce-24-10.jsonl        1.8 MB
  data/customgrid-snapshots            0.1 MB ·     5 file
  data/evo-career.save-3.json          0.1 MB
  data/evo-career.save.json            0.3 MB
  data/evo-career.save.json.bak-backfill-secondgap  0.2 MB
  data/flows-debug.jsonl               0.4 MB
  data/grid-calibrazione.json          0.1 MB
  data/grid-templates                  2.4 MB ·   208 file
  data/hotlaps.json                    0.1 MB
  data/journal                         0.0 MB ·     2 file
  data/kspkg-manifest.progress.log     0.1 MB
  data/match-auto.log                  0.4 MB
  data/report                          0.0 MB ·     2 file
  data/results-archive                 0.8 MB ·    81 file
  data/ricette                         0.0 MB ·     4 file
  data/rivals.json                     0.6 MB
  data/salva-save                      1.8 MB ·     4 file
  data/samples                         1.1 MB ·    58 file
  data/slot-3                          0.2 MB ·    13 file
  data/sniffer-campi                   0.0 MB ·     2 file
  data/test-installazione-pulita       0.1 MB ·    75 file

== SAVE: carta d'identità ==
  nodo attivo: endurance_gt4 · ronda 0 · stagione 14 (stagioni vissute: 13)
  cassa: €626292 · rep: 726
  messaggi in box: ⚠ 60 — cap 60
  sedili firmati: 13 → hyper_road, coppa_mazda-rx7-fd, coppa_r5-turbo, coppa_peugeot-205-t16, roadster_classic, dtm_legends, coppa_alfa-romeo-75-turbo-evo, coppa_volkswagen-golf-gti-mk8, coppa_strada_80, campionato_epoca, coppa_vintage-mini, coppa_mazda-mx5-nd-cup, endurance_gt4
  storico 81 voci · journal stagioni 13

== SAVE: difficulty ==
  trim su 4 serie: roadster_classic=-5 coppa_mazda-rx7-fd=+1 coppa_r5-turbo=+1 coppa_peugeot-205-t16=+0
  pending: {"nodeId":"coppa_mazda-mx5-nd-cup","track":"laguna_seca","from":0,"to":1,"reason":"P4 su 20 (atteso intorno a P10, scarto +6)","at":"2026-11-02T18:20:04.777Z"} · mode=adaptive · locked=0

== SAVE: raceSettings (le righe dei cursori) ==
  86 record: 86 a cursore aperto · 0 fissi · 0 vuoti («↺» — senza semina per legge del 2/11: OK se restano vuoti)
  banda cursore 0–100 e min≤max: tutte sane

== SAVE: garage ==
  auto: 2 → peugeot_205_t16 · lamborghini_countach_lp5000_qv
  nessun doppione

== SAVE: bestLaps (record personali per pista — chiave → time/car) ==
  record: 15 (14 piste uniche)
  ⚠ 1 doppie grafie — la leva di cura (tools/normalizza-bestlaps.mjs) le fonde in una sola chiave
  ⚠ "imola" (time 02:17.115) + "Imola" (time 02:05.382)

== LADDER ==
  nodi: 86 (l'integrità 86 è chiusa da test/integrity: qui solo il dato)
  tutti i sedili corrispondono a nodi con calendario

== CLASSI (grid-classes.json) ==
  classi: 17
  regole dentro cap (fallback 20) in tutte le classi

== SALVA-SAVE (backup zip del gioco — oltre MAX_ZIP=2 il più vecchio esce da solo) ==
  data\salva-save\slot-1: 1 zip (MAX_ZIP=2)
    save-2026-11-01T09-16-03.zip  0.7 MB  2026-11-01 09:16
  data\salva-save\slot-2: 1 zip (MAX_ZIP=2)
    save-2026-11-02T23-29-16.zip  0.8 MB  2026-11-02 23:29

== SOGLIE (leva 3/11): le righe del diff al/oltre cap portano ⚠ ==
  messaggi  cap    60  → ⚠ 60 in box
  zip       cap     2  → ⚠ 2 in salva-save
  trim      cap   ±20  →   5 di scostamento massimo
  bestLaps  cap     0  → ⚠ 1 doppie grafie

== FINE — nessuna scrittura su data/ né sul save ==
  ⚠ soglie toccate: messaggi, zip, bestLaps
