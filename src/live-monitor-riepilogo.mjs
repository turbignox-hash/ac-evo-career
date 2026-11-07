// live-monitor-riepilogo.mjs — righe del monitor live e riepilogo di fine sessione.
//
// Il monitor (`.live-monitor.mjs`) campiona /api/live ogni 5 s e appende una
// riga per tick. Questo modulo fa due cose, separate dal file system così le
// si possono provare:
//   1. `rigaMonitor(snap)` — la riga compatta che il monitor scrive: giri,
//      tempi e dati di contatto per ruota (quelli che il physics scrive già).
//   2. `riassumiMonitor(righe)` / `formattaRiassunto(s)` — il riepilogo che si
//      produce quando la sessione finisce: giri con i tempi, miglior giro e
//      dati di contatto (carico, sospensioni, deriva, slip ratio, vibrazioni).
//
// Regola di casa: nessun numero inventato. Se un campo non è nel log il
// riepilogo lo dice invece di mostrare uno zero.
//
// (6/11, sessione «area debole»: la catena del riepilogo live costava O(intero
// log) a ogni riga scritta e andava in CRASH oltre ~125.000 campioni, perché
// `Math.max(...array)` spande l'array come argomenti e sfonda lo stack. Ora il
// riepilogo si costruisce riga per riga (`creaAccumulatoreRiepiloghi`) con
// statistiche correnti — minimi, massimi, somme, conteggi — quindi: costo
// proporzionale alle righe NUOVE, memoria fissa (niente array di campioni) e
// nessun limite di stack. `riassumiMonitor` resta la stessa porta d'ingresso e
// restituisce gli stessi numeri: un'unica verità, due modi di alimentarla.

