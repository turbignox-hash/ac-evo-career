// ronda-nostro.mjs — IL GENERATORE DI ROUND DEL «PADDOCK NOSTRO» (3/11, richiesta Mauro).
//
// Dalla LADDER, e solo da lei, crea il WEEKEND NATIVO — pista (traccia della
// ronda), giri gara, orari, AI, griglia, auto, meteo — senza dipendere dal
// catalogo dell'exe del Paddock: NESSUNA lettura dei journal pd-*.json
// (pd-calendar nemmeno quando la serie combacerebbe: trovaRonda salta il
// cerchio con l'opzione { nostro }), nessun catalogo car dell'app.
//
// Il cammino, in ordine:
//   0) PC VERGINE: se i protobuf del weekend mancano (gamemodesave o Luo
//      assenti), il CAMPIONE catturato da una lanciata vera
//      (data/ricette/campionato/, già in casa e già nel pacchetto amico)
//      viene SEMINATO tale quale — coi QUATTRO file del monitor del 2/11 —
//      e il Luo parte col METEO della ronda (preset tradotto dalla scala
//      ladder). Chi non ha il server dedicato né fa lanciate prepara
//      EGUALMENTE la ronda; su un PC che ha già i file NON si tocca niente
//      (la tua gara in corso resta la tua gara in corso, salvo --force);
//   1) la ronda «da girare» dalla LADDER (node attivo del save, round
//      corrente; override CLI a piacere);
//   2) la preparazione con le STESSE primitive canoniche di ronda-ladder
//      (rondaPaddock con nostro: true) — ogni passo verifica da sé;
//   3) la TRACCIA della ronda: in data/evo-ronda-nostro[-N].json accanto al
//      save (stessa regola di slot del mirror del calendario) entra il
//      record di ciò che è stato generato — chi legge sa cosa gira adesso
//      e cosa è girato prima. Al più 12 record dietro, come le fasce.
//
// uso:
//   node tools/ronda-nostro.mjs                  → genera la ronda attiva
//   node tools/ronda-nostro.mjs --show           → la ronda attiva + l'ultima traccia
//   node tools/ronda-nostro.mjs --dry            → solo il piano, niente scrittura
//   node tools/ronda-nostro.mjs --round N --node <id> --laps N --hour H
//       --weather <indice LADDER 0..5> --car "<auto o livrea>"
//       --singlemake on|off --skip pista,griglia,auto,meteo,orari,giri,ai
//       [--force]                                  → forza anche la semina su file diversi
//
// Nota sui file: garage (auto/livrea) e meteo si scrivono a gioco aperto
// (come sempre in Paddock); pista/griglia/orari/giri/ai saltano a gioco
// aperto salvo --force (le gamemodesave sono tenute dal menu: stessa regola
// di ronda-ladder).
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { GAME_SAVEDIR } from './evo-grid.mjs';
import { WEEKEND_FILE, currentWeekendTrack } from './set-track.mjs';
import { sessionsOf } from './weekend-laps.mjs';
import { RICETTA, seminaCampionato, leggiPresetLgm } from './semina-campionato.mjs';
import { trovaRonda, meteoRonda, rondaPaddock } from './ronda-ladder.mjs';
import { slotSuffix } from '../src/journal.mjs';
import { SAVE_FILE } from '../src/webui-env.mjs';
import { loadState } from '../src/state.mjs';
import { TRACK_INFO } from '../src/tracks.mjs';

/** La traccia tiene AL PIÙ 12 record dietro (la casa: FASCE_DIETRO = 12). */
export const TRACCIA_MAX = 12;

/** Il file della traccia per il save in uso: stessa regola di slot di
 * journalPathForSave (slotSuffix), nome NOSTRO: evo-ronda-nostro[-N].json. */
export function tracciaPathForSave(saveFile = SAVE_FILE) {
  return join(dirname(String(saveFile ?? '')), `evo-ronda-nostro${slotSuffix(saveFile)}.json`);
}

