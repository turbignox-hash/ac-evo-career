// test/riepilogo-copilota.test.mjs — la contabilità del riepilogo (statRiepilogo).
// Lezione del 31/10 (diagnosi gara 14:24): nel registro convivono DUE sorgenti
// di frasi e il vecchio riepilogo le mescolava — le righe piatte della RADIO
// REALE ({t, chi, it, livello}, le parole uscite dagli altoparlanti) e l'ECO
// del monitor ({t, dati, frasi}, il calcolo diagnostico visto SOLO dal file).
// Ogni riavvio del monitor reinseriva «Meta gara» nell'eco e il riepilogo
// riportava «Meta ×3» e «RIPETUTA dopo 32s» che in pista MAI erano sentiti:
// artefatto diagnostico, non difetto radio. Il test chiuso qui protegge:
//   1) l'eco NON entra nel bilancio né genera anomalie;
//   2) la radio reale sì: meta/bandiera >1 su radio = anomalie vere;
//   3) una ripetizione reale entro 70 s = «RIPETUTA», e porta ms precisi;
//   4) gli eventi SESSIONE contano sbalzi, senza rompere la contabilità;
//   5) i gap vengono letti dalle righe con dati (eco), MAI dalla radio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { statRiepilogo } from '../tools/_monitor-copilota.mjs';

const T0 = Date.now();

test('l\'eco del monitor non entra nel bilancio e non genera anomalie', () => {
  // due istanze di monitor (AVVIO + SESSIONE) ognuna con meta nell'eco,
  // a 32 s tra loro: il quadro che produceva «Meta ×3 / RIPETUTA» falso
  const righe = [
    { t: T0, evento: 'AVVIO MONITOR (v. campi+inPit — 1 porta/e)' },
    { t: T0 + 1000, dati: { gauges: {} }, frasi: [{ chi: 'metaBenzina', it: 'Meta gara: benzina 30 L, per 7.1 giri, restano 3' }] },
    { t: T0 + 33000, evento: 'AVVIO MONITOR (v. campi+inPit — 1 porta/e)' },
    { t: T0 + 34000, dati: { gauges: {} }, frasi: [{ chi: 'metaBenzina', it: 'Meta gara: benzina 30 L, per 7.1 giri, restano 3' }] },
  ];
  const st = statRiepilogo(righe);
  assert.equal(st.meta, 0);           // la radio NON ha detto nulla
  assert.equal(st.bandiera, 0);
  assert.equal(st.ecoFrasi, 2);       // l'eco resta come statistica a parte
  assert.deepEqual(st.viste, []);     // niente «RIPETUTA», niente «Meta ×3»
  assert.equal(st.radio.length, 0);   // parole vere: zero
});

test('la radio reale entra: meta una volta sola = nessuna anomalia', () => {
  const righe = [
    { t: T0, evento: 'SESSIONE VIVA (live=true)' },
    { t: T0 + 5000, chi: 'metaBenzina', it: 'Meta gara: benzina 30 L, per 7.1 giri, restano 3', livello: 'full' },
    { t: T0 + 60000, chi: 'bandiera', it: 'Bandiera a scacchi!', livello: 'full' },
  ];
  const st = statRiepilogo(righe);
  assert.equal(st.meta, 1);
  assert.equal(st.bandiera, 1);
  assert.equal(st.ecoFrasi, 0);
  assert.deepEqual(st.viste, []);
  assert.equal(st.radio.length, 2);
  assert.equal(st.radio[0].ripetutaDopoMs, null);
});

test('doppio REALE sulla radio: «RIPETUTA» + flag riaperto', () => {
  const testo = 'Meta gara: benzina 30 L, per 7.1 giri, restano 3';
  const righe = [
    { t: T0 + 5000, chi: 'metaBenzina', it: testo, livello: 'full' },
    { t: T0 + 37000, chi: 'metaBenzina', it: testo, livello: 'full' }, // 32 s dopo
  ];
  const st = statRiepilogo(righe);
  assert.equal(st.meta, 2);
  assert.ok(st.viste.some((v) => v.startsWith('RIPETUTA ') && v.includes('Meta gara: benzina 30 L')));
  assert.equal(st.radio[1].ripetutaDopoMs, 32000);
});

test('doppio oltre i 70 s: contato, ma niente «RIPETUTA»', () => {
  const righe = [
    { t: T0 + 5000, chi: 'bandiera', it: 'Bandiera a scacchi!', livello: 'normale' },
    { t: T0 + 80000, chi: 'bandiera', it: 'Bandiera a scacchi!', livello: 'normale' },
  ];
  const st = statRiepilogo(righe);
  assert.equal(st.bandiera, 2);
  assert.equal(st.radio[1].ripetutaDopoMs, null);   // oltre i 70 s non è «ripetuta»
  assert.ok(st.viste.some((v) => v.includes('bandiera ×2')));   // resta l'anomalia di banda
});

