// snapshot-pre-aggiornamento.mjs — preparazione U0.10 (9/12/2026, Free Roam
// Eifel). Gli aggiornamenti grossi possono cambiare il formato di
// gamemodesave/customgrid: questo script fotografa LO STATO ATTUALE dei file
// che la carriera tocca, con manifest (sha256 di ogni file) da confrontare
// dopo l'aggiornamento — se un decoder smette di funzionare, il diff dice
// subito se è il formato o il nostro codice.
//
// uso:
//   node tools/snapshot-pre-aggiornamento.mjs           → snapshot completo
//   node tools/snapshot-pre-aggiornamento.mjs --elenca  → solo cosa verrebbe copiato
//   node tools/snapshot-pre-aggiornamento.mjs --confronta <cartella>'. A turno
//                                                        confronta lo snapshot saldato con lo STATO ATTUALE dei file
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJ = join(HERE, '..');
const GAME = join(process.env.USERPROFILE ?? 'C:/Users/Mauro', 'Saved Games', 'ACE', 'GameModes');

// i file IMPORTANTI: file di sessione/giorno + la griglia + i config del progetto
// Che chi scrive. Esclusi i .bak-* e i log (i snapshot voltsshut li salva, non i rumori)
const SORGENTI = [];
for (const f of readdirSync(GAME ?? '.')) {
  if (/(\.bak-|\.tmp|\.log|\.pid)$/.test(f)) continue;
  if (!/\.(gamemodesave|customgrid|offline_profile|lastgamemode|setoptions)$/.test(f) && f !== 'last_grid.customgrid') continue;
  SORGENTI.push(join(GAME, f));
}
for (const f of ['config/career.evo.ladder.json', 'evo-career.save.json', 'E:/SteamLibrary/steamapps/common/Assetto Corsa EVO Dedicated Server/cars.json']) {
  const p = join(PROJ, f);
  if (existsSync(p)) SORGENTI.push(p);
}

if (process.argv.includes('--elenca')) {
  for (const s of SORGENTI) console.log(' ', s);
  process.exit(0);
}

const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

if (process.argv.includes('--confronta')) {
  const dir = process.argv[process.argv.indexOf('--confronta') + 1];
  const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  let cambiate = 0;
  for (const entry of man) {
    const n = existsSync(entry.file) ? sha(readFileSync(entry.file)) : null;
    if (n !== entry.sha) { cambiate++; console.log(`${n ? '≠ CAMBIATO' : '✗ ASSENTE'}  ${entry.file}  (${entry.sha} → ${n ?? '—'})`); }
    else console.log(`= uguale     ${entry.file}`);
  }
  console.log(`\n${cambiate === 0 ? '✅ nessun cambiamento: il formato attuale è IDENTICO allo snapshot' : `⚠ ${cambiate} file cambiati dopo lo snapshot`}`);
  process.exit(cambiate === 0 ? 0 : 1);
}

const tag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const DEST = join(PROJ, 'data', 'snapshot-pre-aggiornamento', '0.10-' + tag);
mkdirSync(DEST, { recursive: true });
const man = [];
for (const s of SORGENTI) {
  try {
    const b = readFileSync(s);
    const nome = basename(s);
    copyFileSync(s, join(DEST, nome));
    man.push({ file: s, nome, byte: b.length, sha: sha(b), mtime: statSync(s).mtime.toISOString() });
  } catch (e) { console.log('saltato', s, e.message); }
}
writeFileSync(join(DEST, 'manifest.json'), JSON.stringify(man, null, 2));
console.log(`✅ snapshot in [${DEST}]: ${man.length} file · manifest con sha256`);
for (const m of man) console.log(`   ${m.nome}  ${m.byte} byte  sha ${m.sha}`);
console.log('\ndopo l\'aggiornamento: node tools/snapshot-pre-aggiornamento.mjs --confronta "' + DEST + '"');
