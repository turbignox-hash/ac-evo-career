// analisi.mjs — i cinque strumenti di ANALISI del pilota (23/10/2026, richiesta
// «cosa faresti se fossi un gamer di sim», senza la benzina per giro):
//
//   1) raceAutopsy    — l'AUTOPSIA della gara: il deficit scomposto in cause
//                       attribuite (partenza, ritmo secco, settori, distanza),
//                       con i numeri presi dal save carriera + registro rivali.
//   2) rivalDossier   — lo scouting da paddock di un rivale: ritmo relativo
//                       (best-lap contro te, media e per pista), tendenza nel
//                       tempo, consistenza di piazzamento, piste deboli/forti.
//   3) setupAB        — il BANCO A/B dei setup: confronto fra due sessioni
//                       MoTeC (presupuesto: preset diversi = assetto diverso),
//                       col diff dei canali chiave e il tempo perso/guadagnato
//                       sul giro best ripartito per ZONA (in frenata / in
//                       uscita / a gas) — non solo il delta: il perché.
//   4) seatMonteCarlo — la SIM del sedile: per ogni offerta di fine stagione
//                       (o serie aperta) Monte Carlo con lo STESSO motore dei
//                       rivali di world.mjs: punti attesi a ronda, podio%,
//                       titolo%, premio atteso e saldo con costi.
//   5) tettoReport    — il TETTO: per ogni pista il giro teorico dai tuoi
//                       settori contro il best reale (il margine lasciato per
//                       strada) e i REPARTI dove perdi più spesso col campo.
//
// Nessun dato nuovo da digitare: tutto dai file che EVO e il tool già scrivono.

import { lapToMs } from './results.mjs';
import { gridFor, pointsFor, ourToSkill, hash32, rng } from './world.mjs';
import { rivalsStore } from './rivals.mjs';
import { analyzeLd, sampleLap, sessionMetaOf } from './motec.mjs';
import { prizeFor, entryFee, difficultyFor, nodeById, gateStatus } from './state.mjs';
import { tr, lang } from './lang.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const median = (vals) => {
  const v = (vals ?? []).filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
};
const stdev = (vals) => {
  const v = (vals ?? []).filter(Number.isFinite);
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1));
};
const avg = (vals) => {
  const v = (vals ?? []).filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const fmtSec = (s, sign = true) => (Number.isFinite(s)
  ? `${s > 0 && sign ? '+' : ''}${s.toFixed(2).replace('.', lang() === 'en' ? '.' : ',')}s`
  : '—');
const fmtLap = (ms) => (Number.isFinite(ms) && ms > 0)
  ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(Math.round(ms % 1000)).padStart(3, '0')}`
  : '—';
/* ordinale inglese per rank: 1→1st, 2→2nd, 13→13th, 21→21st… */
const ordEn = (n) => { const v = Number(n) % 100; if (v >= 11 && v <= 13) return `${n}th`; return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[v % 10] ?? 'th'}`; };

/* ================================================================== */
/* 1) AUTOPSIA DELLA GARA                                              */
/* ================================================================== */

/**
 * L'ultima gara della serie (o della serie indicata) scomposta in CAUSE:
 * partenza/remonta, ritmo secco (best-lap nella gerarchia di griglia),
 * settori persi (dal sectorAnalysis incassato dall'import), distanza
 * (gap per giro + giri inmeno del leader). Attributions = voci con i
 * numeri; narrative = il racconto in ordine.
 */
