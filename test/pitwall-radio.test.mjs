// test/pitwall-radio.test.mjs — la RADIO nel pannello Pitwall (31/10/2026,
// «Pitwall con la radio»).
//
// Il patto: le frasi che il narratore ha già detto in gara (registro della
// voce) arrivano NELLA fascia della Pitwall e là finiscono a schermo. Un
// UNICO file (LOG_VOCE_FILE), quindi il test usa la stessa regola di casa
// (EVO_DATA_DIR) per tenerlo in una sandbox. Cosa si prova:
//   1. leggiRadioVoce: le ultime frasi in ordine dal più recente, gli eventi
//      di sessione (righe evento) NON parlano, il limite `last` vale;
//   2. file assente → [] (la radio è un plus, mai un errore);
//   3. miniPitwall: il payload della fascia porta la radio DEL MEMO e si
//      aggiorna quando il file del registro cresce (una frase NUOVA che
//      esce in pista deve entrare nella prossima fascia);
//   4. il resto del payload (vetrina) non è arrotato nella Pitwall.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// La sandbox PRIMA dell'import: LOG_VOCE_FILE nasce dal modulo e fonde la
// EVO_DATA_DIR solo al load (stessa regola degli altri test della casa).
const DATA = mkdtempSync(join(tmpdir(), 'pw-radio-'));
mkdirSync(DATA, { recursive: true });
process.env.EVO_DATA_DIR = DATA;

const { leggiRadioVoce, LOG_VOCE_FILE } = await import('../src/voce-copilota.mjs');
const { miniPitwall } = await import('../src/uiapp-pub.mjs');

// Registro FINTO: tre frasi vere di gara + qualcosa che NON è una frase
// (corsa, riga evento, non il narratore che ha parlato).
const LOGO = [
  { t: 1000, chi: 'verde', it: 'Carta verde, si riparte.', livello: 'normale' },
  { t: 2000, chi: 'benzina', it: 'Benzina in calo verso il pit stop.', livello: 'normale' },
  { t: 3000, chi: 'blu', it: 'Bandiera blu, lascia passare chi ti doppia.', livello: 'essenziale' },
  { t: 3100, evento: 'SESSIONE VIVA — voce del Pitwall pronta' },
  { t: 4000, chi: 'blu', it: 'Ancora blu: spazio al doppio.', livello: 'essenziale' },
].map((r) => JSON.stringify(r)).join('\n') + '\n';

test('leggiRadioVoce: dal più recente, solo frasi, limite last', () => {
  rmSync(LOG_VOCE_FILE, { force: true });
  writeFileSync(LOG_VOCE_FILE, LOGO, 'utf8');
  const v = leggiRadioVoce({ last: 6 });
  assert.deepEqual(v.map((f) => f.it).slice(0, 2), ['Ancora blu: spazio al doppio.', 'Bandiera blu, lascia passare chi ti doppia.'], 'ordine inversione: l\'ultima frase prima');
  assert.equal(v.length, 4, 'le righe di registro NON parlano della radio (le frasi di verità parlano solo)');
  const due = leggiRadioVoce({ last: 2 });
  assert.equal(due.length, 2, 'il limite last taglia');
});

test('file del registro assente: la radio ritorna [] e non alzà niente', () => {
  rmSync(join(DATA, 'assente-voce.jsonl'), { force: true });
  assert.deepEqual(leggiRadioVoce({ file: join(DATA, 'assente-voce.jsonl') }), []);
});

test('miniPitwall porta la radio + si aggiorna quando il registro cresce', () => {
  rmSync(LOG_VOCE_FILE, { force: true });
  writeFileSync(LOG_VOCE_FILE, LOGO, 'utf8');
  const prima = miniPitwall({ quando: 1 }, 123);
  assert.equal(prima.slot, 123);
  assert.ok(prima.radio.some((f) => f.it.includes('Bandiera blu')), 'radio presente nel payload');
  // una frase NUOVA che esce in pista deve entrare nella prossima fascia
  writeFileSync(LOG_VOCE_FILE, LOGO + JSON.stringify({ t: 5000, chi: 'scarico', it: 'Ultimo giro: quando scorre la bandiera a scacchi è fatta.' }) + '\n', 'utf8');
  const dopo = miniPitwall({ quando: 2 }, 124);
  assert.ok(dopo.radio[0]?.it.includes('Ultimo giro'), 'la frase nuova è già in fascia');
});

test('miniPitwall NON trasporta il resto della vetrina', () => {
  const dati = { quando: 3, comando: { tipo: 'setcar', id: 'x', nome: 'R5' }, files: [], riepilogo: ['peso'] };
  const pw = miniPitwall(dati, 5);
  assert.deepEqual(Object.keys(pw).sort(), ['consigli', 'prepara', 'quando', 'radio', 'slot', 'verdetto'], 'solo le chiavi DEL PITWALL, il resto della fascia non viaggia');
  assert.equal(pw.radio.every((f) => typeof f.it === 'string'), true, 'ogni radio è una frase');
});