const RUOTE = ['LF', 'RF', 'LR', 'RR'];
const RAD2DEG = 180 / Math.PI;

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const arr4 = (v) => (Array.isArray(v) ? Array.from({ length: 4 }, (_, i) => num(v[i])) : null);
const media = (vals) => {
  const v = vals.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const r = (v, k = 10) => (v == null ? null : Math.round(v * k) / k);

/** Una riga del monitor da uno snapshot di /api/live. */
export function rigaMonitor(snap, at = new Date().toISOString()) {
  const p = snap?.player ?? null;
  const c = p?.contact ?? null;
  return {
    at,
    game: !!snap?.game,
    live: !!snap?.live,
    // IL TIPO DICHIARATO, non il giudizio: la carta lo corregge a fine sessione
    // con `garaDiSessione` (7/11), perché il tipo del blocco STATIC scrive
    // «TimeAttack» anche nelle gare in singolo.
    session: snap?.session?.type ?? null,
    track: snap?.session?.track ?? null,
    // LA DICHIARAZIONE DEL GIOCO (7/11): `session.race` — l'unica parola che
    // dice «gara» dentro lo snapshot (il tipo STATIC scrive «TimeAttack»
    // anche in gara). La carriera la rende affidabile al server quando è lei
    // ad aver preparato la gara (vedi `garaDallaCarriera` in webui.mjs).
    race: snap?.session?.race === true,
    pos: num(p?.position),
    // `lap` resta il giro in corso (com'era prima), `lapsDone` è il contatore
    // che serve al riepilogo per capire quando un giro è stato chiuso.
    lap: num(p?.lapsDone),
    laps: num(p?.lapsTotal),
    lapsDone: num(p?.lapsDone),
    lapMs: num(p?.currentLapMs),
    lastLapMs: num(p?.lastLapMs),
    bestLapMs: num(p?.bestLapMs),
    speed: num(p?.speedKmh),
    gear: num(p?.gear),
    fuel: num(p?.fuel),
    tc: p?.tcActive ?? null,
    abs: p?.absActive ?? null,
    ffb: num(c?.ffb),
    vibRoad: num(c?.vibration?.road),
    vibKerb: num(c?.vibration?.kerb),
    vibSlip: num(c?.vibration?.slip),
    vibAbs: num(c?.vibration?.abs),
    load: arr4(c?.wheelLoadN),
    susp: arr4(c?.suspensionM),
    slipDeg: (() => {
      const a = arr4(c?.slipAngleRad);
      return a ? a.map((v) => (v == null ? null : r(v * RAD2DEG, 100))) : null;
    })(),
    slipRatio: arr4(c?.slipRatio),
    brakeC: arr4(p?.brakeTempC),
  };
}

/** Legge un log JSONL; le righe rotte si saltano, non fanno fallire il riepilogo. */
export function parseLog(testo) {
  return String(testo ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

/* ------------------- statistiche correnti (una serie, senza array) -------------
 * `n` campioni, `somma` per la media, `min`/`max` per gli estremi, `maxAbs` per
 * deriva/slip/vibrazioni (che si riportano in valore assoluto). Tutto O(1) per
 * campione: è questo che toglie di mezzo gli array e lo spread. */
const statVuota = () => ({ n: 0, somma: 0, min: Infinity, max: -Infinity, maxAbs: 0 });

function statAggiungi(s, v) {
  s.n += 1;
  s.somma += v;
  if (v < s.min) s.min = v;
  if (v > s.max) s.max = v;
  const a = v < 0 ? -v : v;
  if (a > s.maxAbs) s.maxAbs = a;
}

const statMedia = (s) => (s.n ? s.somma / s.n : null);
const statMin = (s) => (s.n ? s.min : null);
const statMax = (s) => (s.n ? s.max : null);
const statMaxAbs = (s) => (s.n ? s.maxAbs : null);

/**
 * Riepilogo di un log di monitoraggio: una voce per sessione (una serie
 * continua di righe con `live: true`), con i giri chiusi e i dati di contatto.
 * I tempi dei giri si ricavano dall'incremento di `lapsDone`: al cambio, il
 * `lastLapMs` della riga è il tempo del giro appena chiuso.
 */
export function riassumiMonitor(righe) {
  const linee = (Array.isArray(righe) ? righe : parseLog(righe));
  const acc = creaAccumulatoreRiepiloghi();
  for (const l of linee) acc.aggiungi(l);
  return acc.risultato();
}

/**
 * L'ACCUMULATORE (6/11): le stesse regole di `riassumiMonitor`, ma si può
 * alimentare una riga alla volta e chiedere il risultato quando serve — è così
 * che la rotta `live-riepilogo` legge SOLO le righe nuove del log, senza
 * rileggere e riparsare ore di campioni a ogni scrittura.
 *
 * `risultato()` non consuma niente: la sessione ancora aperta viene riassunta
 * come istantanea (`chiusa: false`) e resta aperta per le righe successive.
 */
export function creaAccumulatoreRiepiloghi() {
  const sessioni = [];
  let cur = null;
  // `chiusa`: la sessione è finita perché il log è tornato non-live, non
  // perché il file è terminato. Serve alla scheda del Cruscotto per sapere
  // quando il monitor ha CHIUSO la sessione (e aggiornarsi da sola).
  const chiudi = (chiusa) => {
    if (!cur) return;
    if (cur.righe > 0) {
      const s = finisciSessione(cur);
      s.chiusa = !!chiusa;
      sessioni.push(s);
    }
    cur = null;
  };
  const aggiungi = (l) => {
    if (l?.live) {
      if (!cur) {
        cur = {
          inizio: l.at ?? null, fine: l.at ?? null, track: l.track ?? null, tipo: l.session ?? null,
          righe: 0, pos: statVuota(), vel: statVuota(), giri: new Map(), bestMs: null, contatto: contattoVuoto(),
          // «È GARA?» a fine sessione (7/11): basta UN campione in cui il gioco
          // (o la carriera) l'ha dichiarata. Nella gara di Donington i campioni
          // con `race: true` sono 2 su 697 e cadono dentro la sessione giusta;
          // nelle prove non ce n'è nessuno, quindi non si inventa una gara.
          garaVista: false,
        };
      }
      cur.fine = l.at ?? cur.fine;
      cur.track = l.track ?? cur.track;
      cur.tipo = l.session ?? cur.tipo;
      cur.righe += 1;
      const pos = num(l.pos);
      if (pos != null) statAggiungi(cur.pos, pos);
      const vel = num(l.speed);
      if (vel != null) statAggiungi(cur.vel, vel);
      if (num(l.bestLapMs) > 0) cur.bestMs = cur.bestMs == null ? num(l.bestLapMs) : Math.min(cur.bestMs, num(l.bestLapMs));
      if (l.race === true) cur.garaVista = true;
      accumulaContatto(cur.contatto, l);
      // un giro è chiuso quando lapsDone sale: `lastLapMs` di quella riga è il
      // suo tempo. ATTENZIONE AL RITARDO DEL GIOCO (7/11, misurato sulla gara di
      // Donington del 6/11): nel tick di passaggio il gioco mostra ancora il
      // tempo del giro PRIMA — lapsDone 1→2 con 118.794 che è il giro 1, e solo
      // qualche tick dopo arriva il 109.371 vero. Prendendo il primo valore si
      // attribuiva lo stesso tempo a due giri (#1 e #2 entrambi 1:58.794).
      // Quindi per il giro N si tiene l'ULTIMO valore visto nello stato
      // lapsDone = N: quando il gioco l'ha aggiornato, quello è il suo.
      const done = num(l.lapsDone);
      if (done != null && done >= 1 && num(l.lastLapMs) > 0) {
        cur.giri.set(done, { giro: done, ms: num(l.lastLapMs) });
      } else if (done != null && done >= 1 && !cur.giri.has(done)) {
        cur.giri.set(done, { giro: done, ms: null });
      }
    } else if (cur) {
      // live torna false (o il gioco si chiude): la sessione è finita
      chiudi(true);
    }
  };
  const risultato = () => {
    // la sessione aperta è un'istantanea: non entra in `sessioni` e non cambia
    // stato, così il prossimo giro può continuare ad aggiungere righe
    const aperta = cur && cur.righe > 0 ? { ...finisciSessione(cur), chiusa: false } : null;
    return aperta ? [...sessioni, aperta] : [...sessioni];
  };
  return { aggiungi, risultato };
}

function contattoVuoto() {
  return {
    righe: 0,
    ruote: RUOTE.map(() => ({
      load: statVuota(), susp: statVuota(), slipDeg: statVuota(), slipRatio: statVuota(), frenoC: statVuota(),
    })),
    vib: { road: statVuota(), kerb: statVuota(), slip: statVuota(), abs: statVuota() },
    ffb: statVuota(),
  };
}

function accumulaContatto(acc, l) {
  const campi = [
    ['load', 'load'], ['susp', 'susp'], ['slipDeg', 'slipDeg'], ['slipRatio', 'slipRatio'], ['brakeC', 'frenoC'],
  ];
  let toccato = false;
  for (const [src, dst] of campi) {
    const a = arr4(l[src]);
    if (!a) continue;
    for (let i = 0; i < 4; i++) if (a[i] != null) { statAggiungi(acc.ruote[i][dst], a[i]); toccato = true; }
  }
  for (const k of ['road', 'kerb', 'slip', 'abs']) {
    const v = num(l[k === 'road' ? 'vibRoad' : k === 'kerb' ? 'vibKerb' : k === 'slip' ? 'vibSlip' : 'vibAbs']);
    if (v != null) { statAggiungi(acc.vib[k], v); toccato = true; }
  }
  const ffb = num(l.ffb);
  if (ffb != null) { statAggiungi(acc.ffb, ffb); toccato = true; }
  // righe di log vecchie, senza nessun campo di contatto, non contano come campioni
  if (toccato) acc.righe += 1;
}

function finisciSessione(s) {
  const giri = [...s.giri.values()].sort((a, b) => a.giro - b.giro);
  const tempi = giri.map((g) => g.ms).filter((v) => v != null && v > 0);
  const contatto = s.contatto;
  const perRuota = RUOTE.map((w, i) => {
    const c = contatto.ruote[i];
    const load = statMedia(c.load);
    const susp = statMin(c.susp);
    const suspMedia = statMedia(c.susp);
    return {
      ruota: w,
      caricoMaxN: statMax(c.load),
      caricoMedioN: r(load, 1),
      suspMinMm: susp == null ? null : r(susp * 1000, 1),
      suspMediaMm: suspMedia == null ? null : r(suspMedia * 1000, 1),
      derivaMaxDeg: r(statMaxAbs(c.slipDeg), 10),
      slipMaxAbs: r(statMaxAbs(c.slipRatio), 1000),
      frenoMaxC: c.frenoC.n ? Math.round(c.frenoC.max) : null,
      campioni: c.slipDeg.n || c.load.n || 0,
    };
  });
  const vib = {};
  for (const k of ['road', 'kerb', 'slip', 'abs']) {
    const v = contatto.vib[k];
    vib[k] = v.n ? { medio: r(statMedia(v), 1000), massimo: r(v.maxAbs, 1000) } : null;
  }
  const posMin = statMin(s.pos);
  const posMax = statMax(s.pos);
  // «GARA» (7/11): il tipo dichiarato mente («TimeAttack» anche in gara), quindi
  // vale la dichiarazione vista nei campioni della sessione — il gioco quando la
  // riconosce, la carriera quando è lei ad aver preparato la gara.
  const gara = s.tipo === 'Race' || s.garaVista === true;
  return {
    track: s.track,
    tipo: gara ? 'Race' : s.tipo,
    inizio: s.inizio,
    fine: s.fine,
    durataMin: (s.inizio && s.fine) ? Math.round((Date.parse(s.fine) - Date.parse(s.inizio)) / 6000) / 10 : null,
    righe: s.righe,
    giriFatti: giri.length,
    giri: giri.map((g) => ({ giro: g.giro, ms: g.ms })),
    giriConTempo: tempi.length,
    miglioreMs: tempi.length ? Math.min(...tempi) : s.bestMs,
    mediaMs: tempi.length ? Math.round(media(tempi)) : null,
    posizione: s.pos.n ? { migliore: posMin, peggiore: posMax } : null,
    velocitaMax: s.vel.n ? Math.round(s.vel.max) : null,
    contatto: {
      campioni: contatto.righe,
      ruote: perRuota,
      vibrazioni: vib,
      ffb: contatto.ffb.n ? { minimo: r(contatto.ffb.min, 1000), massimo: r(contatto.ffb.max, 1000) } : null,
    },
  };
}

/**
 * Le ultime `ultime` sessioni (default 5) in forma leggibile, in ordine
 * cronologico — l'ultima in fondo, pronta per la scheda del Cruscotto — più il
 * testo unico da copiare. `totale` dice quante sessioni ha visto il log, non
 * quante se ne mostrano.
 */
/**
 * IL TESTO DI UNA SESSIONE CHIUSA SI COMPONE UNA VOLTA SOLA (6/11).
 *
 * `riepiloghiDa` componeva il testo di TUTTE le sessioni mostrate a ogni poll:
 * cambiava una riga nel log e si riformattavano anche le sessioni di ieri, che
 * per definizione non possono più cambiare. Le sessioni chiuse sono oggetti
 * stabili (l'accumulatore le mette in `sessioni` una volta, alla chiusura),
 * quindi il testo si aggancia all'oggetto in una WeakMap: nessun campo in più
 * nel payload, nessun riferimento tenuto vivo quando la sessione esce dalla
 * finestra. La sessione APERTA non si memorizza: cresce a ogni riga, e lì
 * rifare il conto è il conto giusto.
 */
const TESTO_SESSIONE = new WeakMap();

function testoDi(s) {
  const gia = s && TESTO_SESSIONE.get(s);
  if (gia != null) return gia;
  const t = formattaRiassunto(s);
  // solo le chiuse: la loro immagine non cambierà più
  if (s?.chiusa === true) TESTO_SESSIONE.set(s, t);
  return t;
}

export function riepiloghiDa(tutte, { ultime = 5 } = {}) {
  const lista = Array.isArray(tutte) ? tutte : [];
  const n = Math.max(0, Math.floor(Number(ultime) || 0));
  const scelte = n > 0 ? lista.slice(-n) : lista;
  const testi = scelte.map(testoDi);
  return {
    totale: lista.length,
    sessioni: scelte.map((s, i) => ({ ...s, testo: testi[i] })),
    // il testo unico è la giunzione dei testi già composti: una sessione, un
    // blocco — identico a `formattaRiassunto(scelte)`, senza rifare il lavoro
    testo: lista.length ? testi.join('\n') : null,
  };
}

/**
 * LA RIGA DI UNA REGISTRAZIONE (7/11). `tools/registra-live.mjs` scrive
 * `data/live-<ora>.ndjson` con i record `{ t, ts, snapshot }`: lo snapshot è
 * quello di /api/live, cioè lo STESSO ingresso del monitor. Quindi la riga si
 * ricava con `rigaMonitor` e non esiste un secondo modo di leggere i dati.
 * Un record senza snapshot (fetch fallita a monte) torna null: chi legge lo
 * salta invece di far finta che sia una riga non-live.
 */
export function rigaDaRegistrazione(o) {
  return o?.snapshot ? rigaMonitor(o.snapshot, o.t ?? null) : null;
}

/**
 * UNA SOLA LISTA DA PIÙ FONTI (7/11): il log del monitor e le registrazioni
 * possono raccontare la stessa sessione (due registratori accesi insieme) o
 * sessioni diverse (una gara registrata solo dal registratore non entra nel
 * log del monitor). Qui si tolgono i doppioni — stessa pista e stesso tipo con
 * l'inizio entro 2 minuti, resta quella con più campioni — e si ordina per
 * fine, così «l'ultima» è davvero l'ultima.
 */
export function unisciSessioni(...liste) {
  const ms = (v) => { const t = Date.parse(v ?? ''); return Number.isFinite(t) ? t : 0; };
  const tenute = [];
  for (const s of liste.flat()) {
    if (!s || !s.inizio) continue;
    const i = tenute.findIndex((k) => k.tipo === s.tipo && k.track === s.track
      && Math.abs(ms(k.inizio) - ms(s.inizio)) < 120_000);
    if (i < 0) tenute.push(s);
    else if ((s.righe ?? 0) > (tenute[i].righe ?? 0)) tenute[i] = s;
  }
  return tenute.sort((a, b) => ms(a.fine ?? a.inizio) - ms(b.fine ?? b.inizio));
}

/** I riepiloghi leggibili di un log (righe o testo): porta d'ingresso storica. */
export function riepiloghiMonitor(righe, opts = {}) {
  return riepiloghiDa(riassumiMonitor(righe), opts);
}

/** Tempo giro leggibile: 1:23.456 */
export function fmtGiro(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const m = Math.floor(ms / 60000);
  const s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

const num2 = (v, d = 1) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(d));

/** Riepilogo leggibile, da stampare a fine sessione o chiedere con --riassumi. */
export function formattaRiassunto(sessioni) {
  const lista = Array.isArray(sessioni) ? sessioni : [sessioni];
  if (!lista.length) return 'Nessuna sessione con dati live nel log: niente da riepilogare.';
  const out = [];
  for (const s of lista) {
    out.push(`Sessione ${s.tipo ?? '?'} · ${s.track ?? 'pista n/d'} · ${s.inizio ?? '?'} → ${s.fine ?? '?'}${s.durataMin != null ? ` (${num2(s.durataMin, 1)} min)` : ''}`);
    out.push(`  ${s.righe} campioni · ${s.giriFatti} giri chiusi${s.giriConTempo ? ` · miglior giro ${fmtGiro(s.miglioreMs)} · media ${fmtGiro(s.mediaMs)}` : ''}`);
    if (s.giriConTempo) {
      out.push(`  Giri: ${s.giri.map((g) => `#${g.giro} ${fmtGiro(g.ms)}`).join(' · ')}`);
    } else {
      out.push('  Giri: il log non contiene tempi di giro (lastLapMs assente), solo il conteggio.');
    }
    if (!s.contatto.campioni) {
      out.push('  Contatto: nessun dato nel log.');
      continue;
    }
    out.push(`  Contatto (${s.contatto.campioni} campioni):`);
    for (const w of s.contatto.ruote) {
      out.push(`    ${w.ruota}: carico max ${num2(w.caricoMaxN, 0)} N (medio ${num2(w.caricoMedioN, 0)}) · sosp. min ${num2(w.suspMinMm)} mm · deriva max ${num2(w.derivaMaxDeg)}° · slip max ${num2(w.slipMaxAbs, 3)} · freno max ${w.frenoMaxC == null ? '—' : w.frenoMaxC + ' °C'}`);
    }
    const v = s.contatto.vibrazioni;
    out.push(`    vibrazioni: strada ${num2(v.road?.medio, 3)} · cordolo ${num2(v.kerb?.medio, 3)} · slittamento ${num2(v.slip?.medio, 3)} · ABS ${num2(v.abs?.medio, 3)} · FFB ${num2(s.contatto.ffb?.minimo, 3)}…${num2(s.contatto.ffb?.massimo, 3)}`);
  }
  return out.join('\n');
}
