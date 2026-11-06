// meccanico-mossa.mjs — «e adesso che cosa faccio?» (6/11 notte).
//
// Richiesta di Mauro: «fai in modo che il pannello del meccanico dica anche la
// prossima mossa concreta da fare, non solo cosa è cambiato». Le novità dicono
// COSA è cambiato; questa riga dice l'AZIONE da fare adesso, in ordine di
// priorità e solo con i dati che il pannello già ha (prova A/B, telemetria,
// consumo, prima voce della lista). Funzione PURA: nessun disco, nessun gioco.
import { tr } from './lang.mjs';

const testoPulito = (t) => String(t ?? '').split(/\s*↺\s*Storia:/)[0].trim();
/** Le voci che non sono una leva d'assetto: raccontano il passato, non si applicano. */
const NON_AZIONABILI = /^(memoria|storia|pentimento|scuse)$/i;

const ETICHETTA = {
  pressioni: { it: 'pressioni', en: 'pressures' },
  bumpstop: { it: 'bumpstop', en: 'bumpstops' },
  camber: { it: 'camber', en: 'camber' },
  gomme: { it: 'gomme', en: 'tyres' },
  freni: { it: 'freni', en: 'brakes' },
  benzina: { it: 'benzina', en: 'fuel' },
  aero: { it: 'aero', en: 'aero' },
  elettronica: { it: 'elettronica', en: 'electronics' },
  molle: { it: 'molle', en: 'springs' },
  ammortizzatori: { it: 'ammortizzatori', en: 'dampers' },
};

/**
 * prossimaMossa({ consigli, prova, hasTelem, fuelPerLap, bestLap, giriGara })
 *   consigli  le voci della scheda ({ vedi, text }) — la prima azionabile è la mossa
 *   prova     { aperta: { setupName, ... } } dell'A/B del meccanico
 *   hasTelem  esiste una telemetria dell'auto da cui il pannello corregge
 *   fuelPerLap consumo misurato (null = mai misurato)
 *   bestLap   miglior giro dell'ultima sessione, in secondi
 *   giriGara  giri della prossima ronda (per la prova A/B)
 * Ritorna { chiave, testo } oppure null se non c'è nemmeno un dato su cui
 * appoggiarsi (pannello con anagrafica assente e zero consigli).
 */
export function prossimaMossa({ consigli = [], prova = null, hasTelem = false, fuelPerLap = null, bestLap = null, giriGara = null } = {}) {
  const ap = prova?.aperta ?? null;
  const giri = Number.isFinite(Number(giriGara)) && Number(giriGara) >= 3 ? Math.round(Number(giriGara)) : 3;

  // 1. La prova A/B è aperta: c'è un setup nuovo da giudicare e serve UNA uscita.
  if (ap) {
    const nome = ap.setupName ?? tr({ it: 'nuovo', en: 'new' });
    return {
      chiave: 'prova',
      testo: tr({
        it: `Fai ${giri} giri puliti col setup «${nome}» e rientra: la prova si chiude da sola e ti dico se quella leva ha guadagnato o perso tempo.`,
        en: `Do ${giri} clean laps on the «${nome}» setup and come back: the test closes by itself and I tell you whether that lever gained or lost time.`,
      }),
    };
  }

  // 2. Senza telemetria il meccanico parla solo del profilo della pista.
  if (!hasTelem) {
    return {
      chiave: 'telemetria',
      testo: tr({
        it: 'Fai 3 giri con la telemetria attiva (in EVO: Setup → Elettronica → Telemetria: ON) e riapri il pannello: senza giri veri resto sul profilo della pista e non tocco né benzina né pressioni.',
        en: 'Do 3 laps with telemetry on (in EVO: Setup → Electronics → Telemetry: ON) and reopen the panel: without real laps I stay on the track profile and touch neither fuel nor pressures.',
      }),
    };
  }

  // 3. C'è telemetria ma il consumo non è mai stato misurato: la benzina resta il base.
  if (!(Number(fuelPerLap) > 0)) {
    return {
      chiave: 'consumo',
      testo: tr({
        it: 'Fai un giro cronometrato con la telemetria attiva per misurare il consumo: finché manca, benzina e piano di gara restano quelli del tuo setup base.',
        en: 'Do one timed lap with telemetry on to measure fuel use: until then, fuel and race plan stay those of your base setup.',
      }),
    };
  }

  // 4. La prima voce azionabile della lista è la mossa: si applica, poi si verifica.
  const prima = (consigli ?? []).find((c) => c?.text && !NON_AZIONABILI.test(String(c.vedi ?? '')));
  if (prima) {
    const dove = ETICHETTA[prima.vedi] ? tr(ETICHETTA[prima.vedi]) : String(prima.vedi ?? tr({ it: 'assetto', en: 'setup' }));
    return {
      chiave: 'consiglio',
      testo: tr({
        it: `Sistema «${dove}»: ${testoPulito(prima.text)}. Poi 3 giri di verifica e riapri il pannello (così vedo se ha guadagnato).`,
        en: `Fix «${dove}»: ${testoPulito(prima.text)}. Then 3 verification laps and reopen the panel (so I can see whether it gained).`,
      }),
    };
  }

  // 5. Niente sotto soglia: l'unica mossa è la pista.
  if (Number(bestLap) > 0) {
    const m = Math.floor(Number(bestLap) / 60);
    const s = (Number(bestLap) % 60).toFixed(2).padStart(5, '0');
    return {
      chiave: 'pista',
      testo: tr({
        it: `Assetto a punto: vai in pista e prova a scendere sotto ${m}:${s}. Se non scendi, riapri il pannello e guardiamo dove perdi.`,
        en: `Setup dialed in: go out and try to beat ${m}:${s}. If you do not, reopen the panel and we will look at where you lose it.`,
      }),
    };
  }
  if ((consigli ?? []).length) {
    return {
      chiave: 'pista',
      testo: tr({
        it: 'Vai in pista e fai i primi giri cronometrati: con i tempi in mano la prossima mossa diventa un numero, non un consiglio generico.',
        en: 'Go out and set your first timed laps: with real times the next move becomes a number, not generic advice.',
      }),
    };
  }
  return null;
}