export function raceAutopsy(ladder, state, { nodeId = state.node } = {}) {
  const list = state.results?.[nodeId] ?? [];
  if (!list.length) return null;
  const entry = [...list].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))[0];
  const node = (() => { try { return nodeById(ladder, nodeId); } catch { return null; } })();
  const attributions = [];
  const push = (title, text, kind = 'info') => attributions.push({ title, text, kind });

  // materia prima dal registro rivali: l'intera griglia di QUESTA gara
  const raceRow = rivalsStore().races
    .find((r) => r.nodeId === nodeId && r.season === entry.season && r.round === entry.round) ?? null;
  const others = (raceRow?.grid ?? []).filter((g) => !g.isPlayer && !g.dnf && Number.isFinite(lapToMs(g.bestLap)));
  const fieldBestMs = others.length ? Math.min(...others.map((g) => lapToMs(g.bestLap))) : null;
  const myMs = Number.isFinite(lapToMs(entry.bestLap)) ? lapToMs(entry.bestLap) : null;

  // — PARTENZA E PRIMO GIRO (dalla qualifica abbinata incassata dall'import)
  if (!entry.dnf && entry.gridPosition != null) {
    const recovery = entry.position - entry.gridPosition;
    push(tr({ it: 'Partenza e primo giro', en: 'Start and lap 1' }), tr({
      it: `P${entry.gridPosition} in griglia → ${entry.position === 1 ? 'vincitore' : `P${entry.position}`} all'arrivo: ${recovery >= 0 ? `guadagnate ${recovery} posizioni` : `perse ${Math.abs(recovery)} posizioni`} sul tracciato.`,
      en: `P${entry.gridPosition} on the grid → ${entry.position === 1 ? 'race winner' : `P${entry.position}`} at the flag: ${recovery >= 0 ? `gained ${recovery} positions` : `lost ${Math.abs(recovery)} positions`} on track.`,
    }), recovery >= 0 ? 'good' : 'info');
  }

  // — RITMO SECCO: dove sta il tuo giro migliore rispetto a tutti
  if (myMs != null && fieldBestMs != null) {
    const rank = 1 + others.filter((g) => lapToMs(g.bestLap) < myMs).length;
    const delta = (myMs - fieldBestMs) / 1000;
    push(tr({ it: 'Ritmo secco', en: 'Raw pace' }), tr({
      it: `Miglior giro ${fmtLap(myMs)} — ${rank}° della griglia, ${fmtSec(delta, false)} dal giro del campo-top (${fmtLap(fieldBestMs)}).`,
      en: `Best lap ${fmtLap(myMs)} — ${ordEn(rank)} of the grid, ${fmtSec(delta, false)} off the field's fastest (${fmtLap(fieldBestMs)}).`,
    }), delta <= 0.4 ? 'good' : delta > 1.5 ? 'bad' : 'info');
  } else if (!raceRow) {
    push(tr({ it: 'Ritmo secco', en: 'Raw pace' }), tr({
      it: 'Griglia di questa gara non in archivio (registro incompleto o import a mano): il confronto sul giro può partire solo dalle gare importate con il file risultato.',
      en: 'This race is not in the rivals archive (incomplete log or manual import): lap comparison only works for imports with the raw result file.',
    }), 'info');
  }

  // — SETTORI: da entry.sectors (sectorAnalysis anche persistito nel save)
  const sect = entry.sectors?.sectors ?? [];
  if (sect.length) {
    const lossi = sect.filter((s) => Number.isFinite(s.deltaMs) && s.deltaMs > 0).sort((a, b) => b.deltaMs - a.deltaMs);
    const worst = lossi.length
      ? lossi.slice(0, 3).map((s) => `S${s.index} ${fmtSec(s.deltaMs / 1000, false).replace('+', '+')}`).join(' · ')
      : tr({ it: 'nessun settore perso in valore', en: 'no sector lost in value' });
    const gainMs = (Number.isFinite(entry.sectors?.bestLapMs) && Number.isFinite(entry.sectors?.theoreticalMs))
      ? Math.round(entry.sectors.bestLapMs - entry.sectors.theoreticalMs) : null;
    push(tr({ it: 'Settori', en: 'Sectors' }), tr({
      it: `Perdita per settore (sul best del campo): ${worst}.${gainMs != null && gainMs > 0 ? ` Lasci ${fmtSec(gainMs / 1000, false)} per strada rispetto al tuo giro teorico (la somma dei tuoi settoriali).` : ''}`,
      en: `Sector losses (vs field best): ${worst}.${gainMs != null && gainMs > 0 ? ` You leave ${fmtSec(gainMs / 1000, false)} against your theoretical lap (sum of your best sectors).` : ''}`,
    }), 'info');
  }

  // — DISTANZA: gap al vincitore per giro + giri in meno del leader
  if (entry.dnf && Number(entry.winnerLaps ?? 0) > 0) {
    push(tr({ it: 'Ritiro', en: 'Retirement' }), tr({
      it: `Ritiro al giro ${entry.laps ?? '?'} (il leader ne aveva completati ${entry.winnerLaps}). Nessun premio e la classifica resta in mano ai rivali.`,
      en: `Retired on lap ${entry.laps ?? '?'} (the leader had completed ${entry.winnerLaps}). No prize and the standings stay with the rivals.`,
    }), 'bad');
  } else if (Number.isFinite(entry.gapMs) && entry.gapMs != null && Number(entry.laps ?? 0) > 0) {
    const perLap = entry.gapMs / Math.max(1, entry.laps);
    const shortLaps = Number(entry.winnerLaps ?? 0) > entry.laps ? tr({
      it: ` Ti sei fermato ${entry.winnerLaps - entry.laps} giro(i) prima del leader: tempo in sosta o difficoltà telematiche escluse, l'età della gara fa il resto.`,
      en: ` You stopped ${entry.winnerLaps - entry.laps} lap(s) earlier than the leader.`,
    }) : '';
    push(tr({ it: 'Distanza', en: 'Distance' }), tr({
      it: `Gap ${fmtSec(entry.gapMs / 1000, false)} su ${entry.laps} giri: ~${fmtSec(perLap / 1000, false)} al giro da ridare al vincitore.${shortLaps}`,
      en: `Margin ${fmtSec(entry.gapMs / 1000, false)} over ${entry.laps} laps: ~${fmtSec(perLap / 1000, false)} per lap owed to the winner.${shortLaps}`,
    }), perLap / 1000 > 2 ? 'bad' : 'info');
  }

  // riconoscimenti rapidi
  if (entry.fl && !entry.dnf) push(tr({ it: 'Bonus', en: 'Bonus' }), tr({ it: `Giro veloce della gara: ${entry.bestLap}.`, en: `Fastest lap of the race: ${entry.bestLap}.` }), 'good');
  if (entry.pole && !entry.dnf) push(tr({ it: 'Bonus', en: 'Bonus' }), tr({ it: 'Pole position: firmata in qualifica.', en: 'Pole position: set in qualifying.' }), 'good');

  const headline = entry.dnf
    ? tr({ it: 'Gara abbandonata: ecco cosa è successo, punto per punto.', en: 'Race handed in: here is what happened, point by point.' })
    : entry.position === 1
      ? tr({ it: `Vittoria con +${entry.points ?? 0} punti — ecco COME è arrivata:`, en: `WIN with +${entry.points ?? 0} points — here is HOW it came:` })
      : tr({ it: `P${entry.position} su ${entry.gridSize} · +${entry.points ?? 0} punti — ecco dove è stata persa:`, en: `P${entry.position} of ${entry.gridSize} · +${entry.points ?? 0} points — here is where it was lost:` });

  return {
    ok: true,
    node: node?.display ?? nodeId,
    season: entry.season, round: entry.round,
    entry: {
      position: entry.dnf ? null : entry.position, gridSize: entry.gridSize, dnf: !!entry.dnf,
      laps: entry.laps ?? null, bestLap: entry.bestLap ?? null, gapMs: entry.gapMs ?? null,
      points: entry.points ?? 0, car: entry.car ?? null, fl: !!entry.fl,
      gridPosition: entry.gridPosition ?? null, at: entry.at ?? null,
    },
    hasRaceRow: !!raceRow,
    attributions,
    narrative: [headline, ...attributions.map((a) => a.text)],
  };
}

