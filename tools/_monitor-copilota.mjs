// _monitor-copilota.mjs — osservatore della COPILOTA VOCALE (24/10, richiesta
// Mauro: «mi dice che sta finendo il giro 1 mentre sto partendo»). NON parla:
// replica ESATTAMENTE la logica dei narratori di gui/js/viste-a.js e scrive in
// data/copilot-<porta>-24-10.jsonl ogni frase che il browser direbbe, con i
// dati crudi accanto — così ricostruiamo il perché di ogni discorso sballato.
// ALLINEATO 27/10: delta a bucket (parla solo se cambia davvero, min 20 s),
// finestra pit col suo annuncio E il conto alla rovescia 6b (tacche 2-1-0).
// 28/10 tardissimo: il narratore esce in `narratore(m, slot)` — la STESSA
// funzione la guida il test test/copilota-narratori.test.mjs sulle gare
// sintetiche, così la replica e la vista non possono smettere di combaciare.
// E il riepilogo (--riepilogo) legge un registro e denuncia: frasi ripetute,
// metà gara più di una volta, «Ultimo giro» dopo la bandiera — il materiale
// del verdetto a fine prova live.
//
// uso: node tools/_monitor-copilota.mjs 8644 [8642 …]
//      node tools/_monitor-copilota.mjs --riepilogo data/copilot-8642-24-10.jsonl
import { appendFileSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// il NARRATORE UNICO (31/10): importato per gli effetti — il nucleo vive in
// gui/js/narratore-unito.js e attacca globalThis.__EVO_NARRATORE (la copia è
// lì perché anche la pagina del cruscotto lo carica con gli altri script).
import '../gui/js/narratore-unito.js';
const { narratore } = globalThis.__EVO_NARRATORE;

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = (port) => join(HERE, '..', 'data', `copilot-${port}-24-10.jsonl`);
// il CLI parte SOLO quando il file è lo script principale: quando il test lo
// importa sono il narratore e basta (prima il CLI exitava a import, la suite
// moriva).

/* ------------------------------------------------------------------ */
/* replica dei narratori — UNICA funzione, usata dal CLI e dal test     */
/* ------------------------------------------------------------------ */

const campi = (m) => ({
  sessionType: m.sessionType ?? null,
  // 29/10: la FASE del gioco (phaseName del GRAPHICS, es. 'Race') accanto al
  // tipo del blocco STATIC — nelle gare SP il tipo mente («TimeAttack»), la
  // fase è la verità che apre il gate inRace dell'ingegnere (finestra sosta
  // nelle gare SP). Se in prova libera scrivesse Race pure lì, il registro
  // lo denuncia nella prossima gara e il gate si chiude con un'altra guardia.
  phase: m.phase ?? null,
  gauges: {
    lapsDone: m.gauges?.lapsDone ?? null, lapsTotal: m.gauges?.lapsTotal ?? null,
    isLastLap: m.gauges?.isLastLap ?? null,
    inPit: m.gauges?.inPit ?? null,   // 28/10 sera: sensore drift richiesto da Mauro («voce quando apre/chiude i box»)
    flag: m.gauges?.flag ?? null,     // 28/10 notte: flag PER AUTO della MMF (FLAG[4]='blu') — alimenta il narratore bandiera blu dell'endurance
    flagCode: m.gauges?.flagCode ?? null,        // il GREZZO accanto alla parola: se una endurance scrivesse un valore fuori mappa la diagnosi lo dice da solo
    globalFlag: m.gauges?.globalFlag ?? null,
    globalFlagCode: m.gauges?.globalFlagCode ?? null,
    wear: m.gauges?.wear ?? null,     // usura gomme: alimenta i narratori «Gomme al N%» e le contontoare «gomme stanche» — senza di essa un'istanza vecchia può mascherare il buco come bug del gioco (stesso tranello del campo inPit del 28/10)
    position: m.gauges?.position ?? null, fuel: m.gauges?.fuel ?? null,
    lapsOnFuel: m.gauges?.lapsOnFuel ?? null, lapsLeft: m.gauges?.lapsLeft ?? null,
    gapAhead: m.gauges?.gapAhead ?? null, gapBehind: m.gauges?.gapBehind ?? null,
    // GREZZI (31/10 pomeriggio): il gioco scrive DAVVERO il campo? se i raw
    // restano sempre 0.0 in gara il gap è un campo morto in SP (come
    // totalLapCount della 500) — se muovono è un offset in fumo. Il filtro
    // >0 sopra nascondeva la differenza; così la prossima gara lo dice da
    // sola nel registro.
    gapAheadRaw: m.gauges?.gapAheadRaw ?? null, gapBehindRaw: m.gauges?.gapBehindRaw ?? null,
    cutSec: m.gauges?.cutSec ?? null,   // 30/10: penalità tagli in secondi (9b)
    timeLeft: m.gauges?.timeLeft ?? null,
  },
  timing: m.timing ?? null,
  delta: m.delta ? { dv: m.delta.dv ?? m.delta.hudDv ?? null, lapNo: m.delta.lapNo ?? null, source: m.delta.source ?? null, bestLapNo: m.delta.bestLapNo ?? null } : null,
  pit: m.pit ? { need: m.pit.need, pitLap: m.pit.pitLap, lapsToWindow: m.pit.lapsToWindow, pitLossSec: m.pit.pitLossSec ?? 30 } : null,
  // 31/10 (DA-9): la finestra VIVA del piano stint del server (stintStopAlert
  // di stint-plan.mjs dentro il payload /api/ingegnere): alimenta il narratore
  // «Box entro N giri» e il registro — il campo null fuori gara è il CONTRATTO,
  // come in pit: senza il piano nel payload la voce tace, non mente.
  stintAlert: m.stintAlert ? { k: m.stintAlert.k, earliest: m.stintAlert.earliest, latest: m.stintAlert.latest, mid: m.stintAlert.mid, lapsTo: m.stintAlert.lapsTo } : null,
});

/* il NUCLEO del narratore vive in UNA sola copia da oggi: gui/js/narratore-unito.js
   (31/10, unificazione: la pagina del cruscotto e il server non si riscoprivano
   più a mano — una cura nel nucleo vale per radio, pagina e test).
   Questo file resta la facciata Node: re-esporta il narratore importato qui
   sopra a voce-copilota e ai test. */
export { narratore };

/* statRiepilogo(righe): la contabilità del riepilogo, FUNZIONE PURA (31/10):
   prima viveva in linea nella CLI e nessun test poteva proteggerla — e
   proprio lì era finito il difetto che attribuiva alla radio i doppi
   dell'eco.   Torna: { meta, ultimo, bandiera, zittite, sbalzi, ecoFrasi, gapMax, viste, radio }.
   `radio` è la lista delle parole vere con ripetutaDopoMs (null se unica, ms se
   ripetuta entro i 70 s, per l'avviso della riga); `viste` contiene SOLO anomalie
   reali (ripetizioni, meta >1, bandiera >1 su radio reale — mai sull'eco). */
export function statRiepilogo(righe) {
  const viste = [];
  /* 31/10 sera (prova sul registro voce): nel file del Pitwall si accanmoncan
     centinaia di righe di servizio (STATO ogni 60 s, SILENZIO con il suo motivo,
     TICK di avvio — fino a gioco SPENTO il tick continua a girare) e la CLI
     del riepilogo le stampava TUTTE prima degli eventi veri: il verdetto della
     gara era neutrizzato nel rumore. Da qui il filtro live È nel pure:
     - `servizio`: SOLO gli eventi che raccontano qualcosa (SESSIONE, AVVIO,
       SERVER, ERRORE, PAYLOAD…) in ordine di arrivo — li stampa l'apertura;
     - `nascosti`: contatore del rumore STATO/SILENZIO/TICK, citato in FONDO
       con UNA riga (la diagnostica del motivo resta a chi la cerca nel RAW);
     - `motiviSilenzio`: i motivi SILENZIO distinti visti (arrivo UNA volta
       sola, senza i 3 giri di minuti minutantia). */
  const servizio = [];
  const nascosti = {};
  const motiviSilenzio = [];
  let meta = 0, ultimo = 0, bandiera = 0, zittite = 0, sbalzi = 0, ecoFrasi = 0;
  const detti = new Map();   // testo → ultimo t prima
  /* 31/10 (diagnosi gara 14:24): nel registro convivono DUE sorgenti di frasi
     e il riepilogo le mescolava come se fossero la stessa radio:
     - righe piatte {t, chi, it, livello}): le parole VERE dette dal Pitwall
       (logaVoce della webui) — quello che Mauro ha sentito davvero;
     - righe {t, dati, frasi:[…]}): l'ECO del monitor, il calcolo del narratore
       diagnostico — MAI fuori dagli altoparlanti, e ogni AVVIO MONITOR riparte
       con lo slot fresco (nuova istanza = meta re-inserita). Sul registro
       28-29/10 produceva «Meta ×3» e «RIPETUTA dopo 32s» che non corrispondono
       a nessun doppio udito in gara: artifact diagnostico, non difetto radio.
     Da qui: bilancio e anomalie SOLO sulla radio reale; l'eco resta come
     statistica a parte e come fonte dei dati (dati→gapMax). */
  const gapMax = { davanti: 0, dietro: 0, lette: 0 };
  const radio = [];
  const cellaAt = (chiave) => { nascosti[chiave] = (nascosti[chiave] ?? 0) + 1; };
  for (const r of righe) {
    if (r.evento) {
      // gli sbalzi live (SESSIONE FUORI/VIVA) sono normali fra le sessioni:
      // li CONTANO, non sono anomalie — solo se tornano ogni 4 s è un fulmine
      if (r.evento.startsWith('SESSIONE')) { sbalzi++; servizio.push({ t: r.t, evento: r.evento }); continue; }
      /* il rumore (STATO/SILENZIO/TICK: la mina del tick sotto): conta e tace.
         TUTTO L'ALTRO (AVVIO, SERVER, ERRORE, PAYLOAD…) apre il riepilogo. */
      if (r.evento.startsWith('TICK')) { cellaAt('TICK'); continue; }
      if (r.evento.startsWith('STATO')) { cellaAt('STATO'); continue; }
      if (r.evento.startsWith('SILENZIO')) {
        cellaAt('SILENZIO');
        if (r.motivi && !motiviSilenzio.includes(r.motivi)) motiviSilenzio.push(r.motivi);
        continue;
      }
      servizio.push({ t: r.t, evento: r.evento });
      continue;
    }
    if (r.dati) {
      gapMax.davanti = Math.max(gapMax.davanti, Number(r.dati?.gauges?.gapAhead) || 0);
      gapMax.dietro = Math.max(gapMax.dietro, Number(r.dati?.gauges?.gapBehind) || 0);
      gapMax.lette++;
    }
    if (typeof r.chi === 'string' && r.it) {
      // RADIO REALE: le frasi davvero uscite dagli altoparlanti
      const prima = detti.get(r.it);
      const dt = prima != null ? (r.t - prima) / 1000 : null;
      const entro70 = dt != null && dt < 70;
      radio.push({ t: r.t, chi: r.chi, it: r.it, livello: r.livello ?? null, ripetutaDopoMs: entro70 ? Math.round(dt * 1000) : null });
      if (entro70) viste.push(`RIPETUTA ${r.it.slice(0, 50)} dopo ${dt.toFixed(0)}s`);
      detti.set(r.it, r.t);
      if (r.chi === 'metaBenzina') meta++;
      if (r.chi === 'ultimoGiro') ultimo++;
      if (r.chi === 'bandiera') bandiera++;
      continue;
    }
    for (const f of r.frasi ?? []) {
      if (f.detto) { zittite++; continue; }
      ecoFrasi++;
    }
  }
  /* 11/02 (dopo la gara del 31/10 15:04): il file contiene PIÙ GARE e il
     verdetto «bandiera ×2» contava la bandiera di gare diverse: unica anomalia
     falsa, io per gara la colomba è regolare. Da qui le anomalie di banda si
     calcolano PER GARA: le parole vere si tagliano in gare con una fermera
     > 10 min (radio zitta = cambio gara). Un ripetito nella STESSA gara resta
     anomalía vera (vecchio difetto contatore); una per ogni gara è il giro
     normale. */
  const segmenti = [];
  for (const r of radio) {
    const ultimo = segmenti[segmenti.length - 1];
    if (ultimo != null && r.t - ultimo[ultimo.length - 1].t <= 600000) ultimo.push(r);
    else segmenti.push([r]);
  }
  for (const gara of segmenti) {
    const nMeta = gara.filter((r) => r.chi === 'metaBenzina').length;
    if (nMeta > 1) viste.push(`metà gara annunciata ×${nMeta} in una gara — flag riaperto (vecchio difetto contatore)`);
    const nBand = gara.filter((r) => r.chi === 'bandiera').length;
    if (nBand > 1) viste.push(`bandiera ×${nBand} in una gara`);
  }
  return { meta, ultimo, bandiera, gare: Math.max(1, segmenti.length), zittite, sbalzi, ecoFrasi, gapMax, viste, radio, servizio, nascosti, motiviSilenzio };
}

/* trascrizione(righe): la RADIO in formato leggibile, gara per gara (31/10).
   Il riepilogo fa la contabilità, questo riproduce il discorso vero: righe
   «+mm:ss · [chiave] frase» tagliate in gare al silenzio ≥ 10 min (lo stesso
   fermo della contabilità), con i ripetuti entro 70 s segnati «⚠ ripetuta».
   Fonte: le frasi radio REALI del Pitwall (logaVoce). Su un registro del
   monitor usano le frasi ECO (calcolo, mai altoparlanti) SOLO dichiarate con
   il tag «(eco)»: la trascrizione non deve fingere una radio che non c'era. */
export function trascrizione(righe) {
  const st = statRiepilogo(righe);
  const primoT = righe[0]?.t ?? 0;
  const fmt = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  let frasi = st.radio.map((r) => ({ t: r.t, chi: r.chi, it: r.it, ripetuta: r.ripetutaDopoMs, eco: false }));
  const eco = !frasi.length;
  if (eco) {
    frasi = [];
    for (const r of righe) {
      for (const f of r.frasi ?? []) {
        if (!f.detto && f.chi && f.it) frasi.push({ t: r.t, chi: f.chi, it: f.it, ripetuta: null, eco: true });
      }
    }
  }
  const segmenti = [];
  for (const r of frasi) {
    const seg = segmenti[segmenti.length - 1];
    if (seg != null && r.t - seg[seg.length - 1].t <= 600000) seg.push(r);
    else segmenti.push([r]);
  }
  const fonteTag = eco ? 'ECO del monitor (calcolo, non altoparlanti)' : 'radio reale del Pitwall';
  const out = [`Trascrizione copilota — ${segmenti.length} gara/e · ${frasi.length} frasi · ${fonteTag}`];
  segmenti.forEach((seg, i) => {
    out.push(`── Gara ${i + 1} (da +${fmt(seg[0].t - primoT)} a +${fmt(seg[seg.length - 1].t - primoT)}) ──`);
    for (const r of seg) {
      const rip = r.ripetuta != null ? ` ⚠ ripetuta dopo ${(r.ripetuta / 1000).toFixed(0)}s` : '';
      out.push(`  +${fmt(r.t - primoT)} · [${r.chi}] ${r.it}${r.eco ? ' (eco)' : ''}${rip}`);
    }
  });
  if (!frasi.length) out.push('  (nessuna frase nel registro: la copilota è rimasta muta o il file porta solo rumore di servizio)');
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* CLI (solo quando è lo script prunicipale)                            */
/* ------------------------------------------------------------------ */

const MAIN = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (MAIN) {

const JSX = process.argv.slice(2);
const PORTS = JSX.filter((p) => /^\d+$/.test(p)).map(Number);
const REP = JSX.includes('--riepilogo');

if (REP) {
  const file = JSX[JSX.indexOf('--riepilogo') + 1];
  if (!file) { console.error('uso: node tools/_monitor-copilota.mjs --riepilogo <file.jsonl>'); process.exit(1); }
  const righe = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  console.log('≫ riepilogo copilota:', file, `(${righe.length} righe)`);
  const st = statRiepilogo(righe);
  const primoT = righe[0]?.t ?? 0;
  // prima gli eventi di servizio che raccontano qualcosa (SESSIONE, AVVIO,
  // SERVER, ERRORE…); STATO/SILENZIO/TICK restano fuori e si citano in fondo:
  // sul registro voce erano centinaia e seppellivano il verdetto (31/10).
  for (const r of st.servizio) {
    console.log(`  +${((r.t - primoT) / 1000).toFixed(0)}s · ${r.evento.slice(0, 60)}`);
  }
  // poi la radio reale riga per riga, con l'avviso se ripetuta entro 70 s:
  for (const v of st.radio) {
    const avviso = v.ripetutaDopoMs != null ? `  ⚠ RIPETUTA dopo ${(v.ripetutaDopoMs / 1000).toFixed(0)}s` : '';
    console.log(`  +${((v.t - primoT) / 1000).toFixed(0)}s (${v.livello ?? '?'}) [${v.chi}] ${v.it}${avviso}`);
  }
  console.log(`\n≫ bilancio RADIO REALE (quello sentito dal Pitwall): metà gara ×${st.meta} · ultimo giro ×${st.ultimo} · bandiera ×${st.bandiera}  — su ${st.gare} gara/e in questo file`);
  console.log(`≫ eco monitor (calcolo, non radio): ${st.ecoFrasi} frasi simulate · ${st.zittite} zittite dalla guardia 70s · sbalzi live ×${st.sbalzi}`);
  if (st.gapMax.lette) {
    console.log(`≫ gap: max davanti ${st.gapMax.davanti.toFixed(1)} s · max dietro ${st.gapMax.dietro.toFixed(1)} s · su ${st.gapMax.lette} letture${st.gapMax.davanti === 0 && st.gapMax.dietro === 0 ? ' — MAI scritti dal gioco in questo registro: la voce dei gap tace per costruzione (controlla che in EVO sia attivo il display gap davanti/dietro e riferisci la prossima gara)' : ''}`);
  }
  /* il rumore di servizio si CITA in fondo: contatore per chiave e, se c'erano
     silenzi con un motivo ripetuto, la lista UNICA dei motivi. */
  const zittoSum = Object.entries(st.nascosti ?? {}).map(([k, n]) => `${k} ×${n}`).join(' · ');
  if (zittoSum) {
    console.log(`\n≫ rumore di servizio zittito nel riepilogo: ${zittoSum}`);
    if (st.motiviSilenzio?.length) console.log(`≫ motivi dei silenzi (${st.motiviSilenzio.length} distinti): ${st.motiviSilenzio.join(' | ')}`);
  }
  if (st.viste.length) console.log(`\n≫ ⚠ ANOMALIE (${st.viste.length}):\n   - ${st.viste.join('\n   - ')}`);
  else console.log('\n≫ nessuna anomalia: metà gara, ultimo giro e bandiera una volta sola, niente ripetizioni vicine.');
  process.exit(0);
}

/* --trascrizione (31/10): il discorso della copilota leggibile dall'uomo,
   gara per gara. Stesso parser tollerante del riepilogo; secondo argomento
   opzionale = path di un file .txt dove salvare il testo oltre a stamparlo. */
const TRA = JSX.includes('--trascrizione');
if (TRA) {
  const file = JSX[JSX.indexOf('--trascrizione') + 1];
  if (!file) { console.error('uso: node tools/_monitor-copilota.mjs --trascrizione <file.jsonl> [file-out.txt]'); process.exit(1); }
  const righe = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  const testo = trascrizione(righe);
  console.log(testo);
  const dest = JSX[JSX.indexOf('--trascrizione') + 2];
  if (dest && !/^\d+$/.test(dest) && !dest.startsWith('--')) {
    writeFileSync(dest, testo + '\n');
    console.log(`\n≫ trascrizione scritta in ${dest}`);
  }
  process.exit(0);
}

if (!PORTS.length) { console.error('uso: node tools/_monitor-copilota.mjs <porta> [porta2 …]  (oppure --riepilogo / --trascrizione <file.jsonl> [out.txt])'); process.exit(1); }
for (const p of PORTS) { const f = LOG(p); if (!existsSync(f)) writeFileSync(f, ''); }

/* AUTODIFESA DA CODICE VECCHIO (28/10 notte, lezione della gara muto):
   l'istanza del monitor girava da PRIMA dell'aggiunta del narratore bandiera
   blu e il suo registro non portava MAI la chiave flag (che campi() scrive
   sempre, anche null) — un codice aggiornato su disco ma un processo vecchio
   in esecuzione fanno sembrare un buco diagnostico un bug del gioco. Da
   questa versione il monitor rilegge il proprio file sorgente a ogni tick:
   se è più NUOVO di lui, scrive l'evento nel registro e ESCE così chi lo
   rilancia parte col codice giusto. Timbro mtime all'avvio: */
const SELF_FILE = fileURLToPath(import.meta.url);
const mtimeAllAvvio = statSync(SELF_FILE).mtimeMs;
function codiceAggiornato() {
  try { return statSync(SELF_FILE).mtimeMs > mtimeAllAvvio; } catch { return false; }
}

/* MARCA DI VERSIONE nel log (28/10 tardissimo): la gara «muto» della prova
   3 giri sembrava arrivare SENZA il campo inPit nei dati, ma a sorgente il
   campo c'è sempre (shmem → player.inPit → gauges): l'istanza del monitor
   girava da PRIMA dell'aggiunta del sensore box e il suo campi() non copiava
   inPit. Da questa sera ogni avvio TIMBRA il file: chi legge il registro
   sa subito quale versione del monitor l'ha scritto (e un'istanza vecchia
   non fa più sembrare un buco diagnostico un bug del gioco). */
for (const p of PORTS) {
  appendFileSync(LOG(p), JSON.stringify({ t: Date.now(), up: 0, evento: `AVVIO MONITOR (v. campi+inPit — ${PORTS.length} porta/e)` }) + '\n');
}

// stato per porta: replica window.__copilot (last.*, at) del client
const slots = new Map(PORTS.map((p) => [p, { last: {}, at: 0, said: {}, sawLive: false, firma: null, start: Date.now(), ko: false }]));

async function poll(port, slot) {
  const TRACE = !!process.env.TRACE;
  if (TRACE) console.error(`[poll ${port} up=${+((Date.now() - slot.start) / 1000).toFixed(0)}] inizio`);
  // AUTODIFESA: codice più nuovo del processo → log + exit (lezione 28/10)
  if (codiceAggiornato()) {
    appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up: +((Date.now() - slot.start) / 1000).toFixed(1), evento: 'CODICE AGGIORNATO SU DISCO — il monitor girava la versione VECCHIA (istanza pre-aggiornamento): esco, rilanciare il monitor' }) + '\n');
    console.error('⚠ il codice di _monitor-copilota.mjs è cambiato su disco da quando sono partito: esco, rilanciarmi a mano (node tools/_monitor-copilota.mjs ' + PORTS.join(' ') + ')');
    process.exit(0);
  }
  // IL FIX DEL TUTTO-SILENZIO (28/10 23:45, «copilot ancora muto»): `m`
  // NON era dichiarata — in modo strict ogni poll esplodeva su `m = await
  // r.json()` (ReferenceError), il catch vecchio zittiva tutto e il ciclo
  // continuava ogni 4 s SENZA scrivere MAI una riga: sessione viva, coda
  // viva, monitor vivo… e voci zero. Dichiare prima del try: la fetch
  // torna a lavorare perché sempre ha funzionato — era solo l'assegnazione
  // a morire.
  let m = null;
  try {
    // LEGGERO (31/10 pomeriggio): il payload INTERO impiega più dei 2,5 s di
    // fetch qui dentro (scansioni MoTeC su disco lento) — nella gara delle
    // 15:29 il falimento del fetch è uscito al minuto PER TUTTA LA GARA e il
    // registro è rimasto senza dati (niente flag, niente gap raw). La rotta
    // ora onora body.leggero (stessa variante del tick della voce): con il
    // payload leggero la risposta è fulminea e i dati non si perdono più.
    const r = await fetch(`http://127.0.0.1:${port}/api/ingegnere`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leggero: true }),
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) throw new Error('http ' + r.status);
    m = await r.json();
    if (TRACE) console.error(`[poll ${port}] fetch ok — live=${m?.live} type=${m?.sessionType}`);
    // il server risponde: azzera il segno di guasto del ciclo prima
    if (slot.ko) { slot.ko = false; }
  } catch (e) {
    if (TRACE) console.error(`[poll ${port}] fetch KO: ${e?.message ?? e}`);
    // IL BUCO CHIUSO (28/10 tardissimo): prima il catch ERA VUOTO — server
    // giù/annegato = monitor silenzioso per sempre e nessuna riga lo denunciava:
    // la diagnostica sembrava un bug del gioco. D'ora in poi il PRIMO KO del
    // ciclo arriva nel registro (uno solo: niente spam ogni 4 s), e il segnale
    // si azzera al primo fetch andato bene.
    m = null;
    if (!slot.ko) {
      slot.ko = true;
      appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up: +((Date.now() - slot.start) / 1000).toFixed(1), evento: 'SERVER NON RISPONDE (/api/ingegnere): ' + (e?.message ?? String(e)) }) + '\n');
    }
  }
  const up = +((Date.now() - slot.start) / 1000).toFixed(1);
  /* 30/10 pomeriggio (stalli in gara, Monza): un fallimento della fetch
     (SERVER NON RISPONDE sopra) NON è la fine della gara — prima il fallimento
     portava m=null e il ramo sotto lo dichiarava «SESSIONE FUORI», azzerando
     la memoria dei narratori (said={}) a ogni stallo (uno al minuto: meta
     RIDETTA dopo 32 s, sbalzi live a valanga). Se non c'è risposta si salta
     il tick e basta: la memoria resta e la gara continua da dove era. La
     cpu FUORI DIVENTA l'unica fonte di fine sessione, con i dati letti da
     davvero dal server. */
  if (m === null) return;
  if (!m.live) {
    if (slot.sawLive) {
      appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up, evento: 'SESSIONE FUORI (live=false) — i last del copilota RESTANO: il client non li azzera' }) + '\n');
      slot.sawLive = false;
    }
    return;
  }
  if (!slot.sawLive) {
    slot.sawLive = true; slot.said = {};
    appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up, evento: 'SESSIONE VIVA (live=true) — last del copilota ereditati dalla sessione precedente', dati: campi(m) }) + '\n');
  }
  /* 28/10 tardissimo, gara MUTO della prova 3 giri: tra due gare sulla
     STESSA pista la firma non cambia (in SP la sessionId della SM resta 0),
     e lo slot della gara PRIMA soffocava i narratori della gara DOPO
     (monotono limitato al giro vecchio, «Ultimo giro!» già detto). Il
     ritorno della live (live=false→true) = gara nuova: memoria azzerata,
     come il client da questa sera (viste-a.js, reset a spunto live). */
  if (slot.firma == null) {
    slot.last = {};      // gara vera nuova di riflesso (il client potrebbe portare i valori trascinati dei primi istanti)
    slot.at = 0;
  }
  /* allineato al client 28/10: la FIRMA della sessione (eventId+sessionId+tipo,
     ora nel payload) cambia → memoria dei narratori a zero, come in viste-a.js */
  const firma = m.sessionId ?? null;
  if (firma != null && firma !== slot.firma) {
    if (slot.firma != null) appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up, evento: 'SESSIONE NUOVA (firma cambiata) — last dei narratori azzerati come in vista' }) + '\n');
    slot.firma = firma;
    slot.last = {};
    slot.said = {};
  }
  const frasi = narratore(m, slot);
  appendFileSync(LOG(port), JSON.stringify({ t: Date.now(), up, frasi, dati: campi(m) }) + '\n');
}

console.log('≫ monitor copilota su porte', PORTS.join(', '), '— log in data/copilot-*-24-10.jsonl (CTRL-C ferma)');
const tick = () => { for (const p of PORTS) poll(p, slots.get(p)).catch(() => {}); };
tick();
setInterval(tick, 4000);

}
