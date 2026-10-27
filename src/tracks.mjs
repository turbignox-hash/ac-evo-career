// tracks.mjs — il "libro delle piste" della carriera.
//
// Due cose per ogni pista del ladder:
//  1. RECORD: il tuo miglior giro personale (da state.stats.bestLaps + quaderno prove)
//     e il miglior giro della sessione visto nei file Results (che in prova/qualifica
//     può appartenere anche a un rivale AI: utile per capire quanto manca).
//     Per OGNI LAYOUT della pista (dal catalogo del server dedicato) il tuo miglior
//     giro e il record di sessione, letti dal campo layout dei file risultato.
//  2. STORIA: una breve scheda della pista (paese, lunghezza, inaugurazione, 3–4
//     frasi su cosa la rende speciale) da mostrare nel cruscotto col prossimo weekend.

import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

import { join, dirname } from 'node:path';
import { listResultFiles, readSessionResult, lapToMs } from './results.mjs';
import { nomePilota } from './nome-pilota.mjs';
import { normTrack as normTrk, sameTrack } from './tracknames.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRACKMAPS_DIR = join(HERE, '..', 'gui', 'trackmaps');
/** Mappa ufficiale: PNG ricolorato (rosso su nero) se presente, altrimenti SVG ufficiale (da invertire lato GUI). */
const mapUrlOf = (id) => {
  if (id && existsSync(join(TRACKMAPS_DIR, id + '.png'))) return '/trackmaps/' + id + '.png';
  if (id && existsSync(join(TRACKMAPS_DIR, id + '.svg'))) return '/trackmaps/' + id + '.svg';
  return null;
};
/** Vista aerea realistica (JPG) se presente in gui/trackmaps/<id>.jpg: usata nel blocco storia. */
const photoUrlOf = (id) => (id && existsSync(join(TRACKMAPS_DIR, id + '.jpg')) ? '/trackmaps/' + id + '.jpg' : null);

// normTrk (alias di normTrack di tracknames.mjs) e sameTrack arrivano dal modulo
// condiviso: accenti trascritti prima di spazzare via i non-alfanumerici + prefix-match
const msOf = (t) => (t && lapToMs(t) > 0 ? lapToMs(t) : null);
const cleanCar = (s) => {
  // ripulisce il vecchio doppio marchio ("Abarth Abarth 695 Biposto")
  const parts = String(s ?? '').trim().split(/\s+/);
  if (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) return parts.slice(1).join(' ');
  return s ?? null;
};

/* --------------------------------------------------------------- */
/* Schede storiche (le 8 piste del ladder)                          */
/* --------------------------------------------------------------- */

