// meccanico-novita.mjs — «cosa è cambiato dall'ultima volta che sono passato»
// (6/11 notte, Mauro: «quando rientro dal meccanico non capisco se ha consigli o
// migliorie da aggiungere, vedo la solita scheda della prima visita»).
//
// Il pannello del meccanico è calcolato dai dati (profilo pista + ultima
// telemetria + memoria dell'allievo + prove A/B): se i dati non cambiano, il
// testo è IDENTICO alla visita prima — e non c'è modo di sapere se c'è qualcosa
// di nuovo da fare o se i consigli di ieri valgono ancora. Qui si tiene una
// FOTOGRAFIA di quello che la scheda diceva l'ultima volta che Mauro ha detto
// «ho visto», e si confronta con quella di adesso.
//
// Funzioni PURE (tranne leggi/salva): la fotografia è un oggetto semplice, il
// confronto restituisce righe già scritte, e i test non toccano il disco.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from './atomic.mjs';
import { DATA_DIR } from './webui-env.mjs';

export const FILE = join(DATA_DIR, 'meccanico-visto.json');
const MAX_CHIAVI = 200;

/** chiave auto+pista (minuscola, spazi normalizzati): la stessa nei due versi. */
export const chiaveMeccanico = (car, track) =>
  `${String(car ?? '').trim()}|${String(track ?? '').trim()}`.toLowerCase();

const testoPulito = (t) => String(t ?? '').split(/\s*↺\s*Storia:/)[0].trim();
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const giroTxt = (s) => {
  const v = Number(s);
  if (!Number.isFinite(v) || v <= 0) return null;
  return `${Math.floor(v / 60)}:${(v % 60).toFixed(2).padStart(5, '0')}`;
};

/**
 * La fotografia di quello che la scheda del meccanico sta dicendo ADESSO:
 * l'uscita che ha generato i consigli, il giro migliore, i consigli stessi, la
 * prova A/B (aperta e chiuse) e il miglior giro registrato dall'allievo.
 */
export function firmaMeccanico({ consigli = [], bestLap = null, sessFile = null, prova = null, allievo = null } = {}) {
  const best = Number(allievo?.best?.lap);
  return {
    at: new Date().toISOString(),
    sessFile: sessFile ?? null,
    bestLap: Number.isFinite(Number(bestLap)) && Number(bestLap) > 0 ? Number(bestLap) : null,
    consigli: (consigli ?? []).map((c) => testoPulito(c?.text)).filter(Boolean),
    aperta: prova?.aperta
      ? { nome: prova.aperta.setupName ?? null, campi: prova.aperta.campi ?? [], rif: prova.aperta.bestPrima ?? null }
      : null,
    /* `chiusoAt` è il campo vero delle prove su disco; `at` accettato come
       sinonimo perché un registro vecchio (o un test) può portarlo così. */
    chiuse: (prova?.chiuse ?? []).map((p) => ({
      at: p.chiusoAt ?? p.at ?? null, esito: p.esito ?? null, delta: p.delta ?? null, campi: p.campi ?? [],
    })),
    best: Number.isFinite(best) && best > 0 ? best : null,
  };
}

/**
 * Le righe «è cambiato questo» fra la fotografia vista e quella di adesso.
 * Vuoto = niente di nuovo (la scheda sotto è la stessa dell'ultima visita).
 * `null` come visto = prima visita su questa auto+pista.
 */
