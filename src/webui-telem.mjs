// webui-telem.mjs — la scansione MoTeC del pannello di salute (estratta da
// webui.mjs il 31/10, ZERO cambiamenti di comportamento: la memoir dei 10 s,
// l'header del .ld letta byte per byte e i campi tornati sono IDENTICI.
// Viva da sola per alzare un peso da webui.mjs (quasi 4000 righe): qui c'è
// il solo lettore di file MoTeC locale, senza nessuna dipendenza del launcher.
import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';


/**
 * la scansione MoTeC locale: l'ultimo .ld scritto da EVO, la validità
 * dal HEADER (tabella canali + canali con dati) e lo stato delle cartelle
 * per auto/pista. systemHealth (webui.mjs) lo chiama per il pannello di
 * salute; se il gioco cambia layout delle shared memory, è qui che lo si
 * vede nei dati .ld.
 */
/* scansione MoTeC con memo 10s (21/10): il GUI la richiede ogni 2s ma l'albero
 * MoTeC ha decine di cartelle — riscansarla a ogni richiesta era il vero costo
 * di fondo del LIVE, ben più del lettore PowerShell. */
let _telemAt = 0, _telemScan = null;
function telemScanLocale(paths) {
  if (_telemScan && Date.now() - _telemAt < 10000) return _telemScan;
  // paths può essere NULL: PC senza ACE (collaudo zip 31/10) — il pannello
  // di salute (/api/system-health, interrogato a ogni giro dal cruscotto)
  // risponda il suo onesto "niente da leggere", non un 500 ricorrente.
  paths = paths ?? { dataDirs: [] };
  // ultimo file .ld tra le cartelle MoTeC note (Saved Games\ACE, Documents\ACE)
  let lastLd = null;
  const dirsState = [];
  for (const dir of paths.dataDirs ?? []) {
    const root = join(dir, 'MoTec');
    let cars = [];
    try { cars = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { dirsState.push({ root, exists: false }); continue; }
    dirsState.push({ root, exists: true, cars: cars.length });
    for (const car of cars) {
      // i .ld sono annidati per pista: MoTec\<auto>\<pista>\<file>.ld
      let trackDirs = [];
      try { trackDirs = readdirSync(join(root, car), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
      for (const track of trackDirs) {
        try {
          const files = readdirSync(join(root, car, track)).filter((f) => f.endsWith('.ld'))
            .map((f) => { const st = statSync(join(root, car, track, f)); return { car, track, f, path: join(root, car, track, f), mtime: st.mtimeMs, size: st.size }; });
          const best = files.sort((a, b) => b.mtime - a.mtime)[0];
          if (best && (!lastLd || best.mtime > lastLd.mtime)) lastLd = best;
        } catch { /* pista senza .ld: pazienza */ }
      }
    }
  }
  let lastLdInfo = null;
  if (lastLd) {
    // validità dall'header: come in motec.mjs, tabella canali + canali con dati
    let valid = false, channels = 0, withData = 0;
    try {
      const fd = openSync(lastLd.path, 'r');
      const head = Buffer.alloc(Math.min(lastLd.size, 65536));
      readSync(fd, head, 0, head.length, 0);
      closeSync(fd);
      const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
      const t0 = dv.getUint32(8, true);
      const t1 = Math.min(dv.getUint32(12, true), head.length);
      if (t1 > t0 && (t1 - t0) % 124 === 0) {
        const n = Math.min(Math.floor((t1 - t0) / 124), 500);
        for (let k = 0; k < n; k++) { channels++; if (dv.getUint32(t0 + k * 124 + 12, true) > 0) withData++; }
      }
      valid = withData > 0;
    } catch { valid = false; }
    lastLdInfo = { car: lastLd.car, track: lastLd.track, file: lastLd.f, size: lastLd.size, mtimeMs: lastLd.mtime, when: new Date(lastLd.mtime).toLocaleString('it-IT'), valid, channels, withData };
  }
  _telemAt = Date.now();
  return (_telemScan = {
    lastLd: lastLdInfo,
    dirsChecked: (paths.dataDirs ?? []).map((d) => join(d, 'MoTec')),
    dirsState,
  });
}

export { telemScanLocale };
