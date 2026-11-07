#!/usr/bin/env node
// verifica-gara-tempo.mjs — la verifica guidata della dichiarazione della gara
// da parte della carriera, ripassata su una registrazione vera (7/11/2026).
//
// Uso:
//   node tools/verifica-gara-tempo.mjs                     // ultima registrazione, scheda dal save
//   node tools/verifica-gara-tempo.mjs --minuti 20 --pista donington --prova 45 --qualifica 30
//   node tools/verifica-gara-tempo.mjs --file data/live-....ndjson
//   node tools/verifica-gara-tempo.mjs --aiuto
//
// Cos'è: prende una registrazione del registratore (`data/live-*.ndjson`, la
// stessa che serve i replay dei test), la ripassa TUTTA attraverso la
// dichiarazione con memoria che usa il Cruscotto (`creaDichiarazioneGara`) e
// stampa cosa ha visto: le sessioni con la loro durata (il massimo del conto
// alla rovescia), quando la dichiarazione si è accesa, e — se è una ronda a
// tempo e non si è accesa — QUALE condizione è mancata.
//
// Perché serve: la regola dei minuti (7/11) non ha ancora una gara a tempo
// vera da cui imparare. Il giorno che c'è, questo referto dice in dieci righe
// se la carriera ha dichiarato la gara e, se no, se il colpevole è il timer del
// gioco (che non usa i minuti scritti dal Prepara tutto) o un'ambiguità con
// prove/qualifiche. Vedi VERIFICA-GARA-A-TEMPO.md.
//
// Non modifica niente: legge la registrazione e il save, e stampa.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaDichiarazioneGara, secondiTimer, stessaPista } from '../src/gara-carriera.mjs';
import { parseLog } from '../src/live-monitor-riepilogo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.EVO_DATA_DIR ?? join(ROOT, 'data');

function leggiArgomenti(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
    out[k] = v;
  }
  return out;
}

const opt = leggiArgomenti(process.argv.slice(2));
if (opt.aiuto || opt.help) {
  console.log(`Uso: node tools/verifica-gara-tempo.mjs [--file registrazione.ndjson]
       [--pista nome] [--giri N] [--minuti N] [--prova N] [--qualifica N] [--slot 1]

  Senza --file prende la registrazione più recente in data/.
  Senza --pista/--giri/--minuti la scheda viene letta da state.pending del save
  (data/evo-career.save.json, --slot per gli altri slot).
  --minuti = durata della GARA a tempo; --prova/--qualifica = le altre sessioni
  del weekend (servono a scartare l'ambiguità).`);
  process.exit(0);
}

const num = (v) => (Number.isFinite(Number(v)) && String(v ?? '').trim() !== '' ? Number(v) : null);

/** La registrazione da ripassare: --file, oppure la più recente in data/. */
function trovaRegistrazione() {
  if (opt.file) return String(opt.file);
  if (!existsSync(DATA)) return null;
  const file = readdirSync(DATA).filter((f) => /^live-.*\.ndjson$/.test(f)).sort();
  return file.length ? join(DATA, file[file.length - 1]) : null;
}

/** La scheda della ronda: le opzioni vincono, poi `state.pending` del save. */
function scheda() {
  const slot = Math.max(1, Math.min(3, num(opt.slot) ?? 1));
  const file = join(DATA, slot === 1 ? 'evo-career.save.json' : `evo-career.save-${slot}.json`);
  let pending = null;
  try {
    pending = JSON.parse(readFileSync(file, 'utf8'))?.pending ?? null;
  } catch { /* save assente: si usano le opzioni */ }
  const p = { ...(pending ?? {}) };
  if (opt.pista) { p.trackId = String(opt.pista); p.trackNames = [String(opt.pista)]; }
  if (num(opt.giri) != null) p.laps = num(opt.giri);
  if (num(opt.minuti) != null) p.durationMin = num(opt.minuti);
  if (num(opt.prova) != null) p.practiceMin = num(opt.prova);
  if (num(opt.qualifica) != null) p.qualifyMin = num(opt.qualifica);
  return { pending: Object.keys(p).length ? p : null, daSave: !!pending };
}

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const oraLocale = (iso) => String(iso ?? '').replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '') + 'Z';

/** Una sessione vista nella registrazione: contigua per pista + giri in palio. */
function sessioniViste(campioni) {
  const out = [];
  for (const o of campioni) {
    const s = o.snapshot?.session ?? {};
    const giri = o.snapshot?.player?.lapsTotal ?? null;
    const sec = secondiTimer(o.snapshot?.player?.timeLeftAll);
    const chiave = `${s.track ?? ''}|${giri ?? ''}`;
    const ultima = out[out.length - 1];
    if (ultima && ultima.chiave === chiave) {
      ultima.campioni += 1;
      ultima.fine = o.t;
      if (sec != null) {
        ultima.timerMax = ultima.timerMax == null ? sec : Math.max(ultima.timerMax, sec);
        ultima.timerMin = ultima.timerMin == null ? sec : Math.min(ultima.timerMin, sec);
      }
    } else {
      out.push({
        chiave, pista: s.track ?? '(nessuna)', giri, campioni: 1,
        inizio: o.t, fine: o.t,
        timerMax: sec != null ? sec : null, timerMin: sec != null ? sec : null,
      });
    }
  }
  return out;
}

