// copertura-rimando.test.mjs — LA GUARDIA DEL «RIMANDA» (6/11: prima richiesta
// «rimanda solo di oggi, così torna domani senza cambiare i dati», poi «fai
// valere il rinvio sul giorno di carriera invece che sulla data del computer»).
//
// Il difetto custodito: la ✕ dell'avviso lo tace FINCHÉ LA SITUAZIONE NON
// CAMBIA (firma piste+buchi in localStorage), e l'unico altro modo per liberarsi
// del banner era... aspettare di sistemare una pista. Il rinvio è un'altra
// cosa: vale per il GIORNO DI CARRIERA, non per una firma e non per la data del
// PC, quindi quando la carriera avanza l'avviso torna da solo anche se piste e
// buchi sono identici — e aspettare la mezzanotte non serve a niente.
//
// La legge (`giornoCarriera`, `rinvioAttivo`) e il render vero
// (`avvisoCoperturaHtml`) si estraggono dal VERO gui/js/viste-a.js — come
// nav-bottoni fa con drawNav — e si interrogano con un localStorage finto.
// Le maglie che contano:
//   • nessun rinvio: il banner c'è, con la scelta della durata (1/2/3 giorni);
//   • rinvio di OGGI (giorno 258): nessun banner;
//   • rinvio di ieri (giorno 257): il banner torna;
//   • durata a scelta: fino a 259 (2 giorni) e 260 (3 giorni) resta spento,
//     al giorno dopo torna — la richiesta di Mauro del 6/11 notte;
//   • valore spazzatura, vecchia data `AAAA-MM-GG` o giorno nel futuro remoto:
//     vale come nessun rinvio;
//   • senza giorno di carriera niente pulsanti (non bottoni che non fanno nulla);
//   • la ✕ di prima continua a funzionare (firma uguale → niente banner);
//   • senza piste incomplete: niente banner, rinvio o no.
// E si controlla il filo nel sorgente: il click salva l'ULTIMO GIORNO coperto
// (giorno + durata − 1), non la firma e non la data del PC.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VISTE = join(dirname(fileURLToPath(import.meta.url)), '..', 'gui', 'js', 'viste-a.js');
const viste = readFileSync(VISTE, 'utf8');

/** Il corpo di una funzione di primo livello: da `function nome(` fino alla
 *  prima `}` in colonna zero (dentro il corpo tutto è indentato). */
function funzione(nome) {
  const da = viste.indexOf(`function ${nome}(`);
  assert.ok(da >= 0, `in gui/js/viste-a.js non c'è più \`function ${nome}(\`: la guardia del rinvio va aggiornata, non saltata.`);
  const fine = viste.indexOf('\n}', da);
  assert.ok(fine > da, `la funzione ${nome} non si chiude più con una graffa in colonna zero: estrazione da rivedere.`);
  return viste.slice(da, fine + 2);
}

const tr = (o) => (typeof o === 'string' ? o : (o?.it ?? o?.en ?? ''));
const esc = (s) => String(s);
const motivoCopertura = (m) => `motivo:${m}`;

const giornoCarriera = new Function(`${funzione('giornoCarriera')}\nreturn giornoCarriera;`)();
// `rinvioAttivo` usa `giornoCarriera` e `rinvioFinoA`: estratte da sole, gliele passo io
const rinvioFinoA = new Function(`${funzione('rinvioFinoA')}\nreturn rinvioFinoA;`)();
const rinvioAttivo = new Function('giornoCarriera', 'rinvioFinoA', `${funzione('rinvioAttivo')}\nreturn rinvioAttivo;`)(giornoCarriera, rinvioFinoA);
const firmaCopertura = new Function(`${funzione('firmaCopertura')}\nreturn firmaCopertura;`)();

