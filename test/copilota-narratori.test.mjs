// test/copilota-narratori.test.mjs — le gare SINTETICHE del copilota.
// Il narratore guidato è il gemello esatto di gui/js/viste-a.js (le frasi e
// l'ordine sono gli stessi): il test lo fa correre su frammenti di MMF
// sintetici e controlla quello che Mauro sente in pista:
//   1) metà gara UNA volta sola, anche quando l'HUD graffa il contatore;
//   2) MAI un «Giro 4» sopra una gara da 3 (artefatto del taglio in più);
//   3) «Ultimo giro!» una volta sola anche se il sensore flappa o è solo scorta;
//   4) «Bandiera a scacchi!» una volta sola, al taglio del giro totale;
//   5) la guardia 70 s zittisce la frase identica ripresentata;
//   6) le fasce usura parlano SOLO salendo la scala (55% → tacca 1,
//      80% → tacca 2): restare in banda tace, scendere tace, ricrossare ridice;
//   7) il conto alla rovescia della sosta (6b) nomina le gomme solo
//      quando sono stanche (banda ≥1), e alla prima vista di finestra
//      già vicina la tacca si SEMINA in silenzio (niente doppio annuncio).
// Lezione del 28/10 (il loop «metà gara litri benzina e giri»): il vecchio
// contatore poteva TORNARE INDIETRO (lapsDone che fallisce, scorta lapNo più
// bassa) e ogni ritorno resetta la metà gara → loop. Il contatore ora è
// monotono dentro la sessione (solo la FIRMA la azzera).
import test from 'node:test';
import assert from 'node:assert/strict';
import { narratore } from '../tools/_monitor-copilota.mjs';

/** guida una sequenza di frame: [[t, frame], …] → tutte le frasi (anche zittite) */
function gara(frames) {
  const slot = { last: {}, at: 0, said: {}, firma: 'gara-test' };
  const dette = [];
  for (const [t, m] of frames) dette.push(...narratore(m, slot, t));
  return dette;
}

const voce = (dette, chi) => dette.filter((f) => !f.detto && f.chi === chi).length;

const MMF = (t, over = {}) => ({ t, live: true, sessionId: 'sess-1', ...over });

test("gara da 3 pulita: metà gara una volta, mai «Giro 4», bandiera una volta", () => {
  const frames = [
    [0,  MMF(0,  { gauges: { lapsDone: 0, lapsTotal: 3, fuel: 26.8, lapsOnFuel: 9.2, lapsLeft: 3 }, delta: { lapNo: 0, dv: 0 } })],
    [5,  MMF(5,  { gauges: { lapsDone: 1, lapsTotal: 3, fuel: 26.0, lapsOnFuel: 8.6, lapsLeft: 2 }, delta: { lapNo: 1, dv: 0 }, timing: { lastLap: "1:02.345", bestLap: "1:02.345" } })],
    // il graffio: l'HUD perde lapsDone un istante, la scorta lapNo è rimasta a 1
    [12, MMF(12, { gauges: { lapsTotal: 3, fuel: 25.4, lapsOnFuel: 8.2, lapsLeft: 2 }, delta: { lapNo: 1, dv: 0 }, timing: { lastLap: "1:02.345", bestLap: "1:02.345" } })],
    [20, MMF(20, { gauges: { lapsDone: 2, lapsTotal: 3, fuel: 25.2, lapsOnFuel: 8.1, lapsLeft: 1 }, delta: { lapNo: 2, dv: 0 }, timing: { lastLap: "1:01.780", bestLap: "1:01.780" } })],
    [40, MMF(40, { gauges: { lapsDone: 3, lapsTotal: 3, fuel: 24.4, lapsOnFuel: 7.6, lapsLeft: 0 }, delta: { lapNo: 3, dv: 0 }, timing: { lastLap: "1:01.900" } })],
    // il taglio in più dell'artefatto: il contatore sale a 4 su una gara da 3
    [70, MMF(70, { gauges: { lapsDone: 4, lapsTotal: 3, fuel: 24.3, lapsOnFuel: 7.5, lapsLeft: 0 }, delta: { lapNo: 4, dv: 0 }, timing: { lastLap: "1:02.100" } })],
  ];
  const dette = gara(frames);
  assert.equal(voce(dette, "metaBenzina"), 1, "metà gara una sola volta");
  assert.ok(!dette.some((f) => (f.it ?? "").includes("Giro 4")), "mai «Giro 4» su una gara da 3");
  assert.equal(voce(dette, "ultimoGiro"), 1);
  assert.equal(voce(dette, "bandiera"), 1);
});

