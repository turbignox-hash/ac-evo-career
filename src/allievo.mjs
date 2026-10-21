// allievo.mjs — la MEMORIA del meccanico: impara dai RISULTATI, non dai soli dati.
//
// Richiesta Mauro 21/10/2026 («voglio che il motore impari dai suoi errori»):
// fino a ieri il meccanico era senza memoria — stesso input, stessi consigli,
// anche se l'ultima manciata aveva perso tempo in pista. Il ciclo adesso:
//   1. ogni generazione di consigli per auto+pista apre un ROUND pendente,
//      con il giro migliore della sessione di riferimento;
//   2. quando arriva una sessione NUOVA (file .ld diverso), il round si
//      chiude col delta = giro dopo − giro prima (migliorato/ersi funeg);
//   3. alla generazione seguente ogni consiglio porta la sua STORIA sul
//      campo: confermato se ha guadagnato, passo ridotto/invertito se ha
//      perso, neutro se l'esito era nel rumore. I round aperti non
//      influenzano nulla: non si giudica ciò che non è fattitto.
//(botched) I delta sono condivisi fra i membri dello stesso round (le mancate
// risurezne sono una per round); i contatori sono sul CAMPO (aero, camber...),
// non sul testo — l'obiettivo è la levatura dei consigli, non il catalogo.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './atomic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FILE = join(HERE, '..', 'data', 'setup-allievo.json');

const keyOf = (car, track) =>
  `${String(car ?? '').trim()}|${String(track ?? '').trim()}`.toLowerCase();
const r3 = (v) => Math.round(v * 1000) / 1000;
const nowIso = () => new Date().toISOString();

function load() {
  try {
    const j = JSON.parse(readFileSync(FILE, 'utf8'));
    if (j && typeof j === 'object' && j.memo) return j;
  } catch { /* primo avvio */ }
  return { memo: {} };
}

/** Storia e migliore per auto+pista: { rounds, best } — rounds è in ordine di
 *  tempo (i più recenti in fondo), best può essere null (mai registrato). */
export function memoOf(carName, trackDisplay) {
  const e = load().memo[keyOf(carName, trackDisplay)];
  return { rounds: e?.rounds ?? [], best: e?.best ?? null };
}

/** Storia RIEPILUGO per campo: { campo: { provati, ultimoDelta, ultimoText, guadagnati, persi } } */
export function storiePerCampo(rounds) {
  const m = {};
  for (const r of rounds) {
    if (r.delta == null) continue;          // round pendente: non giudica
    for (const a of r.advices) {
      const e = (m[a.campo] ??= { provati: 0, guadagnati: 0, persi: 0, ultimoDelta: null, ultimoText: null });
      e.provati += 1;
      if (r.delta < -0.05) e.guadagnati += 1;
      else if (r.delta > 0.15) e.persi += 1;
      e.ultimoDelta = r.delta;
      e.ultimoText = a.text;
    }
  }
  return m;
}

/**
 * Registra una generazione di consigli (round APERTO) e chiude i pendenti
 * scaduti: ogni round aperto in precedenza per la stessa auto+pista, con una
 * sessione DIVERSA da quella di oggi, incassa il miglior giro di oggi come
 * esito. Servono bestLap (giro migliore valido di oggi) e la lista consigli
 * ({ vedi, prio, text }) — senza giro valido non si registra nulla.
 */
