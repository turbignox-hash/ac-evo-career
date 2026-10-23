#!/usr/bin/env node
// Generatore one-shot degli annunci in bacheca mancanti (richiesta Mauro 23/10).
// Per ogni gara nel libro di bordo senza il suo annuncio, ricostruisce il testo
// con lo STESSO template di state.mjs (applyRaceResult) e lo appende con at=gara.
// Con backup automatico del save e riepilogo stampato a fine.

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SAVE = join(ROOT, 'data', 'evo-career.save.json');
const LADDER = join(ROOT, 'config', 'career.evo.ladder.json');
const FLOWS = join(ROOT, 'data', 'flows.jsonl');

const state = JSON.parse(readFileSync(SAVE, 'utf8'));
const ladder = JSON.parse(readFileSync(LADDER, 'utf8'));

const nodeOf = (id) => ladder.nodes.find((n) => n.nodeId === id) ?? null;
const day = (s) => (typeof s === 'string' ? s.slice(0, 10) : '');

// flussi sponsor (quota gara / fondo spettatori) scritti nello stesso import —
// finestra ±120 s ristretta a node+season+round della gara da annunciare
let sponsorRows = [];
try { sponsorRows = readFileSync(FLOWS, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { /* senza registro: sponsor 0 */ }
const sponsorTotalOf = (race, nodeId) => sponsorRows
  .filter((f) => f.kind === 'sponsor' && f.node === nodeId && f.season === race.season
    && Math.abs(new Date(f.at).getTime() - new Date(race.at).getTime()) <= 120_000)
  .reduce((a, f) => a + Number(f.money ?? 0), 0);

// annuncio già presente? (stesso criterio del dottore incluso l'allineamento
// per at: l'importer scrive gara e annuncio nello stesso istante ±2 s)
const existing = state.messages ?? [];
const RondName = (node, round) => node?.calendar?.[round]?.name ?? `Round ${round + 1}`;

const out = [];
let piuRecenti = null;
for (const [nodeId, list] of Object.entries(state.results ?? {})) {
  const node = nodeOf(nodeId);
  const display = node?.display ?? nodeId;
  for (const race of list ?? []) {
    const name = RondName(node, race.round);
    const hit = existing.some((m) => {
      const t = `${m.text ?? ''}\n${m.textEn ?? ''}`;
      if (t.includes(String(display)) && t.includes(name) && (race.dnf ? t.includes('ritiro') || t.includes('retired') : t.includes(`P${race.position}`))) return true;
      if (!race.at || !m.at) return false;
      const dms = Math.abs(new Date(m.at).getTime() - new Date(race.at).getTime());
      return dms <= 2000 && t.includes('premio');
    });
    if (hit) continue;
    const gapMs = Number(race.gapMs ?? null);
    const gapText = !race.dnf && Number.isFinite(gapMs) && gapMs > 0
      ? (gapMs >= 60000 ? `+${Math.floor(gapMs / 60000)}'${String(Math.round((gapMs % 60000) / 1000)).padStart(2, '0')}"` : `+${(gapMs / 1000).toFixed(1)}"`)
      : null;
    const sponsorTotal = sponsorTotalOf(race, nodeId);
    const base = { display, name, race, gapText, sponsorTotal };
    out.push(base);
  }
}

if (!out.length) { console.log('Nessun annuncio mancante: il save è già completo.'); process.exit(0); }

// appende a messages (pushMessage non riordina: array alla fine) con cap a 60
const msgs = [...(state.messages ?? [])];
out.reverse(); // le più vecchie per prime in fondo... no: pushMessage emula l'ordine di scrittura; qui generiamo dagli eventi in ordine cronologico
const chron = [...out].sort((a, b) => String(a.race.at).localeCompare(String(b.race.at)));
for (const o of chron) {
  const { display, name, race, gapText, sponsorTotal } = o;
  const it = `${display} · ${name}: ${race.dnf ? 'ritiro' : 'P' + race.position}${gapText ? ' ' + gapText : ''}${race.fl && race.bestLap ? ` · giro veloce ${race.bestLap}` : ''} · +${race.prize} premio (+${sponsorTotal} sponsor) · +${race.rep} reputazione`;
  const en = `${display} · ${name}: ${race.dnf ? 'retired' : 'P' + race.position}${gapText ? ' ' + gapText : ''}${race.fl && race.bestLap ? ` · fastest lap ${race.bestLap}` : ''} · +${race.prize} prize (+${sponsorTotal} sponsor) · +${race.rep} reputation`;
  msgs.push({ at: race.at, kind: race.dnf ? 'bad' : race.position <= 3 ? 'good' : 'info', text: it, textEn: en === it ? undefined : en });
}
// cap 60 come pushMessage, tenendo i più recenti
piuRecenti = msgs.slice(-60);
msgs.length = 0; msgs.push(...piuRecenti);
state.messages = msgs;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
copyFileSync(SAVE, `${SAVE}.bak-msggen-${stamp}`);
writeFileSync(SAVE, JSON.stringify(state, null, 1) + '\n', 'utf8');

console.log(`== Generati ${chron.length} annunci (cap bacheca 60 tenuto).`);
for (const o of chron.slice(0, 6)) console.log(`   ${o.race.at}  ${o.display} · ${o.name} → P${o.race.position}`);
if (chron.length > 6) console.log(`   … e altri ${chron.length - 6}`);
console.log(`== Backup: ${SAVE}.bak-msggen-${stamp}`);
