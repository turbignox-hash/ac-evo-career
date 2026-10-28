// car-pool.mjs — IL VIGIA DEL PARCO AUTO (24/10, richiesta Mauro: «potrei prendere
// anche una F1 e la UI non se ne accorgerebbe dandomi la vittoria: limita la scelta
// alle auto proposte tra la multiclasse e la classe giusta»). EVO non si lascia
// imporre da fuori l'auto del sedile — va scelta a mano nel gioco — ma quello che
// NON può più fare è NON accorgersene. Qui vivono:
//   • la lista delle auto AMMESSE per una serie (nomi leggibili, come li scrive EVO
//     nell'archivio risultati e nella shared memory);
//   • il match tollerante fra l'auto effettivamente corsa e la lista (stesso
//     approccio normalizzato di state.mjs garageCarForSeat e carAdviceFor);
//   • il morso del vigia a import e live: auto fuori pool → la gara vale ZERO.
// Il pool è:
//   - serie con classe dichiarata in grid-classes.json che ha poolAuto → poolAuto
//     (meno le auto in escludiAuto, riconosciute dai token del preset);
//   - altrimenti → node.cars del ladder (le auto proposte dalla serie).
// Catalogo assente / classe assente → pool = node.cars; senza node → pool vuoto
// (NULLA viene giudicato: meglio ammettere tutto che bloccare per un passo falso).

import { loadClasses } from './gridbuilder.mjs';
import { nodeById } from './state.mjs';

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/\u0300-\u036f/g, '')   // "é" → "e" (i nomi di pista/auto si scrivono con accenti a caso)
  .replace(/[^a-z0-9]/g, '');

/**
 * Il parco auto ammesse della serie: { ammesse:[nome…], escluse:[nome…], ids:[…], classe }.
 * Nomi DISPLAY (contentNames.cars) — gli stessi che EVO scrive nei risultati e
 * nella live, così il confronto è una sola stringa. Mai throw: un fondo fermo
 * non deve bloccare la preparazione di una gara.
 */
export function carPoolOf(ladder, nodeId) {
  try {
    const node = (ladder?.nodes ?? []).find((n) => n.nodeId === String(nodeId ?? '')) ?? null;
    const cls = loadClasses().classi?.[String(nodeId ?? '')] ?? null;
    const names = ladder?.contentNames?.cars ?? {};
    let pool = Array.isArray(cls?.poolAuto) && cls.poolAuto.length
      ? cls.poolAuto
      : (Array.isArray(node?.cars) ? node.cars : []);
    // esclusioni dichiarate in escludiAuto (i preset dei Mini/MX-5 fuori dalla Coppa
    // RX-7 FD il 23/10): il preset si riconosce nei NOMI per token — preset_jcs_mech_1
    // → 'jcs' ⊂ "Mini John Cooper S"? no, ⊂ l'ID 'ks_mini_jcs_1990': si matchano i
    // token del preset DENTRO il nome normalizzato dell'auto (≥3 lettere, quindi
    // 'mx5na' ci mette le mani su "Mazda MX5 NA").
    const escluse = [];
    if (Array.isArray(cls?.poolAuto) && cls.poolAuto.length) {
      for (const pre of cls.escludiAuto ?? []) {
        const toks = String(pre).replace(/^preset_/, '').replace(/_mech_\d+.*$/, '').split(/_+/)
          .filter((t) => t.length >= 3);
        if (!toks.length) continue;
        pool = pool.filter((id) => {
          // il hay comprende ANCHE l'ID: 'preset_jcs_mech_1' non è scritto nel
          // nome display «Mini John Cooper S» ma nell'id 'ks_mini_jcs_1990'
          const hay = norm(names[id] ?? id) + '@' + norm(id);
          if (!toks.every((t) => hay.includes(norm(t)))) return true;
          escluse.push(id);
          return false;
        });
      }
    }
    const ammesse = pool.map((id) => names[id] ?? id).filter(Boolean);
    return { ammesse, escluse: escluse.map((id) => names[id] ?? id).filter(Boolean), ids: pool, classe: cls?.id ?? null };
  } catch {
    return { ammesse: [], escluse: [], ids: [], classe: null };
  }
}

