// weekend-roster.mjs — LE CELLE AVVERSARIE DEL WEEKEND (29/10, le Caterham di Mauro).
//
// Storia (per non ripetere l'errore): la ronda di carriera spawna gli avversari
// dal SUO gamemodesave (GameModeType_RACE_WEEKEND.gamemodesave): ogni blocco
// sessione (field 3 ripetuto, col nome Practice/Qualifying/Warmup/Race) può
// portare le PROPRIE celle avversarie (sub 10 ripetute, STESSA forma dei blocchi
// cella del customgrid: .3 carId, .10 preset meccanico, .11 preset visual).
// Il flusso «Prepara tutto» riscriveva da sempre SOLO last_grid.customgrid —
// e Mauro scendeva in pista sempre contro le CATERHAM 485 del vecchio weekend:
// la ronda non legge il customgrid se non al gesto APPLICA del suo menu griglia.
// La cura: dopo ogni ricostruzione della griglia, TRAPIANTO le celle giuste
// del customgrid nei blocchi-celle del weekend — lo stesso gesto APPLICA, fatto
// da noi — così ogni via verso la pista porta il pool della ronda.
//
// Regole del mestiere (le lezioni non si negoziano):
//   • CONTEGGIO: ogni blocco tiene il SUO numero di slot (14 oggi in Practice).
//     Non si aggiungono né si tolgono slot: si montano le prime N celle del
//     customgrid (che il gate del builder allinea già al conteggio nativo).
//   • RISCHIO CRASH 0xC0000005: se le celle offerte son MENO degli slot, niente
//     ripetizioni (celle identiche in griglia = lezione 20/10 e 23/10): il
//     blocco resta com'è e il report lo dice.
//   • IDEMPOTENTE: celle già uguali → written:false, nessun backup nuovo.
//   • i blocchi SENZA celle (Race oggi: 0 slot, il gioco se le fabbrica da
//     solo) non si toccano.
import { readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { decodeMsg, encodeMsg, gameRunning, bakName, pruneBackups } from '../tools/evo-grid.mjs';
// bak al secondo + potatura: UNA fonte da 31/10 (evo-grid), niente più copie
// "stesso pattern": le due qui sotto erano la terza e la quarta rivisita del
// codice di grid-apply. La potatura interna resta chiamata allo stesso modo
// (pruneBackups, il nome condiviso); potatura() se ne va.

/* ---------- letture ---------- */
const carIdOf = (cello) => {
  try { for (const g of decodeMsg(cello)) if (g.field === 3 && g.bytes) return g.bytes.toString('utf8'); } catch { /* cella illeggibile */ }
  return null;
};
const nomeOf = (sub) => {
  const n = sub.find((x) => x.field === 1 && x.bytes);
  return n ? n.bytes.toString('utf8') : null;
};
/** È una cella vera? Deve decodificare E portare il carId (sub 3). */
const cellaVera = (b) => { try { return decodeMsg(b).some((g) => g.field === 3 && g.bytes); } catch { return false; } };

/** Stato dei blocchi-celle del weekend (per report, GUI e test). */
export function rosterInfo(file) {
  let fields;
  try { fields = decodeMsg(readFileSync(file)); } catch { return null; }
  const blocchi = [];
  for (const b of fields.filter((f) => f.field === 3 && f.wire === 2)) {
    let sub;
    try { sub = decodeMsg(b.bytes); } catch { continue; }
    const slot = sub.filter((x) => x.field === 10 && x.wire === 2);
    if (slot.length < 2) continue;                       // senza celle (altro blocco atipico): non è un roster
    const buone = slot.filter((x) => cellaVera(x.bytes));
    if (buone.length !== slot.length) continue;          // slot deformati: non è il roster, meglio non toccare
    blocchi.push({ nome: nomeOf(sub), slot: slot.length, carId: slot.map((x) => carIdOf(x.bytes)) });
  }
  return blocchi.length ? { blocchi } : null;
}

/** Le celle (byte) di un buffer customgrid: field 1 ripetuto di primo livello. */
export function celleDiGrid(buffer) {
  try { return decodeMsg(buffer).filter((g) => g.field === 1 && g.wire === 2).map((g) => g.bytes); } catch { return []; }
}

/**
 * TRAPIANTO delle celle del pool nel weekend.
 * cells = byte delle celle (del customgrid appena scritto), file = il WEEKEND.
 * opts: { file, force, dry } — force vale come nella griglia (a EVO aperto si
 * scrive solo col permesso esplicito del chiamante, come fa la pista nel prep).
 * Idempotente: già uguale → written:false.
 */
export function syncRoster(cells, { file, force = false, dry = false } = {}) {
  if (!Array.isArray(cells) || !cells.length) throw Object.assign(new Error('syncRoster: servono le celle del pool'), { code: 'NO_CELLE' });
  let fields;
  try { fields = decodeMsg(readFileSync(file)); } catch (e) { throw Object.assign(new Error(`weekend illeggibile (${e.code ?? e.message ?? e})`), { code: 'NO_FILE' }); }
  if (gameRunning() && !force && !dry) throw Object.assign(new Error('EVO è APERTO: il roster del weekend si scrive solo con --force sapendolo (o a gioco chiuso).'), { code: 'GAME_RUNNING' });

  let tocco = false;
  const report = [];
  const prima = rosterInfo(file);                        // slot-count attesi, per la verifica post-scrittura
  const out = fields.map((f) => {
    if (f.field !== 3 || f.wire !== 2) return f;
    let sub;
    try { sub = decodeMsg(f.bytes); } catch { return f; }
    const idx = sub.map((x, i) => (x.field === 10 && x.wire === 2 ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2 || !idx.every((i) => cellaVera(sub[i].bytes))) return f;
    const slots = idx.length;
    if (cells.length < slots) {
      report.push({ nome: nomeOf(sub), slot: slots, nota: `celle ${cells.length} < slot ${slots}: non toccato (celle ripetute = lezione crash)` });
      return f;
    }
    // le celle offerte bastano: trapianto le PRIME slots celle del customgrid
    let cambia = false;
    const nuovoSub = sub.map((x, i) => {
      const s = idx.indexOf(i);
      if (s === -1) return x;
      const nuovo = Buffer.from(cells[s]);               // copia difensiva: il caller riusa il suo buffer
      if (Buffer.compare(nuovo, x.bytes) === 0) return x;
      cambia = true;
      return { ...x, bytes: nuovo };
    });
    report.push({ nome: nomeOf(sub), slot: slots, nota: cambia ? 'celle trapiantate' : 'celle già uguali' });
    if (!cambia) return f;
    tocco = true;
    return { ...f, bytes: encodeMsg(nuovoSub) };
  });
  if (!report.some((r) => r.slot > 0)) throw Object.assign(new Error('nessun blocco-celle nel weekend da sincronizzare'), { code: 'NO_ROSTER' });
  if (!tocco || dry) return { written: false, blocchi: report, nota: tocco ? 'dry' : 'già allineato (idempotente)' };
  const backup = bakName(file, 'roster-');
  copyFileSync(file, backup);
  pruneBackups(file);
  writeFileSync(`${file}.tmp`, encodeMsg(out));
  renameSync(`${file}.tmp`, file);
  // verifica di lettura: gli STESSI blocchi-celle con il MEDesimo numero di slot
  const dopo = rosterInfo(file);
  const slotsPrima = prima?.blocchi?.map((b) => b.slot) ?? [];
  const slotsDopo = dopo?.blocchi?.map((b) => b.slot) ?? [];
  if (JSON.stringify(slotsPrima) !== JSON.stringify(slotsDopo)) {
    throw new Error('verifica fallita: i slot del roster sono cambiati dopo la scrittura');
  }
  return { written: true, backup, blocchi: report };
}
