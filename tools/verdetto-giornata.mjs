// tools/verdetto-giornata.mjs — IL VERDETTO DI GIORNATA (29/10, richiesta
// Mauro: «estrai il verdetto di oggi»). Come il rapporto di gara
// (src/rapporto-gara.mjs) ma in scala giornata: TUTTE le gare di un giorno
// (prefisso aammgg dei file Results, oggi di default) in un dossier compatto
// — una riga per gara + il conto totale (vittorie, podi, posizione media,
// giro migliore globale) — salvato in report/gare/verdetto-aammgg.md.
//
//   node tools/verdetto-giornata.mjs            # la GIORNATA di oggi
//   node tools/verdetto-giornata.mjs 291026     # un giorno preciso (prefisso nome file)
//
// Niente dati fittizi: ogni numero esce da resultDetail (catalog.mjs) sui
// file nativi di EVO; il pilota è quello del save di carriera (stesso
// riconoscimento findPlayerDriver). I file illeggibili passano in silenzio
// (il catalogo li ha già sanificati), la giornata senza gare non crasha.
// UNA SOLA VERITÀ (2/11): qui contano SOLO le gare (isRaceSession, la stessa
// regola dell'import di carriera) e sulla STESSA deduplica del catalogo —
// una practice doppiata non paga né il posto né il giro. Practice e quali
// NON pagano il verdetto (come in carriera): restano NOTE sotto le gare.

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePaths } from '../src/paths.mjs';
import { resultDetail, resultDirs } from '../src/catalog.mjs';
import { lapToMs, isRaceSession } from '../src/results.mjs';
import { tr } from '../src/lang.mjs';

const PROJECT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = process.env.EVO_REPORT_DIR ?? join(PROJECT, 'report', 'gare');

/** Ora e minuti dal nome file dei Results (aammgg-HHMM_...): dopo il trattino. */
function dalNome(file) {
  const m = String(file).match(/^(\d{6})-(\d{2})(\d{2})_/);
  return m ? `${m[2]}:${m[3]}` : '';
}

/** Il core: gare del giorno (prefisso), righe compatte e aggregato.
 *  `opts.files` (solo per i test) sostituisce la scansione dei Results. */
