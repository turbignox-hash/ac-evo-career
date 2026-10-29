// ascolta-copilota.mjs — ascolto LIVE del log copilota (attesa prova gara)
import fs from 'node:fs';
const FILE = 'data/copilot-8642-24-10.jsonl';
let pos = fs.existsSync(FILE) ? fs.statSync(FILE).size : 0;
console.log('ASCOLTO LIVE partito — righe nuove appena arrivano:');
// 29/10: la FASE del gioco (dati.phase, il campo del GRAPHICS che il registro
// cataloga dal payload leggero) si stampa quando CAMBIA: in gara SP è la
// verità che decide la finestra sosta (il tipo STATIC mente «TimeAttack») e
// così si vede in diretta cosa scrive il gioco in gara e in prova libera.
let fase = null;
// anche le frasi scritte a UNA A UNA dal registro della voce (Questa voce
// scrive {t, chi, it, livello} senza evento né frasi): prima non comparivano.
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
      const p = r.dati?.phase ?? null;
      if (p != null && p !== fase) { fase = p; console.log(`[${s}s] FASE: ${p}`); }
      if (r.evento) console.log(`[${s}s] ${r.evento.slice(0, 80)}`);
      else if (r.frasi?.length) console.log(`[${s}s] >>> ${r.frasi.map(f => f.it ?? '?').join(' | ')}`);
      else if (r.chi && r.it) console.log(`[${s}s] (${r.chi}/${r.livello ?? '?'}) ${r.it}`);
    } catch {}
  }
});
console.log('in attesa del lancio…');
