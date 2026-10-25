import { readFileSync } from 'node:fs';
const ladder = JSON.parse(readFileSync('config/career.evo.ladder.json', 'utf8'));
const state = JSON.parse(readFileSync('data/evo-career.save.json', 'utf8'));
process.env.EVO_SENZA_VINCOLI = '1';
const { gateStatus, senzaVincoli } = await import('../src/state.mjs');
const { racesOnDay } = await import('../src/agenda.mjs');
const agg = await import('../src/agenda.mjs');
const gare = racesOnDay(ladder, state, Number(state.agenda?.day) || 1);
const tot = gare.length, fat = gare.filter((g) => g.fattibile).length;
const bloccate = gare.filter((g) => !g.fattibile);
console.log(`giorno ${state.agenda?.day ?? '?'} — gare elencate ${tot}, fattibili ${fat}, bloccate ${bloccate.length}`);
if (bloccate.length) console.log('ancora bloccate:', bloccate.map((g) => `${g.node.display}: ${(g.gateReasons ?? []).join('; ')}`).join('\n'));
const multi = ladder.nodes.filter((n) => (agg.loadClasses ? [] : [])).length; // (nessun uso)
// elenco veloce: prime 8 serie fattibili non ancora iscritte con discpline diverse
const esempi = gare.filter((g) => g.fattibile && g.stato === 'fattibile').slice(0, 8).map((g) => g.node.display);
console.log('esempi fattibili:', esempi.join(' · '));
console.log('senzaVincoli() =', senzaVincoli());
