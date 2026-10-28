// uiapp-store.mjs — leggere lo store persistente del gioco (27/10/2026).
//
// Il gioco tiene i persist del loader (chiavi → stringhe) in
//   Saved Games/ACE/ui_storage.uistorage
// con un protobuf molto semplice: una fila di record `0A <lunghezza>` e dentro
// ognuno `0A <len>chiave` + `12 <len>valore`. Lo sé dal vivo (27/10 ore 17:40:
// «paddock.commands» a offset 5 con dentro il JSON dei comandi di Paddock).
// Serve SOLO a leggere gli ACK dell'app Cruscotto (canale inverso, il modo
// che Paddock usa coi suoi paddock.commands): il gioco scrive, noi leggiamo,
// niente di più. Se il file sta a metà scrittura si torna al prossimo giro.
import { readFileSync } from 'node:fs';

/** Tutte le coppie chiave→stringa dello store; file mancante o rotto ⇒ mappa vuota. */
export function leggiValori(percorso) {
  const valori = new Map();
  if (!percorso) return valori;
  let buf;
  try { buf = readFileSync(percorso); } catch { return valori; }
  let pos = 0;
  while (pos < buf.length && buf[pos] === 0x0a) {
    // lunghezza del record (varint protobuf)
    let len = 0, shift = 0, p = pos + 1;
    for (;;) {
      if (p >= buf.length) return valori;             // record troncato
      const b = buf[p++];
      len += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    const fine = p + len;
    if (fine > buf.length) return valori;             // scrittura a metà: fuori
    if (p < fine && buf[p] === 0x0a) {
      // la chiave
      let klen = 0, kshift = 0, q = p + 1;
      for (;;) {
        if (q >= fine) break;
        const b = buf[q++];
        klen += (b & 0x7f) * 2 ** kshift;
        if (!(b & 0x80)) break;
        kshift += 7;
      }
      const chiave = buf.slice(q, q + klen).toString('utf8');
      // il valore
      let vq = q + klen;
      if (vq + 1 < fine && buf[vq] === 0x12) {
        let vlen = 0, vshift = 0;
        vq++;
        for (;;) {
          if (vq >= fine) break;
          const b = buf[vq++];
          vlen += (b & 0x7f) * 2 ** vshift;
          if (!(b & 0x80)) break;
          vshift += 7;
        }
        try { valori.set(chiave, buf.slice(vq, vq + vlen).toString('utf8')); } catch { /* chiave strana: vai oltre */ }
      }
    }
    pos = fine;
  }
  return valori;
}

/** Il valore della chiave come JSON, o null (assente / non-JSON / a metà scrittura). */
export function leggiStoreJson(percorso, chiave) {
  const raw = leggiValori(percorso).get(chiave);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