export const TRACK_INFO = {
  imola: {
    name: 'Imola', fullName: 'Autodromo Internazionale Enzo e Dino Ferrari',
    country: 'Italia', countryEn: 'Italy', lengthKm: 4.909, corners: 19, opened: 1953,
    history: `Costruita lungo le rive del Santerno e intitolata a Enzo e Dino Ferrari, Imola arrivò in Formula 1 nel 1980 prendendo il posto di Monza, e fino al 2006 ospitò il Gran Premio di San Marino. È una pista di carattere: salite e discese continue, le Acque Minerali nel verde, la Variante Bassa della Tamburello — dove nel 1994 cadde Ayrton Senna — e la Tosa che chiude il tratto più veloce. Oggi accoglie il GP dell'Emilia-Romagna ed è il circuito di casa delle corse Ferrari Challenge e del GT World Challenge Europe.`,
    nick: 'Il circuito di casa della Ferrari', nickEn: "Ferrari's home circuit",
    historyEn: `Built along the banks of the Santerno and named after Enzo and Dino Ferrari, Imola joined Formula 1 in 1980 taking Monza's place, and until 2006 it hosted the San Marino Grand Prix. It is a track of character: constant climbs and descents, Acque Minerali among the trees, the Variante Bassa at Tamburello — where in 1994 Ayrton Senna lost his life — and Tosa closing the fastest section. Today it hosts the Emilia-Romagna GP and is the home circuit of Ferrari Challenge races and the GT World Challenge Europe.`,
  },
  monza: {
    name: 'Monza', fullName: 'Autodromo Nazionale di Monza',
    country: 'Italia', countryEn: 'Italy', lengthKm: 5.793, corners: 11, opened: 1922,
    history: `Il Tempio della Velocità: terzo autodromo permanente più antico del mondo dopo Brooklands e Indianapolis, costruito nel 1922 nel parco reale. Il rettifilo, la Curva Grande, le Lesmo, la variante Ascari e la lunga parabolica (oggi curva Alboreto) lo rendono il circuito più veloce del calendario F1: velocità medie vicine ai 250 km/h. Le scie e i sorpassi della prima chicane sono leggenda, come le ore del GP d'Italia. Le due gare MX-5 ci passano dritte: a Monza l'aspirazione conta quanto il coraggio.`,
    nick: 'Il Tempio della Velocità', nickEn: 'The Temple of Speed',
    historyEn: `The Temple of Speed: the third-oldest permanent racing circuit in the world after Brooklands and Indianapolis, built in 1922 in the royal park. The main straight, Curva Grande, the Lesmos, the Ascari chicane and the long parabolica (today's Alboreto curve) make it the fastest circuit on the F1 calendar: average speeds close to 250 km/h. The slipstreams and overtakes of the first chicane are legend, as are the hours of the Italian GP. The two MX-5 races fly through it: at Monza drafting counts as much as courage.`,
  },
  fuji: {
    name: 'Fuji Speedway', fullName: 'Fuji Speedway',
    country: 'Giappone', countryEn: 'Japan', lengthKm: 4.563, corners: 16, opened: 1965,
    history: `Ai piedi del Monte Fuji nacque nel 1965 come pista ad anello velocissima; dopo gli incidenti di fine anni '70 (vi corsero la F1 del 1976, con la caccia a Lauda di James Hunt, e del 1977) fu riconfigurata e comprata dalla Toyota, che nel 2005 la ricostruì con la prima curva più ripida e lunga del mondo moderno. Oggi ospita il Gran Premio del Giappone di endurance (Fuji 6 ore del WEC) e vanta uno dei tratti più fotogenici del sim racing: la curva 1 che sale verso il cielo, con il vulcano sullo sfondo.`,
    nick: 'La pista sotto il vulcano', nickEn: 'The track under the volcano',
    historyEn: `At the foot of Mount Fuji, born in 1965 as a blazing-fast oval; after the late-'70s crashes (F1 raced here in 1976 with James Hunt hunting Lauda, and in 1977) it was reconfigured and bought by Toyota, which in 2005 rebuilt it with the steepest, longest first turn of the modern era. Today it hosts the endurance Grand Prix of Japan (the WEC's Fuji 6 Hours) and boasts one of the most photogenic traits in sim racing: turn 1 climbing toward the sky, the volcano in the background.`,
  },
  redbull_ring: {
    name: 'Red Bull Ring', fullName: 'Red Bull Ring (Spielberg)',
    country: 'Austria', countryEn: 'Austria', lengthKm: 4.318, corners: 10, opened: 1969,
    history: `Nato come Österreichring nel 1969 sulle colline di Spielberg, è il circuito più breve del calendario F1 e anche uno dei più veloci: poche curve, tutte decisive, con un dislivello di oltre 60 metri. La salita verso la curva 1 è un salto nel blu, e le curve Rindt (dedicata al campione austriaco Jochen Rindt), Schlossgold e Rauch smontano chi non ha fiducia in frenata. Abbandonato negli anni '90, fu ricostruito da Dietrich Mateschitz e riaprì nel 2011 col nome dell'azienda delle lattine.`,
    nick: 'Dieci curve, tutte decisive', nickEn: 'Ten corners, all decisive',
    historyEn: `Born as the Österreichring in 1969 on the hills of Spielberg, it is the shortest circuit on the F1 calendar and also one of the fastest: few corners, all of them decisive, with an elevation change of over 60 metres. The climb to turn 1 is a leap into the blue, and the Rindt (dedicated to the Austrian champion Jochen Rindt), Schlossgold and Rauch corners take apart anyone with no confidence under braking. Abandoned in the '90s, it was rebuilt by Dietrich Mateschitz and reopened in 2011 under the name of the tin-can company.`,
  },
  suzuka: {
    name: 'Suzuka', fullName: 'Suzuka International Racing Course',
    country: 'Giappone', countryEn: 'Japan', lengthKm: 5.807, corners: 18, opened: 1962,
    history: `L'unico circuito al mondo a forma di otto: la figura della Honda disegnata da John Hugenholtz nel 1962 incrocia se stessa sul ponte. È considerato da quasi tutti i piloti la pista più bella e completa: la S Curva in salita da girare in un respiro, la Spoon a due raggi, i Degner, il sottoponte e la 130R, la curva veloce più sfacciata del motorsport. Teatrino dei duelli Senna–Prost del 1989 e 1990, ospita da decenni il GP del Giappone: chi conosce Suzuka si conosce.`,
    nick: "L'otto che incrocia il cielo", nickEn: 'The figure eight crossing the sky',
    historyEn: `The only figure-eight circuit in the world: the Honda layout drawn by John Hugenholtz in 1962 crosses itself on the bridge. Almost every driver considers it the most beautiful and complete of tracks: the uphill S Curva to be taken in one breath, the two-radius Spoon, the Degners, the under-bridge and the 130R, the boldest fast corner in motorsport. Theatre of the Senna–Prost duels of 1989 and 1990, it has hosted the Japanese GP for decades: those who know Suzuka, know.`,
  },
  mount_panorama: {
    name: 'Mount Panorama', fullName: 'Mount Panorama Circuit (Bathurst)',
    country: 'Australia', countryEn: 'Australia', lengthKm: 6.213, corners: 23, opened: 1938,
    history: `È una strada pubblica che due volte l'anno diventa il circuito più incredibile del mondo: salite e discese tra i vigneti della montagna con 174 metri di dislivello, The Cutting che taglia la cresta, Skyline dove la pista sparisce sotto il muso dell'auto, e Conrod Straight — la retta più lunga d'Australia — chiusa dal The Chase. Casa della Bathurst 1000, la "Great Race" del Supercars: a Bathurst il muro è vicino e la storia è ovunque. Rispetto e paura vanno d'accordo.`,
    nick: 'La montagna di Bathurst', nickEn: 'The Bathurst mountain',
    historyEn: `It is a public road that twice a year becomes the most incredible circuit in the world: climbs and descents through the mountain's vineyards with 174 metres of elevation, The Cutting slicing the ridge, Skyline where the track disappears under the car's nose, and Conrod Straight — the longest straight in Australia — closed by The Chase. Home of the Bathurst 1000, the "Great Race" of the Supercars: at Bathurst the wall is close and history is everywhere. Respect and fear go well together.`,
  },
  nurburgring: {
    name: 'Nürburgring GP', fullName: 'Nürburgring (Grand-Prix-Strecke)',
    country: 'Germania', countryEn: 'Germany', lengthKm: 5.148, corners: 15, opened: 1984,
    history: `La configurazione moderna costruita nel 1984 accanto alla leggendaria Nordschleife, l'"Inferno Verde" di 20,8 km che Jackie Stewart chiamava la pista più impegnativa del mondo. Il GP-Strecke ha una personalità propria: la Mercedes Arena che gira su se stessa, la lunga Döttinger Höhe, le curve tecniche del tratto interno. Ha ospitato la F1 (quell'Inghilterra di Verstappen sulla 13 di Schumacher... l'Alboreto non c'entra) e le 24 Ore del Nürburgring, la gara di endurance più folla del pianeta: 200.000 spettatori campeggiano nel bosco.`,
    nick: 'L\'inferno verde e il suo gemello moderno', nickEn: "The green hell and its modern twin",
    historyEn: `The modern configuration built in 1984 beside the legendary Nordschleife, the 20.8-km "Green Hell" that Jackie Stewart called the most demanding track in the world. The GP-Strecke has a personality of its own: the Mercedes Arena looping back on itself, the long Döttinger Höhe, the technical corners of the inner section. It has hosted the Nürburgring 24 Hours, the most crowded endurance race on the planet: 200,000 spectators camp in the woods.`,
  },
  sebring: {
    name: 'Sebring', fullName: 'Sebring International Raceway',
    country: 'Stati Uniti', countryEn: 'USA', lengthKm: 6.019, corners: 17, opened: 1950,
    history: `Un'ex base aerea dell'aviazione americana dell'ultimo periodo della seconda guerra mondiale, trasformata nel 1950 in circuito: l'asfalto corrono sopra le antiche lastre di cemento degli aerei, ed è per questo la pista più sconnessa in cui girare — la "blocca-raggi" che smonta auto e piloti. Casa delle 12 Ore di Sebring, inaugurale del WEC e prova di maturità di ogni prototype: la curva 17, il vecchio hangar, le superficie che saltano a vista. Le endurance nascono qui: la prima 12 Ore fu nel 1952, e la reputazione non è mai cambiata.`,
    nick: 'La pista che smonta le auto', nickEn: 'The track that takes cars apart',
    historyEn: `A former US Air Force base from the tail end of World War II, turned into a circuit in 1950: the asphalt runs on top of the old concrete slabs left by the planes, and that makes it the roughest track you can lap — the "block-stopper" that takes apart cars and drivers, and which in the age of power demands patience under you. Home of the 12 Hours of Sebring, the WEC opener and a maturity test for every prototype: turn 17, the old hangar, surfaces that crumble on sight. Endurance was born here: the first 12 Hours came in 1952, and the reputation has never changed.`,
  },
  spa: {
    name: 'Circuit de Spa Francorchamps', fullName: 'Circuit de Spa Francorchamps',
    country: 'Belgio', countryEn: 'Belgium', lengthKm: 7.004, corners: 19, opened: 1921,
    history: `Il tempio della velocità tra le Ardenne: Eau Rouge e Raidillon in salita piena, il lungo Kemmel Straight, le curve cieche che scendono verso Stavelot. Gara piovosa a metà campionato: a Spa il meteo cambia a ogni curva — qui valgono le gomme da bagnato.`,
    nick: 'Le Ardenne in piena', nickEn: 'The Ardennes in full flow',
    historyEn: `The temple of speed in the Ardennes: Eau Rouge and Raidillon climbing at full throttle, the long Kemmel Straight, the blind corners dropping toward Stavelot. A wet race at mid-season: at Spa the weather changes corner by corner — wet tyres are the call here.`,
  },
  brands_hatch: {
    name: 'Brands Hatch', fullName: 'Brands Hatch Circuit',
    country: 'Regno Unito', countryEn: 'United Kingdom', lengthKm: 3.916, corners: 12, opened: 1950,
    history: `La pista britannica per eccellenza: la Paddock Hill che scende a buco, Druids che chiude a ferro di cavallo, e il tratto GP che si snoda nel bosco del Kent. Piccola, rapida, senza pietà.`,
    nick: 'Il giardino del Kent', nickEn: 'The Kent garden',
    historyEn: `The quintessential British track: Paddock Hill dropping away, Druids closing into a horseshoe, and the GP section winding through the woods of Kent. Small, fast, merciless.`,
  },
  circuit_of_the_americas: {
    name: 'Circuit Of The Americas', fullName: 'Circuit of the Americas',
    country: 'Stati Uniti', countryEn: 'USA', lengthKm: 5.515, corners: 20, opened: 2012,
    history: `Il circuito del Texas firmato Tilke: la prima curva sale di 41 metri e si prende alla cieca, poi la serpentina delle curve 3-6 ispirata a Silverstone, e il lungo rettilineo verso il DRS. La pista americana moderna per eccellenza.`,
    nick: 'La torre del Texas', nickEn: 'The Texas tower',
    historyEn: `Tilke's Texas circuit: turn 1 climbs 41 metres and is taken blind, then the serpentine of turns 3–6 inspired by Silverstone, and the long straight into the DRS zone. The modern American track par excellence.`,
  },
  donington_park: {
    name: 'Donington Park', fullName: 'Donington Park Circuit',
    country: 'Regno Unito', countryEn: 'United Kingdom', lengthKm: 4.020, corners: 12, opened: 1977,
    history: `Il vecchio aeroporto di Leicestershire diventato circuito: la Crane Curvature è la curva veloce più amata d'Inghilterra, il trazioneggio Melbourne lo ricorda per Senna nel GP d'Europa del 1993 sotto il diluvio. Gare piovose qui sono una tradizione.`,
    nick: 'Il mito di Senna', nickEn: 'The Senna myth',
    historyEn: `Leicestershire's old airfield turned circuit: Crane Curvature is England's most beloved fast corner, and the Melbourne Hairpin is remembered for Senna's European GP in 1993 under the downpour. Wet races here are a tradition.`,
  },
  kyalami: {
    name: 'Kyalami', fullName: 'Kyalami Grand Prix Circuit',
    country: 'Sudafrica', countryEn: 'South Africa', lengthKm: 4.522, corners: 16, opened: 1961,
    history: `Il circuito dello Highveld a 1500 metri d'altezza, ricostruito nel 2016: salite e discese continue tra le colline a nord di Johannesburg, con la Cheetah che sale verso il punto più alto del tracciato.`,
    nick: "L'anima del Sudafrica", nickEn: "South Africa's soul",
    historyEn: `The Highveld circuit at 1,500 metres of altitude, rebuilt in 2016: constant climbs and dips among the hills north of Johannesburg, with the Cheetah climbing toward the highest point of the layout.`,
  },
  laguna_seca: {
    name: 'Laguna Seca', fullName: 'WeatherTech Raceway Laguna Seca',
    country: 'Stati Uniti', countryEn: 'USA', lengthKm: 3.602, corners: 11, opened: 1957,
    history: `La leggenda della California: il Corkscrew scende di due piani in poche decine di metri, la curva che ha fatto gridare il mondo nel 1988 con il sorpasso impossibile di Senna su Prost. Poco spazio, nessun scampo: la pista dove la tecnica vale più della potenza.`,
    nick: 'Il Corkscrew', nickEn: 'The Corkscrew',
    historyEn: `The California legend: the Corkscrew drops two storeys in a few tens of metres, the corner that made the world scream in 1988 with Senna's impossible overtake on Prost. No room, no escape: the track where technique is worth more than power.`,
  },
  oulton_park: {
    name: 'Oulton Park', fullName: 'Oulton Park Circuit',
    country: 'Regno Unito', countryEn: 'United Kingdom', lengthKm: 4.333, corners: 13, opened: 1953,
    history: `Il circuito più scenografico d'Inghilterra, immerso nel parco di Oulton: ogni curva ha un nome e una personalità — Old Hall, Cascades, Island Bend. Si guida a memoria: dove la pista finisce, cominciano gli alberi.`,
    nick: 'Il parco inglese', nickEn: 'The English park',
    historyEn: `The most scenic circuit in England, set in its own park: every corner has a name and a character — Old Hall, Cascades, Island Bend. You drive it from memory: where the track ends, the trees begin.`,
  },
  road_atlanta: {
    name: 'Road Atlanta', fullName: 'Michelin Raceway Road Atlanta',
    country: 'Stati Uniti', countryEn: 'USA', lengthKm: 4.088, corners: 12, opened: 1970,
    history: `La casa del Petit Le Mans: colline continue, i dossi ciechi verso il ponte, la T12 che scende sul rettilineo. Piccola ma feroce — chi sbaglia l'andamento del giorno la paga al prossimo dosso.`,
    nick: 'I dossi della Georgia', nickEn: 'The Georgia crests',
    historyEn: `The home of the Petit Le Mans: rolling hills, blind crests toward the bridge, the downhill T12 onto the straight. Small but fierce — whoever misreads the rhythm of the day pays for it at the next crest.`,
  },
  watkins_glen: {
    name: 'Watkins Glen', fullName: 'Watkins Glen International',
    country: 'Stati Uniti', countryEn: 'USA', lengthKm: 5.435, corners: 11, opened: 1956,
    history: `Il tempio americano della velocità nello Stato di New York: l'Ess partendo dal diaframma, il Boot che si allarga nella campagna, e l'Inner Loop dove la pista si stringe. La pista di casa di NASCAR e IMSA insieme.`,
    nick: 'The Glen', nickEn: 'The Glen',
    historyEn: `The American temple of speed in New York State: the Ess coming off the front straight, the Boot spreading out into the countryside, and the Inner Loop where the track tightens up. The home track of NASCAR and IMSA at once.`,
  },
  paul_ricard: {
    name: 'Paul Ricard', fullName: 'Circuit Paul Ricard',
    country: 'Francia', countryEn: 'France', lengthKm: 5.842, corners: 15, opened: 1970,
    history: `Il circuito del Mistral: il rettilineo da 1,8 km con le famose blu-rosse plastiche al posto della ghiaia, la Signes in salita piena e il Beausset che chiude. Ristrutturato come laboratorio tecnico da Bollore, oggi ospita il GP di Francia.`,
    nick: 'Le strisce blu', nickEn: 'The blue stripes',
    historyEn: `The circuit of the Mistral: the 1.8-km straight with the famous blue-red run-off stripes instead of gravel, the flat-out climb of Signes and the Beausset closing the section. Restored as a technical lab by Bollore, today it hosts the French GP.`,
  },
};

