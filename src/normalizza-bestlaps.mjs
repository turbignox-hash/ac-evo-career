// normalizza-bestlaps.mjs — LA LEVA DI CURA DELLE CHIAVI bestLaps (2/11,
// richiesta Mauro: «normalizza le chiavi di bestLaps nel save con merge
// case-insensitive, con backup di guardia e verifica»).
//
// L'anomalia A1 dell'audit 1/11 ([report/audit-dati-2026-11-01.md]): in
// state.stats.bestLaps convivono «imola» (23/9, pre-canone dei nomi pista)
// e «Imola» (31/10, fresca). Impatto nullo finché i record sono in vita —
// i lettori (life.mjs, race.mjs, tracks.mjs) cercano col nome attuale e la
// chiave bassa non la trovano MAI — ma resta una doppia grafia che un
// giorno può entrare in GUI o in una classifica storica.
//
// COSA FA (una leva, un gesto):
//   1. legge il save dello SLOT attivo (loadState/saveState della casa,
//      con slotDataDir: EVO_DATA_DIR dei test funziona);
//   2. raggruppa le chiavi di bestLaps case-insensitive (solo GRAFIA:
//      «imola»≈«Imola». L'accento NON è grafia: «Nurburgring» e
//      «Nürburgring» restano due piste, non si toccano);
//   3. per ogni gruppo in doppia grafia sceglie l'ortografia DI CANONE:
//      quella che combacia col nome pista del ladder (contentNames.tracks),
//      altrimenti il record più recente;
//   4. tiene il RECORD più VELOCE del gruppo (a parità di tempo, il più
//      recente), gli altri sepoli vengono DICHIARATI nel registro;
//   5. backup di guardia in data/bak/ (stessa filiera pre-ripara-sonda
//      del 31/10) PRIMA di qualunque scrittura;
//   6. scrittura atomica (saveState della casa);
//   7. VERIFICA: ricarica dal disco e controlla che nessun gruppo sia
//      ancora in doppia grafia, che le chiavi fuori dal gruppo combacino
//      alla lettera e che il resto del save sia byte-pari (stessa
//      serializzazione meno la fascia bestLaps).
//
// GUARDIA ANTI-CORSA: se il webui con carriera è vivo (tmp/webui-live.pid)
// NON scrive e si ferma — il server tiene lo state in memoria e un suo
// persist ripartirebbe da lì, ripristinando la doppia grafia. Si riavvia
// il webui prima (tools/riavvia-webui.mjs) e poi si rilancia la leva.
// `--dry` mostra il piano e NON scrive niente.

import { readFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
// AGGANCIO 3/11 (richiesta Mauro): il canone della chiave SI SCRIVE GIÀ GIUSTO
// dal nodo di import — src/state.mjs · chiaveBestLaps (usato da applyRaceResult)
// — e il criterio di GRAFIA vive UNO solo, in src/state.mjs · grafiaNorma:
// qui il re-export tiene vita ai vecchi import (audit, test). La leva resta la
// cura delle doppie GRAFIE GIA IN SAVE, arrivate prima del canone.
import {
  activeSlot, loadState, savePath, saveState, slotDataDir, grafiaNorma, chiaveBestLaps,
} from '../src/state.mjs';
import { LADDER_FILE } from '../src/orario.mjs';

const ROOT = join(import.meta.dirname, '..');

/** Identità di GRAFIA (case-insensitive): quella dell'anomalia A1.
 *  Definite in src/state.mjs; qui si ri-esportano il criterio e il canone
 *  della scrittura (chiaveBestLaps) — i vecchi import (audit, test)
 *  continuano a comprarli dalla leva, nessuna copia del criterio. */
export { grafiaNorma, chiaveBestLaps };

/** ms del giro, stesso formato del save ('M:SS.mmm' e 'H:MM:SS.mmm'); fallisce a Infinity. */
export function lapMs(t) {
  const m = String(t ?? '').match(/^(?:(\d+):)?(\d+):(\d+)\.(\d+)$/);
  if (!m) return Infinity;
  return Number(m[1] ?? 0) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + Number(m[4]);
}

const recente = (a, b) => String(b?.at ?? '').localeCompare(String(a?.at ?? ''));

/** 1 se la chiave porta spazi bianchi in coda o in fronte, 0 se pulita. */
const chiaveSgualcita = (k) => (String(k ?? '') !== String(k ?? '').trim() ? 1 : 0);

/**
 * Merge case-insensitive delle chiavi di un mappa bestLaps. Puro: può girare
 * in test senza toccare dischi.
 * @param {object} bl  la mappa state.stats.bestLaps (chiave pista → record)
 * @param {string[]} nomiCanon  i nomi pista attivi del ladder (contentNames.tracks)
 * @returns {{ nuovo: object, fusioni: Array }}
 */
export function normalizzaBestLaps(bl, nomiCanon = []) {
  const gruppi = new Map();
  for (const [chiave, rec] of Object.entries(bl ?? {})) {
    (gruppi.get(grafiaNorma(chiave)) ?? gruppi.set(grafiaNorma(chiave), []).get(grafiaNorma(chiave))).push({ chiave, rec: rec ?? null });
  }
  const nuovo = {};
  const fusioni = [];
  for (const membri of gruppi.values()) {
    // record vincente: il più VELOCE, a parità il più recente
    const vincente = [...membri].sort((a, b) => lapMs(a.rec?.time) - lapMs(b.rec?.time) || recente(a.rec, b.rec))[0];
    // ortografia di canone: combacia col nome pista del ladder; altrimenti
    // tra le grafie del gruppo vince quella SENZA spazi bianchi in testa né in
    // coda, e a parità la più recente (la ' Suzuka ' sgualcita non è stata un
    // peccato, ma il canone da scrivere resta pulito: i lettori cercano 'Suzuka')
    const canon = nomiCanon.find((n) => membri.some((m) => m.chiave === n))
      ?? [...membri].sort((a, b) => (chiaveSgualcita(a.chiave) - chiaveSgualcita(b.chiave)) || recente(a.rec, b.rec))[0].chiave;
    nuovo[canon] = vincente.rec;
    if (membri.length > 1) {
      fusioni.push({
        in: canon,
        tempo: vincente.rec?.time ?? null,
        sepolte: membri.map((m) => ({ chiave: m.chiave, time: m.rec?.time ?? null })).filter((x) => x.chiave !== canon),
      });
    }
  }
  return { nuovo, fusioni };
}

/** Webui con carriera vivo? Restituisce il pid o false (EPERM → diffida comunque). */
export function webuiVivo() {
  const f = join(ROOT, 'tmp', 'webui-live.pid');
  if (!existsSync(f)) return false;
  try {
    const pid = Number(readFileSync(f, 'utf8').trim().split(/\s+/)[0]);
    if (!pid) return false;
    process.kill(pid, 0);
    return pid;
  } catch (e) {
    return e.code === 'EPERM';   // se il segnale non passa, meglio diffidare comunque
  }
}

// snapshot del save SENZA la fascia bestLaps: la verifica pesa su questo confronto
const firmaUtile = (state) => {
  const copia = { ...state };
  const stats = { ...(state.stats ?? {}) };
  delete stats.bestLaps;
  delete copia.stats;
  if (Object.keys(stats).length) copia.stats = stats;
  return JSON.stringify(copia);
};

export function eseguiCura({ dry = false } = {}) {
  const DIR = slotDataDir(process.env);
  const FILE = join(DIR, savePath(activeSlot(process.env)));
  const log = [];
  const state = loadState(FILE);
  const ladder = JSON.parse(readFileSync(LADDER_FILE, 'utf8'));
  const nomiCanon = [...new Set(Object.values(ladder.contentNames?.tracks ?? {}))];
  const prima = state.stats?.bestLaps ?? {};
  const firmaPrima = firmaUtile(state);
  const { nuovo, fusioni } = normalizzaBestLaps(prima, nomiCanon);

  if (!fusioni.length) {
    log.push(`bestLaps già in una grafia sola: ${Object.keys(prima).length} chiavi, niente da fondere.`);
    return { log, scritto: false, FILE };
  }
  for (const f of fusioni) {
    log.push(`fusione «${f.sepolte.map((x) => x.chiave).join('»+«')}» ortografie → «${f.in}» · tiene il giro ${f.tempo} (sepolte: ${f.sepolte.map((x) => `${x.chiave} ${x.time}`).join(', ')})`);
  }
  if (dry) {
    log.push('--dry: niente scritto.');
    return { log, scritto: false, FILE };
  }

  const vivo = webuiVivo();
  if (vivo) {
    log.push(`FERMO: il webui con carriera è vivo (pid ${vivo === true ? '?' : vivo}); tienilo spento o riavvialo dopo: l'ordinazione è node tools/riavvia-webui.mjs.`);
    return { log, scritto: false, FILE, fermo: true };
  }

  // 5) backup di guardia PRIMA di scrivere (data/bak/, filiera del 31/10)
  const st = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 17);
  const bak = join(DIR, 'bak', `evo-career.save.pre-bestlaps-${st}.json`);
  mkdirSync(dirname(bak), { recursive: true });
  copyFileSync(FILE, bak);
  log.push(`backup di guardia: ${bak}`);

  // 6) scrittura atomica della casa
  state.stats ??= {};
  state.stats.bestLaps = nuovo;
  saveState(FILE, state);

  // 7) VERIFICA dal disco
  const dopo = loadState(FILE);
  const dopoBL = dopo.stats?.bestLaps ?? {};
  const secondoGiro = normalizzaBestLaps(dopoBL, nomiCanon);
  log.push(`verifica: ${Object.keys(dopoBL).length} chiavi (prima ${Object.keys(prima).length}) · doppie residue: ${secondoGiro.fusioni.length}`);
  if (secondoGiro.fusioni.length) {
    log.push(`⚠ ancora in doppia grafia: ${JSON.stringify(secondoGiro.fusioni)}`);
    return { log, scritto: true, FILE, ok: false };
  }
  // fuori dal gruppo TUTTO combacia alla lettera, e nient'altro del save è mosso
  const fuoriDa = new Set(fusioni.map((f) => f.in).concat(fusioni.flatMap((f) => f.sepolte.map((x) => x.chiave))));
  const intatte = Object.entries(prima).filter(([k]) => !fuoriDa.has(k)).every(([k, v]) => JSON.stringify(dopoBL[k]) === JSON.stringify(v));
  if (!intatte) {
    log.push('⚠ una chiave FUORI dal gruppo è cambiata: rivedi il backup prima di fidarti.');
    return { log, scritto: true, FILE, ok: false };
  }
  if (firmaUtile(dopo) !== firmaPrima) {
    log.push('⚠ il resto del save non combacia colla fotografia di ingresso (loadState chi scrive prima può aver fatto un migrate di version): rivedi il backup.');
    return { log, scritto: true, FILE, ok: false };
  }
  log.push('verifica OK: gruppi una grafia sola, chiavi esterne immutate, resto del save invariato.');
  return { log, scritto: true, FILE, ok: true, bak };
}

// CLI diretta: node tools/normalizza-bestlaps.mjs [--dry]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dry = process.argv.slice(2).includes('--dry');
  try {
    for (const riga of eseguiCura({ dry }).log) console.log(riga);
  } catch (e) {
    console.log('CURA FALLITA:', String(e?.stack ?? e).slice(-800));
    process.exitCode = 1;
  }
}