/* ================================================================== */
/* 2) DOSSIER DEL RIVALE                                               */
/* ================================================================== */

/**
 * Lo scouting di un rivale: oltre a chi è e come è andata, il RITMO —
 * i suoi best-lap contro i tuoi (mediana), l'evoluzione (si avvicina o si
 * stacca), la CONSISTENZA (sdev dei piazzamenti, DNF%) e le piste deboli
 * (dove girare più piiano di te) e le sue piste forti (dove ti prende).
 */
export function rivalDossier(key) {
  const store = rivalsStore();
  const rv = store.rivals[key];
  if (!rv) return null;
  const races = store.races.filter((r) => r.grid.some((g) => g.key === key));

  const meetings = races.map((race) => {
    const g = race.grid.find((x) => x.key === key);
    const me = race.grid.find((x) => x.isPlayer);
    const hisMs = Number.isFinite(lapToMs(g.bestLap)) ? lapToMs(g.bestLap) : null;
    const myMs = Number.isFinite(lapToMs(me?.bestLap)) ? lapToMs(me.bestLap) : null;
    const myPos = me ? (me.dnf ? null : me.position) : null;
    const hisPos = g.dnf ? null : g.position;
    return {
      at: race.at, season: race.season, round: race.round,
      node: race.nodeDisplay ?? race.nodeId, track: race.trackDisplay ?? race.track,
      trackKey: race.track, pos: hisPos, dnf: g.dnf, car: g.car ?? null,
      hisBestLap: g.bestLap ?? null, myBestLap: me?.bestLap ?? null,
      himVsMeMs: hisMs != null && myMs != null ? hisMs - myMs : null, // >0 = lui più lento
      beatMe: myPos == null || hisPos == null ? false : hisPos < myPos,
    };
  }).sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const deltas = meetings.map((m) => m.himVsMeMs).filter(Number.isFinite);
  const baseDeltaMs = median(deltas);
  // evoluzione: metà più vecchia vs metà più recente delle gare (per tempo)
  const byTime = [...meetings].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const half = Math.max(1, Math.floor(byTime.length / 2));
  const firstHalf = byTime.slice(0, half).map((m) => m.himVsMeMs).filter(Number.isFinite);
  const secondHalf = byTime.length >= 2 ? byTime.slice(half).map((m) => m.himVsMeMs).filter(Number.isFinite) : [];
  const newer = avg(secondHalf), older = avg(firstHalf);
  const closeDelta = newer != null && older != null ? older - newer : null; // >0 = si avvicina

  // per pista: mediana dei delta su quella pista
  const byTrack = new Map();
  for (const m of meetings) {
    if (!Number.isFinite(m.himVsMeMs)) continue;
    const t = byTrack.get(m.trackKey) ?? { track: m.track, deltas: [] };
    t.deltas.push(m.himVsMeMs);
    byTrack.set(m.trackKey, t);
  }
  const perTrack = [...byTrack.values()]
    .map((t) => ({ track: t.track, n: t.deltas.length, deltaMs: median(t.deltas) }))
    .sort((a, b) => b.deltaMs - a.deltaMs);

  const posizioni = meetings.filter((m) => m.pos != null).map((m) => m.pos);
  const posMean = avg(posizioni);
  const posSd = stdev(posizioni);
  const dnfRate = meetings.length ? meetings.filter((m) => m.dnf).length / meetings.length : null;

  const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  return {
    key, name: rv.full, team: rv.team ?? null, nation: rv.nation ?? null, car: rv.car ?? null,
    since: (rv.since ?? '').slice(0, 10),
    meetingsCount: meetings.length,
    totals: { ...rv.totals },
    h2h: { ...rv.h2h },
    pace: {
      samples: deltas.length,
      himVsMeSec: baseDeltaMs != null ? baseDeltaMs / 1000 : null,
      verdict: baseDeltaMs == null ? null : baseDeltaMs > 0
        ? tr({ it: `in media ${fmtSec(baseDeltaMs / 1000, false)} PIÙ LENTO di te sul giro (suo giro − il tuo)`, en: `on average ${fmtSec(baseDeltaMs / 1000, false)} SLOWER than you per lap (his lap − yours)` })
        : tr({ it: `in media ${fmtSec(baseDeltaMs / 1000)} PIÙ VELOCE di te sul giro — tempo da ritrovare in cabina`, en: `on average ${fmtSec(baseDeltaMs / 1000)} FASTER than you per lap — time to find in the cockpit` }),
      closeTrendSec: closeDelta != null ? closeDelta / 1000 : null,
      closeTrendText: closeDelta == null ? null
        : closeDelta > 0.05 ? tr({ it: 'si sta avvicinando: nelle gare recenti gira più vicino al tuo ritmo', en: 'closing in: running closer to your pace in recent races' })
        : closeDelta < -0.05 ? tr({ it: 'si sta staccando: nelle gare recenti perde di più del solito', en: 'falling away: losing more than usual in recent races' })
        : tr({ it: 'ritmo stabile nel tempo', en: 'pace stable over time' }),
    },
    perTrack,
    weakTracks: perTrack.filter((t) => t.deltaMs > 0).slice(0, 3),
    hisTracks: perTrack.filter((t) => t.deltaMs < 0).slice(-3).reverse(),
    consistency: {
      meanPos: posMean != null ? r1(posMean) : null,
      posSd: posSd != null ? Math.round(posSd * 100) / 100 : null,
      verdict: posSd == null ? null
        : posSd < 1.5 ? tr({ it: 'costante: i suoi piazzamenti oscillano poco — va battuto sul ritmo', en: 'consistent: finishes vary little — beat him on pace' })
        : posSd > 4 ? tr({ it: 'altalenante: serate sopra e serate sotto — il calendario decide la faida', en: 'hot and cold: alternates front and back runs — the calendar decides the feud' })
        : tr({ it: 'trattabile: un round perso si recupera nel round dopo', en: 'manageable: one lost round can be recovered in the next' }),
      dnfRate: dnfRate != null ? Math.round(dnfRate * 100) : null,
    },
    meetings,
  };
}

