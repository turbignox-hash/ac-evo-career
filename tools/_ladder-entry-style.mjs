// _ladder-entry-style.mjs — una passata di matita sulle SERIE DI LIVELLO 1.
//
// Lezione di Paddock (30/10, analisi della sua carriera onboarding): la prima
// serie è monomarca su PISTE CORTE con GARI LUNGHE (12 giri) e la terza
// sempre BREVE su pista breve e bagnata: la novità è solo la superficie.
// Noi teniamo 6-8 giri (12 giri Abarth bruciano troppa serata) ma adottiamo
// la logica:
//   - SOLO piste corte/leggibili (niente Monza grande in apertura),
//   - 6-8 giri: la pista si impara in 2-3, i restanti si corrono per RITMO,
//     traffico e gomme (lo sprint da 3 giri non insegna la gara),
//   - R1 e R2 asciutte, R3 SEMPRE bagnata, dopo si alterna sereno,
//   - finale asciutta.
// Tengono: la STRUTTURA della serie (num round, auto, economia). Cambia SOLO
// calendario (pista/giri/ora/meteo) — le serie di livello 1 che già combaciano
// non si toccano (passata idempotente). Il save in corso (RX-7, livello 3)
// non legge queste pagine: zero rischio di strutturare.
//
// Roundtrip PROVATO byte-identico (30/10): JSON.parse → stringify(,2)
// riproduce il file al byte, quindi il diff resta solo sui campi cambati.

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../config/career.evo.ladder.json', import.meta.url);   // URL oggetto: fs lo legge da sé (spazi inclusi)
const raw = readFileSync(FILE, 'utf8');
const ladder = JSON.parse(raw);

/* piste "facili" del libro: corte, una lezione per volta —
   BRAN 3.2km, DONI 4.0, OULTON 4.3, KYAL 4.5, RING 4.7, IMOLA come prima
   grande. MONZA/SEBRING/COTA restano per il livello 2+. */
const PISTE_CORTE = [
  'brands_hatch', 'donington_park', 'oulton_park', 'kyalami',
  'redbull_ring', 'imola',
].filter((t) => !!ladder.contentNames?.tracks?.[t]);

const ORE = [15, 14, 16, 13, 15, 14];
const METEO_DOPO = [0, 1, 3, 0, 2, 0];

for (const t of ['oulton_park', 'donington_park', 'brands_hatch', 'kyalami', 'redbull_ring', 'imola']) {
  if (!ladder.contentNames?.tracks?.[t]) console.warn(`!! pista ${t} ASSENTE nel ladder: tolta dal pool`);
}
const POOL = PISTE_CORTE;
if (POOL.length < 4) throw new Error(`pool piste corte troppo piccolo (${POOL.join(',')})`);

// giri per serie: deterministico dalla PARITA nel proprio livello/disciplina (6..8)
function giriSerie(node) {
  const idxInLevel = [...ladder.nodes].filter((n) => n.level === node.level && n.discipline === node.discipline)
    .findIndex((n) => n.nodeId === node.nodeId);
  return [7, 6, 8, 7, 6, 7][Math.max(0, idxInLevel) % 6] ?? 7;
}

let toccati = 0, giaOk = 0;
for (const node of ladder.nodes) {
  if (node.level !== 1) continue;
  const cal = node.calendar ?? [];
  if (!cal.length) continue;
  // già stile Paddock? (tutte le piste nel pool, giri 6..8, R3 bagnata)
  const giaTutto = cal.every((r) => POOL.includes(r.track)) && cal.every((r) => r.laps >= 6 && r.laps <= 8)
    && cal.length > 2 && [3, 4].includes(cal[2].weather);
  if (giaTutto) { giaOk++; continue; }

  const giri = giriSerie(node);
  const nuovo = cal.map((r, i) => {
    const track = POOL[i % POOL.length];
    const ora = r.hour ?? ORE[i % ORE.length];
    let weather;
    if (i === 0 || i === 1) weather = i === 0 ? 0 : (r.weather ?? 1) >= 3 ? 1 : (r.weather ?? 1);
    else if (i === 2) weather = 4;                       // LA RONDA BAGNATA di Paddock
    else if (i === cal.length - 1) weather = 0;          // finale asciutta, sulla pista che adesso conosci
    else weather = METEO_DOPO[i % METEO_DOPO.length];
    return { track, name: r.name ?? `Round ${i + 1}`, laps: i === cal.length - 1 ? Math.min(8, giri + 1) : giri, hour: ora, weather };
  });
  node.calendar = nuovo;
  toccati++;
}

// una nota nel file per il futuro umano (come le altre note del ladder)
if (!ladder._nota_entry) {
  ladder._nota_entry = 'Filosofia Paddock sulle SERIE ENTRY (livello 1): solo piste corte/leggibili, 6-8 giri (la pista si impara in 2-3, il resto è gara: ritmo, traffico, gomme), R3 sempre bagnata (la prima novità è la superficie, non la pista), finale asciutta. Passata tools/_ladder-entry-style.mjs, 30/10 — mantiene num round, auto ed economia.';
}

// riscrittura PULITA: roundtrip già provato byte-identico, quindi il diff resta
// solo sui campi che cambiamo davvero.
const out = JSON.stringify(ladder, null, 2) + '\n';
if (out === raw) {
  console.log('niente da cambiare: entry-level già in stile Paddock (già ok:', giaOk, ')');
} else {
  writeFileSync(FILE, out);
  console.log(`serie livello 1 riscritte: ${toccati} · già in stile: ${giaOk}`);
}
console.log('calendari livello 1 dopo la passata:');
const check = JSON.parse(readFileSync(FILE, 'utf8'));
for (const n of check.nodes.filter((x) => x.level === 1)) {
  console.log(`  ${n.nodeId}: ${(n.calendar ?? []).map((r) => `${r.track} w${r.weather} ${r.laps}g ${r.hour}h`).join(' | ')}`);
}