test("HUD che graffa continua: il loop «metà gara» NON riparte", () => {
  // regressione 28/10: dopo il primo annuncio legitimo lapsDone oscilla
  // (presente ↔ assente, scorta più bassa) per 30 tick — la vecchia logica
  // riapriva la metà gara a ogni ritorno (il flag reset). Il contatore
  // monotono la tiene chiusa: una sola frase meta in tutta la pila.
  const frames = [
    [0,  MMF(0,  { gauges: { lapsDone: 0, lapsTotal: 3, fuel: 26.8, lapsOnFuel: 9.2, lapsLeft: 3 }, delta: { lapNo: 0, dv: 0 } })],
    [5,  MMF(5,  { gauges: { lapsDone: 1, lapsTotal: 3, fuel: 26.0, lapsOnFuel: 8.6, lapsLeft: 2 }, delta: { lapNo: 1, dv: 0 }, timing: { lastLap: "1:02.345", bestLap: "1:02.345" } })],
  ];
  for (let i = 1; i <= 30; i++) {
    const t = 90 + i * 2;
    if (i % 2 === 0) frames.push([t, MMF(t, { gauges: { lapsDone: 2, lapsTotal: 3, fuel: 25.2, lapsOnFuel: 8.1, lapsLeft: 1 }, delta: { lapNo: 2, dv: 0 }, timing: { lastLap: "1:01.780", bestLap: "1:01.780" } })]);
    else frames.push([t, MMF(t, { gauges: { lapsTotal: 3, fuel: 25.2, lapsOnFuel: 8.1, lapsLeft: 1 }, delta: { lapNo: 1, dv: 0 }, timing: { lastLap: "1:01.780", bestLap: "1:01.780" } })]);
  }
  const dette = gara(frames);
  assert.equal(voce(dette, "metaBenzina"), 1, "esattamente l'annuncio legitimo, mai la ripetizione");
});

test("gara intera col contatore a 0 (HUD cieco): metà, ultimo giro e bandiera arrivano dalla scorta", () => {
  const frames = [
    [0,  MMF(0,  { gauges: { lapsTotal: 3, fuel: 26.8, lapsOnFuel: 9.2, lapsLeft: 3 }, delta: { lapNo: 0, dv: 0 } })],
    [5,  MMF(5,  { gauges: { lapsTotal: 3, fuel: 26.0, lapsOnFuel: 8.6, lapsLeft: 2 }, delta: { lapNo: 1, dv: 0 }, timing: { lastLap: "1:02.345", bestLap: "1:02.345" } })],
    [30, MMF(30, { gauges: { lapsTotal: 3, fuel: 25.2, lapsOnFuel: 8.1, lapsLeft: 1 }, delta: { lapNo: 2, dv: 0 }, timing: { lastLap: "1:01.780", bestLap: "1:01.780" } })],
    [50, MMF(50, { gauges: { lapsTotal: 3, fuel: 24.4, lapsOnFuel: 7.6, lapsLeft: 0 }, delta: { lapNo: 3, dv: 0 }, timing: { lastLap: "1:01.900" } })],
    [90, MMF(90, { gauges: { lapsTotal: 3, fuel: 24.3, lapsOnFuel: 7.5, lapsLeft: 0 }, delta: { lapNo: 4, dv: 0 }, timing: { lastLap: "1:02.100" } })],
  ];
  const dette = gara(frames);
  assert.equal(voce(dette, "metaBenzina"), 1, "la metà parla anche col contatore dell'HUD a 0");
  assert.equal(voce(dette, "ultimoGiro"), 1, "l'ultimo giro parla anche col contatore dell'HUD a 0");
  assert.equal(voce(dette, "bandiera"), 1);
  assert.ok(!dette.some((f) => (f.it ?? "").includes("Giro 4")), "il fallback non dà voce a un giro oltre il totale");
});

test("il sensore isLastLap che flappa: «Ultimo giro!» una sola volta", () => {
  const frames = [];
  for (let i = 0; i < 10; i++) {
    const t = 20 + i * 2;
    frames.push([t, MMF(t, { gauges: { lapsDone: 2, lapsTotal: 3, fuel: 25.2, lapsOnFuel: 8.1, lapsLeft: 1, isLastLap: i % 2 === 0 }, delta: { lapNo: 2, dv: 0 }, timing: { lastLap: "1:01.780", bestLap: "1:01.780" } })]);
  }
  const dette = gara(frames);
  assert.equal(voce(dette, "ultimoGiro"), 1, "niente ripetizioni anche col sensore flappy");
});

test("la guardia 70 s zittisce la frase identica ripresentata", () => {
  // il gap gioca a palette: 1.2 → 1.4 → di nuovo 1.2 — la stessa frase
  // «Gap davanti 1.2» nel giro di poco tempo deve uscire con detto:true.
  const gap = (t, v) => MMF(t, { gauges: { lapsDone: 1, lapsTotal: 3, fuel: 26.0, lapsOnFuel: 8.6, lapsLeft: 2, gapAhead: v }, delta: { lapNo: 0, dv: 0 } });
  const slot = { last: {}, at: 0, said: {}, firma: "f1" };
  const a = narratore(gap(1000, 1.2), slot, 1000);
  const b = narratore(gap(4000, 1.4), slot, 4000);
  const c = narratore(gap(8000, 1.2), slot, 8000);
  assert.ok(a.some((f) => f.chi === "gap" && !f.detto), "il primo gap sotto 1,5 s parla");
  assert.ok(b.length === 0 || b.every((f) => f.detto), "il cambio dentro i 20 s resta zittito dalla guardia");
  const ritorno = c.filter((f) => f.chi === "gap");
  assert.ok(ritorno.length === 0 || (ritorno.length === 1 && ritorno[0].detto), "il ritorno della stessa frase dentro i 70 s viene zittito");
});

