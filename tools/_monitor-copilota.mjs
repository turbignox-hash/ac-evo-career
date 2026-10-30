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

/**
 * I narratori del copilota, identici a gui/js/viste-a.js (28/10 tardissimo):
 * entra il messaggio `/api/ingegnere` e lo slot di memoria (last.*), escono
 * le frasi da dire. NUOVO 28/10 tardo: il contatore giri è MONOTONO dentro
 * la sessione (lapsDone e la scorta lapNo non si ricalibrano mai in giù —
 * era la sorgente del loop «metà gara» di Mauro) e la soglia della meta
 * si legge dal contatore filtrato. La funzione è PURA fuori dal tempo:
 * i distanzelli (20 s delta, 70 s anti-ripetizione) li scandisce il test
 * con `ora` esplicito.
 */
export function narratore(m, slot, ora = Date.now()) {
  const parla = [];
  /* 8d) LA BANDIERA NON GRIDÌ PRIMA DEL GIRO (31/10, gara delle 14:24):
     nel gioco la crocetta a scacchi arriva alla MMF un istante PRIMA che
     contatore giri salga — così la bandiera uscì 4 secondi PRIMA del
     «Giro 3 fatto — nuovo best». Adesso: se in QUESTO tick il narratore
     ha già parlato un giro, la bandiera esce subito DOPO; altrimenti va
     in CODA e parla al primo giro annunciato in un tick successivo.
     Se il giro non arriva mai (HUD muto), soccorso: esce comunque dopo 10 s. */
  const bandParla = () => {
    if (parla.some((p) => p.chi === 'giroFatto')) parla.push({ chi: 'bandiera', it: 'Bandiera a scacchi!' });
    else slot.last.bandieraP = ora;
  };
  /* replicato dei narratori — viste-a.js: il delta parla SOLO se il bucket
     di 400 ms cambia davvero, minimo 20 s tra discorsi (prima ripeteva a
     valore fermo ogni 12 s).
     31/10 FIX DEL DELTA MUTO: la semina portava `|| slot.at === 0` e
     formava un vicolo cieco — at resta 0 finché il delta non parla, ma
     per parlare serve un bucket diverso dal seme, e il seme a ogni frame
     era riseminato col valore corrente (dvBucket finiva sempre uguale a
     quello corrente): l'else-if non può mai scattare. La voce delta non è
     MAI uscita, né qui né in vista, dal 27/10 (registro 28-29/10: 394
     letture dv, zero frasi delta — trovato rigiocolando i dati reali nel
     narratore odierno). Ora si semina solo alla PRIMA lettura della
     memoria; in cambio, DUE tensioni del 31/10 pomeriggio (gara delle
     15:29, livello full): nel HUD il delta raffronta con il BEST, e mentre
     il valore scivola ogni bucket è nuovo — parlava a RAFFICA, «più veloce
     del best di 56.9 … 36.9 … 16.9 … lento di 5.8» uno ogni 20 s. Da qui:
     - finestra di LEGGIBILITÀ ±15 s: i 56.9/36.9 erano raffronti col best
       di un'altra sessione (fuori piste/giri pieni), non ritmo vero — oltre
       la finestra tace (il vecchio tetto 90 s era una finestra spazzatura);
     - minima CADENZA 45 s (prima 20): lo scivolone parla al più ogni 45 s,
       il ritmo che conta lo dice lo stesso. Il livello-voci manda 'delta'
       SOLO al full (voce-copilota.mjs FRASI_LIVELLO), normale ed essenziale
       non lo nominano mai. */
  /* 31/10 SERA (R5, i falsi 11-14 s): la scelta del dv NON è più «il numero
     che arriva, qualunque sia il raffronto» — la fonte dice CHI paragona:
     source 'hud' = il delta HUD del gioco, che ancora DOVE vuole lui (stasera
     il best della Time Attack di prima: «11.2 … 13.8» in gara — non ritmo,
     il best di un'altra sessione); source 'tracked' = il delta della SIESTA
     COPILOTA, calcolato sulla traccia del best di QUESTA sessione (shmem
     bestTrack). VOCE solo da 'tracked': l'HUD può restare nel numero grande
     della pagina, non entra in radio — e un payload SENZA la fonte (payload
     antichi) tace pure: da oggi la copilota raffronta SOLO col best che HA
     tracciato lei. La finestra ±15 s e la cadenza 45 s restano le guardie
     di legno sopra la norma. */
  const dv = m.delta?.source === 'tracked' ? (m.delta?.dv ?? null) : null;
  if (dv != null && Math.abs(dv) <= 15000) {
    const bucket = Math.round(dv / 400);
    if (slot.last.dvBucket == null) slot.last.dvBucket = bucket;   // semina senza voce
    else if (bucket !== slot.last.dvBucket && ora - (slot.at ?? 0) > 45000) {
      slot.last.dvBucket = bucket; slot.at = ora;
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
  // 28/10 tardo (allineato alla vista): dentro la STESSA sessione il contatore
  // giri NON torna mai indietro — l'HUD che fallisce un istante perde contro
  // la memoria; solo la FIRMA (sessione vera nuova, gestita dal chiamante)
  // azzera. Vecchio reset in giù → meta da capo = il loop di Mauro.
  if (compiuto != null && slot.last.giro != null && compiuto < slot.last.giro) compiuto = slot.last.giro;
  if (compiuto != null && slot.last.giro != null && compiuto > slot.last.giro && lastLapTxt && lastLapTxt !== slot.last.lastLapTxt) {
    parla.push(m.delta?.bestLapNo === compiuto
      ? { chi: 'giroFatto', it: `Giro ${compiuto} fatto in ${lastLapTxt} — nuovo best` }
      : { chi: 'giroFatto', it: `Giro ${compiuto} fatto in ${lastLapTxt}` });
    slot.last.giroFattoOra = ora;   // 8d: il momento del giro annunciato — la bandiera aspetta QUESTO
  }
  // CROCE FINALE (30/10, gara a tempo): un NUOVO lastLap = il traguardo è
  // appena attraversato. Lo calcolo PRIMA che la memoria aggiorni il lastLap
  // (il blocco 8 sta dopo e vedrebbe già il valore nuovo), perché la bandiera
  // senza totale di giri arriva ESATTAMENTE qui: la crocetta finale.
  const croceFinale = compiuto != null && lastLapTxt != null && lastLapTxt !== slot.last.lastLapTxt;
  if (compiuto != null && lastLapTxt && lastLapTxt !== slot.last.lastLapTxt) slot.last.giro = compiuto;
  if (lastLapTxt != null) slot.last.lastLapTxt = lastLapTxt;
  if (lapNo != null) slot.last.lapNo = lapNo;
  if (g.lapsOnFuel != null && slot.last.fuel != null && g.lapsOnFuel < slot.last.fuel - 0.49) {
    parla.push(g.lapsLeft != null && g.lapsOnFuel < g.lapsLeft + 1
      ? { chi: 'benzina', it: `Attenzione benzina: per ${g.lapsOnFuel} giri, ne restano ${g.lapsLeft}` }
      : { chi: 'benzina', it: `Benzina per ${g.lapsOnFuel} giri` });
  }
  if (g.lapsOnFuel != null) slot.last.fuel = g.lapsOnFuel;
  /* 3b) META GARA: la soglia si legge da compiuto (contatore filtrato), non
     da g.lapsDone diretto — se l'HUD resta a 0 è la scorta a parlare. Una
     volta sola per sessione: il flag si toglie SOLO alla firma nuova. */
  if (g.lapsTotal != null && g.lapsTotal > 0 && compiuto != null && !slot.last.meta) {
    const meta = Math.ceil(g.lapsTotal / 2);
    if (compiuto + 1 >= meta) {
      slot.last.meta = true;
      parla.push({ chi: 'metaBenzina', it: `Meta gara: benzina ${g.fuel ?? '?'} L, per ${g.lapsOnFuel ?? '?'} giri${g.lapsLeft != null ? `, restano ${g.lapsLeft}` : ''}` });
    }
  }
  const worst = (g.wear ?? []).filter(Number.isFinite).reduce((a, v) => Math.max(a, v), 0);
  const band = !worst ? 0 : worst >= 80 ? 2 : worst >= 55 ? 1 : 0;
  if (band > (slot.last.wearBand ?? 0) && band > 0) parla.push({ chi: 'gomme', it: `Gomme al ${Math.round(worst)} percento` });
  if (worst != null) slot.last.wearBand = band;
  if (g.gapAhead != null && g.gapAhead > 0 && g.gapAhead < 1.5) {
    const k = Math.round(g.gapAhead * 10);
    // 30/10 (richiesta Mauro: «dillo a chi ti sta sotto»): frase umana con
    // la DISTANZA, e guardia 20 s tra i discorsi (prima senza guardia:
    // il bucket 0,1 s variando casa parla senza fermezza).
    // NOMI: i file MMF di EVO portano SOLO il driver_name della TUA auto
    // (docs/acevo-wrapper.hpp, struct graphics): i nomi dei rivali non
    // esistono in dati live, quindi la voce dice la distanza, chi ti
    // precede si vede in classifica. Se EVO la esporrà, qui c'è il jetto.
    if (slot.last.gap !== k && (slot.last.gapAt == null || ora - slot.last.gapAt >= 20000)) {
      slot.last.gap = k; slot.last.gapAt = ora;
      parla.push({ chi: 'gap', it: `Chi ti sta davanti: ${g.gapAhead.toFixed(1)} secondi.` });
    }
  } else { slot.last.gap = null; slot.last.gapAt = null; }
  /* 9b) PENALITÀ TAGLI (30/10, richiesta Mauro: «penalità a voce... appena
     arriva»): la MMF grafica porta race_cut_gained_time_ms, i SECONDI
     GUADAGNATI tagliando che il gioco scala dal tuo tempo finale. Parla
     quando il TOTALE sale di almeno 0,5 s — «Penalità tagli: X secondi»
     (cumulativo, è quello che alla fine pesa alla classifica). In
     qualifica e TimeAttack resta 0 di proposito: mai un annuncio.
     31/10 notte, la 150-SECONDI: il gioco NON azzera il contatore quando
     la sessione si riavvia (e sembra contare anche il tempo che l'auto
     ferma passa fuori pista dopo l'incidente): al primo tutto, il totale
     parte da un valore assurdo. NESSUN taglio di pista vero guadagna
     decine di secondi in un colpo solo (ogni violazione vale ~1-2 s),
     quindi un salto singolo ≥ 30 S NON si annuncia: si semina zitte
     (i salti veri dopo, piani e piccoli, riprendono a parlare). */
  const cutSec = Number.isFinite(g.cutSec) ? g.cutSec : null;
  if (cutSec != null) {
    const prev = slot.last.cut == null ? 0 : slot.last.cut;
    const passo = cutSec - prev;
    if (passo >= 0.5 && passo < 30) parla.push({ chi: 'penalia', it: `Penalità tagli: ${cutSec.toFixed(1)} secondi.` });
    slot.last.cut = cutSec;
  }
  /* 11) FINESTRA STINT DEL PIANO (31/10, DA-9 seconda fetta — richiesta
     Mauro: «copilota annuncia la finestra»): il piano pre-gara dice le
     FINESTRE di sosta; quando il contatore giri entra nell'ultima finestra
     ancora raggiungibile la copilota dice «Box entro N giri», e a scadenza
     «Box entro QUESTO giro». Si parla UNA volta per finestra (semenna su
     slot.last.finestraK) e UNA volta la scadenza (finestraZero); se il
     piano non è nel payload (gara a giri, dati del sedile insufficienti)
     il narratore tace — niente finestre che i dati non buttano fuori. */
  const fin = m.stintAlert ?? null;
  if (fin && Number.isFinite(fin.k)) {
    if (slot.last.finestraK !== fin.k) {
      slot.last.finestraK = fin.k;
      slot.last.finestraZero = false;
      parla.push(fin.lapsTo === 0
        ? { chi: 'finestra', it: `Benzina del piano: al box entro QUESTO giro — scadenza della sosta ${fin.k}.` }
        : { chi: 'finestra', it: `Finestra sosta ${fin.k}: box entro ${fin.lapsTo} giri (${fin.earliest}–${fin.latest}).` });
    } else if (fin.lapsTo === 0 && !slot.last.finestraZero) {
      slot.last.finestraZero = true;
      parla.push({ chi: 'finestra', it: `Box entro QUESTO giro: è la scadenza della sosta ${fin.k}.` });
    }
  } else {
    slot.last.finestraK = null;   // piano uscito (fine gara / dati bruciati): la prossima finestra ridice
    slot.last.finestraZero = null;
  }
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
  /* 6c) I BOX (28/10 sera, allineato a viste-a.js narratore 6c): il sensore
     inPit dai gauges. INGRESSO nel pitlane → 'boxopen', uscita → 'boxclose';
     il primissimo valore si semina in silenzio, poi si parla sul CAMBIO con
     distanza 10 s minimo fra tori baia (slot.last.box con `ora` esplicito,
     come pitcount: il tempo('(') lo scandisce il test). */
  if (g.inPit != null) {
    const previsto = slot.last.inPit;
    if (previsto != null && previsto !== g.inPit && (slot.last.box == null || ora - slot.last.box > 10000)) {
      slot.last.box = ora;
      parla.push(g.inPit
        ? { chi: 'boxopen', it: 'Box aperto: in pitlane — limiter on, niente gas.' }
        : { chi: 'boxclose', it: 'Box chiuso: fuori dal pitlane — gomme in temperatura al primo giro.' });
    }
    slot.last.inPit = g.inPit;
  }
  /* 10) BANDIERA BLU (28/10 notte, allineato a viste-a.js narratore 10): il
     flag per auto dai gauges. Si parla sul CAMBIO a blu (semaforo 'bluf'),
     la primissima vista si semina in silenzio; il flag torna 'nessuna' e
     la prossima doppietta ridice — la GUARDIA 70 s (più sotto) resta il
     solo distanziello: doppio annuncio vicinissimo = radio pulita. */
  if (g.flag != null) {
    if (slot.last.bluf == null) slot.last.bluf = g.flag;
    else if (g.flag !== slot.last.bluf) {
      if (slot.last.bluf !== 'blu' && g.flag === 'blu') {
        parla.push({ chi: 'blu', it: 'Bandiera blu: chi ti doppietta ti sta sotto — lascia la linea al rettilineo.' });
      }
      slot.last.bluf = g.flag;
    }
  }
  /* 8) ULTIMO GIRO PIÙ BANDIERA (28/10, allineato a viste-a.js narratore 8):
     prima il sensore isLastLap della MMF, poi il CONTATORE FILTRATO come
     scorta (28/10 tardo: ld = compiuto, non g.lapsDone diretto — le gare
     con l'HUD a 0 hanno la scorta a parlante, come in vista).
     30/10 LUGA GARA A TEMPO (gara dei 5 min, Mauro): con gara a tempo il
     gioco NON scrive un totale di giri (totalLapsSession resta 0 anche
     dopo i traguardi) e l'intero ramo era sgozzato dietro lt > 0 — anche
     isLastLap, il sensore che il gioco DALLA VERA in gara a tempo, non
     poteva parlare: la gara a tempo finiva in silenzio. OGGI:
     - «Ultimo giro!» = isLastLap della MMF anche SENZA totale;
     - «Bandiera a scacchi!» senza totale = il TRAGUARDO dopo l'ultimo
       giro: nuovo lastLap mentre ultimo=true (la crocetta finale scrive
       il giro e la gara fine — non la flappatura del sensore, che non
       cambia mai il lastLap). */
  const lt = g.lapsTotal, ld = compiuto;
  const ltOk = Number.isFinite(lt) && lt > 0;
  if (Number.isFinite(ld)) {
    if ((g.isLastLap || (ltOk && ld + 1 === lt)) && !slot.last.ultimo) {
      slot.last.ultimo = true;
      slot.last.ultimoGiro = ld;           // il giro in corso quando parlò: la crocetta conta da dopo questo
      parla.push({ chi: 'ultimoGiro', it: 'Ultimo giro!' });
    }
    if (ltOk && ld >= lt && !slot.last.bandiera) { slot.last.bandiera = true; bandParla(); }
    else if (!ltOk && slot.last.ultimo && croceFinale && !slot.last.bandiera
             && Number.isFinite(slot.last.ultimoGiro) && ld > slot.last.ultimoGiro) {
      // senza totale: il traguardo che CHIUDE l'ultimo giro = un giro in più
      // del traguardo che aveva annunciato «Ultimo giro!» — esclude il falso
      // inizio quando il timer scade proprio sul traguardo d'inizio ultimo giro
      slot.last.bandiera = true;
      bandParla();
    }
    if (ltOk && ld + 1 < lt) slot.last.ultimo = false;
  }
  /* 8c) BANDIERA DI FONDO (30/10 pomeriggio, gara di Monza zittita): nella
     gara la MMF NON ha scritto NESSUNA delle tre fonti che facevano parlare
     la fine (lapsTotal=0, isLastLap=false, timeLeft=null per tutta la
     sessione) e «Ultimo giro!»/«Bandiera!»/conto alla rovescia sono morti
     per costruzione: l'unica cosa certa che il gioco ha scritto è il CAMBIO
     DI BANDIERA a scacchi al traguardo finale (flagCode 8). Rete di
     sicurezza: bandiera che diventa a scacchi con almeno un giro compiuto =
     fine gara, «Bandiera a scacchi!» una volta sola anche se le altre fonti
     non sono mai arrivate. Bandiera già a scacchi al primo tick della
     sessione (entrare a gara finita): si SEMINA in silenzio. */
  if (!ltOk && !slot.last.bandiera) {
    if (slot.last.flagF === undefined) slot.last.flagF = g.flag;
    else if (slot.last.flagF !== 'a scacchi' && g.flag === 'a scacchi' && Number.isFinite(ld) && ld >= 1) {
      slot.last.bandiera = true;
      bandParla();
    }
    if (g.flag != null) slot.last.flagF = g.flag;
  }
  /* 8d SVUOTAMENTO DELLA CODA: la bandiera in attesa esce quando il narratore
     annuncia un giro (giroFatto arrivato DOPO l'attivazione) o allo
     scadere del soccorso di 10 s — mai prima di un giro annunciato. */
  if (slot.last.bandieraP != null) {
    const att = slot.last.bandieraP;
    if ((Number.isFinite(slot.last.giroFattoOra) && slot.last.giroFattoOra >= att) || ora - att >= 10000) {
      slot.last.bandieraP = null;
      parla.push({ chi: 'bandiera', it: 'Bandiera a scacchi!' });
    }
  }
  /* 8b) CONTO ALLA ROVESCIA (30/10 sera, carte blanche): nelle gare a TEMPO
     l'HUD mostra i secondi che restano (timeLeft = stringa del gioco, es.
     "4:59" o "1:02:30" — il campo arriva solo quando lo static dice timedRace,
     quindi in TimeAttack/qualifiche tace da solo). Due tacche, UNA volta
     ciascuna per sessione (i flag si tolgono solo alla firma nuova):
       ≤ 60 s → «Ultimo minuto!»
       ≤ 30 s → «Trenta secondi!»
     Il parsing è tollerante ai formati (m:ss, h:mm:ss, «45s»): se la stringa
     non si capisce, ZITI — una tacca finta è peggio del silenzio. */
  if (g.timeLeft != null) {
    const mta = String(g.timeLeft).match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})/);
    const secUlt = mta ? (mta[1] ? Number(mta[1]) * 3600 : 0) + Number(mta[2]) * 60 + Number(mta[3]) : null;
    if (secUlt != null) {
      if (secUlt <= 60 && !slot.last.minuto) { slot.last.minuto = true; parla.push({ chi: 'minuto', it: 'Ultimo minuto!' }); }
      else if (secUlt <= 30 && !slot.last.minutoSegn) { slot.last.minutoSegn = true; parla.push({ chi: 'minuto', it: 'Trenta secondi!' }); }
    }
  }
  /* 9-ter) VIA LIBERA (29/10, gara delle 15:51): la bandiera VERDE di rientro
     in pista (flagCode 2) non ha MAI una voce — laMMF la scrive e il
     narratore la mangiava: nel registro della gara esce «verde (code 2)»
     alle 15:52:19 e nessuna frase. Si parla sul PASSAGGIO a verde:
     nessuna→verde al via, gialla→verde dopo l'incidente. Distanziello 30 s
     contro i cambi a raffica e semina in silenzio alla prima lettura.
     31/10 NOTTE, LA ROSSA-INVISIBILITA': il RESTART di Stanotte (gara R5)
     aveva la ROSSA a schermo (procedura di riassestamento griglia) e il
     registro non la Sapeva da nessuna parte: se il VERDE (code 2) si
     legge dalla STESSA fontana, la ROSSA (3) e la NERA (6) si leggono
     allo stesso modo — e da oggi si dicono sul passaggio, semina alla
     prima lettura, distanziello 15 s (due RESTART vicini non scaricano
     la radio). Per la prova di domani: tagli e anti-marcia su pista.
     Condividono il semaforo «area»: rossa e nera dentro i 15 s parlano
     UNA sola volta. */
  const fc = m.gauges?.flagCode ?? null;
  if (fc != null) {
    /* 31/10 SERA (R5 di sera): la VERDE è pure il segno del VIA per il
       narratore di posizione («postalk» più sotto): l'annuncio aspetta che
       la bandiera verde sia passata, o che fosse già verde alla prima
       lettura (partenza vista in ritardo): la griglia che si forma non può
       gridare «P10, posizione persa» PRIMA del via. */
    if (fc === 2) slot.last.verdeVisto = true;
    if (slot.last.verde == null) slot.last.verde = fc;     // semina
    else if (fc === 2 && slot.last.verde !== 2
             && (slot.last.verdeOra == null || ora - slot.last.verdeOra >= 30000)) {
      slot.last.verdeOra = ora;
      parla.push({ chi: 'verde', it: 'Bandiera verde: via libera.' });
    }
    slot.last.verde = fc;
    if (slot.last.rede == null) slot.last.rede = fc;       // semina rossa/nera
    else if (fc !== slot.last.rede
             && (fc === 3 || fc === 6)
             && (slot.last.redeOra == null || ora - slot.last.redeOra >= 15000)) {
      slot.last.redeOra = ora;
      parla.push(fc === 3
        ? { chi: 'rossa', it: 'Bandiera rossa!' }
        : { chi: 'nera', it: 'Bandiera nera: il gioco ti squalifica.' });
    }
    slot.last.rede = fc;
  }
  /* 9) POSIZIONE (30/10, la gara del mezzogiorno): gli annunci di posizione
     esistevano SOLO nella pagina (viste-a.js narratore 9, chi 'postalk');
     con la radio unica sul Pitwall la pagina tace di proposito e la
     posizione era sparita dalla radio: la STESSA regola qui, nel narratore
     unico — cambia sedile → «P5, posizione persa/recuperata», la prima
     vista si SEMINA in silenzio, distanziello 30 s per chiave (cpSay della
     vista). In solista (TimeAttack) la posizione resta 1: mai un annuncio. */
  if (g.position != null) {
    /* 29/10 (gara delle 15:51): nel pitlane la classifica vale ZERO — all'uscita
       dei box gridava «P15, posizione persa» mentre l'ordine vero non esisteva
       ancora. Si annuncia solo fuori dal pit E oltre i 12 s dall'ultima lettura
       in pit: la classifica rientra un istante DOPO il pitlane etichetta. */
    /* 31/10 SERA: in GARA («Race») il postalk aspetta la VERDE — prima del
       via la griglia si forma e l'ordine non è il campionato: gli annunci di
       sedile aspettano il via libera visto (o una prima lettura già verde).
       Fuori gara (quali, TimeAttack, sessione ignota) resta il comportamento
       di sempre: lì l'ordine conta subito. */
    const inGara = /race/i.test(String(m.phase ?? m.sessionType ?? ''));
    const viaVisto = slot.last.verdeVisto === true;
    if (g.inPit === true) slot.last.inPitOra = ora;
    const pitScena = g.inPit === true || (slot.last.inPitOra != null && ora - slot.last.inPitOra <= 12000);
    if (!pitScena && (!inGara || viaVisto) && slot.last.pos != null && g.position !== slot.last.pos
        && (slot.last.postalk == null || ora - slot.last.postalk >= 30000)) {
      slot.last.postalk = ora;
      parla.push({
        chi: 'postalk',
        it: `P${g.position}, posizione ${g.position < slot.last.pos ? 'recuperata' : 'persa'}.`,
      });
    }
    slot.last.pos = g.position;
  }
  if (pit?.need && Number.isFinite(pit.lapsToWindow)) {
    const stanche = (slot.last.wearBand ?? 0) >= 1;
    const tacca = pit.lapsToWindow >= 3 ? null : pit.lapsToWindow;
    if (tacca != null && slot.last.pitN !== tacca) {
      slot.last.pitN = tacca;
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
  // 28/10 pomeriggio: guardia anti-ripetizioni identica alla vista (cpDettoRecente):
  // stesso testo già detto dentro i 70 s NON esce come voce — appare con
  // detto:true così si vede che è stato giustamente zittito.
  const frasi = [];
  for (const p of parla) {
    const testo = p.it ?? '';
    const last = slot.said[testo];
    if (last && ora - last < 70000) { frasi.push({ ...p, detto: true }); continue; }
    slot.said[testo] = ora;
    frasi.push(p);
  }
  return frasi;
}

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