/** Un localStorage finto: solo getItem/setItem, come serve al banner. */
const storage = (iniziale = {}) => {
  const m = new Map(Object.entries(iniziale));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

/** Il render col vero corpo della funzione, ma con lo storage e il giorno che dico io. */
const html = (gaps, memoria, giorno = 258) => new Function(
  'FIRMA_AVVISO_COV', 'RIMANDA_AVVISO_COV', 'firmaCopertura', 'motivoCopertura', 'esc', 'tr',
  'localStorage', 'giornoCarriera', 'rinvioAttivo',
  `${funzione('avvisoCoperturaHtml')}\nreturn avvisoCoperturaHtml;`,
)('evo.covAvvisoChiudi', 'evo.covAvvisoDomani', firmaCopertura, motivoCopertura, esc, tr, memoria, giornoCarriera, rinvioAttivo)(gaps, giorno);

const GAPS = {
  soglia: { giri: 3, fileTelemetria: 2, giriSessione: 3 },
  incomplete: [{ name: 'Imola', laps: 2, telemetryFiles: 1, mancano: ['giri', 'file'], gravita: 10 }],
};

/** Il giorno di carriera di oggi (dati veri: 258) e quello di ieri. */
const OGGI = 258;
const IERI = 257;

test('senza rinvio il banner c\'è, con la scelta della durata', () => {
  const h = html(GAPS, storage());
  assert.match(h, /class="banner warn"/);
  assert.match(h, /id="cov-banner-rimanda"/);
  for (const n of [1, 2, 3]) assert.match(h, new RegExp(`data-rimanda="${n}"`), `manca la durata di ${n} giorni`);
  assert.match(h, /1 giorno/);
  assert.match(h, /3 giorni/);
});

test('rinviato a oggi (giorno di carriera 258): niente banner', () => {
  assert.equal(html(GAPS, storage({ 'evo.covAvvisoDomani': String(OGGI) })), '');
});

test('il rinvio di ieri (giorno 257) è scaduto: il banner torna da solo', () => {
  assert.match(html(GAPS, storage({ 'evo.covAvvisoDomani': String(IERI) })), /class="banner warn"/);
  assert.equal(rinvioAttivo(IERI, OGGI), false);
  // e il giorno dopo la chiusura della carriera non c'entra nulla con la data del PC
  assert.equal(rinvioAttivo(OGGI, 300), false, 'carriera avanzata: il rinvio non vale più');
  assert.equal(rinvioAttivo('258', 258), true, 'il valore può arrivare come stringa dallo storage');
});

test('durata a scelta: 2 e 3 giorni di carriera coprono davvero quei giorni', () => {
  // 2 giorni dal 258 → ultimo giorno coperto 259
  assert.equal(rinvioAttivo('259', 258), true);
  assert.equal(rinvioAttivo('259', 259), true, 'il secondo giorno è ancora coperto');
  assert.equal(rinvioAttivo('259', 260), false, 'al terzo giorno il rinvio è scaduto');
  // 3 giorni dal 258 → 260
  assert.equal(rinvioAttivo('260', 260), true);
  assert.equal(rinvioAttivo('260', 261), false);
  // e il banner sparisce davvero, non solo la funzione dice sì
  assert.equal(html(GAPS, storage({ 'evo.covAvvisoDomani': '259' }), 259), '');
  assert.match(html(GAPS, storage({ 'evo.covAvvisoDomani': '259' }), 260), /class="banner warn"/);
});

test('valore spazzatura o vecchia data in memoria: vale come nessun rinvio', () => {
  assert.equal(rinvioAttivo('', OGGI), false);
  assert.equal(rinvioAttivo(null, OGGI), false);
  assert.equal(rinvioAttivo(undefined, OGGI), false);
  assert.equal(rinvioAttivo('2026-11-06', OGGI), false, 'la data scritta prima di questo cambio non è un giorno di carriera');
  assert.equal(rinvioAttivo('domani', OGGI), false);
  assert.equal(rinvioAttivo('257', OGGI), false, 'un rinvio scaduto non vale per oggi');
  assert.equal(rinvioAttivo('9999', OGGI), false, 'un giorno nel futuro remoto è sporco: non spegne l’avviso per sempre');
  assert.equal(rinvioAttivo('289', OGGI), false, 'oltre i 30 giorni resta fuori');
  assert.equal(rinvioAttivo('288', OGGI), true, 'il tetto è 30 giorni inclusi');
});

test('giorno di carriera assente o sporco: banner senza pulsante, niente rinvio', () => {
  assert.equal(giornoCarriera(null), null);
  assert.equal(giornoCarriera(undefined), null);
  assert.equal(giornoCarriera(''), null);
  assert.equal(giornoCarriera(-3), null);
  assert.equal(giornoCarriera('abc'), null);
  assert.equal(giornoCarriera('258'), 258);
  assert.equal(giornoCarriera(258.7), 258, 'il giorno è un intero');
  const h = html(GAPS, storage(), null);
  assert.match(h, /class="banner warn"/, 'senza giorno il banner resta, non sparisce');
  assert.doesNotMatch(h, /id="cov-banner-rimanda"/, 'senza giorno non ci sono pulsanti che non farebbero nulla');
  assert.equal(rinvioAttivo(String(OGGI), null), false);
});

test('la ✕ di prima continua a funzionare: firma uguale, niente banner', () => {
  assert.equal(html(GAPS, storage({ 'evo.covAvvisoChiudi': firmaCopertura(GAPS) })), '');
  assert.match(html(GAPS, storage({ 'evo.covAvvisoChiudi': 'Imola:altro' })), /class="banner warn"/);
});

test('senza piste incomplete non c\'è nessun banner, rinvio o no', () => {
  const vuoto = { ...GAPS, incomplete: [] };
  assert.equal(html(vuoto, storage()), '');
  assert.equal(html(vuoto, storage({ 'evo.covAvvisoDomani': String(OGGI) })), '');
});

test('il filo nel sorgente: il click salva l\'ultimo giorno coperto, non la firma', () => {
  assert.match(viste, /id="cov-banner-rimanda"/, 'la scelta della durata deve stare nel markup del banner');
  assert.match(viste, /setItem\(RIMANDA_AVVISO_COV, String\(giorno \+ n - 1\)\)/,
    'il click deve salvare giorno + durata − 1 (l’ultimo giorno coperto), non la data');
  assert.match(viste, /Math\.min\(3, Math\.max\(1, Number\(e\.currentTarget\.dataset\.rimanda\) \|\| 1\)\)/,
    'la durata va limitata a 1..3: un data-rimanda manomesso non deve coprire mesi');
  assert.match(funzione('avvisoCoperturaHtml'), /rinvioAttivo\(localStorage\.getItem\(RIMANDA_AVVISO_COV\), oggi\)/,
    'il banner deve controllare il rinvio prima di disegnarsi');
  assert.match(viste, /avvisoCoperturaHtml\(cov\?\.gaps, h\.day\)/, 'al banner va passato il giorno di carriera dell\'header');
  assert.doesNotMatch(viste, /oggiChiave/, 'la vecchia chiave di calendario non deve restare in giro');
});