/* --------------------------------------------------------------- */
/* Tracciati stilizzati (SVG path, viewBox 0 0 100 64)              */
/* --------------------------------------------------------------- */

export const TRACK_OUTLINE = {
  imola: 'M12,50 L14,38 L10,28 L16,20 L12,14 L20,8 L30,12 L40,8 L50,14 L58,10 L66,14 L64,22 L74,26 L86,30 L88,38 L78,42 L82,48 L60,52 L30,54 Q16,54 12,50 Z',
  monza: 'M18,56 L18,10 L26,6 L34,8 L44,6 L62,10 L70,8 L76,12 L72,18 L80,22 L78,28 L70,34 L82,40 L92,44 L86,50 L78,46 L74,54 L52,60 Q28,62 22,56 Z',
  fuji: 'M10,50 L80,50 L90,44 L92,32 L84,26 L88,18 L74,12 L50,14 L30,12 L14,20 Q8,32 10,50 Z',
  redbull_ring: 'M14,50 L40,16 L70,8 L84,10 L86,18 L78,20 L74,28 L60,32 L64,40 L50,46 L54,52 L34,56 Q18,58 14,50 Z',
  suzuka: 'M14,46 L14,22 Q16,12 26,14 L34,10 L42,16 L50,10 L58,16 L66,12 L78,14 L88,22 L84,30 L72,32 L66,40 L54,36 L46,44 L32,50 L18,52 Q12,52 14,46 Z',
  mount_panorama: 'M10,54 L16,18 L28,8 L48,6 L66,10 L80,8 L90,16 L88,30 L92,42 L84,54 L60,58 L30,58 Q12,60 10,54 Z',
  nurburgring: 'M10,44 L14,48 L70,48 L80,42 L78,34 L66,28 L70,20 L84,16 L90,24 L82,30 L60,28 L40,24 L28,28 L18,24 L12,30 L20,36 L34,34 L40,40 L34,44 L26,42 L20,46 Z',
  sebring: 'M8,46 L10,18 L14,12 L30,14 L34,8 L52,12 L54,20 L70,16 L74,24 L90,22 L92,34 L84,40 L66,38 L60,46 L44,44 L40,52 L24,50 Q10,52 8,46 Z',
};

