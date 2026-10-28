// tools/_misure-realismo.mjs — misura UNA TANTUM (28/10): lo standings dei round
// simulati favorisce davvero i sedili forti o è una lotteria?
// node tools/_misure-realismo.mjs
import { readFileSync } from 'node:fs';
import { createWorld, gridFor, finishOrder } from '../src/world.mjs';

const ladder = JSON.parse(readFileSync(new URL('../config/career.evo.ladder.json', import.meta.url), 'utf8'));
const world = createWorld(ladder, 'evo-world-1');

// nodi campione: ciascuno con la sua banda (ai) e gridSize
const nodi = ladder.nodes.filter((n) => Array.isArray(n.ai) && n.gridSize > 4)
  .sort((a, b) => (a.ai[1] - b.ai[1]) || (b.gridSize - a.gridSize));
const scelto = [nodi[Math.floor(nodi.length * 0.15)], nodi[Math.floor(nodi.length * 0.5)], nodi[nodi.length - 1]];

const P = Math.floor(nodi[0].calendar.length); // il primo ha il calendario? uso per selezione
for (const node of scelto.filter((n) => n.calendar.length >= P)) {
  const stagioni = 60;
  const champions = {}; // seat (1-based rank) -> conteggio
  const winCounts = {};
  const dnfPerSedile = {};
  for (let season = 1; season <= stagioni; season++) {
    const grid = gridFor(world, ladder, node, season);
    const pts = grid.map(() => 0);
    for (let r = 0; r < node.calendar.length; r++) {
      const order = finishOrder(grid, node, season, r, null, ladder, null);
      for (const e of order) {
        const seat = grid.findIndex((s) => s.driverId === e.driverId);
        if (e.dnf) { dnfPerSedile[seat] = (dnfPerSedile[seat] ?? 0) + 1; continue; }
        pts[seat] += (ladder.pointsSystems[node.points]?.table?.[e.position - 1] ?? 0);
        if (e.position === 1) winCounts[seat] = (winCounts[seat] ?? 0) + 1;
      }
    }
    const champ = pts.indexOf(Math.max(...pts));
    champions[champ] = (champions[champ] ?? 0) + 1;
  }
  const winTotal = Object.values(winCounts).reduce((a, b) => a + b, 0) || 1;
  const champTotal = Object.values(champions).reduce((a, b) => a + b, 0) || 1;
  const top3wins = Object.entries(winCounts).sort((a, b) => a[0] - b[0]).slice(0, 3).reduce((a, [, v]) => a + v, 0);
  const top3cham = Object.keys(champions).filter((k) => Number(k) < 3).reduce((a, k) => a + champions[k], 0);
  console.log(`\n== ${node.display} — banda ai ${node.ai[0]}-${node.ai[1]}, gridSize ${node.gridSize}, ${node.calendar.length} gare, sistema punti ${node.points} ==`);
  console.log(`   vittorie catchando sedili 0-2: ${top3wins}/${winTotal} (${(top3wins / winTotal * 100).toFixed(1)}%) — reale atteso: ben oltre il 50%`);
  console.log(`   titoli scesi a sedili 0-2: ${top3cham}/${stagioni} (${(top3cham / champTotal * 100).toFixed(1)}%)`);
  console.log('   vittorie per sedile:', Object.entries(winCounts).sort((a, b) => Number(a[0]) - Number(b[0])).slice(0, 8).map(([k, v]) => `#-${1 + Number(k)}:${v}`).join(' '));
  console.log('   titoli per sedile:', Object.entries(champions).sort((a, b) => Number(a[0]) - Number(b[0])).slice(0, 8).map(([k, v]) => `#${1 + Number(k)}:${v}`).join(' '));
  const dnfT = Object.values(dnfPerSedile).reduce((a, b) => a + b, 0);
  const gareT = stagioni * node.calendar.length * node.gridSize;
  console.log(`   DNF: ${dnfT}/${gareT} (${(dnfT / gareT * 100).toFixed(2)}%)`);
}