test("i box: voce all'ingresso e all'uscita dal pitlane — una volta ciascuna, mai in loop", () => {
  // 28/10 sera, richiesta Mauro: «per il copilot implementa la voce quando
  // apre/chiude i box». Il sensore è inPit dai gauges (carLocation 1 della MMF).
  const sedia = (inPit) => ({ lapsDone: 1, lapsTotal: 3, fuel: 26, lapsOnFuel: 8.6, lapsLeft: 2, inPit });
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-box' };
  // il primissimo valore si SEMINA in silenzio: niente «box aperto» all'avvio
  const f0 = narratore(MMF(0, { gauges: sedia(false) }), slot, 0);
  assert.equal(f0.filter((f) => f.chi?.startsWith('box')).length, 0, 'il primo valore non parla');
  // ingresso in pitlane: la voce esce una volta
  const f1 = narratore(MMF(5000, { gauges: sedia(true) }), slot, 5000);
  assert.ok(f1.some((f) => f.chi === 'boxopen' && !f.detto), "all'ingresso nel pitlane il narratore parla");
  // stabile in baia: tace (niente loop ogni tick)
  const f2 = narratore(MMF(7000, { gauges: sedia(true) }), slot, 7000);
  assert.equal(f2.filter((f) => f.chi === 'boxopen').length, 0, 'restando in baia non ripete');
  // uscita: la sua voce, con la distanza minima 10 s rispettata
  const f3 = narratore(MMF(60000, { gauges: sedia(false) }), slot, 60000);
  assert.ok(f3.some((f) => f.chi === 'boxclose' && !f.detto), "all'uscita dal pitlane il narratore parla");
  // un ingresso immediato (< 10 s dall'uscita) resta MUTED: niente scale in baia
  const f4 = narratore(MMF(62000, { gauges: sedia(true) }), slot, 62000);
  assert.ok(!f4.some((f) => f.chi === 'boxopen' && !f.detto), 'rientro entro 10 s: zittito dal distanziello');
});

test("fasce usura: la voce sale la scala (55→80), una tacca a volta, mai a scendere", () => {
  // 28/10 tardissimo, le prove sistematiche mancanti: narratore 4 (fasce usura).
  // Soglie = banda 1 sopra il 55%, banda 2 sopra l'80% (Math.round del peggiore).
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-usura' };
  const passo = (t, wear) => narratore(MMF(t, { gauges: { wear } }), slot, t);
  const a = passo(1000, [10, 20, 15, 12]);            // banda 0: tace
  const b = passo(4000, [40, 58, 20, 25]);            // salita in banda 1
  const c = passo(7000, [42, 60, 22, 26]);            // restare in banda 1: tace
  const d = passo(10000, [88, 82, 45, 50]);           // salita in banda 2
  const e = passo(13000, [90, 85, 50, 55]);           // restare in banda 2: tace
  const f = passo(16000, [20, 15, 10, 12]);           // scendere sotto 55: tace
  const g = passo(20000, [60, 30, 20, 10]);           // ricrossare in banda 1: ridice
  assert.equal(a.filter((fr) => fr.chi === 'gomme').length, 0, 'gomme sane: la radio non parla');
  assert.ok(b.some((fr) => fr.chi === 'gomme' && !fr.detto && fr.it === 'Gomme al 58 percento'), 'salita in tacca 1 parla');
  assert.equal(c.filter((fr) => fr.chi === 'gomme').length, 0, 'restare in tacca non ripete');
  assert.ok(d.some((fr) => fr.chi === 'gomme' && !fr.detto && fr.it === 'Gomme al 88 percento'), 'salita in tacca 2 parla');
  assert.equal(e.filter((fr) => fr.chi === 'gomme').length, 0, 'restare in tacca 2 non ripete');
  assert.equal(f.filter((fr) => fr.chi === 'gomme').length, 0, 'scendere di fascia tace');
  assert.ok(g.some((fr) => fr.chi === 'gomme' && !fr.detto), 'ricrossare la stessa fascia ridice (nuovo avvicinamento al limite)');
});

