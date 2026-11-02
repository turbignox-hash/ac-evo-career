# Banco A/B — MX-5 ND Cup su Imola (carta del 1/11/2026)

**Il confronto A/B dei setup qui NON esiste**: le 11 sessioni MX-5 su ImolaGP
portano tutte lo stesso preset (`mx5ndcup_mech_1`) — stesse meccaniche, quindi
niente A/B di assetto. È un confronto fra SESSIONI: la serata di sabato 26/9
(A) contro il pomeriggio di domenica 27/9 (B), dove sta il best di Imola.

| Fascia | Sessione | Data | Giri | Best | Preset |
|---|---|---|---|---|---|
| A (base) | `…_Sat Sep 26 193715 2026.ld` | sab 26/9 ore 19:37 | 2 | 2:15.00 (135.0 s) | mx5ndcup_mech_1 |
| B (prova) | `…_Sun Sep 27 172053 2026.ld` | dom 27/9 ore 17:20 | 3 | **2:13.90 (133.9 s)** | mx5ndcup_mech_1 |

**Δ giro best = −1,10 s** (B più veloce). Buttate fuori: le tre sessioni con
best 293–298 s (giri morti) e quella con 1 solo giro (out-lap).

## La fascia dei canali (Δ = B − A)

| Canale | A (sab) | B (dom) | Δ |
|---|---:|---:|---:|
| giro migliore (s) | 135.00 | 133.90 | −1.10 |
| benzina per giro (l) | 1.42 | 1.38 | −0.04 |
| psi a freddo LF | 25.4 | 26.5 | +1.1 |
| psi a caldo LF | 25.9 | 27.0 | +1.1 |
| camber a effetto LF (L−R °C) | 0 | 0 | 0 |
| bumpstop LF % | 4.7 | 5.3 | +0.6 |
| sospensione media LF | 33.8 | 34.3 | +0.5 |
| TC attiva % | 0 | 0 | 0 |
| ABS attiva % | 0.8 | 1.0 | +0.2 |
| slittamento trazione % | 0.6 | 0.4 | −0.2 |
| gas medio giro best % | 80.8 | 81.2 | +0.4 |
| a gas pieno giro best % | 73.9 | 71.9 | −2.0 |
| gas medio sessione % | 75.6 | 75.3 | −0.3 |

(partenza ed evoluzione pista: non misurabili — sessioni senza scatto da fermo.)

## Le fasce del tempo perso (per zona, sul giro best)

- **a gas pieno: 1,23 s** — la voce che pesa più di tutte
- in uscita (applicazione gas): 0,48 s
- in frenata: 0,41 s
- Netto col giro-best: **+1,20 s perso da A** (perso 2,12 s · guadagnato 0,92 s)

## Verdetto

La differenza parte dalla PRESSIONE: a pari preset, domenica girava con
+1,1 bar di psi e il piede più fermo in trazione (slittamento −0,2%). Il tempo
che A perde non è in staccata (frenata solo 0,41 s di dispersione — la staccata
di Imola è la sua abitudine) ma in VELOCITÀ DI PUNTA: la meta è tutta
a gas pieno. Prossima prova libera su Imola: tenere le pressioni del 27/9
(~26.5 a freddo LF) e lavorare solo sul piede destro nella piena.

*Carta scritta dai file MoTeC veri di EVO (lettura pura, `setupAB` di
src/analisi.mjs). Targa copiata in gazzetta (news occasionali): vedi data/news.json.*