/* ================================================================== */
/* 3) BANCO A/B DEI SETUP                                              */
/* ================================================================== */

/**
 * Confronto fra DUE sessioni MoTeC (fileA = base, fileB = prova): il diff dei
 * canali chiave (pressioni, camber a effetto, bumpstop, assistenze, benzina)
 * e — la parte scientifica — il tempo perso/guadagnato sul giro best col
 * giro best, allineato su FRAZIONE di distanza e ripartito per zona di guida:
 * in frenata (freno spinto) · in uscita (gas parziale/niente) · a gas pieno.
 * Nessuna scrittura: pura misurazione.
 */
export function setupAB(fileA, fileB, { points = 240 } = {}) {
  const a = analyzeLd(fileA), b = analyzeLd(fileB);
  if (!a || !b) return { ok: false, error: tr({ it: 'Uno dei due file MoTeC non è leggibile (o è vuoto).', en: 'One of the two MoTeC files is unreadable (or empty).' }) };
  const A = sampleLap(fileA, 'best', points), B = sampleLap(fileB, 'best', points);
  if (!A || !B) return { ok: false, error: tr({ it: 'Nessun giro valido da confrontare in uno dei due file.', en: 'No valid lap to compare in one of the files.' }) };

  const num = (v) => (Number.isFinite(v) ? v : null);
  const row = (k, va, vb, { fixed = 1 } = {}) => {
    const v = (x) => (num(x) != null ? Math.round(x * 10 ** fixed) / 10 ** fixed : null);
    const d = num(va) != null && num(vb) != null ? Math.round((num(vb) - num(va)) * 100) / 100 : null;
    return { k, a: v(va), b: v(vb), delta: d, fixed };
  };
  const rows = [
    row(tr({ it: 'giro migliore (s)', en: 'best lap (s)' }), A.bestLapSec, B.bestLapSec, { fixed: 2 }),
    row(tr({ it: 'benzina per giro (l)', en: 'fuel per lap (l)' }), a.fuelPerLap, b.fuelPerLap, { fixed: 2 }),
    row(tr({ it: 'psi a freddo LF', en: 'cold psi LF' }), a.coldPressures?.LF, b.coldPressures?.LF),
    row(tr({ it: 'psi a caldo LF', en: 'hot psi LF' }), a.lastPressures?.LF, b.lastPressures?.LF),
    row(tr({ it: 'camber a effetto LF (L−R °C)', en: 'effective camber LF (L−R °C)' }), a.camberProxy?.LF, b.camberProxy?.LF),
    row(tr({ it: 'bumpstop LF %', en: 'bumpstop LF %' }), a.bump?.LF?.contactPct, b.bump?.LF?.contactPct),
    row(tr({ it: 'sospensione media LF', en: 'susp mean LF' }), a.sus?.LF?.mean, b.sus?.LF?.mean),
    row(tr({ it: 'TC attiva %', en: 'TC on %' }), a.assist?.tcPct, b.assist?.tcPct),
    row(tr({ it: 'ABS attiva %', en: 'ABS on %' }), a.assist?.absPct, b.assist?.absPct),
    row(tr({ it: 'slittamento trazione %', en: 'traction slip %' }), a.assist?.slipRearPct, b.assist?.slipRearPct),
  ];

  // — tempo perso/guadagnato per ZONA
  const dz = { frenata: 0, uscita: 0, gas: 0 };
  let lost = 0, gained = 0;
  for (let i = 1; i < A.pts.length; i++) {
    const ds = (A.xs[i] - A.xs[i - 1]) * A.distKm; // km su quella fettina
    const vA = A.pts[i].v, vB = B.vs[i];
    if (!(vA > 1 && vB > 1) || ds <= 0) continue;
    const dt = ds * 3600 * (1 / vA - 1 / vB); // secondi
    const p = A.pts[i];
    const zone = (p.br != null && p.br > 0.25) ? 'frenata' : (p.th != null && p.th < 0.92) ? 'uscita' : 'gas';
    if (dt > 0) { dz[zone] += dt; lost += dt; } else if (dt < 0) gained -= dt;
  }
  const zones = { frenata: Math.round(dz.frenata * 100) / 100, uscita: Math.round(dz.uscita * 100) / 100, gas: Math.round(dz.gas * 100) / 100 };
  const netS = Math.round((lost - gained) * 100) / 100;
  const biggest = Object.entries(zones).sort((x, y) => y[1] - x[1])[0];
  const where = biggest[1] > 0
    ? (biggest[0] === 'frenata' ? tr({ it: 'IN FRENATA', en: 'ON THE BRAKES' })
      : biggest[0] === 'uscita' ? tr({ it: 'IN USCITA (applicazione gas dopo la curva)', en: 'ON THE EXITS (throttle application)' })
      : tr({ it: 'A GAS PIENO (limite trazione/aero)', en: 'AT FULL THROTTLE (traction/aero limit)' }))
    : tr({ it: 'niente dominante: il lap va e issa in varie zone', en: 'nothing dominant: the lap is even all around' });

  const metaA = sessionMetaOf(String(fileA).split(/[/\\]/).pop());
  const metaB = sessionMetaOf(String(fileB).split(/[/\\]/).pop());
  const deltaBest = A.bestLapSec != null && B.bestLapSec != null ? Math.round((A.bestLapSec - B.bestLapSec) * 100) / 100 : null;
  const zonesText = tr({
    it: `Netto col giro-best: ${netS === 0 ? 'pari' : netS > 0 ? `+${netS.toFixed(2)}s perso da A` : `−${Math.abs(netS).toFixed(2)}s guadagnati da A`}. Il tempo perso si concentra ${where}: ${zones.frenata.toFixed(2)}s in frenata · ${zones.uscita.toFixed(2)}s in uscita · ${zones.gas.toFixed(2)}s a gas.`,
    en: `Net on best laps: ${netS === 0 ? 'even' : netS > 0 ? `+${netS.toFixed(2)}s lost by A` : `−${Math.abs(netS).toFixed(2)}s gained by A`}. Lost time concentrates ${where}: ${zones.frenata.toFixed(2)}s braking · ${zones.uscita.toFixed(2)}s exits · ${zones.gas.toFixed(2)}s throttle.`,
  });

  return {
    ok: true,
    A: { file: A.file ?? String(fileA), preset: metaA.preset ?? null, bestLapSec: A.bestLapSec, laps: a.validLaps, fuelPerLap: a.fuelPerLap, cold: a.coldPressures, hot: a.lastPressures, camberProxy: a.camberProxy, assist: a.assist },
    B: { file: B.file ?? String(fileB), preset: metaB.preset ?? null, bestLapSec: B.bestLapSec, laps: b.validLaps, fuelPerLap: b.fuelPerLap, cold: b.coldPressures, hot: b.lastPressures, camberProxy: b.camberProxy, assist: b.assist },
    rows,
    lostS: Math.round(lost * 100) / 100, gainedS: Math.round(gained * 100) / 100,
    zones, deltaBest, zonesText,
  };
}