export function registraRound({ carName, trackDisplay, advices, sessFile, bestLap, when = null }) {
  if (!carName || !trackDisplay || !(bestLap > 0) || !Array.isArray(advices) || !advices.length) return false;
  const j = load();
  const k = keyOf(carName, trackDisplay);
  const e = (j.memo[k] ??= { best: null, rounds: [] });
  // chiusura dei pendenti: sessione di riferimento diversa da quella di oggi
  for (const r of e.rounds) {
    if (r.sessFile && sessFile && r.sessFile !== sessFile && r.bestAfter == null) {
      r.bestAfter = r3(bestLap);
      r.delta = r3(bestLap - r.bestBefore);
      r.chiusoAt = nowIso();
    }
  }
  // il migliore di sempre (è il semaforo del meccanico)
  if (!e.best || bestLap < e.best.lap) e.best = { lap: r3(bestLap), at: when ?? nowIso(), sessFile: sessFile ?? null };
  // IDEMPOTENZA: ricliccare il pannello con la STESSA sessione e lo stesso
  // giro non deve accumulare round doppi pendenti — si aggiorna l'ultimo.
  const ult = e.rounds[e.rounds.length - 1];
  if (ult && ult.bestAfter == null && ult.sessFile === (sessFile ?? null) && ult.bestBefore === r3(bestLap)) {
    ult.advice = advices.slice(0, 12).map((c) => ({ campo: c.vedi ?? '?', prio: c.prio ?? 9, text: String(c.text ?? '').slice(0, 200) }));
    writeJsonAtomic(FILE, j);
    return true;
  }
  const round = {
    at: nowIso(),
    sessFile: sessFile ?? null,
    bestBefore: r3(bestLap),
    bestAfter: null,
    delta: null,
    advice: advices.slice(0, 12).map((c) => ({ campo: c.vedi ?? '?', prio: c.prio ?? 9, text: String(c.text ?? '').slice(0, 200) })),
  };
  e.rounds.push(round);
  if (e.rounds.length > 40) e.rounds = e.rounds.slice(-40);   // memoria fissa
  writeJsonAtomic(FILE, j);
  return true;
}

/**
 * Arricchisce i consigli con la STORIA del campo: un consiglio già provato che
 * ha guadagnato tempo invita a proseguire; uno che ha perso invita a passo
 * ridotto o a cambiare leva. NIENTE annotazione sui round pendenti.
 * Ritorna { consigli, storie } — consigli con campi testo estesi.
 */
export function annotaAdvice(consigli, { rounds, best }) {
  const storie = storiePerCampo(rounds);
  const out = (consigli ?? []).map((c) => {
    const st = storie[c.vedi];
    if (!st) return c;
    let nota;
    if (st.ultimoDelta < -0.05) {
      nota = `Storia: l'ultima proposta su ${c.vedi} ha GUADAGNATO ${(-st.ultimoDelta).toFixed(2)}s · ${st.guadagnati}/${st.provati} giri guadagnati — prosegui in quella direzione o raffina il gradino.`;
    } else if (st.ultimoDelta > 0.15) {
      nota = `Storia: l'ultima proposta su ${c.vedi} ha PERSO ${st.ultimoDelta.toFixed(2)}s · ${st.persi}/${st.provati} giri persi — se il dato di oggi è lo stesso, riduci il passo alla metà o considera che non era quella la leva giusta.`;
    } else {
      nota = `Storia: l'ultima proposta su ${c.vedi} è stata neutra (${st.ultimoDelta >= 0 ? '+' : ''}${st.ultimoDelta.toFixed(2)}s).`;
    }
    return { ...c, text: `${c.text}\n↺ ${nota}` };
  });
  return { consigli: out, storie };
}

/** Il semaforo: consiglio EXTRA in testa quando il giro di oggi è peggio del
 *  migliore di sempre — ricorda ESATTAMENTE quanto manca e da dove si torna. */
export function semaforoAdvice({ best, bestLap }) {
  if (!best || !(bestLap > 0)) return null;
  const delta = r3(bestLap - best.lap);
  if (delta <= 0.05) return null;         // il migliore è già questo
  return {
    vedi: 'memoria', prio: 0,
    text: `🧠 Il tuo miglior giro resta ${best.lap.toFixed(2)}s (${(best.at ?? '').slice(0, 10)}): oggi sei a +${delta.toFixed(2)}s. Se le correzioni non recuperano, torna al setup del ${best.at.slice(0, 10)} e riparti da quello.`,
  };
}