/** Legge la traccia ({ traccia: [record…], l'ultimo PRIMO }) o null se assente. */
export function leggiTraccia(path = tracciaPathForSave()) {
  try {
    const t = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(t.traccia) ? t : null;
  } catch { return null; }
}

/** Aggiunge il record in TESTA e pota oltre il cap (12 dietro). Scrittura
 *  con rename: il file della traccia resta sempre leggibile intero. */
export function scriviTraccia(path, record, { cap = TRACCIA_MAX } = {}) {
  const prima = leggiTraccia(path) ?? { traccia: [] };
  const out = { ...prima, traccia: [record, ...prima.traccia].slice(0, cap) };
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
  return out;
}

/** Il Luo sul PC: derivato dalla RICETTA del campione, niente costante in due
 *  posti (chi semina e chi controlla guardano la STESSA riga). */
export function luoDelPc(root = GAME_SAVEDIR) {
  return join(root, RICETTA.find((r) => r.chiave === 'luo').dest);
}

/**
 * IL GENERATORE. opts = { dry, force, skip, singleMake, car, orari,
 * trovaRonda: { nodeId, round, track, laps, hour, weather }, forceSemina }.
 * Ritorna { ...rondaPaddock, semina, traccia } — semina null se i file del
 * nativo c'erano già; la traccia NON si scrive nel dry.
 */
export async function generaRondaNostro(opts = {}) {
  const { dry = false, force = false } = opts;

  // 1) la ronda dalla LADDER, prima di tutto: il meteo della semina è il SUO
  const piani = trovaRonda(opts.trovaRonda ?? {}, { nostro: true });
  const wx = meteoRonda(piani.entry);

  // 2) il weekend NATIVO: su PC vergine si semina il campione (i quattro
  //    protobuf della lanciata vera), Luo col meteo della ronda. Su un PC
  //    che ha già i file si NON tocca niente (FILE_DIFFERENTI resta la
  //    guardia del seminatore: solo --force la oltrepassa).
  let semina = null;
  const mancano = [WEEKEND_FILE, luoDelPc()].filter((p) => !existsSync(p));
  if (mancano.length) {
    semina = seminaCampionato({ preset: String(wx.id), dry, force: force || opts.forceSemina === true });
  }

  // 3) i passi canoni — UN solo orchestrazione (rondaPaddock), ronda solo ladder
  const res = await rondaPaddock({ ...opts, nostro: true });

  // 4) la traccia della ronda da girare (mai nel dry)
  let traccia = null;
  if (!dry) {
    let stagione = null;
    try { stagione = loadState(SAVE_FILE).season ?? 1; } catch { /* stagione non letta: la traccia non mente */ }
    const record = {
      at: new Date().toISOString(),
      node: res.node,
      stagione,
      ronda: res.ronda,
      ronda_numero: res.ronda + 1,
      ronda_nome: res.ronda_nome,
      fonte: 'ladder',
      pista: res.entry.track,
      pista_nome: TRACK_INFO[res.entry.track]?.name ?? res.entry.track,
      layout: res.entry.layout ?? null,
      giri: res.entry.laps ?? null,
      ora: `${String(res.entry.hour ?? '').padStart(2, '0')}:${String(res.entry.minute ?? 0).padStart(2, '0')}`,
      meteo: wx.label,
      meteo_preset: wx.id,
      semina: semina ? {
        scritti: semina.scritti.length,
        saltati: semina.saltati.length,
        rimpiazzati: semina.rimpiazzati.length,
      } : null,
      passi: res.passi.map((p) => ({ nome: p.nome, stato: p.skip ? 'skip' : p.ok ? 'ok' : 'errore', nota: p.note ?? p.error ?? null })),
    };
    traccia = scriviTraccia(tracciaPathForSave(), record).traccia[0];
  }

  return { ...res, semina, mancano, traccia };
}