/* ================================================================== */
/* 4) MONTE CARLO DEL SEDILE                                           */
/* ================================================================== */

const bandCenter = (node) => (node.ai[0] + node.ai[1]) / 2;

/**
 * La scelta del sedile con i numeri. Per ogni offerta (state.offers, oppure le
 * serie aperte con gate superato + rinnovo) simula stagioni complete con lo
 * STESSO motore dei rivali di world.mjs (rumore, DNF, offset di pista). Te sei
 * un sedile in più proiettato:
 *   - PACE: centro banda della serie candidata + il tuo scostamento in uso
 *     (base+trim della serie corrente rispetto al suo centro — offClass/offTrack
 *     restano fuori, si dichiarano nel pannello);
 *   - VARIABILITÀ: la sdev dei risultati veri (frazione di posizione), clamp alla
 *     banda umana; il rumore usa la stessa forma funzionale dei rivali;
 *   - DNF%: il tuo tasso reale dei file importati (minimo 4 gare di base).
 * Aggregati per sedile: punti attesi a ronda e a stagione, mediana di posto,
 * podio%, vittoria%, titolo% (chiud mondo dei rivali simulato), premio atteso
 * e saldo stagione con affitto + quote d'iscrizione.
 */
export function seatMonteCarlo(ladder, state, { sims = 400 } = {}) {
  sims = Math.floor(clamp(Number(sims) || 400, 50, 1000));
  const cur = (() => { try { return nodeById(ladder, state.node); } catch { return null; } })();
  if (!cur) return { ok: false, error: tr({ it: 'Serie corrente non nota.', en: 'Current series unknown.' }) };
  const curDiff = difficultyFor(ladder, state, cur);
  const paceOffset = (curDiff.base - bandCenter(cur)) + curDiff.trim;

  // il profilo REALE del pilota dai risultati importati
  const fracs = []; let dnfN = 0, raceN = 0;
  for (const list of Object.values(state.results ?? {})) for (const r of list) {
    const gs = Number(r.gridSize) || 0, pos = Number(r.position) || 0;
    if (!pos || pos < 1) continue;
    raceN++;
    if (r.dnf) { dnfN++; continue; }
    if (gs > 1) fracs.push((pos - 1) / (gs - 1));
  }
  const sdFrac = stdev(fracs);
  const playerAmp = clamp((sdFrac ?? 0.18) * 0.35, 0.02, 0.10); // swing del pilota in skill (stessa scala rivali)
  const myDnfRate = raceN >= 4 ? clamp(dnfN / raceN, 0.005, 0.35) : 0.02;

  // i candidati: le offerte di fine stagione se ci sono, altrimenti le serie
  // aperte con gate superato (+ rinnovo), stessa regola di buildOffers
  let candidates;
  if (Array.isArray(state.offers) && state.offers.length) {
    candidates = state.offers;
  } else {
    candidates = ladder.nodes
      .filter((n) => n.nodeId !== cur.nodeId)
      .filter((n) => (gateStatus(ladder, state, n) ?? { ok: false }).ok)
      .filter((n) => n.level >= cur.level - 1)
      .sort((a, b) => b.level - a.level || a.display.localeCompare(b.display))
      .slice(0, 5)
      .map((n) => ({ nodeId: n.nodeId, display: n.display, note: 'aperte' }));
    candidates.push({ nodeId: cur.nodeId, display: cur.display, note: 'rinnovo' });
  }

  const seatRows = [];
  for (const offer of candidates) {
    let node;
    try { node = nodeById(ladder, offer.nodeId); } catch { continue; }
    const grid = gridFor(state.world, ladder, node, state.season);
    const candidateDiff = clamp(bandCenter(node) + paceOffset, 70, 120);
    const playerSkill = ourToSkill(candidateDiff);
    const rounds = Math.max(1, node.calendar.length);
    const rand = rng(`seatmc|${node.nodeId}|${state.season}|${candidateDiff}|${sims}`);
    const fee = entryFee(node);
    const rent = Number(node.econ?.rent ?? 0);

    const posList = [];
    let podium = 0, wins = 0, pDnfCnt = 0, pointsSum = 0, prizeSum = 0;
    let titles = 0, top3stands = 0;
    for (let s = 0; s < sims; s++) {
      const totals = new Map();
      for (const seat of grid) totals.set(seat.driverId, 0);
      totals.set('player', 0);
      for (let r = 0; r < rounds; r++) {
        const track = node.calendar[r]?.track ?? 'x';
        const entries = [];
        for (const seat of grid) {
          const noise = (rand() - 0.5) * (0.035 + (1 - seat.cons) * 0.07);
          const trackOff = ((hash32(`${track}|${seat.archetype}`) % 100) / 100 - 0.5) * 0.02;
          const dnf = rand() < 0.006 + (1 - seat.cons) * 0.03;
          entries.push({ id: seat.driverId, score: seat.skill + noise + trackOff, dnf });
        }
        // il giocatore: stesso offset di pista (impari per i rivali qui sotto)
        const playerTrackOff = ((hash32(`${track}|player-offset`) % 100) / 100 - 0.5) * 0.02;
        const pNoise = (rand() - 0.5) * playerAmp;
        const pDnf = rand() < myDnfRate;
        const pScore = playerSkill + pNoise + playerTrackOff;
        // posizione del giocatore: classificato o in coda se DNF
        let pos;
        if (pDnf) pos = entries.length + 1;
        else {
          pos = 1 + entries.filter((e) => !e.dnf && e.score > pScore).length;
          if (pos > entries.length + 1) pos = entries.length + 1;
        }
        const gs = entries.length + 1;
        const pts = pointsFor(ladder, node, pos, pDnf);
        totals.set('player', totals.get('player') + pts);
        pointsSum += pts;
        if (!pDnf) {
          posList.push((pos - 1) / Math.max(1, gs - 1));
          if (pos === 1) wins++;
          if (pos <= 3) podium++;
          prizeSum += prizeFor(node, pos, gs);
        } else pDnfCnt++;
        // i rivali corrono tutta la ronda
        let rank = 0;
        for (const e of [...entries].sort((a, b) => (a.dnf === b.dnf ? b.score - a.score : (a.dnf ? 1 : -1)))) {
          rank++;
          totals.set(e.id, totals.get(e.id) + pointsFor(ladder, node, rank, e.dnf));
        }
      }
      // posizione nella classifica di fine stagione simulata
      const myTotal = totals.get('player');
      const others = [...totals.entries()].filter(([id]) => id !== 'player').map(([, v]) => v);
      const standPos = 1 + others.filter((v) => v > myTotal).length;
      if (standPos === 1) titles++;
      if (standPos <= 3) top3stands++;
    }
    const raced = sims * rounds;
    const expPosFrac = avg(posList);
    const gridSize = grid.length + 1;
    const expPrizeSeason = prizeSum / sims;
    seatRows.push({
      nodeId: node.nodeId,
      display: node.display,
      level: node.level ?? 0,
      discipline: node.discipline ?? null,
      access: node.access ?? 'open',
      gridSize,
      rounds,
      note: offer.note ?? null,
      paceValue: Math.round(candidateDiff * 10) / 10,
      expPosFrac: expPosFrac != null ? Math.round(expPosFrac * 100) / 100 : null,
      medianPos: median(posList) != null ? Math.round(median(posList) * (gridSize - 1)) + 1 : null,
      podiumPct: Math.round((podium / raced) * 100),
      winPct: Math.round((wins / raced) * 100),
      dnfPct: Math.round((pDnfCnt / raced) * 100),
      expPointsPerRound: Math.round((pointsSum / raced) * 10) / 10,
      expSeasonPoints: Math.round((pointsSum / raced) * rounds),
      titlePct: Math.round((titles / sims) * 100),
      top3StandingsPct: Math.round((top3stands / sims) * 100),
      expPrizeSeason: Math.round(expPrizeSeason),
      rentPerSeason: rent,
      feePerRound: fee,
      netSeason: Math.round(expPrizeSeason - rent - fee * rounds),
    });
  }
  seatRows.sort((a, b) => b.expSeasonPoints - a.expSeasonPoints || (a.enteredFirst ? 0 : 0) || String(a.display).localeCompare(b.display));
  return {
    ok: true,
    sims,
    basis: {
      current: cur.display,
      paceOffset: Math.round(paceOffset * 10) / 10,
      variability: sdFrac != null ? Math.round(sdFrac * 100) / 100 : null,
      variabilityAmplitude: Math.round(playerAmp * 1000) / 1000,
      dnfRate: Math.round(myDnfRate * 100),
      racesMeasured: raceN,
      fromOffers: Array.isArray(state.offers) && state.offers.length > 0,
    },
    caveat: tr({
      it: 'Stima: la tua variazione di passo vale per la nuova serie senza aggiustamenti per-disciplina/pista e il campo usa lo stesso motore delle gare simulate in classifica. Servono per serietà numeriche, e si comanda con i reali.',
      en: 'Estimate: your pace set carries to the new series without per-discipline/track trims and the field uses the same engine as standings simulation. Best used as a magnitude, not a promise.',
    }),
    seats: seatRows,
  };
}