/** Le sequenze di cifre di String(s) — «1600GT-Apex (AE86)» → ['1600','86']:
 *  si Prattengono separate (i separatori cambiano a caso fra archivio e
 *  pool, fondendoli si confondeva MP4/4 con qualsiasi 4). */
const cifre = (s) => String(s ?? '').match(/\d+/g) ?? [];

/** Le parole (blocchi di lettere) lunghe ≥ 5 — le firme che non si possono
 *  mescolare: toyota, sprinter, trueno… «gt», «apex», «ae86» contano poco. */
const paroleLunghe = (s) => (String(s ?? '').toLowerCase().match(/[a-zà-ú]{5,}/g) ?? []);

/**
 * L'auto `car` (nome completo come lo scrivono risultato e live: brand + modello)
 * rientra fra le ammesse? VERO anche con car/liste vuote: il vigia giudica solo
 * quando può — niente falsi positivi quando l'archivio tace.
 * Due strade: (1) una stringa normalizzata contiene l'altra; (2) match per
 * CIFRE+parole-lunga-tolerant: stessa auto con segni d'ortografia a caso fra
 * archivio e pool («1600 GT Apex» vs «1600GT-Apex (AE86)») — ma NON la versione
 * potenziata: senza «1600» fra le cifre il match NON passa (richiesta Mauro:
 * la Trueno GT-Apex affianco alla 1600 non è war gaming ammesso).
 */
export function carInPool(car, ammesse) {
  if (!car || !Array.isArray(ammesse) || !ammesse.length) return true;
  const c = norm(car);
  if (!c) return true;
  return ammesse.some((a) => {
    const n = norm(a);
    if (!n) return false;
    if (n === c || n.includes(c) || c.includes(n)) return true;
    return cifre(a).every((d) => cifre(car).includes(d))
      && cifre(car).every((d) => cifre(a).includes(d))
      && paroleLunghe(a).some((p) => paroleLunghe(car).includes(p));
  });
}

/* ------------------------------------------------------------------ */
/* il giudizio LIVE si fa solo con la serie giusta (27/10, Mauro:       */
/* «il coach non fa altro che dire F40 fuori parco» — l'F40 LM HA il    */
/* suo parco in Leggende Stradali e nella sua Coppa, ma il touch live   */
/* lo giudicava col pool della serie DI CARRIERA corrente anche quando  */
/* la sessione in pista non era quella: test della griglia, MP, prove   */
/* libere di un'altra serie → false allerte a ripetizione). Da qui:     */
/* la copilota giudica solo quando la sessione della SM è SULLA PISTA   */
/* della gara di carriera in corso. In menu (pista assente) o su una    */
/* pista che non c'entra: niente giudizio — la copilota tace e QUALE    */
/* gara vale zero lo decide l'IMPORT, dai dati VERI del file risultato. */

/** Il nodo la cui serie è LEGITTIMA a giudicare questa sessione live, o null.
 *  Con pending (gara lanciata dal flusso di carriera) → il nodo del pending,
 *  ma solo se la pista della SM è quella del round del pending (una sessione
 *  aperta a mano su un'altra pista non è la gara del flusso). Senza pending
 *  → il nodo di carriera SOLO se la SM è già sulla pista della ronda
 *  corrente e la sessione è una Race (le prove libere non possono costare
 *  punti: niente parlarne). */
export function poolNodeForLive(ladder, { pending = null, node = null, round = null, smTrack = null, smType = null } = {}) {
  const sm = norm(smTrack);
  if (!sm) return null;   // in menu / SM muto: niente sedile attendibile
  const pistaOk = (dotto, r) => {
    const n = nodeById(ladder, dotto);
    if (!n) return false;
    const id = n.calendar?.[r]?.track ?? null;
    if (id == null) return false;
    const disp = ladder?.contentNames?.tracks?.[id] ?? id;
    return [id, disp].some((t) => { const nn = norm(t); return nn && (nn.includes(sm) || sm.includes(nn)); });
  };
  if (pending?.node) return pistaOk(pending.node, pending.round) ? pending.node : null;
  if (node) return (smType === 'Race' && pistaOk(node, round)) ? node : null;
  return null;
}