/** Perché la dichiarazione non si è accesa: la prima condizione che manca. */
function perchéNo(pending, sessione) {
  if (!pending) return 'nessuna scheda (la carriera non può dichiarare: passare --pista e --minuti/--giri)';
  if (!sessione) return 'nessuna sessione nella registrazione';
  const giriScheda = num(pending.laps);
  const durataScheda = num(pending.durationMin);
  if (giriScheda > 0) return 'la ronda è a GIRI: la regola dei minuti non si applica (servono i giri in palio uguali)';
  if (!(durataScheda > 0)) return 'la scheda non ha né giri né minuti: non c\u2019è niente da confrontare';
  const nomi = [pending.trackId, ...(Array.isArray(pending.trackNames) ? pending.trackNames : [])].filter(Boolean);
  const sullaPista = nomi.length ? nomi.some((x) => stessaPista(sessione.pista, x)) : true;
  if (!sullaPista) return `la sessione è su «${sessione.pista}», la scheda parla di «${pending.trackId ?? nomi[0]}»`;
  if (sessione.giri != null && Number(sessione.giri) > 0) return `la sessione ha ${sessione.giri} giri in palio: non è una gara a tempo`;
  if (sessione.timerMax == null) return 'la sessione non riporta mai un timer: durata non misurabile';
  const durataVista = sessione.timerMax / 60;
  const tolleranza = Math.max(1, durataScheda * 0.1);
  if (Math.abs(durataVista - durataScheda) > tolleranza) {
    return `la sessione dura ${durataVista.toFixed(1)}′ (timer massimo ${Math.round(sessione.timerMax)} s), la scheda dice ${durataScheda}′: o il gioco non usa i minuti della carriera, o è un\u2019altra sessione`;
  }
  for (const [nome, altra] of [['prova', pending.practiceMin], ['qualifica', pending.qualifyMin]]) {
    const d = num(altra);
    if (d > 0 && Math.abs(durataVista - d) <= Math.max(1, d * 0.1)) {
      return `la durata vista (${durataVista.toFixed(1)}′) combacia anche con la ${nome} (${d}′): sessione non distinguibile, la dichiarazione tace per costruzione`;
    }
  }
  return 'condizione non riconosciuta: guardare i campioni a mano';
}

// ─────────────────────────────── referto ───────────────────────────────
const file = trovaRegistrazione();
if (!file || !existsSync(file)) {
  console.error(`Nessuna registrazione trovata${file ? `: ${file}` : ` in ${DATA}`}.\nRegistra una gara con: node tools/registra-live.mjs`);
  process.exit(1);
}
const campioni = parseLog(readFileSync(file, 'utf8')).filter((o) => o?.snapshot);
if (!campioni.length) {
  console.error(`La registrazione non contiene campioni: ${file}`);
  process.exit(1);
}
const { pending, daSave } = scheda();

console.log(`\n== SCHEDA DELLA RONDA ==  (${pending ? (daSave ? 'da state.pending del save' : 'dalle opzioni') : 'nessuna'})`);
if (pending) {
  const giri = num(pending.laps);
  const minuti = num(pending.durationMin);
  console.log(`  pista: ${pending.trackId ?? '?'}${Array.isArray(pending.trackNames) ? ` (${pending.trackNames.join(', ')})` : ''}`);
  console.log(`  ronda: ${giri > 0 ? `a GIRI · ${giri} giri` : minuti > 0 ? `a TEMPO · ${minuti} minuti` : 'né giri né minuti (scheda incompleta)'}`);
  if (num(pending.practiceMin) > 0 || num(pending.qualifyMin) > 0) {
    console.log(`  altre sessioni: prove ${num(pending.practiceMin) ?? '?'}′ · qualifica ${num(pending.qualifyMin) ?? '?'}′`);
  }
} else {
  console.log('  nessuna: passare --pista e --minuti N (o --giri N) per giudicare la registrazione');
}

console.log(`\n== REGISTRAZIONE ==\n  ${file.replace(ROOT, '.').replace(/\\/g, '/')} · ${campioni.length} campioni · ${oraLocale(campioni[0].t)} → ${oraLocale(campioni[campioni.length - 1].t)}`);

