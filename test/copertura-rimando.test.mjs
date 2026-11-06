// copertura-rimando.test.mjs — LA GUARDIA DEL «RIMANDA A DOMANI» (6/11,
// richiesta Mauro: «aggiungi all'avviso di copertura un pulsante per rimandare
// solo di oggi, così torna domani senza dover cambiare i dati»).
//
// Il difetto custodito: la ✕ dell'avviso lo tace FINCHÉ LA SITUAZIONE NON
// CAMBIA (firma piste+buchi in localStorage), e l'unico altro modo per
// liberarsi del banner era... aspettare di sistemare una pista. Il rinvio è
// un'altra cosa: vale per il GIORNO di calendario, non per una firma, quindi
// domani l'avviso torna da solo anche se piste e buchi sono identici.
//
// La legge (`oggiChiave`, `rimandatoOggi`) e il render vero
// (`avvisoCoperturaHtml`) si estraggono dal VERO gui/js/viste-a.js — come
// nav-bottoni fa con drawNav — e si interrogano con un localStorage finto.
// Le maglie che contano:
//   • nessun rinvio: il banner c'è, col pulsante «Rimanda a domani»;
//   • rinvio di OGGI: nessun banner;
//   • rinvio di IERI (o valore spazzatura): il banner torna;
//   • la ✕ di prima continua a funzionare (firma uguale → niente banner);
//   • senza piste incomplete: niente banner, rinvio o no.
// E si controlla il filo nel sorgente: il pulsante esiste nel markup e il suo
// click salva la DATA di oggi, non la firma.

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

const oggiChiave = new Function(`${funzione('oggiChiave')}\nreturn oggiChiave;`)();
const rimandatoOggi = new Function(`${funzione('rimandatoOggi')}\nreturn rimandatoOggi;`)();
const firmaCopertura = new Function(`${funzione('firmaCopertura')}\nreturn firmaCopertura;`)();

/** Un localStorage finto: solo getItem/setItem, come serve al banner. */
const storage = (iniziale = {}) => {
  const m = new Map(Object.entries(iniziale));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

/** Il render col vero corpo della funzione, ma con lo storage che dico io. */
const html = (gaps, memoria) => new Function(
  'FIRMA_AVVISO_COV', 'RIMANDA_AVVISO_COV', 'firmaCopertura', 'motivoCopertura', 'esc', 'tr',
  'localStorage', 'oggiChiave', 'rimandatoOggi',
  `${funzione('avvisoCoperturaHtml')}\nreturn avvisoCoperturaHtml;`,
)('evo.covAvvisoChiudi', 'evo.covAvvisoDomani', firmaCopertura, motivoCopertura, esc, tr, memoria, oggiChiave, rimandatoOggi)(gaps);

const GAPS = {
  soglia: { giri: 3, fileTelemetria: 2, giriSessione: 3 },
  incomplete: [{ name: 'Imola', laps: 2, telemetryFiles: 1, mancano: ['giri', 'file'], gravita: 10 }],
};

const OGGI = oggiChiave();
const IERI = oggiChiave(new Date(Date.now() - 86400000));

test('senza rinvio il banner c\'è, con il pulsante «Rimanda a domani»', () => {
  const h = html(GAPS, storage());
  assert.match(h, /class="banner warn"/);
  assert.match(h, /id="cov-banner-domani"/);
  assert.match(h, /Rimanda a domani/);
});

test('rinviato a oggi: niente banner, e nessun pulsante da cliccare a vuoto', () => {
  assert.equal(html(GAPS, storage({ 'evo.covAvvisoDomani': OGGI })), '');
});

test('il rinvio di ieri è scaduto: il banner torna da solo', () => {
  assert.match(html(GAPS, storage({ 'evo.covAvvisoDomani': IERI })), /class="banner warn"/);
  assert.equal(rimandatoOggi(IERI, OGGI), false);
});

test('valore spazzatura in memoria: vale come nessun rinvio', () => {
  assert.equal(rimandatoOggi('', OGGI), false);
  assert.equal(rimandatoOggi(null, OGGI), false);
  assert.equal(rimandatoOggi(OGGI, OGGI), true);
});

test('la ✕ di prima continua a funzionare: firma uguale, niente banner', () => {
  assert.equal(html(GAPS, storage({ 'evo.covAvvisoChiudi': firmaCopertura(GAPS) })), '');
  assert.match(html(GAPS, storage({ 'evo.covAvvisoChiudi': 'Imola:altro' })), /class="banner warn"/);
});

test('senza piste incomplete non c\'è nessun banner, rinvio o no', () => {
  const vuoto = { ...GAPS, incomplete: [] };
  assert.equal(html(vuoto, storage()), '');
  assert.equal(html(vuoto, storage({ 'evo.covAvvisoDomani': OGGI })), '');
});

test('la chiave è il giorno di calendario locale, non un numero di ore', () => {
  assert.equal(oggiChiave(new Date(2026, 10, 6, 0, 1)), '2026-11-06');
  assert.equal(oggiChiave(new Date(2026, 10, 6, 23, 59)), '2026-11-06');
  assert.equal(oggiChiave(new Date(2026, 0, 5, 12, 0)), '2026-01-05', 'mese e giorno vanno a due cifre');
  assert.notEqual(oggiChiave(new Date(2026, 10, 6, 23, 59)), oggiChiave(new Date(2026, 10, 7, 0, 1)));
});

test('il filo nel sorgente: il click salva la DATA, non la firma', () => {
  assert.match(viste, /id="cov-banner-domani"/, 'il pulsante deve stare nel markup del banner');
  assert.match(viste, /setItem\(RIMANDA_AVVISO_COV, oggiChiave\(\)\)/, 'il click deve salvare la data di oggi');
  assert.match(funzione('avvisoCoperturaHtml'), /rimandatoOggi\(localStorage\.getItem\(RIMANDA_AVVISO_COV\), oggiChiave\(\)\)/,
    'il banner deve controllare il rinvio prima di disegnarsi');
});
