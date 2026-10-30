// rapporto-gara.mjs — IL RAPPORTO DI GARA CHE SI CONDIVIDE (27/10, richiesta
// Mauro: «dietro ogni racer che torna a un tool c'è lo slancio a far vedere
// i risultati alla community»). Dopo ogni gara il dossier completo in un POST:
// griglia ufficiale, podio, penalità, gap, giro veloce, testa a testa (MP),
// settori del tuo giro vs griglia — composto SOLO dai dati scritti dal gioco
// nel file risultato. Output: Markdown pronto da incollare su Discord (Discord
// NON disegna le tabelle: la classifica va in un blocco monospazio con colonne
// allineate) + HTML per l'anteprima. Il file .md finisce in report/gare/ per
// restare a portata di allegato anche a distanza di mesi.
//
//   rapportoGara(paths, file, { driver })  → { md, html, salvatoMd } | { error }
//
// Niente dati fittizi: ogni numero esce da resultDetail (catalog.mjs) o da
// sectorAnalysis (results.mjs) sul file nativo di EVO.

import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resultDetail, resultDirs } from './catalog.mjs';
import { readSessionResult, findPlayerDriver, sectorAnalysis, lapToMs } from './results.mjs';
import { riepilogoPerClasse } from './classi-gt.mjs';
import { sameTrack } from './tracknames.mjs';
import { buildVersion } from './report.mjs';
import { tr } from './lang.mjs';
import { listMotecSessions, analyzeLd } from './motec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RADICE = dirname(HERE);
// EVO_REPORT_DIR: solo per i test — redirige i .md della prova in una temporanea
const OUT_DIR = process.env.EVO_REPORT_DIR ?? join(RADICE, 'report', 'gare');

/**
 * Il best lap dal MoTeC quando il file di gioco scrive best_lap VUOTO
 * (28/10 Oulton nella pioggia: has_best_lap true, stringa vuota, splits []).
 * La sessione MoTeC giusta è quella .ld più vicina nel tempo al file dei
 * risultati (max 30 min), sola auto+pista combaciante; best = giro minimo.
 * Ritorna 'm:ss.mmm' o null — mai un numero inventato.
 */
function bestLapDaMotec(paths, me, trackRef, resultMtime) {
  try {
    const root = paths?.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : null;
    if (!root || !me?.car) return null;
    const s = listMotecSessions(root, { car: me.car, track: trackRef })
      .map((f) => ({ ...f, dt: Math.abs(f.mtime - resultMtime) }))
      .filter((f) => f.dt <= 30 * 60 * 1000)
      .sort((a, b) => a.dt - b.dt)[0];
    if (!s) return null;
    const best = Math.min(...(analyzeLd(s.file)?.laps ?? [])
      .map((l) => l.durationSec).filter(Number.isFinite));
    if (!Number.isFinite(best)) return null;
    const min = Math.floor(best / 60);
    return `${min}:${(best - min * 60).toFixed(3).padStart(6, '0')}`;
  } catch { return null; }
}

const g = (s) => String(s ?? '').trim();

const MEDAGLIE = ['🥇', '🥈', '🥉'];

/* La fila del gap di UNA riga — IL TESTO STANDARD anche per i doppiati:
   il total_time di chi ha un giro in meno è MINORE del vincitore, quindi il
   gap ce ne esce negativo (dato reale, non un bug). In pista si dice in GIRI. */
const leaderLapsDi = (rows) => Math.max(...rows.map((r) => Number(r.laps) || 0));
/* Il gap in testo standard: +x.xs" sotto il minuto, +M'SS" sopra (le gare lunghe
   si leggono in minuti, non in +140.0s). Com'è scritto in state.mjs. */
const fmtGap = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms >= 60000) return `+${Math.floor(ms / 60000)}'${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}"`;
  return `+${(ms / 1000).toFixed(1)}"`;
};
export function gapTesto(r, rows) {
  if (r.gap == null) return '—';
  if (r.gap <= -1000) return `−${leaderLapsDi(rows) - (Number(r.laps) || 0)} giri`;
  return fmtGap(r.gap);
}

