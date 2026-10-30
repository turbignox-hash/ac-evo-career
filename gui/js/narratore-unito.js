// narratore-unito.js — L'UNICO narratore del copilota (31/10, unificazione):
// prima le STESSE regole vivevano in due posti (questa funzione per la
// radio del Pitwall e i test, e una copia manuale narratore per narratore
// dentro gui/js/viste-a.js) e ogni cura andava applicata due volte. Da oggi
// il nucleo è UNO: il server lo importa (tools/_monitor-copilota.mjs lo
// re-esporta in facciata), il browser lo carica come script classico e usa
// globalThis.__EVO_NARRATORE.narratore. Le frasi restano {chi, it} — la voce
// della copilota è SEMPRE italiana (viste-a.js cpT), il resto non cambia.
// Alimentazione: entra il payload /api/ingegnere (o il suo cugino del
// monitor) e lo slot di memoria (last.*, said, at). Funzione PURA fuori dal
// tempo: i distanzelli li scandisce il "ora" esplicito, così i test li giocano a piacere.

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
function narratore(m, slot, ora = Date.now()) {
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
  /* 7) AUTO DEL PARCO (24-10, il narratore 7 di viste-a.js, ora qui): fuori
     dalla lista ammesse della serie la copilota lo dice e lo RIDICE finché
     il sedile torna in regola — all'import quella gara vale 0 punti e 0
     premio. Il campo m.auto sta SOLO nel payload /api/ingegnere: la diagnostica
     del monitor non lo mappa e questo ramo resta zitto con lei, di proposito. */
  const auto = m.auto ?? null;
  if (auto?.ammesse?.length && !auto.ok
      && (slot.last.autoFuori == null || ora - slot.last.autoFuori >= 30000)) {
    slot.last.autoFuori = ora;
    parla.push({
      chi: 'autofuori',
      it: `${auto.mine ?? "Quest'auto"} fuori parco: ammesse ${auto.ammesse.slice(0, 3).join(', ')}. Gara senza punti.`,
    });
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

// esportazione per il browser: script classico, la pagina la legge da qui.
globalThis.__EVO_NARRATORE = { narratore };