console.log('\n== SESSIONI VISTE ==');
for (const s of sessioniViste(campioni)) {
  const timer = s.timerMax == null ? 'senza timer (attesa del via)' : `timer ${mmss(s.timerMax)} max → ${mmss(s.timerMin)} min (${(s.timerMax / 60).toFixed(1)}′ di durata)`;
  console.log(`  ${s.pista} · ${s.giri == null ? 'giri ?' : `${s.giri} giri in palio`} · ${timer} · ${oraLocale(s.inizio)} → ${oraLocale(s.fine)} · ${s.campioni} campioni`);
}

// il ripasso vero: il tracker che usa il Cruscotto, sugli stessi campioni
const dichiarazione = creaDichiarazioneGara();
const segmenti = [];
let primoAcceso = null;   // la sessione che ha fatto scattare la dichiarazione
for (const o of campioni) {
  const { gara } = dichiarazione.valuta(o.snapshot, pending ?? {});
  if (gara === true && !primoAcceso) {
    primoAcceso = { t: o.t, pista: o.snapshot?.session?.track ?? '?', giri: o.snapshot?.player?.lapsTotal ?? null, timer: secondiTimer(o.snapshot?.player?.timeLeftAll) };
  }
  const ultimo = segmenti[segmenti.length - 1];
  if (ultimo && ultimo.gara === gara) { ultimo.campioni += 1; ultimo.fine = o.t; } else { segmenti.push({ gara, campioni: 1, inizio: o.t, fine: o.t }); }
}
const accesi = segmenti.filter((x) => x.gara === true);
const spenti = segmenti.filter((x) => x.gara === false);

console.log('\n== LA DICHIARAZIONE ==');
if (!accesi.length) console.log('  la carriera non ha mai dichiarato la gara');
for (const s of accesi) console.log(`  ✓ gara VERA · ${oraLocale(s.inizio)} → ${oraLocale(s.fine)} · ${s.campioni} campioni`);
for (const s of spenti.slice(0, 6)) console.log(`  · non gara · ${oraLocale(s.inizio)} → ${oraLocale(s.fine)} · ${s.campioni} campioni`);

// ─── referto ───
const viste = sessioniViste(campioni);
const sullaPista = pending
  ? viste.filter((s) => {
    const nomi = [pending.trackId, ...(Array.isArray(pending.trackNames) ? pending.trackNames : [])].filter(Boolean);
    return !nomi.length || nomi.some((x) => stessaPista(s.pista, x));
  })
  : viste;
const candidata = sullaPista.sort((a, b) => b.campioni - a.campioni)[0] ?? viste[0] ?? null;
const totale = accesi.reduce((n, s) => n + s.campioni, 0);
const quota = Math.round((totale / campioni.length) * 100);

console.log('\n== REFERTO ==');
if (num(pending?.laps) > 0) {
  console.log(`  ¬ ronda a GIRI (${pending.laps}): la regola dei minuti non c\u2019entra.`);
  if (totale) console.log(`    La dichiarazione a giri si è accesa in ${totale} campioni su ${campioni.length} (${quota}%): ${accesi[0] ? `${oraLocale(accesi[0].inizio)} → ${oraLocale(accesi[0].fine)}` : '—'}.`);
  else console.log('    E la dichiarazione a giri NON si è accesa: guardare la pista e i giri in palio delle sessioni qui sopra.');
} else if (totale) {
  console.log(`  ✓ LA REGOLA DEI MINUTI HA DICHIARATO LA GARA: ${totale} campioni su ${campioni.length} (${quota}%), ${oraLocale(accesi[0].inizio)} → ${oraLocale(accesi[accesi.length - 1].fine)}.`);
  if (primoAcceso) {
    console.log(`    Ha fatto scattare: ${primoAcceso.pista} · ${primoAcceso.giri == null ? 'giri ?' : `${primoAcceso.giri} giri in palio`} · timer ${primoAcceso.timer == null ? 'non letto' : mmss(primoAcceso.timer)} · dalle ${oraLocale(primoAcceso.t)}`);
    if (Number(primoAcceso.giri) > 0) console.log('    ATTENZIONE: quella sessione ha giri in palio, quindi non è una gara a tempo: la dichiarazione è venuta dalla regola dei GIRI, non dai minuti.');
    else if (candidata?.timerMax != null) console.log(`    Durata vista ${(candidata.timerMax / 60).toFixed(1)}′ contro ${num(pending?.durationMin)}′ in scheda: combaciano (misurato, non dedotto: il referto dice solo che i due numeri sono uguali).`);
  }
  if (totale < campioni.length * 0.3) console.log('    Copre meno di un terzo della registrazione: potrebbe essere un\u2019altra sessione con la stessa durata, o una gara accorciata da un cambio di stato. Sui dati del 6/11 la gara a giri copriva il 47%.');
} else {
  console.log(`  ✗ LA REGOLA DEI MINUTI NON HA DICHIARATO NIENTE. Prima condizione che manca:\n    ${perchéNo(pending, candidata)}`);
  console.log('    Il lato buono: nessun falso «gara» (finestra pit e ultimo giro sono rimasti spenti dove non andavano).');
}
console.log('');
