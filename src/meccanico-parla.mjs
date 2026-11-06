// meccanico-parla.mjs — il meccanico a CHIACCHIERE: chiedi e lui prepara.
//
// Richiesta Mauro 6/11/2026 («vorrei interagire con lui per chiedere
// aggiustamenti… li prepara già con il nome giusto, non il solito setup
// consigliato»): nel pannello del meccanico c'è una casella dove si scrive
// «preparami il setup da qualifica», «da gara con 8 giri»,
// «bagnato», «gara di 12 giri» e il meccanico costruisce CON IL NOME GIUSTO:
// «Qualifica», «Gara 8 giri», «Bagnato». NIENTE «consigliato»: il file è
// un file .carsetup che il pilota riconosce in EVO.
//
// GIUSTO CONFINI DEL POSSIBILE: il composto delle gomme NON vive nel file
// .carsetup (in EVO si sceglie nel menu del setup): per il bagnato il
// meccanico calibra pressioni e benzina e DICE in 2 parole di passare alla
// gomma pioggia in gioco. La benzina si mette SOLO se esiste un consumo
// REALE (telemetria o vivo); le pressioni SOLO se c'è una base dal vivo o
// dal fourPsi — per il resto nessuna cifra inventata.

const num = (v) => Number.isFinite(v);
const dec1 = (v) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ */
/* intenzione: cosa chiede esattamente il pilota                       */
/* ------------------------------------------------------------------ */

const giriDaTesto = (t) => {
  const m = String(t ?? '').match(/(\d{1,2})\s*gi(?:ro|ri)/i);
  const n = m ? Number(m[1]) : null;
  return n >= 3 && n <= 60 ? n : null;
};

/**
 * leggiIntenzione(testo, preset) → { tipo: 'qualifica'|'gara'|'bagnato'|'pentito'|null, raceLaps|null }
 * `preset` è il valore della chip già schiacciata nella GUI ('qualifica'|'gara'|'bagnato'):
 * quando non è vuota vince sul testo libero. Il testo libero si legge a parole:
 * «bagnato gara» conta BAGNATO (la pioggia va prima del piano di pista),
 * «gara con benzina giusta» conta GARA, «gara di 12 giri» porta anche i giri.
 * Libre: parola per parola, niente parse magico.
 */
export function leggiIntenzione(testo, preset = null) {
  const t = String(testo ?? '').toLowerCase();
  const p = String(preset ?? '').toLowerCase();
  const con = (par) => t.includes(par) || (p !== '' && p === par);
  if (con('bagn') || con('piogg') || con('piuv')) return { tipo: 'bagnato', raceLaps: giriDaTesto(t) };
  if (con('qualifica')) return { tipo: 'qualifica', raceLaps: giriDaTesto(t) };
  if (con('gara')) return { tipo: 'gara', raceLaps: giriDaTesto(t) };
  if (con('corregg')) return { tipo: 'pentito', raceLaps: null };
  return { tipo: null, raceLaps: null };
}

/** Il NOME VERO del file: niente «consigliato», solo ciò che chiede il pilota. */
export function nomeSetup(tipo, raceLaps = null) {
  if (tipo === 'qualifica') return 'Qualifica';
  if (tipo === 'gara') return raceLaps >= 3 ? `Gara ${raceLaps} giri` : 'Gara';
  if (tipo === 'bagnato') return 'Bagnato';
  return null;
}

/**
 * Il nome del FILE sul disco: AUTO + PISTA + tipo di uscita, la forma chiesta
 * da Mauro («vorrei che lo creasse con il nome auto-pista: gara o qualifica,
 * pioggia etc»): «Ferrari 296 GT3 - Brands Hatch - Qualifica» si ritrova a
 * colpo d'occhio nella lista CARICA di EVO, dove il nome del file è l'unica
 * cosa che si legge. I caratteri vietati da Windows diventano '-', gli spazi
 * si comprimono e il nome si ferma a 110 caratteri; senza un pezzo mancante
 * resta il solo tipo di uscita (mai un nome vuoto).
 */
