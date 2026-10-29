// uiapp-store.mjs — leggere lo store persistente del gioco (27/10/2026).
//
// Il gioco tiene i persist del loader (chiavi → stringhe) in
//   Saved Games/ACE/ui_storage.uistorage
// con un protobuf molto semplice: una fila di record `0A <lunghezza>` e dentro
// ognuno `0A <len>chiave` + `12 <len>valore`. Lo sé dal vivo (27/10 ore 17:40:
// «paddock.commands» a offset 5 con dentro il JSON dei comandi di Paddock).
// Serve SOLO a leggere gli ACK dell'app Cruscotto (canale inverso, il modo
// che Paddock usa coi suoi paddock.commands): il gioco scrive, noi leggiamo,
// nessuno di più. Se il file sta a metà scrittura si torna al prossimo giro.
//
// 29/10 sera, il riparto delle gare («appena esco da una gara, sul menu
// riparte la stessa gara»): la lettura non distingueva l'«ack assente» dalla
// «lettura a metà scrittura» — e nell'attimo in cui l'app Cruscotto rimontava
// al menu (il gioco sta scrivendo lo store) l'ack perdeva il proprio valore e
// l'auto-via ripartiva. Ora `leggiStoreJson` distingue:
//   * file illeggibile o troncato → `undefined`: lettura AMBIGUA; il
//     chiamante non decide niente su un insieme che non ha letto;
//   * chiave assente in un file LEGGIBILE → `null`: certo, l'ack non c'è.
import { readFileSync } from 'node:fs';

/** Il parser: buffer → { mappa, completa }. Un record troncato o una colla
 *  oltre la fine del file dicono «scrittura a metà»: `completa: false`. */
function parseValori(buf) {
  const valori = new Map();
  let pos = 0;
  while (pos < buf.length && buf[pos] === 0x0a) {
    // lunghezza del record (varint protobuf)
    let len = 0, shift = 0, p = pos + 1;
    for (;;) {
      if (p >= buf.length) return { mappa: valori, completa: false };
      const b = buf[p++];
      len += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    const fine = p + len;
    if (fine > buf.length) return { mappa: valori, completa: false }; // scrittura a metà
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
  return { mappa: valori, completa: true };
}

/** Tutte le coppie chiave→stringa dello store; file mancante o rotto ⇒ mappa vuota. */
export function leggiValori(percorso) {
  let buf = null;
  try { buf = readFileSync(percorso); } catch { return new Map(); }
  return parseValori(buf).mappa;
}

/**
 * Il valore della chiave come JSON:
 *   * `null`      → certo che l'ack NON ci sia (file assente, o presente e
 *                    leggibile ma senza la chiave, o la chiave non è JSON);
 *   * `undefined` → NON SI SA: file illeggibile (occupato mentre il gioco
 *                    scrive) o troncato a metà scrittura. Il chiamante di un
 *                    comando pericoloso (l'avvia) non decide su `undefined`.
 */
export function leggiStoreJson(percorso, chiave) {
  if (!percorso) return null;
  let buf;
  try { buf = readFileSync(percorso); } catch (e) {
    if (e?.code === 'ENOENT') return null;     // file assente: niente ack (certo)
    return undefined;                           // occupato/appeso: lettura ambigua
  }
  const { mappa, completa } = parseValori(buf);
  if (!completa) return undefined;              // file a metà scrittura: ambiguo
  const raw = mappa.get(chiave);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