/* --------------------------------------------------------------- */
/* Record: personali (save + quaderno) e di sessione (Results)      */
/* --------------------------------------------------------------- */

/** Migliori giri personali del save (per pista, chiavi normalizzate, doppio marchio pulito). */
function personalFromSave(state) {
  const out = {};
  const bl = state?.stats?.bestLaps ?? {};
  for (const [key, rec] of Object.entries(bl)) {
    const k = normTrk(key);
    if (!k || !rec?.time) continue;
    const ms = msOf(rec.time);
    if (!ms) continue;
    if (!out[k] || ms < out[k].ms) out[k] = { time: rec.time, ms, car: cleanCar(rec.car), season: rec.season, node: rec.node, at: rec.at };
  }
  return out;
}

/** Migliori giri del quaderno di prove (note manuali incluse). */
function personalFromTestdays(testdayFile) {
  let book = null;
  try { book = JSON.parse(readFileSync(testdayFile, 'utf8')); } catch { return {}; }
  const out = {};
  for (const s of book?.sessions ?? []) {
    const track = s.track ?? s.trackDisplay;
    const k = normTrk(track);
    const ms = msOf(s.bestLap);
    if (!k || !ms) continue;
    const cand = { time: s.bestLap, ms, car: s.car ?? null, season: null, node: s.nodeId ?? null, at: s.at, kind: s.kind ?? 'file', sessionType: s.sessionType ?? null };
    if (!out[k] || ms < out[k].ms) out[k] = cand;
  }
  return out;
}