/** Il nome del file risultato porta la data: 260416-2108_MP_Race.… → 16/04/2026 21:08. */
const dataDi = (file) => {
  const m = g(file).match(/^(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  return m ? `20${m[1]}/${m[2]}/${m[3]} · ${m[4]}:${m[5]}` : null;
};

/** Base del file risultato per il nome del .rapporto.md (soli caratteri sicuri). */
const baseDi = (file) => g(file).replace(/\.sessionresults\.json$/i, '').replace(/[^\w.-]+/g, '_');

/** Il giro veloce della sessione: tra le righe che il gioco marca has_best_lap vince il più basso. */
const giroVeloce = (rows) => {
  const cand = rows.filter((r) => r.hasBest && r.bestLap).sort((a, b) => lapToMs(a.bestLap) - lapToMs(b.bestLap));
  return cand[0] ?? null;
};

/** Il podio ufficiale: i primi tre classificati (le DSQ escono già dal conto). */
export function podioDi(rows) {
  return rows.filter((r) => !r.dsq).slice(0, 3);
}

/* -------------------------------------------------------------- LE MANS */
/**
 * La CLASSIFICA PER CLASSE, stile 24h Le Mans (richiesta Mauro 28/10):
 * gare endurance con GT1/GT2/GT3 dove il gioco scrive una classifica sola.
 * Il gruppo esce da classi-gt.mjs (raggruppa per pezzo del nome auto) e qui
 * si compone la sezione: per ogni classe, podio della classe + righe in
 * blocco monospazio come il bianco. Con meno di due classi vere ritorna
 * null e NESSUN byte toccato nel resto del rapporto.
 * Le etichette portano la posizione di CLASSE (posClasse) accanto a quella
 * di gara, così «GT2 · P1 (P5 ass.)» resta leggibile insieme alla gara vera.
 */
export function sezioneClassi(rows, { larghezzaVuota = null } = {}) {
  const L = locale();
  const res = riepilogoPerClasse(rows);
  if (!res) return null;
  const limAutoC = larghezzaVuota ?? Math.max(8, ...res.gruppi.flatMap((gr) => gr.righe.map((r) => g(r.car).length)));
  const limPilotaC = Math.max(8, ...res.gruppi.flatMap((gr) => gr.righe.map((r) => g(r.name).length)));
  const padC = (s, w) => { s = g(s); return s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w); };
  const nomeEtichetta = (c) => (c === '-' ? tr({ it: 'Diversi', en: 'Various' }) : c);
  const blocchi = res.gruppi.map((gr) => {
    const testa = [
      `${nomeEtichetta(gr.classe).slice(0, 12).padEnd(12)}`,
      tr({ it: 'Pilota', en: 'Driver' }).padEnd(limPilotaC),
      L.auto.padEnd(limAutoC),
      L.giri.padStart(4),
      L.miglior.padEnd(10),
      tr({ it: 'Pos', en: 'Pos' }).padStart(8),
    ].join(' | ');
    const riga = (r) => [
      `P${r.posClasse}`.padStart(12),
      padC(r.name, limPilotaC),
      padC(r.car, limAutoC),
      String(r.laps ?? 0).padStart(4),
      padC(r.bestLap || '—', 10),
      `P${r.position}`.padStart(8),
    ].join(' | ');
    return [testa, ...gr.righe.map(riga)].join('\n');
  });
  // podio per classe: una riga di premiazione ciascuna, gold-silver-bronze
  const premi = res.gruppi
    .filter((gr) => gr.righe.some((r) => !r.dsq))
    .map((gr) => {
      const primo = gr.righe.find((r) => !r.dsq);
      return `${MEDAGLIE[0]} ${nomeEtichetta(gr.classe)} — **${g(primo?.name).slice(0, 30)}** (${g(primo?.car)})`;
    });
  return {
    titolo: tr({ it: 'CLASSIFICA PER CLASSE · stile 24h Le Mans', en: 'CLASS STANDINGS · 24h Le Mans style' }),
    blocchi,
    premi: premi.join(' · '),
    // 31/10 notte: anche i GRUPPI nudi (con posClasse), per la tabella HTML
    // di htmlCompose — prima l'unico consumatore del blocchi in MD fungeva,
    // ma l'anteprima HTML leggeva .gruppi che NON esisteva e il rapporto
    // bilingue moriva lì (giornata 261030, fermo a Donington).
    gruppi: res.gruppi,
  };
}

/** Legge il file nativo (per i settori del tuo giro: resultDetail non porta gli splits). */
function readRaw(paths, safe) {
  for (const dir of paths?.resultsDirs ?? []) {
    const full = join(dir, safe);
    if (existsSync(full)) return readSessionResult(full);
  }
  return null;
}

/** Confronto gara su gara (richiesta Mauro 27/10): l'ultimo file risultato sulla
 *  STESSA pista con i tuoi splits, scritto PRIMA del file corrente. I nomi portano
 *  la data (YYMMDD-HHMM) e le dir si elencano in ordine: il confronto cronologico
 *  si fa col nome, non col mtime. Ritorna { file, etichetta, sectors } o null. */
export function settoriPrecedente(paths, trackRef, safe, driver) {
  const files = [];
  for (const dir of paths?.resultsDirs ?? []) {
    let ls = [];
    try { ls = readdirSync(dir).filter((f) => /\.sessionresults\.json$/i.test(f) && f < safe); } catch { /* dir assente: passa */ }
    for (const f of ls) files.push(join(dir, f));
  }
  files.sort((a, b) => b.localeCompare(a)); // dal più recente all'indietro
  for (const full of files) {
    try {
      const raw = readSessionResult(full);
      if (!raw || !sameTrack(raw.track, trackRef)) continue;
      const meRaw = findPlayerDriver(raw, driver).driver
        ?? raw.drivers.find((x) => x.is_current_driver === true)
        ?? null;
      const s = meRaw && (meRaw.splits ?? []).length ? sectorAnalysis(raw, meRaw) : null;
      if (s) return { file: basename(full), etichetta: dataDi(basename(full)) ?? basename(full), sectors: s.sectors };
    } catch { /* file corrotto: prova il precedente */ }
  }
  return null;
}

/* Etichette localizzate: IT/EN come tutta la suite (la lingua la sposta webui a ogni richiesta). */
function locale() {
  return {
    titolo: tr({ it: 'RAPPORTO GARA · ', en: 'RACE REPORT · ' }),
    pilota: tr({ it: 'Pilota', en: 'Driver' }),
    auto: tr({ it: 'Auto', en: 'Car' }),
    giri: tr({ it: 'Giri', en: 'Laps' }),
    miglior: tr({ it: 'Miglior', en: 'Best' }),
    tempo: tr({ it: 'Tempo', en: 'Time' }),
    gap: tr({ it: 'Gap', en: 'Gap' }),
    pen: tr({ it: 'Pen', en: 'Pen' }),
    piloti: tr({ it: 'piloti', en: 'drivers' }),
    online: tr({ it: 'online', en: 'online' }),
    tu: tr({ it: 'tu', en: 'you' }),
    tuSei: tr({ it: 'TU: ', en: 'YOU: ' }),
    gap2: tr({ it: 'gap', en: 'gap' }),
    penalita: tr({ it: 'penalità', en: 'penalty' }),
    settore: tr({ it: 'Settore', en: 'Sector' }),
    peggiore: tr({ it: 'peggiore', en: 'worst' }),
    giroTeorico: tr({ it: 'Giro teorico (i tuoi migliori settoriali): ', en: 'Theoretical lap (your best sectors): ' }),
    scorta: tr({ it: 'scorta potenziale', en: 'potential gain' }),
    settoriPrev: tr({ it: 'Settori vs gara precedente', en: 'Sectors vs previous race' }),
    meglio: tr({ it: 'negativo = migliorato', en: 'negative = improved' }),
    giroVeloce: tr({ it: 'Giro veloce: ', en: 'Fastest lap: ' }),
    firma: tr({ it: 'Generato da evo-pitwall', en: 'Generated by evo-pitwall' }),
  };
}

/* ---------------------------------------------------------------- MD (Discord) */
/**
 * Il testo Discord-ready: titolo + podio + classifica in blocco monospazio +
 * la tua gara (settori del tuo giro, giro teorico, testa a testa MP) + giro
 * veloce + firma. Discord NON disegna le tabelle → colonne allineate a mano.
 */
export function mdCompose(d, { me = null, fl = null, sect = null, prev = null, build = null } = {}) {
  const L = locale();
  const pad = (s, w) => { s = g(s); return s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w); };
  // larghezza colonna = la più larga dei dati, con tetto esplicito (Discord monospace)
  const larghezza = (vals, tetto) => Math.max(...vals.map((v) => Math.min(g(v).length, tetto)), 4);

  const nomeMe = (r) => (r.me ? `▸ ${r.name}` : r.name);
  const limPilota = larghezza(d.rows.map((r) => nomeMe(r)), 30);
  const limAuto = larghezza(d.rows.map((r) => r.car), 26);
  const limBest = larghezza(d.rows.map((r) => r.bestLap || '—'), 10);
  const limTempo = larghezza(d.rows.map((r) => r.totalTime || '—'), 11);
  const limGap = 9;   // arriva largo per «−2 giri» (vedi gapDi)

  const cella = (r) => [
    (r.dsq ? 'DSQ' : `P${r.position}`).padStart(3),
    pad(nomeMe(r), limPilota),
    pad(r.car, limAuto),
    String(r.laps ?? 0).padStart(4),
    pad(r.hasBest && r.bestLap ? `<${r.bestLap}>` : (r.bestLap || '—'), limBest),
    pad(r.totalTime || '—', limTempo),
    pad(gapTesto(r, d.rows), limGap),
    pad(r.penalty ?? '—', 6),
  ].join(' | ');

  const intestazione = [
    'P'.padStart(3),
    L.pilota.padEnd(limPilota),
    L.auto.padEnd(limAuto),
    L.giri.padStart(4),
    L.miglior.padEnd(limBest),
    L.tempo.padEnd(limTempo),
    L.gap.padStart(limGap),
    L.pen.padStart(6),
  ].join(' | ');
  const righello = [...intestazione].map(() => '─').join('');
  const blocco = [intestazione, righello, ...d.rows.map(cella)].join('\n');

  const podio = podioDi(d.rows)
    .map((r, i) => `${MEDAGLIE[i]} **P${r.position}** ${r.name}${r.penalty ? ` _${r.penalty}_` : ''} — ${r.car}`)
    .join('\n');

  // CLASSIFICA PER CLASSE (stile 24h Le Mans): solo con ≥2 classi vere.
  const classiS = sezioneClassi(d.rows);
  const capoClassi = classiS ? [
    `\n🏁 **${classiS.titolo}**`,
    classiS.premi,
    ...classiS.blocchi.map((b) => `\`\`\`\n${b}\n\`\``),
  ] : [];

  const capo = [
    `🏁 **${L.titolo}${d.track}${d.layout ? ` — ${d.layout}` : ''}**`,
    [
      dataDi(d.file),
      d.session,
      d.event,
      `${tr({ it: 'ore ', en: 'at ' })}${d.hour ?? '?'}:${String(d.min ?? 0).padStart(2, '0')}`,
      `☁️ ${d.weather || 'n/d'}`,
      `${d.rows.length} ${L.piloti}`,
      d.is_mp ? `🌐 ${L.online}` : null,
    ].filter(Boolean).join(' · '),
  ].join('\n');

  /* la TUA gara: posizione, gap, penalità, settori del tuo giro vs griglia */
  const tue = [];
  if (me) {
    tue.push(`⭐ ${L.tuSei}${me.dsq ? '**DSQ**' : `**P${me.position}**`}${me.gap != null ? ` · ${L.gap2} ${fmtGap(me.gap)}` : ''}${me.penalty ? ` · ${L.penalita} ${me.penalty}` : ''} · ${L.miglior} ${me.bestLap || '—'}${me.car ? ` · ${me.car}` : ''}`);
    if (sect && Number.isFinite(sect.theoreticalMs)) {
      const righeS = sect.sectors.map((s) =>
        `${L.settore} ${s.index} ${s.deltaMs != null ? `${s.deltaMs > 0 ? '+' : ''}${(s.deltaMs / 1000).toFixed(3)}"` : '—'}`).join(' · ');
      const peg = sect.worstSector
        ? ` (${L.peggiore}: ${L.settore} ${sect.worstSector.index} +${(sect.worstSector.deltaMs / 1000).toFixed(3)}")`
        : '';
      tue.push(`🎯 ${righeS}${peg}`);
      tue.push(`🧩 ${L.giroTeorico}**${sect.theoreticalText}**${sect.theoreticalGainText ? ` — ${L.scorta} ${sect.theoreticalGainText}` : ''}`);
    }
    if (prev && sect) {
      // il tuo evoluzione settoriale: attuale vs precedente, negativo = migliorato
      const no = Math.min(sect.sectors.length, prev.sectors.length);
      const rigaPrev = [];
      for (let i = 0; i < no; i++) {
        const attuale = sect.sectors[i].mine, prima = prev.sectors[i].mine;
        if (!Number.isFinite(attuale) || !Number.isFinite(prima)) { rigaPrev.push(`S${i + 1} —`); continue; }
        const dlt = (attuale - prima) / 1000;
        rigaPrev.push(`S${i + 1} ${dlt > 0 ? '+' : ''}${dlt.toFixed(3)}`);
      }
      tue.push(`🕰 ${L.settoriPrev} (${prev.etichetta}): ${rigaPrev.join(' · ')} *(${L.meglio})*`);
    }
  }

  const h2h = d.rows
    .filter((r) => !r.me && r.h2h && r.h2h.meetings > 1)
    .slice(0, 6)
    .map((r) => `⚔️ ${r.name}: ${L.tu} ${r.h2h.tu}–${r.h2h.lui} (${r.h2h.meetings})`);

  const veloce = fl ? `⚡ ${L.giroVeloce}**${fl.bestLap}** ${fl.name}${fl.me ? ` (${L.tu})` : ''}` : null;
  const firma = `_——_ ${L.firma} build ${build?.semver ?? '?'}${build?.hash ? ` (${build.hash})` : ''}`;

  return [
    capo,
    podio || null,
    ...capoClassi,
    `\`\`\`\n${blocco}\n\`\`\``,
    ...tue,
    veloce,
    ...h2h,
    '',
    firma,
  ].filter((x) => x != null && x !== '').join('\n');
}

/* ---------------------------------------------------------------- HTML */
/** L'anteprima HTML: stesso dossier, la tua riga in oro, il testo MD qui sotto. */
export function htmlCompose(d, { md = '' } = {}) {
  const L = locale();
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const righe = d.rows.map((r) => `<tr class="${r.me ? 'me' : ''}">
    <td>${r.dsq ? 'DSQ' : `P${r.position}`}</td>
    <td>${esc(r.name)}${r.me ? ' ⭐' : ''}</td>
    <td>${esc(r.car)}</td>
    <td class="r">${r.laps}</td>
    <td class="r">${esc(r.bestLap || '—')}</td>
    <td class="r">${esc(r.totalTime || '—')}</td>
    <td class="r">${esc(gapTesto(r, d.rows))}</td>
    <td class="r">${r.penalty ? esc(r.penalty) : ''}</td>
    <td class="r">${r.h2h ? `${r.h2h.tu}–${r.h2h.lui}` : ''}</td>
  </tr>`).join('\n');
  const podio = podioDi(d.rows)
    .map((r, i) => `${MEDAGLIE[i]} <b>P${r.position}</b> ${esc(r.name)} — ${esc(r.car)}${r.penalty ? ` <i>${esc(r.penalty)}</i>` : ''}`)
    .join(' · ');
  // CLASSIFICA PER CLASSE (stile 24h Le Mans): solo con ≥2 classi vere.
  const classiS = sezioneClassi(d.rows);
  const etichettaClasse = (c) => (c === '-' ? tr({ it: 'Diversi', en: 'Various' }) : c);
  const tabClassi = classiS ? `<div class="podio"><b>${esc(classiS.titolo)}</b><br>${esc(classiS.premi)}</div>
<table class="tab"><thead><tr><th>${esc(tr({ it: 'Classe', en: 'Class' }))}</th><th>P</th><th>${esc(L.pilota)}</th><th>${esc(L.auto)}</th><th class="r">${esc(L.giri)}</th><th class="r">${esc(L.miglior)}</th><th class="r">${esc(L.gap)}</th></tr></thead>
<tbody>${classiS.gruppi.map((gr) => gr.righe
    .map((r) => `<tr><td>${esc(etichettaClasse(gr.classe))}</td><td>P${r.posClasse}</td><td>${esc(r.name)}${r.me ? ' ⭐' : ''}</td><td>${esc(r.car)}</td><td class="r">${r.laps}</td><td class="r">${esc(r.bestLap || '—')}</td><td class="r">${esc(gapTesto(r, d.rows))}</td></tr>`)
    .join('')).join('')}</tbody></table>` : '';
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<title>${esc(d.track)} — ${esc(d.event)}</title>
<style>
 body{font-family:system-ui,Segoe UI,sans-serif;background:#14171f;color:#e8eaf0;margin:0;padding:24px}
 .wrap{max-width:1000px;margin:0 auto}
 h1{font-size:22px;margin:0 0 4px} .meta{color:#9aa3b5;font-size:13px;margin-bottom:10px}
 .podio{margin:0 0 4px;font-size:15px}
 table.tab{width:100%;border-collapse:collapse;font-size:14px;margin-top:12px}
 table.tab th,table.tab td{border-bottom:1px solid #242b3a;padding:6px 8px;text-align:left}
 table.tab th{color:#9aa3b5;font-weight:600;font-size:12px}
 table.tab .r{text-align:right}
 tr.me{background:#2a2410} tr.me td{color:#ffd766}
 pre.md{background:#1b2030;border:1px solid #2b3345;border-radius:8px;padding:14px;overflow:auto;font-size:12.5px;color:#cdd3e0;white-space:pre-wrap}
</style></head><body><div class="wrap">
<h1>🏁 ${esc(d.track)}${d.layout ? ` — ${esc(d.layout)}` : ''}</h1>
<div class="meta">${esc(d.session)} · ${esc(d.event)} · ${tr({ it: 'ore ', en: 'at ' })}${esc(d.hour ?? '?')}:${String(d.min ?? 0).padStart(2, '0')} · ☁️ ${esc(d.weather || 'n/d')} · ${d.rows.length} ${esc(L.piloti)}${dataDi(d.file) ? ` · ${esc(dataDi(d.file))}` : ''}</div>
${podio ? `<div class="podio">${podio}</div>` : ''}
${tabClassi}
<table class="tab"><thead><tr><th>P</th><th>${esc(L.pilota)}</th><th>${esc(L.auto)}</th><th class="r">${esc(L.giri)}</th><th class="r">${esc(L.miglior)}</th><th class="r">${esc(L.tempo)}</th><th class="r">${esc(L.gap)}</th><th class="r">${esc(L.pen)}</th><th class="r">⚔️</th></tr></thead>
<tbody>${righe}</tbody></table>
<pre class="md">${esc(md)}</pre>
</div></body></html>`;
}

/* ---------------------------------------------------------------- entry */

/** Composizione completa + salvataggio del .md in report/gare/. Niente tiri: tutto da dati veri. */
export function rapportoGara(paths, fileName, { driver = null, salva = true } = {}) {
  const safe = g(fileName);
  if (!safe) return { error: tr({ it: 'File risultato non indicato.', en: 'Result file not given.' }) };
  const d = resultDetail(paths, safe, { driver });
  if (!d) return { error: tr({ it: 'File non trovato.', en: 'File not found.' }) };

  /* settori del tuo giro: dal file NATIVO (resultDetail non porta gli splits).
     Anche qui il riconoscimento del pilota passa dallo stesso findPlayerDriver
     usato da archivio e import: d'entrata vale la parola al libro del pilota. */
  let sect = null;
  let prev = null;
  try {
    const raw = readRaw(paths, safe);
    if (raw) {
      const meRaw = findPlayerDriver(raw, driver).driver
        ?? raw.drivers.find((x) => x.is_current_driver === true && x.has_best_lap === true)
        ?? null;
      if (meRaw) {
        sect = sectorAnalysis(raw, meRaw);
        if (sect) prev = settoriPrecedente(paths, raw.track, safe, driver);
      }
    }
  } catch { /* senza splits il rapporto resta completo senza la sezione settori */ }

  const me = d.rows.find((r) => r.me) ?? null;
  // ripiego MoTeC: il gioco CHIscrive il best vuoto non deve lasciare «—»
  // nel rapporto quando la telemetria della sessione ha i giri veri.
  try {
    const vuoto = me && !String(me.bestLap ?? '').trim();
    if (vuoto) {
      const dir = (resultDirs(paths) ?? []).find((x) => existsSync(join(x, safe)));
      const b = dir ? bestLapDaMotec(paths, me, d.track, statSync(join(dir, safe)).mtimeMs) : null;
      if (b) { me.bestLap = b; me.hasBest = true; }
    }
  } catch { /* senza MoTeC il rapporto resta con «—», com'era */ }
  const fl = giroVeloce(d.rows);
  let build = null;
  try { build = buildVersion(); } catch { /* senza git il semver basta */ }

  const md = mdCompose(d, { me, fl, sect, prev, build });
  const html = htmlCompose(d, { me, md });

  let salvatoMd = null;
  if (salva) {
    try {
      mkdirSync(OUT_DIR, { recursive: true });
      salvatoMd = join(OUT_DIR, `${baseDi(safe)}.rapporto.md`);
      writeFileSync(salvatoMd, md, 'utf8');
    } catch { /* il salvataggio non deve bloccare la copia col clipboard */ }
  }
  return { md, html, salvatoMd, is_mp: d.is_mp, track: `${d.track}${d.layout ? ` — ${d.layout}` : ''}` };
}
