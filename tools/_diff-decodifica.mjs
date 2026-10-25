// _diff-decodifica.mjs — diagnostica 26/10 notte: DENTRO il gamemodesave
// attuale, dove muore il decodificatore? Confronto col backup che si
// leggeva (la forma certificata di stanotte).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { decodeMsg } from './evo-grid.mjs';
import { GAME_MODES_DIR } from './evo-grid.mjs';

const ATTUALE = join(GAME_MODES_DIR, 'GameModeType_RACE_WEEKEND.gamemodesave');
const baks = readdirSync(GAME_MODES_DIR)
  .filter((f) => f.startsWith('GameModeType_RACE_WEEKEND.gamemodesave.bak-'))
  .sort((a, b) => statSync(join(GAME_MODES_DIR, b)).mtimeMs - statSync(join(GAME_MODES_DIR, a)).mtimeMs);
const BACKUP = join(GAME_MODES_DIR, baks[0]);

function prova(p, etichetta) {
  const buf = readFileSync(p);
  try {
    const fields = decodeMsg(buf);
    const riep = {};
    for (const f of fields) {
      const k = `${f.field}:${f.wire}`;
      riep[k] = (riep[k] ?? 0) + 1;
    }
    console.log(`✔ ${etichetta} (${buf.length} B): ${fields.length} campi →`, riep);
    return fields;
  } catch (e) {
    console.log(`✘ ${etichetta} (${buf.length} B): ${e.message} @ byte ~${e.offset ?? '?'}`);
    return null;
  }
}

console.log('ATTUALE:', prova(ATTUALE, 'attuale'));
console.log('BACKUP più recente:', BACKUP, prova(BACKUP, basename(BACKUP)));