/** Chiave di layout dal file risultato: "GP Time Attack" → "gp", "East Race" → "east",
 *  "National Hotstint" → "national", "Gp Strecke Race" → "gpstrecke": il tipo di
 *  sessione non fa parte del layout e la chiave è normalizzata come quella del catalogo. */
const LAYOUT_SUFFIX_RE = /\s+(time\s*attack|warm\s*up|warmup|practice|qualifying|quali|race|hot\s*stint|hotstint|hot\s*lap|hotlap|drift|drag)\s*$/i;
function layoutKeyOf(result) {
  const raw = String(result?.layout ?? '').trim();
  if (!raw) return null;
  return normTrk(raw.replace(LAYOUT_SUFFIX_RE, '')) || normTrk(raw) || null;
}
/** Nome del layout da mostrare: come nel file risultato ma senza il tipo di sessione. */
function layoutNameOf(result) {
  const raw = String(result?.layout ?? '').trim();
  return raw ? (raw.replace(LAYOUT_SUFFIX_RE, '').trim() || raw) : null;
}

const nameKey = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

/** Migliori giri da TUTTI i file Results (tutti i piloti), con cache: la firma è
 *  la somma dei mtime dei file, così basta un file nuovo a invalidarla.
 *  Riconoscimento del giocatore: nelle sessioni SP EVO a volte marca is_current_driver
 *  su TUTTI i piloti — in quel caso decide il nome (come fa l'import).
 *  Ritorna { byTrack: {pista: {auto: record}}, byLayout: {pista: {layout: {name, best, mine}}} }. */