test("conto alla rovescia sosta (6b): nomina le gomme solo se stanche, prima vista vicina semina", () => {
  // Il pitcount copre i due suffissi di usura «gomme stanche» (tacca 1) e
  // «gomme al limite, contano anche le pressioni» (tacca 2), e quello SANO
  // esce SENZA suffisso. Servono due slot separate: la finestra lontana
  // (tacca ≥3) deve precedere la vicina, perché alla prima vista vicina la
  // tacca si semina in silenzio (fissano il doppio annuncio del 27/10).
  const wear = (v) => (v ? [60, 40, 30, 20] : [10, 12, 8, 6]);
  // pitLap FERMO a 10: nel flusso vero la finestra non si muove, sono i GIRI
  // che si consumano — solo lapsToWindow scende. Se pitLap cambiasse, il 'pit'
  // riannuncerebbe e SEMINEREbbe la tacca in silenzio (anti-doppio annuncio:
  // il test stesso lo dimostra col semaforo della prima vista vicina).
  const pitA = (lw) => ({ need: 'both', pitLap: 10, lapsToWindow: lw, pitLossSec: 24 });
  const frame = (t, lw, stanche) => MMF(t, { gauges: { lapsDone: 5, lapsTotal: 12, fuel: 30, lapsOnFuel: 9, lapsLeft: 5, wear: wear(stanche) }, pit: pitA(lw) });
  // STANCHE: banda 1 dal primo tick (60%)
  const slotSt = { last: {}, at: 0, said: {}, firma: 'sess-pit-st' };
  const s0 = narratore(frame(1000, 4, true), slotSt, 1000);    // «si apre tra 4 giri»
  const s1 = narratore(frame(21000, 2, true), slotSt, 21000);  // tacca 2
  const s2 = narratore(frame(41000, 1, true), slotSt, 41000);  // tacca 1
  assert.ok(s0.some((fr) => fr.chi === 'pit' && !fr.detto), 'la finestra lontana si annuncia');
  assert.equal(s0.filter((fr) => fr.chi === 'pitcount').length, 0, 'a tacca 4 niente conto da dire');
  assert.equal(s1.filter((fr) => fr.chi === 'pit').length, 0, 'la stessa finestra col pitLap fermo NON riannuncia');
  assert.ok(s1.some((fr) => fr.chi === 'pitcount' && !fr.detto && fr.it.includes('Sosta tra 2 giri') && fr.it.includes('gomme al limite, contano anche le pressioni')), 'tacca 2 col nome delle gomme al limite');
  assert.ok(s2.some((fr) => fr.chi === 'pitcount' && !fr.detto && fr.it.includes('Sosta questo giro o il prossimo') && fr.it.includes('gomme stanche')), 'tacca 1 col nome delle gomme stanche');
  // SANE: stessa finestra, banda 0 — stesso discorso SENZA suffissi
  const slotSa = { last: {}, at: 0, said: {}, firma: 'sess-pit-sa' };
  const h0 = narratore(frame(1000, 4, false), slotSa, 1000);
  const h1 = narratore(frame(21000, 1, false), slotSa, 21000);
  assert.ok(h0.some((fr) => fr.chi === 'pit' && !fr.detto));
  assert.ok(h1.some((fr) => fr.chi === 'pitcount' && !fr.detto && fr.it === 'Sosta questo giro o il prossimo'), 'gomme sane: nessun suffisso di usura');
});

test("gara A TEMPO (5 min, senza lapsTotal): «Ultimo giro!» da isLastLap e «Bandiera» al traguardo", () => {
  // 30/10, gara dei 5 min (Race Weekend con Mauro che salta prove/quali):
  // in gara a tempo il gioco NON scrive totalLapsSession (resta 0 anche
  // dopo i traguardi — i risultati ufficiali mostrano i giri FATTI per
  // capienza) e l'intero ramo del narratore era ghiacciato dietro
  // lapsTotal > 0: fine gara in silenzio completo.
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-tempo' };
  // lapsTotal ASSENTE: o null o 0, la regola è la stessa
  const passo = (t, o = {}) => narratore(MMF(t, { gauges: { lapsDone: o.ld ?? null, lapsTotal: 0, isLastLap: o.isLast ?? false, fuel: 26, lapsOnFuel: 9, lapsLeft: null }, delta: { lapNo: o.lapNo ?? 0, dv: 0 }, timing: o.lastLap ? { lastLap: o.lastLap, bestLap: "1:52.500" } : undefined }), slot, t);
  const a = passo(1000, { ld: 0 });
  assert.equal(a.filter((f) => f.chi === 'ultimoGiro' || f.chi === 'bandiera').length, 0, 'fuori dal finale non parla');
  const b = passo(20000, { ld: 2, lapNo: 3, isLast: true, lastLap: "1:53.100" });            // traguardo del giro 2, poi scade il timer: isLastLap a true
  assert.ok(b.some((f) => f.chi === 'ultimoGiro' && !f.detto), '«Ultimo giro!» parla SENZA lapsTotal (il sensore del gioco basta)');
  const c = passo(24000, { ld: 2, lapNo: 3, isLast: false, lastLap: "1:53.100" });           // flappa a false a metà giro: NESSUN nuovo lastLap
  assert.ok(!c.some((f) => f.chi === 'bandiera' && !f.detto), 'il flap del sensore NON spara la bandiera (lastLap non cambiato)');
  const d = passo(30000, { ld: 3, lapNo: 4, isLast: false, lastLap: "1:52.800" });           // traguardo finale: nuovo lastLap
  assert.ok(d.some((f) => f.chi === 'bandiera' && !f.detto), 'il traguardo dopo l\'ultimo giro parla «Bandiera a scacchi!» senza contatore');
});

test("sessione vera nuova (firma): azzera lo slot e la metà ridice", () => {
  const slot = { last: {}, at: 0, said: {}, firma: "sess-1" };
  const m = MMF(0, { gauges: { lapsDone: 1, lapsTotal: 3, fuel: 26.0, lapsOnFuel: 8.6, lapsLeft: 2 }, delta: { lapNo: 1, dv: 0 }, timing: { lastLap: "1:02.345", bestLap: "1:02.345" } });
  narratore(m, slot, 1000);
  assert.equal(slot.last.meta, true);
  // la firma (sess-2) la gestiscono viste-a.js e il monitor: azzerano e ripassano il tick
  slot.last = {}; slot.said = {};
  const m2 = { ...m, sessionId: "sess-2" };
  void narratore(m2, slot, 90000);
  assert.equal(slot.last.meta, true);
});