export function novitaDa(visto = null, ora = null, { max = 4 } = {}) {
  if (!ora) return [];
  if (!visto) {
    return [{
      chi: 'prima',
      text: 'Prima visita su questa auto e questa pista: qui sotto ci sono i consigli, la prova col cronometro e il dialogo per chiedergli un setup.',
    }];
  }
  const out = [];
  /* 1) uscita nuova: la telemetria che alimenta i consigli è un'altra */
  const uscitaNuova = ora.sessFile && ora.sessFile !== visto.sessFile;
  if (uscitaNuova) {
    const g = giroTxt(ora.bestLap);
    out.push({ chi: 'uscita', text: `Nuova uscita in pista${g ? `: giro migliore ${g}` : ''} — i consigli sono ricalcolati su questi dati.` });
  }
  /* 2) giro migliore migliorato nella STESSA sessione (o con dati nuovi) */
  const prima = Number(visto.bestLap), dopo = Number(ora.bestLap);
  if (Number.isFinite(prima) && Number.isFinite(dopo) && prima > 0 && dopo > 0 && dopo < prima - 0.05) {
    out.push({ chi: 'giro', text: `Giro migliore: da ${giroTxt(prima)} a ${giroTxt(dopo)} (−${r2(prima - dopo)} s).` });
  }
  /* 3) prove del setup chiuse da quando hai guardato: l'esito è la cosa più
        importante che il meccanico possa dirti al rientro */
  const giaViste = new Set((visto.chiuse ?? []).map((p) => String(p.at ?? '')));
  for (const p of ora.chiuse ?? []) {
    if (!p?.at || giaViste.has(String(p.at))) continue;
    const campi = (p.campi ?? []).join(' · ') || 'setup';
    const esito = p.esito === 'migliorato' ? `migliorato di ${r2(Math.abs(Number(p.delta) || 0))} s`
      : p.esito === 'peggiorato' ? `peggiorato di ${r2(Math.abs(Number(p.delta) || 0))} s`
        : p.esito === 'neutro' ? 'neutro (dentro il rumore)' : 'chiuso';
    out.push({ chi: 'prova', text: `Prova chiusa su ${campi}: ${esito}.` });
  }
  /* 4) una prova nuova in corso: c'è una carta da caricare e dei giri da fare */
  if (ora.aperta && (ora.aperta.nome ?? '') !== (visto.aperta?.nome ?? '')) {
    const rif = giroTxt(ora.aperta.rif);
    out.push({ chi: 'prova-aperta', text: `Prova in corso: carica «${ora.aperta.nome ?? 'la carta nuova'}» e fai i giri${rif ? ` (riferimento ${rif})` : ''} — al rientro ti dico se ha guadagnato.` });
  }
  /* 5) consigli cambiati: le voci nuove o sparite rispetto a ieri */
  const a = new Set(visto.consigli ?? []), b = ora.consigli ?? [];
  const nuove = b.filter((t) => !a.has(t));
  if (nuove.length) {
    const primaRiga = nuove[0].length > 95 ? `${nuove[0].slice(0, 92)}…` : nuove[0];
    out.push({ chi: 'consigli', text: `${nuove.length === 1 ? 'Consiglio nuovo' : `${nuove.length} consigli nuovi`}: ${primaRiga}` });
  }
  /* 6) il record dell'allievo è migliorato: il meccanico ha un nuovo riferimento */
  const bestPrima = Number(visto.best), bestOra = Number(ora.best);
  if (Number.isFinite(bestPrima) && Number.isFinite(bestOra) && bestPrima > 0 && bestOra > 0 && bestOra < bestPrima - 0.05) {
    out.push({ chi: 'record', text: `Nuovo riferimento su questa pista: ${giroTxt(bestOra)} (era ${giroTxt(bestPrima)}).` });
  }
  return out.slice(0, Math.max(0, max));
}

/** La fotografia salvata per auto+pista (null alla prima visita). */
export function leggiVisto(car, track) {
  try {
    const j = JSON.parse(readFileSync(FILE, 'utf8'));
    return j?.[chiaveMeccanico(car, track)] ?? null;
  } catch { return null; }
}

/** Salva la fotografia: da adesso le novità si contano da qui. */
export function salvaVisto(car, track, firma) {
  if (!firma) return null;
  let j = {};
  try {
    j = JSON.parse(readFileSync(FILE, 'utf8')) ?? {};
    if (typeof j !== 'object' || Array.isArray(j)) j = {};
  } catch { j = {}; }
  j[chiaveMeccanico(car, track)] = firma;
  const chiavi = Object.keys(j);
  if (chiavi.length > MAX_CHIAVI) {
    chiavi.sort((x, y) => String(j[x]?.at ?? '').localeCompare(String(j[y]?.at ?? '')));
    for (const k of chiavi.slice(0, chiavi.length - MAX_CHIAVI)) delete j[k];
  }
  writeJsonAtomic(FILE, j);
  return firma;
}
