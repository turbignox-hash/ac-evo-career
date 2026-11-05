// classifiche-gioco.mjs — le classifiche REALI che il gioco scrive.
//
// A fine sessione EVO appende in Saved Games\ACE\Results (e nel mirror in
// Documents\ACE\Results) un file .sessionresults.json con la classifica
// COMPLETA: piloti veri, auto, posizioni, giri. Fino ad ora quelle righe
// vivevano solo nell'import delle GARE della ronda; le classifiche di
// qualifiche, prove e uscite libere restavano fuori dalle schede.
// (5/11, richiesta Mauro: «aggiorna tutte le classifiche con i dati reali
// del gioco, compreso i piloti».)
//
// Questo modulo legge gli ULTIMI file risultato e restituisce le classifiche
// già digerate per la GUI: nessun calcolo sul gioco, solo lettura fedele.
// `paths` è lo stesso oggetto che il server già passa a listResultFiles.

import { listResultFiles, readSessionResult, positionBase } from './results.mjs';
import { nomePilota } from './nome-pilota.mjs';

const LIMITE_PILOTI = 40; // griglie da 40 in su: oltre, il pannello taglia

/** nome auto come lo scrive il gioco: brand già dentro car_name? evito i doppi. */
function autoCompleta(brand, name) {
  const b = String(brand ?? '').trim();
  const n = String(name ?? '').trim();
  if (n && b && n.toLowerCase().startsWith(b.toLowerCase())) return n;
  return `${b} ${n}`.trim() || null;
}

/** Classifica di UN file risultato, già pronta per la GUI (o null se ilegibile). */
export function classificaDiFile(file) {
  let r;
  try { r = readSessionResult(file); } catch { return null; }
  // 0-based nei file EVO (position 0 = vincitore): qui si torna a P1;
  // i file 1-based (qualifiche di profili vecchi) passano senza tocco
  const { zeroBased } = positionBase(r);
  const piloti = (r.drivers ?? [])
    .slice()
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .slice(0, LIMITE_PILOTI);
  return {
    quando: new Date().toISOString(), // si corregge sotto con l'mtime reale
    pista: r.track ? String(r.track) : null,
    tipo: r.session ? String(r.session) : null,
    pilotiTot: (r.drivers ?? []).length,
    righe: piloti.map((d) => ({
      pos: Number.isFinite(Number(d.position)) ? Number(d.position) + (zeroBased ? 1 : 0) : null,
      nome: nomePilota(d.driver_name, d.driver_surname) || '—',
      auto: autoCompleta(d.car_brand, d.car_name),
    })),
  };
}

/**
 * Le ultime `limite` classifiche reali del disco, dalla PIÙ recente.
 * La fuente è listResultFiles (già ordinata mtime decrescente); un file
 * illeggibile salta, non rompe la scheda.
 */
export function classificheRecenti(paths, { limite = 3 } = {}) {
  const sessions = [];
  for (const f of listResultFiles(paths)) {
    if (sessions.length >= limite) break;
    const c = classificaDiFile(f.file);
    if (!c) continue;
    c.nome = f.name;
    c.quando = f.mtime ? new Date(f.mtime).toISOString() : c.quando;
    sessions.push(c);
  }
  return { sessions };
}
