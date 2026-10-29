// _celle-confronto.mjs — i campi di UNA cella nei due file (forma compatibile?)
import { decodeMsg } from './evo-grid.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.env.USERPROFILE, 'Saved Games', 'ACE', 'gamemodes');
const descrivi = (nome, cella) => {
  const campi = decodeMsg(cella).map((g) => (g.bytes ? `${g.field}[${g.bytes.length}B]` : `${g.field}=${typeof g.varint === 'bigint' ? g.varint.toString() : g.f32 ?? '?'}`));
  console.log(nome, '→', campi.join(' '));
};

// customgrid: le celle sono i blocchi field 1 di primo livello
const cg = readFileSync(join(DIR, 'last_grid.customgrid'));
const cgRoot = decodeMsg(cg).filter((f) => f.field === 1 && f.wire === 2);
console.log('customgrid: celle di primo livello =', cgRoot.length);
descrivi('customgrid cella[0]', cgRoot[0].bytes);
descrivi('customgrid cella[1]', cgRoot[1].bytes);

// weekend: blocco roster = field 3 che contiene subfield 10
const wk = readFileSync(join(DIR, 'GameModeType_RACE_WEEKEND.gamemodesave'));
const wkRoot = decodeMsg(wk);
const blocchi3 = wkRoot.filter((f) => f.field === 3 && f.wire === 2);
console.log('weekend: blocchi field 3 =', blocchi3.length);
for (const b of blocchi3) {
  const sub = decodeMsg(b.bytes);
  const nomi = sub.filter((x) => x.field === 1).map((x) => '"' + x.bytes.toString('utf8').slice(0, 30) + '"');
  const nCelle = sub.filter((x) => x.field === 10 && x.wire === 2).length;
  console.log('  blocco3 con', sub.length, 'subfield · nomi:', nomi.join(','), '· sub-10 count:', nCelle);
  if (nCelle > 3) {
    const celle = sub.filter((x) => x.field === 10 && x.wire === 2);
    descrivi('weekend cella[0] (sub-10)', celle[0].bytes);
    descrivi('weekend cella[1] (sub-10)', celle[1].bytes);
    // e la sotto-anatomia della cella: campo 10 dentro la cella contiene sub 1?
    const inCell = decodeMsg(celle[0].bytes);
    const pre10 = inCell.filter((x) => x.field === 10 && x.wire === 2);
    if (pre10.length) console.log('    cella[0].10.1 =', JSON.stringify(decodeMsg(pre10[0].bytes).map((x) => x.bytes.toString('utf8'))));
  }
}