/* ---------- CLI (solo quando eseguito direttamente) ---------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;

if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
  const has = (k) => args.includes('--' + k);

  const mostraTraccia = (t) => {
    if (!t) return 'nessuna traccia in casa';
    return `${t.ronda_numero}. ${t.ronda_nome} · ${t.pista}${t.layout ? ' / ' + t.layout : ''} · ${t.giri} giri · ${t.ora} · ${t.meteo}${t.semina ? ' · semina ' + t.semina.scritti + ' file' : ''}${t.dry ? ' · DRY' : ''} (${t.at})`;
  };

  if (has('--show')) {
    const piani = trovaRonda({
      nodeId: getArg('node'),
      round: getArg('round') != null ? Number(getArg('round')) : null,
    }, { nostro: true });
    console.log(`— ronda da girare (LADDER): ronda ${piani.ronda + 1} del nodo ${piani.nodeId} (${piani.ronda_nome})`);
    console.log(`  ${piani.entry.track}${piani.entry.layout ? ' · layout ' + piani.entry.layout : ''} · giri ${piani.entry.laps} · ore ${piani.entry.hour}:${String(piani.entry.minute ?? 0).padStart(2, '0')} · meteo idx ${piani.entry.weather} → ${meteoRonda(piani.entry).label}`);
    console.log(`traccia: ${mostraTraccia(leggiTraccia()?.traccia?.[0] ?? null)}`);
    process.exit(0);
  }

  const singleMake = (getArg('singlemake') ?? '').toLowerCase() || null;
  const dry = has('--dry');
  try {
    console.log('GENERO IL ROUND DAL LADDER (paddock nostro: niente catalogo dell\'exe)…');
    const res = await generaRondaNostro({
      trovaRonda: {
        nodeId: getArg('node'),
        round: getArg('round') != null ? Number(getArg('round')) : null,
        track: getArg('track'),
        laps: getArg('laps'),
        hour: getArg('hour'),
        weather: getArg('weather'),
      },
      car: getArg('car'),
      dry,
      force: has('--force'),
      singleMake: singleMake && ['on', 'off'].includes(singleMake) ? singleMake : null,
      skip: (getArg('skip') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    });
    console.log(`— ronda ${res.ronda + 1} del nodo ${res.node} (${res.ronda_nome}) —`);
    if (res.semina) {
      const counts = `scritti ${res.semina.scritti.length}, saltati ${res.semina.saltati.length}`;
      console.log(`  ${dry ? 'seminerei (dry)' : 'seminati'} i file del weekend nativo dal campione (${counts})`);
    } else if (res.mancano.length === 0) {
      console.log('  weekend nativo già in casa: campione non toccato');
    }
    for (const p of res.passi) {
      const segno = p.skip ? '↷' : p.ok ? '✔' : '×';
      const testo = p.skip ? 'salto (skip)' : p.note || p.error || '';
      console.log(`  ${segno} ${p.nome}${p.skip ? '' : p.ok ? '' : ' (ERRORE)'}: ${testo}`);
    }
    if (!dry) {
      console.log(`\ntraccia: ${mostraTraccia(res.traccia)}`);
      try {
        const traccia_file = tracciaPathForSave();
        console.log(`  file: ${traccia_file}`);
        const t = currentWeekendTrack();
        const luo = leggiPresetLgm(readFileSync(luoDelPc()));
        console.log(`verifica: pista=${t?.name ?? '?'} · meteo preset=${luo === null ? '?' : luo}`);
        for (const s of sessionsOf(readFileSync(WEEKEND_FILE))) console.log(`  ${s.nome}: ${s.aTempo ? s.durataSec + 's a tempo' : s.giri + ' giri'} · griglia=${s.singleMake === null ? '?' : s.singleMake ? 'mono' : 'custom'}`);
      } catch { /* la verifica rapida salta se un file è occupato */ }
    } else {
      console.log('\nDRY: niente scrittura, solo il piano (la traccia non si tocca).');
    }
    const morti = res.passi.filter((p) => !p.ok && !p.skip).length;
    process.exit(morti ? 1 : 0);
  } catch (e) {
    console.error(e.code ? `${e.code}: ${e.message}` : e.message);
    process.exit(1);
  }
}