test("GARA DOPO LA GARA sulla stessa pista (firma muta): il reset a spunto live ridice tutto" , () => {
  // 28/10 tardissimo, la gara MUTO: in SP la sessionId della MMF non cambia
  // tra due gare sulla STESSA pista — la «firma» azzera niente e le last
  // della gara prima soffocavano la gara dopo (contatore monotono limitato
  // al giro vecchio, «Ultimo giro!» già detto, benzina già seminata).
  // Il FIX (viste-a.js e monitor gemello) azzera la memoria al RITORNO della
  // live (live=false→true): qui si replica ESATTAMENTE quel flusso di chiamata.
  const gara3 = (t, ld, af) => MMF(t, { gauges: { lapsDone: ld, lapsTotal: 3, fuel: 26 - ld * 1.4, lapsOnFuel: af, lapsLeft: 3 - (ld >= 2 ? ld : 1) }, delta: { lapNo: ld, dv: 0 }, timing: ld ? { lastLap: `1:0${1 + ld}.${(200 + ld * 111) % 900}` , bestLap: "1:01.500" } : undefined });
  // GARA 1 con slot fresca: parla normale (il contatore monotono segna il giro 2)
  const slot = { last: {}, at: 0, said: {}, firma: null };
  const dette1 = [
    ...narratore(gara3(1000, 0, 9.2), slot, 1000),
    ...narratore(gara3(4000, 2, 8.1), slot, 4000),
    ...narratore(gara3(7000, 3, 7.6), slot, 7000),
  ];
  assert.equal(voce(dette1, "ultimoGiro"), 1, "gara 1: «Ultimo giro!» parlato una volta");
  assert.equal(voce(dette1, "bandiera"), 1, "gara 1: bandiera parlata una volta");
  // attesa tra le due gare: live=false e lo slot RESTA sporco — esattamente
  // lo stato che il registro del monitor mostrava stanotte prima del fix.
  assert.equal(slot.last.ultimo, true, "lo slot sporco che soffocava la gara dopo");
  // SPUNTO LIVE della gara 2: la firma NON cambia (in SP il sessionId resta 0);
  // il tirante live=false→true segna la gara nuova e il chiamante (fix di
  // stanotte, viste-a.js + monitor) azzera lo slot — QUESTE due righe sono il fix:
  slot.last = {};
  slot.at = 0;
  // il primo «benzina» si semina in silenzio; allo scaducio (0.5+) la voce riparte.
  // Le gare sono DISTANTI 100 s come nella realtà (video: la gara 1 finiva a t≈7000):
  // la guardia 70 s NON è in gioco tra le due gare vera.
  const dette2 = [
    ...narratore(gara3(100000, 0, 7.9), slot, 100000),    // semina fuel=7.9
    ...narratore(gara3(105050, 1, 7.3), slot, 105050),    // scende di 0.6 → «Benzina per 7.3 giri»
    ...narratore(gara3(108300, 2, 6.8), slot, 108300),    // ultimo giro (compiuto+1==3)
    ...narratore(gara3(111300, 3, 6.4), slot, 111300),    // bandiera
  ];
  assert.ok(dette2.some((f) => f.chi === "benzina" && !f.detto), "gara 2: il benzina RIDICE (slot pulita allo spunto live)");
  assert.equal(voce(dette2, "ultimoGiro"), 1, "gara 2: «Ultimo giro!» ridetto, non ereditato a true");
  assert.equal(voce(dette2, "bandiera"), 1, "gara 2: bandiera ridetta da capo");
});

test("conto alla rovescia gara a tempo (8b): «Ultimo minuto!» e «Trenta secondi!», una volta ciascuna", () => {
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-count' };
  const passo = (t, timeLeft) => narratore(MMF(t, { gauges: { lapsDone: 2, lapsTotal: 0, fuel: 26, lapsOnFuel: 9, timeLeft } }), slot, t);
  const a = passo(1000, "5:00");
  assert.equal(a.filter((f) => f.chi === 'minuto').length, 0, 'con 5 minuti pieni non parla');
  const b = passo(4000, "1:10");
  assert.equal(b.filter((f) => f.chi === 'minuto').length, 0, 'con 70 secondi non parla ancora');
  const c = passo(7000, "0:59");
  assert.ok(c.some((f) => f.chi === 'minuto' && !f.detto && f.it === 'Ultimo minuto!'), 'sotto i 60 s parlo l\'ultima tacca');
  const d = passo(10000, "0:59");
  assert.equal(d.filter((f) => f.chi === 'minuto').length, 0, 'a valore fermo non ripete');
  const e = passo(13000, "0:30");
  assert.ok(e.some((f) => f.chi === 'minuto' && !f.detto && f.it === 'Trenta secondi!'), 'sotto i 30 s parla la seconda tacca');
  const f = passo(16000, "0:29");
  assert.equal(f.filter((f) => f.chi === 'minuto').length, 0, 'la seconda tacca non ripete');
  // formato ore (endurance): 1:02:30 non deve annunciare NULLA (lontano)
  const slot2 = { last: {}, at: 0, said: {}, firma: 'sess-count2' };
  const ore = narratore(MMF(1000, { gauges: { lapsDone: 2, lapsTotal: 0, fuel: 26, lapsOnFuel: 9, timeLeft: "1:02:30" } }), slot2, 1000);
  assert.equal(ore.filter((x) => x.chi === 'minuto').length, 0, 'il formato h:mm:ss si sembra e tace quando lontano');
  // stringa senza senso: ziti, niente tacca finta
  const slot3 = { last: {}, at: 0, said: {}, firma: 'sess-count3' };
  const z = narratore(MMF(1000, { gauges: { lapsDone: 2, lapsTotal: 0, fuel: 26, lapsOnFuel: 9, timeLeft: "--:--" } }), slot3, 1000);
  assert.equal(z.filter((x) => x.chi === 'minuto').length, 0, 'la stringa che non si parses ese zita');
});