/* ================================================================== */
/* 5) TETTO TEORICO                                                    */
/* ================================================================== */

/**
 * Il TETTO, per pista e per carriera: dal sectorAnalysis incassato a ogni
 * import (giro teorico = somma dei tuoi best settori contro il best reale, e
 * i delta sul best del campo per settore) si aggrega:
 *   - per pista: quanto margine lasci in pista (best e ultimo), e il REPARTO
 *     dove perdi più spesso (la mediana dei delta per settore);
 *   - in carriera: i settori peggiori classificati — dove il tempo si è perso
 *     più spesso dall'inizio.
 */
export function tettoReport(ladder, state) {
  const rows = [];
  for (const [nodeId, list] of Object.entries(state.results ?? {})) {
    for (const entry of list) {
      const s = entry.sectors;
      if (!s || !Array.isArray(s.sectors) || !s.sectors.length) continue;
      rows.push({
        nodeId, node: ladder.nodes.find((n) => n.nodeId === nodeId)?.display ?? nodeId,
        track: entry.track ?? null, season: entry.season, round: entry.round,
        position: entry.dnf ? null : entry.position,
        bestLapMs: Number.isFinite(s.bestLapMs) ? s.bestLapMs : null,
        theoreticalMs: Number.isFinite(s.theoreticalMs) ? s.theoreticalMs : null,
        marginMs: (Number.isFinite(s.bestLapMs) && Number.isFinite(s.theoreticalMs)) ? Math.round(s.bestLapMs - s.theoreticalMs) : null,
        sectorDeltas: s.sectors.map((x) => ({ n: x.index, deltaMs: Number.isFinite(x.deltaMs) ? x.deltaMs : null })),
      });
    }
  }
  if (!rows.length) {
    return { ok: true, perTrack: [], worstSectors: [], hint: tr({
      it: 'Niente settori incassati: EVO scrive gli S1/S2/S3 nel file risultato e l\'import li collecchia a ogni gara. Dopo la prossima gara qui spuntano i numeri.',
      en: 'No sectors archived yet: EVO writes S1/S2/S3 in the result file and the import collects them at each race. They will appear here after the next race.',
    }) };
  }

  // per pista (match tollerante)
  const byTrack = [];
  for (const row of rows) {
    if (!row.track) continue;
    let t = byTrack.find((x) => x.track === row.track);
    if (!t) { t = { track: row.track, entries: [] }; byTrack.push(t); }
    t.entries.push(row);
  }
  const perTrack = byTrack.map((t) => {
    const margins = t.entries.map((e) => e.marginMs).filter(Number.isFinite);
    // il reparto peggio: la mediana dei delta per indice di settore
    const bySector = new Map();
    for (const e of t.entries) for (const sd of e.sectorDeltas) {
      if (sd.deltaMs == null) continue;
      const arr = bySector.get(sd.n);
      if (arr) arr.push(sd.deltaMs);
      else bySector.set(sd.n, [sd.deltaMs]);
    }
    const sectors = [...bySector.entries()]
      .map(([n, dl]) => ({ sector: n, medianDeltaMs: median(dl) }))
      .sort((a, b) => b.medianDeltaMs - a.medianDeltaMs);
    return {
      track: t.track,
      sessions: t.entries.length,
      marginBestMs: margins.length ? Math.min(...margins) : null,
      marginLastMs: margins.length ? margins[margins.length - 1] : null,
      campTopDeltaMs: t.entries.length ? Math.max(...t.entries.map((e) => Math.max(0, ...e.sectorDeltas.map((d) => d.deltaMs ?? 0)))) : null,
      worstSector: sectors[0]?.sector ?? null,
      worstSectorDeltaMs: sectors[0]?.medianDeltaMs ?? null,
      sectors,
    };
  }).sort((a, b) => b.sessions - a.sessions || (b.worstSectorDeltaMs ?? 0) - (a.worstSectorDeltaMs ?? 0));

  // i ona peggiori settori della carriera: raggruppare per pista + settore
  const worst = [];
  for (const row of rows) for (const sd of row.sectorDeltas) {
    if (sd.deltaMs == null || sd.deltaMs <= 0) continue;
    worst.push({ track: row.track, sector: sd.n, deltaMs: sd.deltaMs, season: row.season, round: row.round });
  }
  worst.sort((a, b) => b.deltaMs - a.deltaMs);
  const worstTop = worst.slice(0, 8);

  return {
    ok: true,
    perTrack,
    worstSectors: worstTop,
    hint: tr({
      it: 'Il margine = best reale − giro teorico (somma dei tuoi best settori): quanto tempo ogni pista ti è costata a farla in un unico giro.',
      en: 'Margin = real best − theoretical lap (sum of your best sectors): how much time each track cost you to string together.',
    }),
  };
}