export function nomeFileSetup({ car = null, track = null, tipo, raceLaps = null } = {}) {
  const pulisci = (s) => String(s ?? '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  const parti = [pulisci(car), pulisci(track), pulisci(nomeSetup(tipo, raceLaps))].filter(Boolean);
  return parti.join(' - ').slice(0, 110).trim() || null;
}

/* ------------------------------------------------------------------ */
/* il piano di lavorazione: patch sul file .carsetup, SOLO veri        */
/* ------------------------------------------------------------------ */

import { benzinaDelMeccanico, notaBenzina, QUALI_GIRI } from './benzina.mjs';

const PSI_BAGNATO = -1.5;    // nel bagnato la gomma lavora più freddo: meno psi
const FILO_PSI = 0.05;       // sotto questo scarto di psi non tocco il file

/**
 * pianoSetup({ tipo, raceLaps, cur, sessione, live, tyreTarget })
 *   tipo       'qualifica' | 'gara' | 'bagnato'
 *   raceLaps   giri di gara (null → 10 di default)
 *   cur        parseSetup del TUO base file (campi .tires[], .fuel?.liters)
 *   sessione   l'ultima uscita reale: { fuelPerLap } (telem o vivo)
 *   live       { psi: [4] | psiSingolo } — base pressioni dal vivo/fourPsi
 *   tyreTarget target psi a caldo della classe (per la nota)
 * Ritorno { edits, righe, note, risposta } — edits già pronto per
 * applyEdits (carsetup.mjs). NULL se manca il file di partenza.
 */
export function pianoSetup({ tipo, raceLaps = null, cur, sessione = null, live = null, tyreTarget = null, nome = null } = {}) {
  if (!cur || !tipo) return null;
  const note = [];
  const righe = [];
  const edits = {};
  const fuelPerLap = Number(sessione?.fuelPerLap);
  let psiPer = live?.psi ?? null;
  if (!Array.isArray(psiPer) && num(live?.psiSingolo)) psiPer = [live.psiSingolo, live.psiSingolo, live.psiSingolo, live.psiSingolo];
  const psiFreddo = Array.isArray(psiPer) && psiPer.filter(num).length >= 4
    ? psiPer.slice(0, 4).map((p) => (tipo === 'bagnato' ? Number(p) + PSI_BAGNATO : Number(p)))
    : null;
  if (psiFreddo) {
    edits.tires = (cur.tires ?? []).map((t, i) => {
      const want = psiFreddo[i];
      if (!num(want)) return {};
      const da = Number(t?.pressure);
      if (Math.abs(da - want) < FILO_PSI) return {};
      righe.push({ campo: `gomma ${['LF', 'RF', 'LR', 'RR'][i] ?? i}`, da, a: dec1(want), unita: 'psi' });
      return { pressure: dec1(want) };
    });
    if (!edits.tires.some((t) => Object.keys(t).length)) delete edits.tires;
    note.push(`Pressioni da freddo: ${psiFreddo.map(dec1).join(' / ')} psi${tipo === 'bagnato'
      ? ' (bagnato: −1,5 psi per pista fredda e senza grip)'
      : ` (bersaglio a caldo ${tyreTarget ?? '?'} psi, regola dei 4 PSI)`}.`);
  } else {
    note.push('Pressioni invariate: manca una base viva (un giro dal vivo oppure un fourPsi con telemetria); meglio non inventare numeri.');
  }

  // BENZINA: la formula è UNA, in src/benzina.mjs (6/11): la stessa che scrive
  // il setup applicato — prima la carta aggiungeva 3 L di riserva e il file no,
  // quindi il numero detto dal meccanico non era quello caricato in pista.
  const benz = benzinaDelMeccanico({ tipo, fuelPerLap, raceLaps });
  if (benz) {
    edits.fuel = { liters: dec1(benz.litri) };
    righe.push({ campo: 'benzina', da: cur.fuel?.liters ?? null, a: dec1(benz.litri), unita: 'L' });
    note.push(notaBenzina(benz, fuelPerLap, { tipo, dec1 }));
  } else {
    /* ONESTO E CHIARO (5/11 sera, la benzina che non si muove): se non c'è un
       consumo REALE la benzina resta quella del file di partenza, e lo si dice
       col numero — non con un «com'è» che sembra un silenzio. */
    note.push(`Benzina invariata${num(cur?.fuel?.liters) ? ` a ${dec1(Number(cur.fuel.liters))} L` : ''}: non ho ancora un consumo REALE misurato per questa auto (fai un giro o scarica una telemetria); il serbatoio del tuo base setup resta com'è.`);
  }
  if (tipo === 'bagnato') {
    note.push('Il COMPOSTO NON vive nel file: nel menu del setup in EVO passa alla gomma pioggia PRIMA di uscire, le pressioni in questo file sono già da pioggia.');
  }
  const nomeDetto = nome ?? nomeSetup(tipo, raceLaps);
  /* 6/11 (la benzina che non si muove): la risposta è ONESTA alla prima —
     senza NESSUNA leva reale non c'è «Fatto: ti preparo…»: si dice che il
     file NON lo tocca e cosa manca. Invenzione zero, la regola della casa. */
  const nessunaLeva = !Object.keys(edits).length;
  const risposta = nessunaLeva
    ? `Non scrivo niente: con i dati di oggi «${nomeDetto}» non avrebbe NESSUNA modifica (benzina e pressioni restano quelle del tuo base). Mi servono numeri veri — fai un giro o scarica una telemetria — e chiedimi di nuovo: allora il file nasce col nome giusto.`
    : tipo === 'qualifica'
      ? `Fatto: ti preparo «${nomeDetto}» con il tuo nome. Benzina da ${QUALI_GIRI} giri di verifica e pressioni fredde dal calcolo del vivo. In pista fai ${QUALI_GIRI} giri di assaggio e poi di nuovo a lui.`
      : tipo === 'gara'
        ? `Fatto: ti preparo «${nomeDetto}» con il tuo nome: benzina del piano completo${raceLaps >= 3 ? ' a ' + raceLaps : ''} e pressioni del vivo.`
        : `Fatto: ti preparo «${nomeDetto}» con il tuo nome — pressioni scaricate di 1,5 psi e benzina del piano; il composto pioggia lo scegli nel menu del setup dentro EVO prima di uscire.`;
  return { edits, righe, note, risposta, psiBersaglio: tyreTarget ?? null };
}