test('sbalzi SESSIONE contati, eventi misti non creano frasi', () => {
  const righe = [
    { t: T0, evento: 'SESSIONE FUORI (live=false)' },
    { t: T0 + 4000, evento: 'SESSIONE VIVA (live=true)' },
    { t: T0 + 8000, evento: 'SESSIONE FUORI (live=false)' },
    { t: T0 + 12000, evento: 'SERVER NON RISPONDE (timeout)' },
  ];
  const st = statRiepilogo(righe);
  assert.equal(st.sbalzi, 3);   // solo gli eventi SESSIONE, non gli altri eventi
  assert.deepEqual(st.viste, []);
});

test('i gap arrivano SOLO dalle righe con dati, mai dalla radio', () => {
  const righe = [
    { t: T0, dati: { gauges: { gapAhead: 12.3, gapBehind: 0 } }, frasi: [] },
    { t: T0 + 1000, dati: { gauges: { gapAhead: 7.5, gapBehind: 2.25 } }, frasi: [{ chi: 'gap', it: 'Sei più veloce del best di 7.5 secondi', detto: true }] },
  ];
  const st = statRiepilogo(righe);
  assert.equal(st.gapMax.lette, 2);
  assert.equal(st.gapMax.davanti, 12.3);
  assert.equal(st.gapMax.dietro, 2.25);
  assert.equal(st.zittite, 1);      // la frase eco zittita della guardia conta solo là
});

/* 31/10 sera: il registro della VOCE si riempie di righe di servizio ogni 60 s
   (STATO/SILENZIO/TICK — il tick continua anche a gioco SPENTO) e la CLI del
   riepilogo le stampava TUTTE prima degli eventi veri: centinaia di righe che
   seppellivano il verdetto. Qui il filtro è sancito: il rumore ESCE dal
   riepilogo (contato in `nascosti`), gli eventi che raccontano restano in
   `servizio` nell'ordine di arrivo, e i MOTIVI dei silenzi tornano UNA volta
   sola (senza minuta di minuti minuta). */
test('il rumore di servizio (STATO/SILENZIO/TICK) esce dal riepilogo e resta contato', () => {
  const righe = [
    { t: T0, evento: 'TICK', n: 1 },
    { t: T0 + 500, evento: 'SESSIONE VIVA (live=true, radio in pista)' },
    { t: T0 + 1000, chi: 'bandiera', it: 'Bandiera a scacchi!', livello: 'normale' },
    { t: T0 + 2000, evento: 'STATO', tickEtaMs: 3.5, tickN: 100 },
    { t: T0 + 3000, evento: 'SILENZIO', motivi: 'gioco non è vivo nello snapshot' },
    { t: T0 + 4000, evento: 'ERRORE TICK VOCE', err: 'body null' },
    { t: T0 + 5000, evento: 'TICK', n: 3 },
    { t: T0 + 6000, evento: 'SILENZIO', motivi: 'gioco non è vivo nello snapshot' },   // motivo già visto: NON si ripete
  ];
  const st = statRiepilogo(righe);
  // il rumore NON è nell'apertura...
  assert.ok(!st.servizio.some((s) => s.evento.startsWith('TICK') || s.evento.startsWith('STATO') || s.evento.startsWith('SILENZIO')));
  // ...è CONTATO e i motivi tornano UNA volta sola...
  assert.deepEqual(st.nascosti, { TICK: 2, STATO: 1, SILENZIO: 2 });
  assert.deepEqual(st.motiviSilenzio, ['gioco non è vivo nello snapshot']);
  // ...e gli eventi che raccontano restano in ordine, senza perdere niente:
  assert.deepEqual(st.servizio.map((s) => s.evento.split(' ')[0]), ['SESSIONE', 'ERRORE']);
});

test('un registro già pulito (ricalcolo monito) non mette righe di rumore né motivi fatti a mano', () => {
  const righe = [
    { t: T0, evento: 'AVVIO MONITOR (v. campi+contemporary — 1 porta/e)' },
    { t: T0 + 1000, chi: 'ultimoGiro', it: 'Ultimo giro!', livello: 'normale' },
  ];
  const st = statRiepilogo(righe);
  assert.deepEqual(st.nascosti, {});
  assert.deepEqual(st.motiviSilenzio, []);
  assert.deepEqual(st.servizio.map((s) => s.evento.slice(0, 5)), ['AVVIO']);
  assert.equal(st.ultimo, 1);
});
