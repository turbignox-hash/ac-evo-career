// ascolta-copilota.mjs — ascolto LIVE del log copilota (attesa prova 3 giri)
import fs from 'node:fs';
const FILE = 'data/copilot-8642-24-10.jsonl';
let pos = fs.existsSync(FILE) ? fs.statSync(FILE).size : 0;
console.log('ASCOLTO LIVE partito — righe nuove appena arrivano:');
fs.watchFile(FILE, { interval: 500 }, () => {
  let st; try { st = fs.statSync(FILE); } catch { return; }
  if (st.size <= pos) { pos = st.size; return; }
  let buf;
  try { buf = fs.readFileSync(FILE); } catch { return; }
  const nuove = buf.slice(pos).toString('utf8');
  pos = st.size;
  for (const l of nuove.split('\n')) {
    if (!l.trim()) continue;
    try {
      const r = JSON.parse(l);
      const s = Math.round(r.up ?? 0);
      if (r.evento) console.log(`[${s}s] ${r.evento.slice(0, 80)}`);
      else if (r.frasi?.length) console.log(`[${s}s] >>> ${r.frasi.map(f => f.it ?? '?').join(' | ')}`);
    } catch {}
  }
});
console.log('in attesa del lancio…');
