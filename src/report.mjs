// report.mjs — come l'utente ci raggiunge: il bottone "Segnala un problema"
// apre una issue GitHub GIÀ COMPILATA dal tool (versione build, serie in corso,
// ronda, pista, difficoltà, ultimi errori del registro) e l'utente completa
// il testo e invia. Zero servizi esterni: il POST lo fa il browser su github.com,
// qui si costruisce solo l'URL. Il link donazioni Ko-fi arriva dal config
// (data/evo.config.json, campo "kofi": URL completo) rimane nascosto finché
// l'autore non lo imposta — niente segnaposto visibili in GUI.
//
//  feedbackReport(ctx, { repo, kofi })  → { title, body }
//  feedbackLinks(ctx, opts?)            → { issuesUrl, kofi }

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILE } from './webui-env.mjs';
import { readWarnings } from './warnings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RADICE = join(HERE, '..');

function gitRun(args, timeout = 8000) {
  return execFileSync('git', args, {
    encoding: 'utf8', cwd: RADICE, timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).toString().trim();
}

/** owner/repo da GitHub, leggendo i remote git (prima "offsite", poi "origin"). */
export function githubRepo() {
  for (const remote of ['offsite', 'origin', 'upstream']) {
    try {
      const url = gitRun(['remote', 'get-url', remote]);
      const m = String(url).match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
      if (m) return `${m[1]}/${m[2]}`;
    } catch { /* remote assente o git assente: si prova il prossimo */ }
  }
  return null;
}

/** URL Ko-fi da config (evo.config.json). Null se non impostato o se il campo è segnaposto. */
export function kofiUrl() {
  try {
    if (!existsSync(CONFIG_FILE)) return null;
    const raw = String(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')).kofi ?? '').trim();
    if (!raw || raw.includes('NOME_UTENTE')) return null;
    return raw.startsWith('http') ? raw : `https://ko-fi.com/${raw}`;
  } catch { return null; }
}

/**
 * Testo della segnalazione: versione build, stato della carriera, difficoltà
 * corrente e gli ultimi errori del registro. Il tool lo riempie, l'utente
 * scrive "cosa è successo" e invia: la issue arriva già strutturata.
 */
export function feedbackReport(ctx) {
  const ctxFallback = { ladder: null, state: null, ...(ctx ?? {}) };
  const { ladder, state } = ctxFallback;
  const version = versionLine();
  const lines = [];
  lines.push(version);
  if (state) {
    const series = state.node ? (ladder?.nodes ?? []).find((n) => n.nodeId === state.node) : null;
    const round = series?.calendar?.[Math.min(state.round ?? 0, (series?.calendar?.length ?? 1) - 1)];
    const nameOf = (id) => ladder?.contentNames?.[id !== null && typeof id !== 'object' ? 'tracks' : 'tracks']?.[id] ?? id;
    if (series) {
      lines.push(`- serie in corso: **${series.display ?? series.nodeId}** · ronda ${((state.round ?? 0) + 1)}/${series.calendar?.length ?? '?'}${round?.track ? ` · pista: ${nameOf(round.track)}` : ''}`);
    }
    if (round?.hour != null) lines.push(`- orario gara: ${round.hour}:00${round.timeScale != null ? ` (scala tempo x${round.timeScale})` : ''}`);
    if (formatDiff(state)) lines.push(`- difficoltà: ${formatDiff(state)}`);
  } else {
    lines.push('- carriera: non ancora creata');
  }
  for (const err of lastErrors()) {
    lines.push(`- errore [${err.module}] ${err.message}` + (err.extra ? ` (${err.extra})` : ''));
  }
  lines.push('');
  lines.push('---');
  return {
    title: `Segnalazione — ${version} (${new Date().toLocaleString('it-IT')})`,
    body: `${lines.join('\n')}\n\n**Descrizione del problema:**\n\n(completa qui: cosa hai fatto, cosa ti aspettavi, cosa è successo)\n`,
  };
}

function formatDiff(state) {
  const d = state?.difficulty;
  if (!d) return null;
  const mode = d.mode ?? '?';
  if (Array.isArray(d.locked) && d.locked.length) return `${mode} (${d.locked.length} serie bloccate)`;
  return `${mode}`;
}

/** { semver, hash } da package.json + git, corazzato: in test potrebbe mancare git. */
export function buildVersion() {
  let semver = '?';
  try { semver = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8')).version ?? '?'; } catch { /* pazienza */ }
  let hash = '';
  try { hash = gitRun(['rev-parse', '--short', 'HEAD']); } catch { /* senza git: tutto qui */ }
  return { semver, hash };
}

function versionLine() {
  const v = buildVersion();
  return `build ${v.semver}${v.hash ? ` (${v.hash})` : ''}`;
}

/** Ultimi 4 errori, dal più recente, come oggetti semplici. Dal registro reale. */
function lastErrors() {
  try {
    const w = readWarnings({ perModule: 50 });
    const flat = (w?.modules ?? []).flatMap((m) => (m.last ?? []).map((e) => ({ module: m.module, ...e })));
    return flat.slice(0, 4);
  } catch { return []; }
}

/** Link per il footer GUI: issuesUrl (github) + kofi (da config). */
export function feedbackLinks(ctx, opts = {}) {
  const repo = 'repo' in opts ? opts.repo : githubRepo();
  const kofi = opts.kofi ?? kofiUrl();
  const rep = feedbackReport(ctx);
  let issuesUrl = null;
  if (repo) {
    const u = new URL(`https://github.com/${repo}/issues/new`);
    u.searchParams.set('title', rep.title);
    u.searchParams.set('body', rep.body);
    issuesUrl = u.toString();
  }
  return { issuesUrl, kofi };
}