test("bandiera blu (28/10 notte, endurance): parla sul CAMBIO a blu, prima vista seminata, ridice alla doppia successiva", () => {
  // Il flag PER AUTO della MMF (FLAG[4]='blu') era nella snapshot da sempre
  // e nessuno lo consumava: nelle gare multi-classe il copilota taceva
  // proprio quando ti doppiano. Sequenza reale: doppiato → blu, liberato →
  // nessuna, di nuovo in doppiata → blu.
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-blu' };
  const giri = { lapsDone: 2, lapsTotal: 10, fuel: 40, lapsOnFuel: 8, lapsLeft: 8 };
  const passo = (t, flag) => narratore(MMF(t, { gauges: { ...giri, flag } }), slot, t);
  const a = passo(1000, 'blu');
  assert.equal(a.filter((f) => f.chi === 'blu').length, 0, 'la primissima vista semina in silenzio (niente voce all\'avvio)');
  const b = passo(2000, 'verde');
  assert.equal(b.filter((f) => f.chi === 'blu').length, 0, 'il cambio verde→blu? no: VERDE resta muto');
  const c = passo(4000, 'blu');
  assert.ok(c.some((f) => f.chi === 'blu' && !f.detto && (f.it ?? '').startsWith('Bandiera blu')), 'il CAMBIO a blu parla');
  const d = passo(6000, 'blu');
  assert.equal(d.filter((f) => f.chi === 'blu').length, 0, 'restando blu non ripete');
  const e = passo(8000, 'nessuna');
  assert.equal(e.filter((f) => f.chi === 'blu').length, 0, 'la fine della doppietta non parla');
  const g = passo(80000, 'blu');   // 76 s dopo il primo annuncio: la guardia 70 s è passata
  assert.ok(g.some((f) => f.chi === 'blu' && !f.detto), "la doppietta successiva ridice (dopo la guardia 70 s)");
  passo(90000, 'nessuna');
  const i = passo(100000, 'blu');    // rientro nella finestra 70 s
  assert.ok(!i.some((f) => f.chi === 'blu' && !f.detto), 'il rientro entro la guardia 70 s resta zittito');
});

test("posizione: «P5, posizione persa/recuperata» al sedile che cambia — chi 'postalk' come la vista (30/10, radio unica sul server)", () => {
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-pos' };
  const giri = { lapsDone: 3, lapsTotal: 10, fuel: 40, lapsOnFuel: 8, lapsLeft: 8 };
  let t = 1000;
  const passo = (pos, dt = 4000) => { t += dt; return narratore(MMF(t, { gauges: { ...giri, position: pos }, position: pos }), slot, t); };
  const a = passo(5, 1000);
  assert.equal(a.filter((f) => f.chi === 'postalk').length, 0, "la primissima vista semina il sedile in silenzio (niente voce all'avvio)");
  const b = passo(5);
  assert.equal(b.filter((f) => f.chi === 'postalk').length, 0, 'restando al sedile non ripete');
  const c = passo(6);
  assert.ok(c.some((f) => f.chi === 'postalk' && !f.detto && (f.it ?? '').includes('persa')), 'P5→P6: posizione PERSA');
  const d = passo(3, 35000);   // oltre la finestra 30 s: il distanziello è passato
  assert.ok(d.some((f) => f.chi === 'postalk' && !f.detto && (f.it ?? '').includes('recuperata')), 'P6→P3: posizione RECUPERATA');
  const e = passo(3, 4000);
  assert.equal(e.filter((f) => f.chi === 'postalk').length, 0, 'restando a P3 non ripete');
  // la guardia 30 s: subito dopo non ridice, 40 s dopo la finestra è passata
  const f = passo(4);   // a +4 s: dentro la finestra 30 s
  assert.ok(!f.some((x) => x.chi === 'postalk' && !x.detto), 'il cambio dentro la finestra 30 s resta zittito');
  const g = passo(6, 30000);   // +38 s dall'ultimo annuncio: la guardia è passata
  assert.ok(g.some((x) => x.chi === 'postalk' && !x.detto && (x.it ?? '').includes('persa')), 'il cambio oltre la 30 s parla di nuovo');
});