let _sessCache = { sig: null, val: null };
function sessionStatsFromResults(paths, _ladder, driver = null) {
  let sig = 0;
  try { for (const f of listResultFiles(paths)) sig += f.mtime; } catch { sig = -1; }
  if (_sessCache.sig === sig) return _sessCache.val;
  const myKey = driver ? nameKey(`${driver.first ?? ''}${driver.last ?? ''}`) : null;
  const byTrack = {};
  const byLayout = {};
  for (const f of listResultFiles(paths)) {
    let result = null;
    try { result = readSessionResult(f.file); } catch { continue; }
    const k = normTrk(result?.track);
    if (!k) continue;
    const lk = layoutKeyOf(result) ?? '(layout n/d)';
    const layName = layoutNameOf(result) ?? lk;
    const at = new Date(f.mtime).toISOString();
    const drivers = result.drivers ?? [];
    // il flag vale solo se il gioco l'ha messo su UN pilota solo
    const flagged = drivers.filter((d) => d.is_current_driver === true).length;
    for (const d of drivers) {
      const ms = msOf(d.best_lap);
      if (!ms) continue;
      const who = nomePilota(d.driver_name, d.driver_surname) || 'pilota';
      const me = flagged === 1
        ? d.is_current_driver === true
        : (myKey ? nameKey(`${d.driver_name ?? ''}${d.driver_surname ?? ''}`) === myKey : false);
      const car = cleanCar(d.car_name && d.car_brand && String(d.car_name).toLowerCase().startsWith(String(d.car_brand).toLowerCase()) ? d.car_name : `${d.car_brand ?? ''} ${d.car_name ?? ''}`.trim());
      const cand = { time: d.best_lap, ms, driver: who, car, kind: String(result.session ?? '').toLowerCase(), at, me };
      // per pista+auto (come prima)
      byTrack[k] ??= {};
      if (!byTrack[k][car] || ms < byTrack[k][car].ms) byTrack[k][car] = cand;
      // per pista+LAYOUT: record assoluto di sessione + tuo miglior giro
      byLayout[k] ??= {};
      const cell = (byLayout[k][lk] ??= { name: layName, best: null, mine: null });
      if (!cell.best || ms < cell.best.ms) cell.best = cand;
      if (me && (!cell.mine || ms < cell.mine.ms)) cell.mine = { time: cand.time, ms, car, at };
    }
  }
  _sessCache = { sig, val: { byTrack, byLayout } };
  return _sessCache.val;
}