export function verdettoGiornata({ paths, driver, prefix, files = null } = {}) {
  // IL PREFISSO di default è aammgg di OGGI — MAI la stringa "undefined":
  // (31/10, richiesta Mauro: «verdetto di gara oggi non va»): la GUI chiamava
  // /api/verdetto SENZA prefisso, l'endpoint passava `prefix: undefined` e la
  // scansione cercava il NOME FILE letterale «undefined…» — il verdetto del
  // webui diceva «Gare 0» su qualsiasi giornata piena (il CLI era a posto,
  // perché il default di oggi lo calcolava solo lui). Adesso il default vive
  // DENTRO la funzione: una sola fonte, chi la chiama senza prefisso la riceve.
  if (!prefix) {
    const oggi = new Date(); const due = (n) => String(n).padStart(2, '0');
    prefix = `${String(oggi.getFullYear()).slice(2)}${due(oggi.getMonth() + 1)}${due(oggi.getDate())}`;
  }
  const dirs = paths?.resultsDirs?.length ? paths.resultsDirs : resultDirs(paths ?? {});
  const lista = files ?? dirs.flatMap((d) => {
    if (!existsSync(d)) return [];
    return readdirSync(d).filter((f) => f.startsWith(prefix) && f.endsWith('.sessionresults.json')).sort();
  });
  const gare = [];
  // LE SEZIONI DELLE NOTE (30/10 rigenerato il 261029, richiesta Mauro: «quali in
  // sezione a parte»): le Quali hanno la LORO tabella, separate dalle
  // practice — è la storia della GRIGLIA, come è costruita da partire. Solo
  // le gare entrano nell'aggregato: nessuna sessione di nota paga il verdetto.
  const practice = [];
  const quali = [];
  const altre = [];   // ogni altra sessione non gara (warmup, hotlap, custom)
  for (const f of lista) {
    const det = resultDetail(paths, f, { driver });
    if (!det) continue;
    const me = det.rows.find((r) => r.me);
    const base = {
      file: f,
      ora: dalNome(f),
      pista: det.track + (det.layout ? ` (${det.layout})` : ''),
      sessione: det.session ?? '?',
      mioGiro: me?.bestLap ?? null,
    };
    // SOLO le gare entrano nell'aggregato (isRaceSession sulla sessione del
    // dettaglio, la stessa regola dell'import); il resto è la nota.
    if (isRaceSession(det)) {
      gare.push({ ...base, meteo: det.weather, posto: me?.position ?? null, dsq: me?.dsq ?? false,
        penalita: me?.penalty ?? null, partecipanti: det.rows.length, gap: me?.gap ?? null });
    } else if (/qualif/i.test(det.session ?? '')) {
      quali.push(base);
    } else if (/practice/i.test(det.session ?? '')) {
      practice.push(base);
    } else {
      altre.push(base);
    }
  }
  const sezioneNote = (lista, titoloIt, titoloEn) => {
    if (!lista.length) return [];
    return [
      '',
      `${tr({ it: titoloIt, en: titoloEn })} (${lista.length}):`,
      '',
      `| ${tr({ it: 'Ora', en: 'Time' })} | ${tr({ it: 'Sessione', en: 'Session' })} | ${tr({ it: 'Pista', en: 'Track' })} | ${tr({ it: 'Tuo giro', en: 'Your lap' })} |`,
      '|---|---|---|---|',
      ...lista.map((a) => `| ${a.ora || '—'} | ${a.sessione} | ${a.pista} | ${a.mioGiro ?? '—'} |`),
    ];
  };
  const noteGare = () => [
    ...sezioneNote(quali, 'Qualifiche della giornata, sezione a parte (la griglia, non il verdetto)', 'Quali of the day, separate section (the grid, not the verdict)'),
    ...sezioneNote(practice, 'Practice della giornata (non conta nel verdetto)', 'Practice of the day (not counted)'),
    ...sezioneNote(altre, 'Altre sessioni della giornata (non contano nel verdetto)', 'Other sessions of the day (not counted)'),
  ];
  if (!gare.length) {
    const vuota = quali.length + practice.length + altre.length > 0;
    const testo = vuota
      ? `${tr({ it: 'Nessuna gara', en: 'No races' })} ${prefix}: ${tr({ it: 'ma la giornata non era vuota — quali, practice e altre qui sotto, non pagano il verdetto.', en: 'but the day was not empty — quali, practice and others below, they do not count.' })}`
      : `${tr({ it: 'Nessuna gara', en: 'No races' })} ${prefix}: ${tr({ it: 'nessun file risultato con quel prefisso.', en: 'no result file with that prefix.' })}`;
    return { md: `**${testo}**\n${noteGare().join('\n')}\n`, gare: [] };
  }
  const giriValidi = gare.filter((g) => g.mioGiro).map((g) => ({ g, ms: lapToMs(g.mioGiro) })).filter((x) => Number.isFinite(x.ms)).sort((a, b) => a.ms - b.ms);
  const giroTop = giriValidi[0] ?? null;
  const posti = gare.filter((g) => g.posto != null && !g.dsq).map((g) => g.posto);
  const conta = (a, b) => gare.filter((g) => !g.dsq && g.posto != null && g.posto >= a && g.posto <= b).length;
  const vittorie = conta(1, 1);
  const podi = conta(1, 3);
  const mediaPos = posti.length ? (posti.reduce((s, p) => s + p, 0) / posti.length) : null;
  const nul = (v) => (v ?? '—');
  const sMs = (ms) => {
    if (!Number.isFinite(ms)) return '—';
    const s = ms / 1000; const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(3).padStart(6, '0')}`;
  };
  // la penalità resta NELLA cella del giro: colonna extra fuori dalla
  // tabella Discord non la disegna né la allinea
  // il gap negativo (tu davanti al vincitore di riferimento: usato nel DNF,
  // dove il result você è "sopra la linea") NON deve stampare "+-75.9s"
  const gapStr = (ms) => {
    if (ms == null) return '—';
    const s = (ms / 1000).toFixed(1);
    return (ms < 0 ? '-' : '+') + Math.abs(Number(s)).toFixed(1) + 's';
  };
  const righe = gare.map((g) => `| ${g.ora} | ${g.pista} | ${nul(g.posto)}/${g.partecipanti} | ${gapStr(g.gap)} | ${g.mioGiro ?? '—'}${g.penalita ? ` (${g.penalita})` : ''} |`);
  const md = [
    `# ${tr({ it: 'Verdetto di giornata', en: 'Day verdict' })} — ${tr({ it: 'prefix', en: 'prefix' })} ${prefix}`,
    '',
    `${tr({ it: 'Gare', en: 'Races' })} ${gare.length} · ${vittorie} ${tr({ it: 'vittorie', en: 'wins' })} · ${podi} ${tr({ it: 'podi', en: 'podiums' })} · ${tr({ it: 'posizione media', en: 'average position' })} ${mediaPos != null ? mediaPos.toFixed(1) : '—'} · ${tr({ it: 'giro migliore', en: 'best lap' })} ${giroTop ? sMs(giroTop.ms) + ` (${giroTop.g.pista})` : '—'}`,
    '',
    `| ${tr({ it: 'Ora', en: 'Time' })} | ${tr({ it: 'Pista', en: 'Track' })} | ${tr({ it: 'Posto', en: 'Pos' })} | ${tr({ it: 'Gap', en: 'Gap' })} | ${tr({ it: 'Tuo giro', en: 'Your lap' })} |`,
    '|---|---|---|---|---|',
    ...righe,
    ...noteGare(),
  ].join('\n') + '\n';
  return {
    md,
    gare,
    aggregato: { gare: gare.length, vittorie, podi, mediaPos, giroTop: giroTop ? { ms: giroTop.ms, pista: giroTop.g.pista } : null },
  };
}

/* ---------------- CLI ---------------- */
const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const prefisso = process.argv[2] ?? (() => {
    // IL PREFISSO dei file Results è aammgg (261029): anno, mese, giorno —
    // come li nomina il gioco, non come li leggiamo a voce.
    const oggi = new Date(); const due = (n) => String(n).padStart(2, '0');
    return `${String(oggi.getFullYear()).slice(2)}${due(oggi.getMonth() + 1)}${due(oggi.getDate())}`;
  })();
  const save = (() => {
    try { return JSON.parse(readFileSync(join(PROJECT, 'data', 'evo-career.save.json'), 'utf8')); } catch { return null; }
  })();
  if (!save?.driver) { console.error('Salvataggio di carriera non leggibile: serve il pilota per il riconoscimento.'); process.exit(1); }
  const v = verdettoGiornata({ paths: resolvePaths({}), driver: save.driver, prefix: prefisso });
  if (!v.gare.length) { console.log(v.md); process.exit(0); }
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `verdetto-${prefisso}.md`);
  writeFileSync(file, v.md);
  console.log(`SALVATO IN: ${file}\n`);
  console.log(v.md);
}