test("penalita' tagli pista (9b, 30/10): parla sul salto >= 0,5 s del totale cumulativo, niente a valore fermo", () => {
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-cut' };
  const giri = { lapsDone: 3, lapsTotal: 10, fuel: 40, lapsOnFuel: 8, lapsLeft: 8 };
  let t = 1000;
  const passo = (cutSec, dt = 4000) => { t += dt; return narratore(MMF(t, { gauges: { ...giri, cutSec } }), slot, t); };
  const a = passo(0.2);
  assert.equal(a.filter((f) => f.chi === 'penalia').length, 0, 'il primo salto piccolo (0.2) resta muto: non dele fracasso');
  const b = passo(0.4);
  assert.equal(b.filter((f) => f.chi === 'penalia').length, 0, 'sotto i 0,5 s cumulativi non parla');
  const c = passo(1.0);
  assert.ok(c.some((f) => f.chi === 'penalia' && !f.detto && (f.it ?? '').includes('1.0')), 'il salto a 1.0 s parla (totale cumulativo)');
  const d = passo(1.0);
  assert.equal(d.filter((f) => f.chi === 'penalia').length, 0, 'a valore fermo non ripete');
  // comunque il said guard 70 s atterrato: stessa frase identica zitta
  const e = passo(1.0, 4000);
  assert.ok(e.every((f) => f.chi !== 'penalia' || f.detto), 'stesso totale dentro i 70 s: solo zitta (detto) OK? no: e value presenti');
  const g = passo(2.7, 35000);
  assert.ok(g.some((f) => f.chi === 'penalia' && !f.detto && (f.it ?? '').includes('2.7')), "salto successivo oltre i 0,5 s parla col totale aggiornato");
});

test("chi ti sta davanti (gap, 30/10): distanza senza nome (niente driver avversari nella MMF), guardia 20 s", () => {
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-gap' };
  const giri = { lapsDone: 3, lapsTotal: 10, fuel: 40, lapsOnFuel: 8, lapsLeft: 8 };
  let t = 1000;
  const passo = (gapAhead, dt = 4000) => { t += dt; return narratore(MMF(t, { gauges: { ...giri, gapAhead } }), slot, t); };
  const a = passo(1.2, 1000);
  assert.ok(a.some((f) => f.chi === 'gap' && !f.detto && (f.it ?? '').includes('1.2')), 'chi ti entra sotto 1,5 s parla con la distanza');
  const b = passo(0.9);
  assert.equal(b.filter((f) => f.chi === 'gap').length, 0, 'la variazione dentro la finestra 20 s tace');
  const c = passo(1.4, 21000);
  assert.ok(c.some((f) => f.chi === 'gap' && !f.detto && (f.it ?? '').includes('1.4')), 'dopo i 20 s la distanza nuova parla');
  const d = passo(2.0);
  assert.equal(d.filter((f) => f.chi === 'gap').length, 0, "sopra 1,5 s di nuevo il gap tace: non e' la lotta, e la scia");
});

test("gara senza segnali (30/10, Monza 13:52: lapsTotal=0, isLastLap mai, timeLeft null): la bandiera a scacchi che arriva al traguardo chiude la gara UNA volta sola", () => {
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-monza' };
  let t = 0;
  const passo = (over, dt = 4000) => { t += dt; return narratore(MMF(t, over), slot, t); };
  // la gara reale: MMF muto sulle finiture per TUTTA la sessione
  const giri = { lapsDone: 0, lapsTotal: 0, isLastLap: false, flag: 'nessuna', timeLeft: null, fuel: 30, lapsOnFuel: 7.1 };
  const a = passo({ gauges: { ...giri }, delta: { lapNo: 0, dv: 0 } });
  assert.equal(a.filter((f) => f.chi === 'bandiera').length, 0, 'inizio gara in silenzio');
  t += 6000; const b = narratore(MMF(t, { gauges: { ...giri, lapsDone: 1 }, delta: { lapNo: 1, dv: 0 }, timing: { lastLap: '1:48.267' } }), slot, t);
  assert.equal(b.filter((f) => f.chi === 'bandiera').length, 0, 'al giro 1 non c\'è bandiera');
  t += 30000; const c = narratore(MMF(t, { gauges: { ...giri, lapsDone: 3, flag: 'a scacchi', fuel: 20.8 }, delta: { lapNo: 4, dv: 0 }, timing: { lastLap: '1:56.724', bestLap: '1:56.724' } }), slot, t);
  assert.ok(c.some((f) => f.chi === 'bandiera' && !f.detto), 'il cambio a scacchi con 3 giri compiuti annuncia la bandiera');
  t += 8000; const d = narratore(MMF(t, { gauges: { ...giri, lapsDone: 3, flag: 'a scacchi', fuel: 19 }, delta: { lapNo: 4, dv: 0 } }), slot, t);
  assert.equal(d.filter((f) => f.chi === 'bandiera' && !f.detto).length, 0, 'a flag fermo non ripete');
});

test("gara finita prima del monito (30/10): entrare a sessione VIVA con la bandiera già a scacchi si SEMINA in silenzio", () => {
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-scaduta' };
  const frame = { gauges: { lapsDone: 3, lapsTotal: 0, isLastLap: false, flag: 'a scacchi', timeLeft: null }, delta: { lapNo: 4, dv: 0 } };
  const a = narratore(MMF(0, frame), slot, 0);
  assert.equal(a.filter((f) => f.chi === 'bandiera' && !f.detto).length, 0, 'la bandiera già a scacchi al primo tick non grida');
  const b = narratore(MMF(4000, frame), slot, 4000);
  assert.equal(b.filter((f) => f.chi === 'bandiera' && !f.detto).length, 0, 'e neppure ai tick seguenti');
});

