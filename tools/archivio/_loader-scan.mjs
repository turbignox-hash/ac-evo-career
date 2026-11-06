// _loader-scan.mjs — trova DENTRO ACEUIAppLoader.kspkg le parti di codice
// che costruiscono il cassetto (drawer) delle app a pagine: serve a capire
// come il loader misura il pannello (larghezza, posizione, contenitore) e
// smettere di provarci a tentoni con cruscotto.
import { openSync, readSync, closeSync } from 'node:fs';

const FILE = 'C:/Users/Mauro/Saved Games/ACE/mods/ACEUIAppLoader.kspkg';
const PAROLE = process.argv.slice(2).length ? process.argv.slice(2) : ['drawer', 'app-iframe', 'cohtml', 'width:'];

const CH = 4 * 1024 * 1024;
let _buf = null;
const fd = openSync(FILE, 'r');
const LIMIT = 69_206_016;
let pos = 0;
const trovati = new Map();
while (pos < LIMIT) {
  const n = readSync(fd, bufGlobal(), 0, CH, pos);
  if (n <= 0) break;
  const s = buf(0, n);
  for (const parola of PAROLE) {
    for (let i = s.indexOf(parola); i !== -1; i = s.indexOf(parola, i + 1)) {
      const snip = s.slice(Math.max(0, i - 200), i + 400).replace(/[^\x20-\x7e\n]/g, '·');
      const chiave = parola;
      if (!trovati.has(chiave)) trovati.set(chiave, []);
      const lista = trovati.get(chiave);
      if (lista.length < 6) lista.push(`${pos + i}: ${snip}`);
    }
  }
  pos += CH - 1000;
}
closeSync(fd);
for (const [parola, lista] of trovati) {
  console.log(`===== ${parola}: ${lista.length} occorrenze mostrate`);
  for (const l of lista) console.log(l, '\n');
}

function bufGlobal() { if (!_buf) _buf = Buffer.alloc(CH + 1000); return _buf; }
function buf(fine) { return uint8ToString(bufGlobal().subarray(0, fine)); }
function uint8ToString(u8) {
  let out = '';
  const STEP = 65536;
  for (let i = 0; i < u8.length; i += STEP) out += String.fromCharCode(...u8.subarray(i, Math.min(i + STEP, u8.length)));
  return out;
}
