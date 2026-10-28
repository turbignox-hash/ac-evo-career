// stinti.mjs — STINT e USURA GOMME da terminale, dalla telemetria REALE dei
// file .ld di MoTeC scritti da EVO (nicosainventata: i giri, i rifornimenti e
// le temperature arrivano dai moduli stinti.mjs e usura-gomme.mjs, che a loro
// volta leggono analyzeLd() di motec.mjs).
//
// uso:
//   node tools/stinti.mjs                 → stint + gomme della sessione .ld più recente
//   node tools/stinti.mjs --car "nome auto"          → filtra per auto (substring, case-insensitive)
//   node tools/stinti.mjs --gomme         → mostra SOLO l'usura gomme
//   node tools/stinti.mjs --stint         → mostra SOLO i stint
//
// Le stesse analisi stanno nella GUI (Meccanico → box) e nel server
// (POST /api/garage { action: 'stinti' | 'gomme' }): qui basta la finestra
// del terminale per chi lavora a gioco chiuso.
import { resolvePaths } from '../src/paths.mjs';
import { join } from 'node:path';
import { listMotecSessions } from '../src/motec.mjs';
import { stintsFromLd } from '../src/stinti.mjs';
import { tyreWearFromLd } from '../src/usura-gomme.mjs';

const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? '') : null; };
const has = (name) => args.includes(name);
const carFilter = argOf('--car') ?? null;
const soloStint = has('--stint');
const soloGomme = has('--gomme');

const paths = resolvePaths({ ...process.env });
const root = paths.dataDirs?.[0] ? join(paths.dataDirs[0], 'MoTec') : join(paths.dataDirs?.[1] ?? '', 'MoTec');
const all = listMotecSessions(root, {}).filter((s) => !carFilter || s.car.toLowerCase().includes(String(carFilter).toLowerCase()));
if (!all.length) {
  console.log(`Nessuna telemetria MoTeC${carFilter ? ` per «${carFilter}»` : ''} in ${root}.`);
  console.log('Fai una sessione con la telemetria attiva (Setup → Elettronica) e riprova.');
  process.exit(0);
}
const pick = all[0];
const tSec = (v) => (v == null ? '—' : `${Math.floor(v / 60)}:${(v % 60).toFixed(2).padStart(5, '0')}`);

console.log(`Sessione: ${pick.car} · ${pick.track} · ${new Date(pick.mtime).toLocaleString('it-IT')}`);

if (!soloGomme) {
  const st = stintsFromLd(pick.file);
  if (!st) { console.log('File .ld non leggibile: ' + pick.name); process.exit(1); }
  console.log('');
  if (!st.nStints) console.log('Nessun giro valido (> 15 s) nel file.');
  console.log(`Stint${st.refuels ? ` — ${st.refuels} rifornimento/i (dai salti di carburante nei giri)` : ''} · ${st.laps} giri validi`);
  console.log('  n   giri      media   migliore  l/giro   degrado');
  st.stints.forEach((s, i) => {
    const deg = s.degradation ? `${s.degradation.deltaSec >= 0 ? '+' : ''}${s.degradation.deltaSec.toFixed(2)} s` : '—';
    console.log(`  ${String(i + 1).padStart(2)}  ${String(s.fromLap).padStart(3)}–${String(s.toLap).padEnd(3)}  ${pad8(tSec(s.avgLapSec))}  ${pad8(tSec(s.bestLapSec))}  ${pad6(s.fuelPerLap != null ? s.fuelPerLap + ' L' : '—')}  ${deg}`);
  });
  if (st.bestStint) console.log(`Stint migliore (ritmo medio): #${st.stints.findIndex((s) => s.fromLap === st.bestStint.fromLap) + 1} (giri ${st.bestStint.fromLap}–${st.bestStint.toLap}, media ${tSec(st.bestStint.avgLapSec)})`);
  if (st.fuelPace) console.log(`Peso del carburante misurato sui giri veri: ${st.fuelPace.secPerLiter >= 0 ? '+' : ''}${Number(st.fuelPace.secPerLiter).toFixed(3)} s per litro (${st.fuelPace.n} giri campionati, benzina da ${st.fuelPace.fuelSpread} L)`);
  else console.log('Peso del carburante: non misurabile in questa sessione (poca benzina diversa a bordo o pochi giri).');
}

if (!soloStint) {
  const go = tyreWearFromLd(pick.file);
  if (go) {
    console.log('');
    console.log('Usura gomme');
    if (go.degradation) console.log(`  Ritmo dal 1° al ${go.laps}° giro: ${tSec(go.degradation.firstAvg)} → ${tSec(go.degradation.lastAvg)} (${go.degradation.deltaSec >= 0 ? '+' : ''}${go.degradation.deltaSec} s)`);
    else console.log('  Giri non bastanti per misurare il degrado del ritmo (servono almeno 2).');
    const RUOTE = ['LF', 'RF', 'LR', 'RR'];
    const rows = RUOTE.filter((w) => go.temps?.[w]);
    if (rows.length) {
      console.log('  gomma   prima   ultima    Δ       picco');
      for (const w of rows) {
        const t = go.temps[w];
        console.log(`  ${w.padEnd(6)} ${(t.first + '°').padStart(8)} ${(t.last + '°').padStart(8)} ${(t.deltaC + '°').padStart(7)} ${(t.max + '°').padStart(8)}`);
      }
      if (go.hottestWheel) console.log(`  La gomma che soffre di più: ${go.hottestWheel}`);
      if (go.slipRearPct != null) console.log(`  Slittamento trazione posteriore: ${go.slipRearPct}%`);
    } else console.log("  Nell'.ld non ci sono canali SURF_TEMP: temperature gomma non registrate.");
  }
}

function pad6(s) { return String(s).padEnd(6); }
function pad8(s) { return String(s).padEnd(8); }