test("LA BANDIERA DOPO IL GIRO (8d, gara delle 14:24): la crocetta arriva 4 s prima del contatore — la bandiera aspetta il giro annunciato", () => {
  // 31/10, gara dei 5 minuti: la bandiera parlò alle 14:30:56 e "Giro 3 fatto
  // in 1:42.576 — nuovo best" alle 14:31:00. Il gioco scrive la crocetta a
  // scacchi PRIMA che il contatore salga: la bandiera va in codA e parla al
  // primo giro annunciato in un tick successivo.
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-ordine' };
  const passo = (t, over) => narratore(MMF(t, over), slot, t);
  const giri = { lapsTotal: 0, isLastLap: false, timeLeft: null, lapsOnFuel: 7.5 };
  // il giro 2 entra nella memoria del narratore (compiuto=2 seminato)
  passo(0, { gauges: { ...giri, lapsDone: 2, fuel: 30, flag: 'nessuna' }, delta: { lapNo: 3, dv: 0 }, timing: { lastLap: '2:03.564' } });
  // IL TICK DEL TRAGUARDO: flag a scacchi, contatore NON ancora salito, tempo finale non ancora scritto
  const b = passo(4000, { gauges: { ...giri, lapsDone: 2, fuel: 29.8, flag: 'a scacchi' }, delta: { lapNo: 3, dv: 0 }, timing: { lastLap: '2:03.564' } });
  assert.equal(b.filter((f) => f.chi === 'bandiera' && !f.detto).length, 0, 'croce senza contatore salito: la bandiera non grida subito');
  // IL TICK DOPO (4 s, come in gara): contatore salito + tempo nuovo → «Giro 3 fatto» e POI la bandiera
  const c = passo(8000, { gauges: { ...giri, lapsDone: 3, fuel: 29.5, flag: 'a scacchi' }, delta: { lapNo: 4, dv: 0 }, timing: { lastLap: '1:42.576' } });
  const iG = c.findIndex((f) => f.chi === 'giroFatto' && !f.detto);
  const iB = c.findIndex((f) => f.chi === 'bandiera' && !f.detto);
  assert.ok(iG >= 0, 'il traguardo annuncia il giro fatto');
  assert.ok(iB >= 0 && iB > iG, 'la bandiera esce DOPO il "Giro 3 fatto" (non più prima)');
});

/* 31/10 — IL DELTA DI RITMO TORNA A PARLARE: la semina del bucket portava
   `|| slot.at === 0`, un vicolo cieco che la teneva muta dal 27/10 (i test
   passavano perché usati con dv: 0 fisso, il bucket non cambiava mai e il
   difetto restava invisibile). Gare reali del registro 28-29/10: 394 letture
   dv, ZERO frasi delta. Da qui il repertorio:
   1) la prima lettura si semina in silenzio;
   2) dopo il primo cambio di bucket (oltre i 20 s) parla e nomina i secondi;
   3) minimo 20 s tra i discorsi: un nuovo bucket vicino tace;
   4) al cambio ancora dopo 20 s ridice, senza ripetere l'identico;
   5) fuori scala (|dv| > 90 s — nel registro ±300 s a frame alterni) il HUD
      è in spazzatura: non lo si dice e non tocca la memoria. */
test("il delta di ritmo parla (31/10: la semina a at===0 lo teneva muto dal 27/10)", () => {
  const slot = { last: {}, at: 0, said: {}, firma: 'sess-delta' };
  const passo = (t, dv) => narratore(
    MMF(t, { gauges: { lapsDone: 1, lapsTotal: 3, fuel: 26.0, lapsOnFuel: 8.6, lapsLeft: 2 }, delta: { lapNo: 1, dv } }),
    slot, t,
  ).filter((f) => f.chi === 'delta');
  assert.equal(passo(0, -1200).length, 0, 'la prima lettura si semina senza voce');
  assert.equal(passo(4000, -2400).length, 0, 'prima dei 20 s resta in silenzio');
  const a = passo(21000, -3600);   // cambio bucket + ora > 20 s: finalmente parla
  assert.equal(a.length, 1, 'al primo cambio vero fuori ingresso parla');
  assert.ok(a[0].it.includes('più veloce del best di 3.6'), `frase corretta: ${a[0].it}`);
  assert.equal(passo(23000, -1200).length, 0, 'a 2 s dal discorso precedente torna in silenzio (minimo 20 s)');
  const b = passo(46000, 4400);    // cambia segno e bucket, oltre i 20 s: parla di nuovo
  assert.equal(b.length, 1, 'secondo discorso legittimo');
  assert.ok(b[0].it.includes('più lento del best di 4.4'), `frase lato lento: ${b[0].it}`);
  assert.equal(passo(50000, 300000).length, 0, 'fuori scala: il HUD scrive spazzatura, non lo si dice');
  const c = passo(80000, -2400);   // bucket diverso dall'ultimo pulito (-9) e oltre i 20 s: ridice
  assert.equal(c.length, 1, 'dopo la spazzatura la radio torna sul legittimo');
});
