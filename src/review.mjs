// review.mjs — la rassegna di fine stagione: la carriera si racconta da sola.
// Dalla storia vera (gare, rivali, messaggi) costruisce il riassunto dell'anno:
// risultati gara per gara, il duello dell'anno, la rimonta più bella, i soldi.
// Usata dalla GUI (bottone nel cruscotto a stagione chiusa) e dalla CLI
// (comando "review", anche per le stagioni passate con --season N).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeById } from './state.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RIVALS_FILE = join(HERE, '..', 'data', 'rivals.json');
const JOURNAL_DIR = join(HERE, '..', 'data', 'journal');
const lapMs = (t) => { const m = String(t ?? '').match(/^(\d+):(\d+)\.(\d+)$/); return m ? +m[1] * 60000 + +m[2] * 1000 + +m[3] : Infinity; };

/**
 * La rassegna della stagione `season` (default: la più recente registrata
 * in state.seasons, altrimenti quella corrente). Restituisce un oggetto
 * strutturato + un testo pronto da leggere o condividere.
 */
export function seasonReview(ladder, state, { season = null } = {}) {
  const all = Object.entries(state.results ?? {})
    .flatMap(([nodeId, list]) => (list ?? []).map((r) => ({ ...r, nodeId })))
    .filter((r) => r.season === season)
    .sort((a, b) => a.round - b.round);
  const summary = (state.seasons ?? []).find((x) => x.season === season) ?? null;
  const first = all[0];
  const nodeId = summary?.node ?? first?.nodeId ?? state.node;
  const node = ladder.nodes.find((n) => n.nodeId === nodeId) ?? nodeById(ladder, state.node);
  const trackDisp = (id) => ladder.contentNames?.tracks?.[id] ?? id;

  const wins = all.filter((r) => !r.dnf && r.position === 1).length;
  const podiums = all.filter((r) => !r.dnf && r.position <= 3).length;
  const fls = all.filter((r) => r.fl).length;
  const poles = all.filter((r) => r.pole === true).length;
  const points = all.reduce((a, r) => a + (r.points ?? 0), 0);
  const prize = all.reduce((a, r) => a + (r.prize ?? 0), 0);
  const dnfs = all.filter((r) => r.dnf).length;

  // battaglie: gare decise sotto i 3 secondi (gap dal vincitore)
  const close = all.filter((r) => Number.isFinite(r.gapMs) && r.gapMs != null && r.gapMs > 0 && r.gapMs < 3000);

  // rivali incontrate quest'anno, dal registro
  let rivalRows = [];
  try {
    if (existsSync(RIVALS_FILE)) {
      const store = JSON.parse(readFileSync(RIVALS_FILE, 'utf8'));
      const seen = new Map();
      for (const race of store.races ?? []) {
        if (race.season !== season) continue;
        const me = (race.grid ?? []).find((g) => g.isPlayer);
        if (!me) continue;
        for (const g of race.grid ?? []) {
          if (g.isPlayer) continue;
          const rv = seen.get(g.key) ?? { key: g.key, name: g.full, team: g.team ?? null, meetings: 0, beatenByMe: 0, beatenMe: 0, bestPos: 99 };
          rv.meetings += 1;
          if (!g.dnf && g.position < rv.bestPos) rv.bestPos = g.position;
          const myPos = me.dnf ? (race.grid?.length ?? 99) + 1 : me.position;
          const hisPos = g.dnf ? (race.grid?.length ?? 99) + 1 : g.position;
          if (myPos < hisPos) rv.beatenByMe += 1; else if (myPos > hisPos) rv.beatenMe += 1;
          seen.set(g.key, rv);
        }
      }
      rivalRows = [...seen.values()].sort((a, b) => b.meetings - a.meetings || a.bestPos - b.bestPos);
    }
  } catch { /* senza registro la rassegna esce comunque */ }
  const duello = rivalRows.slice().sort((a, b) => (b.beatenMe + b.beatenByMe) - (a.beatenMe + a.beatenByMe))[0] ?? null;

  const champion = summary?.champion ?? false;
  const position = summary?.position ?? null;

  const lines = [];
  lines.push(`# Stagione ${season} — ${node.display}`);
  if (summary) lines.push('');
  if (summary) lines.push(champion ? `🏆 **CAMPIONE** con ${summary.points} punti` : `Stagione chiusa in P${summary.position} con ${summary.points} punti`);
  lines.push('');
  lines.push(`**Gare**: ${all.length} · **Vittorie**: ${wins} · **Podi**: ${podiums} · **Pole**: ${poles} · **Giri veloci**: ${fls}${dnfs ? ` · **Ritiri**: ${dnfs}` : ''}`);
  lines.push(`**Punti**: ${points} · **Premi incassati**: ${prize.toLocaleString('it-IT')} €`);
  // la saga di famiglia: capitoli completati nell'anno
  const heritageDone = (state.heritage?.completed ?? []).filter((c) => c.claimedSeason === season);
  if (heritageDone.length) {
    lines.push('');
    lines.push('## Le memorie di famiglia');
    for (const c of heritageDone) lines.push(`- 📜 **${c.title}** — ${c.ancestor}, ${c.relation ?? 'antenato'} (${c.era}, ${c.series}): eredità incassata +${Number(c.inherit ?? 0).toLocaleString('it-IT')} €.`);
  }
  if (all.length) {
    lines.push('');
    lines.push('## Le gare');
    for (const r of all) {
      const label = `${trackDisp(r.track)}${r.durationMin ? ` (${r.durationMin}′ a tempo)` : ''}`;
      const pos = r.dnf ? 'ritiro' : `P${r.position}`;
      const extra = [r.pole ? 'pole' : null, r.fl ? `giro veloce ${r.bestLap ?? ''}`.trim() : null, r.gridPosition ? `partito P${r.gridPosition}` : null].filter(Boolean).join(', ');
      lines.push(`- **${pos}** a ${label}${extra ? ` (${extra})` : ''} — +${r.points} pt, +${(r.prize ?? 0).toLocaleString('it-IT')} €`);
    }
  }
  if (rivalRows.length) {
    lines.push('');
    lines.push('## I rivali dell\'anno');
    for (const rv of rivalRows.slice(0, 8)) {
      lines.push(`- **${rv.name}**${rv.team ? ` (${rv.team})` : ''}: ${rv.meetings} scontri, ${rv.beatenByMe} vinti da te${rv.beatenMe ? `, ${rv.beatenMe} persi` : ''}${rv.bestPos < 99 ? `, suo best P${rv.bestPos}` : ''}`);
    }
  }
  if (duello) {
    lines.push('');
    lines.push(`⚔️ **Duello dell'anno**: ${duello.name}, ${duello.meetings} scontri (${duello.beatenByMe}-${duello.beatenMe} per te).`);
  }
  if (close.length) {
    lines.push('');
    lines.push(`🔥 **Arrivi sparati**: ${close.map((r) => `${trackDisp(r.track)} +${(r.gapMs / 1000).toFixed(1)}"`).join(', ')}.`);
  }

  const review = {
    season, node: node.display, champion, position,
    stats: { races: all.length, wins, podiums, poles, fls, dnfs, points, prize },
    races: all, rivals: rivalRows, duello, close,
    text: lines.join('\n'),
  };
  // se esiste già una rassegna esportata per questa stagione, riprendila (stesso testo)
  if (existsSync(JOURNAL_DIR)) {
    const file = join(JOURNAL_DIR, `stagione-${season}.md`);
    try { if (existsSync(file)) review.file = file; } catch { /* n/d */ }
  }
  return review;
}

/** Salva la rassegna in data/journal/stagione-N.md e ritorna il percorso. */
export function exportReview(review) {
  mkdirSync(JOURNAL_DIR, { recursive: true });
  const file = join(JOURNAL_DIR, `stagione-${review.season}.md`);
  writeFileSync(file, review.text + '\n', 'utf8');
  return file;
}

/** Lista delle stagioni di cui esiste una rassegna possibile. */
export function reviewableSeasons(state) {
  const done = (state.seasons ?? []).map((s) => s.season);
  const running = Object.values(state.results ?? {}).flat().length ? [state.season] : [];
  return [...new Set([...done, ...running])].sort((a, b) => b - a);
}
