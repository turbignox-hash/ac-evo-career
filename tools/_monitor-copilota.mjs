// _monitor-copilota.mjs — osservatore della COPILOTA VOCALE (24/10, richiesta
// Mauro: «mi dice che sta finendo il giro 1 mentre sto partendo»). NON parla:
// replica ESATTAMENTE la logica dei narratori di gui/js/viste-a.js e scrive in
// data/copilot-<porta>-24-10.jsonl ogni frase che il browser direbbe, con i
// dati crudi accanto — così ricostruiamo il perché di ogni discorso sballato.
// ALLINEATO 27/10: delta a bucket (parla solo se cambia davvero, min 20 s),
// finestra pit col suo annuncio E il conto alla rovescia 6b (tacche 2-1-0).
//
// uso: node tools/_monitor-copilota.mjs 8644 [8642 …]
import { appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORTS = process.argv.slice(2).filter((p) => /^\d+$/.test(p)).map(Number);
if (!PORTS.length) { console.error('uso: node tools/_monitor-copilota.mjs <porta> [porta2 …]'); process.exit(1); }
const LOG = (port) => join(HERE, '..', 'data', `copilot-${port}-24-10.jsonl`);
for (const p of PORTS) { const f = LOG(p); if (!existsSync(f)) writeFileSync(f, ''); }

// stato per porta: replica window.__copilot (last.*, at) del client
const slots = new Map(PORTS.map((p) => [p, { last: {}, at: 0, sawLive: false, firma: null, start: Date.now() }]));

const campi = (m) => ({
  sessionType: m.sessionType ?? null,
  gauges: {
    lapsDone: m.gauges?.lapsDone ?? null, lapsTotal: m.gauges?.lapsTotal ?? null,
    isLastLap: m.gauges?.isLastLap ?? null,
    position: m.gauges?.position ?? null, fuel: m.gauges?.fuel ?? null,
    lapsOnFuel: m.gauges?.lapsOnFuel ?? null, lapsLeft: m.gauges?.lapsLeft ?? null,
    gapAhead: m.gauges?.gapAhead ?? null, gapBehind: m.gauges?.gapBehind ?? null,
    timeLeft: m.gauges?.timeLeft ?? null,
  },
  timing: m.timing ?? null,
  delta: m.delta ? { dv: m.delta.dv ?? m.delta.hudDv ?? null, lapNo: m.delta.lapNo ?? null, source: m.delta.source ?? null, bestLapNo: m.delta.bestLapNo ?? null } : null,
  pit: m.pit ? { need: m.pit.need, pitLap: m.pit.pitLap, lapsToWindow: m.pit.lapsToWindow } : null,
});

async function poll(port, slot) {
  let m = null;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/ingegnere`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) throw new Error('http ' + r.status);
    m = await r.json();
  } catch { m = null; }
  const up = +((Date.now() - slot.start) / 1000).toFixed(1);
  if (!m?.live) {
    if (slot.sawLive) {
      appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up, evento: 'SESSIONE FUORI (live=false) — i last del copilota RESTANO: il client non li azzera' }) + '\n');
      slot.sawLive = false;
    }
    return;
  }
  if (!slot.sawLive) {
    slot.sawLive = true;
    appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up, evento: 'SESSIONE VIVA (live=true) — last del copilota ereditati dalla sessione precedente', dati: campi(m) }) + '\n');
  }
  /* allineato al client 28/10: la FIRMA della sessione (eventId+sessionId+tipo,
     ora nel payload) cambia → memoria dei narratori a zero, come in viste-a.js */
  const firma = m.sessionId ?? null;
  if (firma != null && firma !== slot.firma) {
    if (slot.firma != null) appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up, evento: 'SESSIONE NUOVA (firma cambiata) — last dei narratori azzerati come in vista' }) + '\n');
    slot.firma = firma;
    slot.last = {};
  }
  const parla = [];
  /* replica narratori — viste-a.js, logica allineata 27/10: il delta parla SOLO
     se il bucket di 400 ms cambia per davvero, minimo 20 s tra discorsi (prima
     ripeteva a valore fermo ogni 12 s). */
  const dv = m.delta?.dv ?? m.delta?.hudDv ?? null;
  if (dv != null) {
    const bucket = Math.round(dv / 400);
    if (slot.last.dvBucket == null || slot.at === 0) slot.last.dvBucket = bucket;   // semina senza voce
    else if (bucket !== slot.last.dvBucket && Date.now() - (slot.at ?? 0) > 20000) {
      slot.last.dvBucket = bucket; slot.at = Date.now();
      parla.push(dv < 0
        ? { chi: 'delta', it: `sei più veloce del best di ${(Math.abs(dv) / 1000).toFixed(1)}` }
        : { chi: 'delta', it: `sei più lento del best di ${(dv / 1000).toFixed(1)}` });
    }
  }
  const lapNo = m.delta?.lapNo ?? null;
  const lastLapTxt = m.timing?.lastLap ?? null;
  const g = m.gauges ?? {};
  // replica 25/10: il traguardo si legge da lapsDone, e se la modalità lo
  // lascia a 0 la scorta è lapNo DELTA DIRETTO (lapNo = giri compiuti, vedi
  // viste-a.js: lezione Brands Hatch 25/10, replay del registro). Come in
  // vista: niente voce oltre il totale della sessione — il taglio in più sul
  // traguardo è artefatto, non gara (risultati ufficiali restano 3 giri)
  let compiuto = (Number.isFinite(g.lapsDone) && g.lapsDone > 0) ? g.lapsDone
    : (lapNo != null && lapNo > 0 ? lapNo : null);
  if (compiuto != null && g.lapsTotal != null && g.lapsTotal > 0 && compiuto > g.lapsTotal) compiuto = g.lapsTotal;
  if (compiuto != null && slot.last.giro != null && compiuto < slot.last.giro) { slot.last.giro = compiuto; slot.last.lastLapTxt = lastLapTxt; slot.last.meta = false; }
  // ⚠ replica FEDELLE: qui sotto le condizioni restano IDENTICHE alla vista
  if (g.lapsDone != null && g.lapsDone <= 1) slot.last.meta = false;
  if (compiuto != null && slot.last.giro != null && compiuto > slot.last.giro && lastLapTxt && lastLapTxt !== slot.last.lastLapTxt) {
    parla.push(m.delta?.bestLapNo === compiuto
      ? { chi: 'giroFatto', it: `Giro ${compiuto} fatto in ${lastLapTxt} — nuovo best` }
      : { chi: 'giroFatto', it: `Giro ${compiuto} fatto in ${lastLapTxt}` });
  }
  if (compiuto != null && lastLapTxt && lastLapTxt !== slot.last.lastLapTxt) slot.last.giro = compiuto;
  if (lastLapTxt != null) slot.last.lastLapTxt = lastLapTxt;
  if (g.lapsTotal != null && g.lapsTotal > 0 && g.lapsDone != null && !slot.last.meta) {
    const meta = Math.ceil(g.lapsTotal / 2);
    if (g.lapsDone + 1 >= meta) {
      slot.last.meta = true;
      parla.push({ chi: 'metaBenzina', it: `Meta gara: benzina ${g.fuel ?? '?'} L, per ${g.lapsOnFuel ?? '?'} giri${g.lapsLeft != null ? `, restano ${g.lapsLeft}` : ''}` });
    }
  }
  if (g.lapsOnFuel != null && slot.last.fuel != null && g.lapsOnFuel < slot.last.fuel - 0.49) {
    parla.push(g.lapsLeft != null && g.lapsOnFuel < g.lapsLeft + 1
      ? { chi: 'benzina', it: `Attenzione benzina: per ${g.lapsOnFuel} giri, ne restano ${g.lapsLeft}` }
      : { chi: 'benzina', it: `Benzina per ${g.lapsOnFuel} giri` });
  }
  if (g.lapsOnFuel != null) slot.last.fuel = g.lapsOnFuel;
  const worst = (g.wear ?? []).filter(Number.isFinite).reduce((a, v) => Math.max(a, v), 0);
  const band = !worst ? 0 : worst >= 80 ? 2 : worst >= 55 ? 1 : 0;
  if (band > (slot.last.wearBand ?? 0) && band > 0) parla.push({ chi: 'gomme', it: `Gomme al ${Math.round(worst)} percento` });
  if (worst != null) slot.last.wearBand = band;
  if (g.gapAhead != null && g.gapAhead > 0 && g.gapAhead < 1.5) {
    const k = Math.round(g.gapAhead * 10);
    if (slot.last.gap !== k) { slot.last.gap = k; parla.push({ chi: 'gap', it: `Gap davanti ${g.gapAhead.toFixed(1)}` }); }
  } else slot.last.gap = null;
  const pit = m.pit;
  if (pit?.need && pit.pitLap != null && slot.last.pit !== pit.pitLap) {
    slot.last.pit = pit.pitLap;
    parla.push(pit.lapsToWindow === 0
      ? { chi: 'pit', it: 'Sosta: aperta adesso, fermati questo giro' }
      : { chi: 'pit', it: `Sosta: si apre tra ${pit.lapsToWindow} giri, entro il giro ${pit.pitLap + 1}` });
    // 27/10: se la finestra era già vicina alla prima vista, il conto (6b) parte
    // dalla tacca di adesso — niente doppio annuncio nello stesso minuto
    if (Number.isFinite(pit.lapsToWindow) && pit.lapsToWindow < 3) slot.last.pitN = pit.lapsToWindow;
  }
  /* 8) ULTIMO GIRO PIÙ BANDIERA (28/10, allineato a viste-a.js narratore 8):
     prima il sensore isLastLap della MMF, poi il contatore come scorta.
     Prima del sensore doppio (shmem) la gara del 24/10 finiva SENZA il
     «Ultimo giro!» e SENZA la «Bandiera a scacchi». */
  const lt = g.lapsTotal, ld = g.lapsDone;
  if (lt != null && ld != null && lt > 0) {
    if ((g.isLastLap || ld + 1 === lt) && !slot.last.ultimo) { slot.last.ultimo = true; parla.push({ chi: 'ultimoGiro', it: 'Ultimo giro!' }); }
    if (ld >= lt && !slot.last.bandiera) { slot.last.bandiera = true; parla.push({ chi: 'bandiera', it: 'Bandiera a scacchi!' }); }
    if (ld + 1 < lt) slot.last.ultimo = false;
  }
  /* 6b) CONTO ALLA SOSTA (27/10, come in vista): tacche 2, 1, 0 con le gomme
     stanche nella frase. cpSay min 12 s → qui lo stesso slot di tempo. */
  if (pit?.need && Number.isFinite(pit.lapsToWindow)) {
    const stanche = (slot.last.wearBand ?? 0) >= 1;
    const tacca = pit.lapsToWindow >= 3 ? null : pit.lapsToWindow;
    if (tacca != null && slot.last.pitN !== tacca) {
      slot.last.pitN = tacca;
      const ora = Date.now();
      if (!slot.last.pitcount || ora - slot.last.pitcount >= 12000) {
        slot.last.pitcount = ora;
        parla.push({
          chi: 'pitcount',
          it: tacca === 0
            ? `Fermarsi adesso: baia costa circa ${pit.pitLossSec} secondi`
            : tacca === 1
              ? `Sosta questo giro o il prossimo${stanche ? ' — gomme stanche' : ''}`
              : `Sosta tra ${tacca} giri${stanche ? ' — gomme al limite, contano anche le pressioni' : ''}`,
        });
      }
    }
  } else slot.last.pitN = null;
  appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up, frasi: parla, dati: campi(m) }) + '\n');
}

console.log('≫ monitor copilota su porte', PORTS.join(', '), '— log in data/copilot-*-24-10.jsonl (CTRL-C ferma)');
const tick = () => { for (const p of PORTS) poll(p, slots.get(p)).catch(() => {}); };
tick();
setInterval(tick, 4000);