/**
 * Il quadro completo: per ogni pista nota
 *  - personal: il tuo miglior giro (save + quaderno, il migliore vince)
 *  - session: il miglior giro mai visto nei risultati (con nome del pilota)
 *  - info: la scheda storica (se esiste nel database TRACK_INFO)
 */
export function trackBook(ladder, paths, state, { testdayFile, catalog = null } = {}) {
  const calendar = [...new Set((ladder.nodes ?? []).flatMap((n) => n.calendar ?? []).map((r) => r.track))].filter(Boolean);
  const nameOf = (id) => ladder.contentNames?.tracks?.[id] ?? TRACK_INFO[id]?.name ?? id;

  // le piste dei risultati/save hanno nomi propri ("Fuji Speedway"): le riportiamo
  // all'id del ladder quando combaciano (confronto normalizzato, prefix incluso)
  const aliasOf = (k) => {
    if (!k) return null;
    for (const id of calendar) {
      const a = normTrk(id), d = normTrk(nameOf(id));
      if (k === a || k === d || (a && (k.startsWith(a) || a.startsWith(k))) || (d && (k.startsWith(d) || d.startsWith(k)))) return id;
    }
    return null;
  };
  const reindex = (map) => {
    const out = {};
    for (const [k, v] of Object.entries(map)) {
      const id = aliasOf(k) ?? k;
      if (!out[id] || v.ms < out[id].ms) out[id] = v;
    }
    return out;
  };

  const mineSave = reindex(personalFromSave(state));
  const mineTests = reindex(personalFromTestdays(testdayFile));
  const stats = sessionStatsFromResults(paths, ladder, state?.driver ?? null);
  const sessionBest = {};
  for (const [k, perCar] of Object.entries(stats.byTrack)) {
    const id = aliasOf(k) ?? k;
    sessionBest[id] ??= {};
    for (const [car, rec] of Object.entries(perCar)) {
      if (!sessionBest[id][car] || rec.ms < sessionBest[id][car].ms) sessionBest[id][car] = rec;
    }
  }
  // record per layout, riportati agli id del ladder come gli altri
  const sessionLayouts = {};
  for (const [k, lays] of Object.entries(stats.byLayout)) {
    const id = aliasOf(k) ?? k;
    const cell = (sessionLayouts[id] ??= {});
    for (const [lk, rec] of Object.entries(lays)) {
      if (!cell[lk] || (rec.best?.ms ?? Infinity) < (cell[lk].best?.ms ?? Infinity)) cell[lk] = rec;
    }
  }

  // tutte le piste con scheda storica + quelle incontrate in calendario/risultati:
  // il libro mostra l'intero contenuto del gioco, non solo i tracciati gia' corsi
  const seen = [...new Set([...Object.keys(TRACK_INFO), ...calendar, ...Object.keys(sessionBest), ...Object.keys(mineSave), ...Object.keys(mineTests)])];
  const rows = [];
  for (const id of seen) {
    const mineA = mineSave[id], mineB = mineTests[id];
    let personal = null;
    if (mineA && (!mineB || mineA.ms <= mineB.ms)) personal = { ...mineA, from: 'carriera' };
    else if (mineB) personal = { ...mineB, from: 'prove' };
    const perCar = sessionBest[id] ?? {};
    const carKeys = Object.keys(perCar);
    // il "record di sessione" della pista: stessa auto del record personale se c'è,
    // altrimenti il migliore assoluto (segnalato come altra auto)
    let session = null;
    if (personal?.car && perCar[personal.car]) session = { ...perCar[personal.car], sameCar: true };
    else if (carKeys.length) {
      const best = carKeys.map((c) => perCar[c]).sort((a, b) => a.ms - b.ms)[0];
      session = { ...best, sameCar: false };
    }
    // layout della pista: nomi e lunghezze ufficiali dal catalogo del server
    // dedicato (se disponibile), tempi dai file risultato — il TUO miglior giro e
    // il record di sessione per OGNI configurazione. Le piste con un solo layout
    // ereditano il record personale della pista (è quello, per definizione).
    // Il catalogo e la scala non usano lo stesso nome ("Nurburgring" contro
    // "Nürburgring GP", "Sebring" contro "Sebring International Raceway"): vale
    // anche il match a prefisso, non solo l'uguaglianza.
    const display = nameOf(id);
    const catTrack = (catalog?.tracks ?? []).find((ct) => sameTrack(display, ct.name)) ?? null;
    const catLays = (catTrack?.layouts ?? []).map((l) => ({ name: String(l.layout ?? '').trim(), lengthM: Number(l.length) || null, pits: Number(l.pits) || null }));
    const resLays = sessionLayouts[id] ?? {};
    const layKeys = [...new Set([...catLays.map((l) => normTrk(l.name)).filter(Boolean), ...Object.keys(resLays)])];
    const layoutRows = layKeys.map((lk) => {
      const cat = catLays.find((l) => normTrk(l.name) === lk) ?? null;
      const rec = resLays[lk] ?? null;
      let mine = rec?.mine ?? null;
      let mineFallback = false;
      if (!mine && personal && layKeys.length === 1) {
        mine = { time: personal.time, car: personal.car ?? null, at: personal.at ?? null };
        mineFallback = true; // dalla carriera/prove: il save non distingue i layout
      }
      return {
        layout: cat?.name ?? rec?.name ?? lk,
        lengthKm: cat?.lengthM ? Math.round(cat.lengthM / 10) / 100 : null,
        pits: cat?.pits ?? null,
        mine: mine ? { time: mine.time, car: mine.car ?? null, at: mine.at ?? null } : null,
        mineFallback,
        session: rec?.best ? { time: rec.best.time, driver: rec.best.driver, car: rec.best.car, at: rec.best.at, mine: !!rec.best.me } : null,
      };
    }).sort((a, b) => (a.lengthKm ?? 9e9) - (b.lengthKm ?? 9e9) || a.layout.localeCompare(b.layout));
    rows.push({
      id,
      track: nameOf(id),
      inLadder: calendar.includes(id),
      info: TRACK_INFO[id] ? { ...TRACK_INFO[id], outline: TRACK_OUTLINE[id] ?? null, map: mapUrlOf(id), photo: photoUrlOf(id) } : null,
      personal: personal ? { time: personal.time, car: personal.car, season: personal.season ?? null, at: personal.at ?? null, from: personal.from } : null,
      session: session ? { time: session.time, driver: session.driver, car: session.car, kind: session.kind, at: session.at, mine: !!session.me, sameCar: !!session.sameCar } : null,
      layoutRows,
    });
  }
  rows.sort((a, b) => (a.inLadder ? 0 : 1) - (b.inLadder ? 0 : 1) || a.track.localeCompare(b.track));
  return { rows };
}

/** La pista della prossima gara (o quella corrente se pending). */
export function nextTrackOf(ladder, state) {
  const node = (ladder.nodes ?? []).find((n) => n.nodeId === state.node);
  if (!node) return null;
  const round = state.pending?.round ?? state.round ?? 0;
  const rnd = node.calendar?.[Math.min(round, (node.calendar?.length ?? 1) - 1)];
  const id = rnd?.track ?? null;
  if (!id) return null;
  return { id, display: ladder.contentNames?.tracks?.[id] ?? TRACK_INFO[id]?.name ?? id, round, laps: rnd?.laps ?? null, hour: rnd?.hour ?? null, weather: rnd?.weather ?? null };
}

