// test/storia-comando.test.mjs — LA STORIA DEL COMANDO nel tooltip
// (31/10/2026 notte, «storia del comando nel tooltip»).
//
// Il patto: ogni comando che esce in fascia (setcar · evento · avvia) e ogni
// ACK che torna dall'app in gioco finisce in data/cruscotto-storia.json e il
// pannello inchioda: una riga nel tooltip del pallino connessione. Il file
// è anche la memoria ATTRAVERSO i riavvii del server — un cambio auto a
// gioco APERTO non deve sparire con il processo. Qui si prova la memoria
// in sandbox (EVO_DATA_DIR), non il gioco: stesso patto delle altre suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// sandbox PRIMA dell'import: il file della storia nasce dentro EVO_DATA_DIR
const DATA = mkdtempSync(join(tmpdir(), 'storia-cmd-'));
mkdirSync(DATA, { recursive: true });
process.env.EVO_DATA_DIR = DATA;

const { storiaAggiungi, storiaComandoFascia, storiaReset } = await import('../src/uiapp-pub.mjs');

const FILE = () => join(DATA, 'cruscotto-storia.json');

test('storiaAggiungi: le righe più recenti in CODA e il file porta la memoria', () => {
  storiaReset();
  storiaAggiungi({ stato: 'inviato', tipo: 'setcar', nome: 'R5 5 giri Oulton', id: 'p1:setcar' }, { ora: 1000 });
  storiaAggiungi({ stato: 'confermato', tipo: 'setcar', nome: 'R5 5 giri Oulton', id: 'p1:setcar', msg: '5 giri' }, { ora: 2000 });
  storiaAggiungi({ stato: 'inviato', tipo: 'avvia', nome: 'Renault 5 GT Turbo', id: 'p1:avvia' }, { ora: 3000 });
  const doc = JSON.parse(readFileSync(FILE(), 'utf8'));
  assert.deepEqual(doc.righe.map((r) => r.t), [1000, 2000, 3000], 'in coda, l\'ordine del tempo');
  assert.equal(doc.righe[1].stato, 'confermato', 'la conferma porta il suo messaggio');
  assert.equal(doc.righe[1].msg, '5 giri');
});

test('storiaComandoFascia: la più recente PRIMA, il limite last taglia', () => {
  storiaReset();
  for (let i = 0; i < 7; i++) storiaAggiungi({ stato: 'inviato', tipo: 'setcar', nome: 'auto ' + i, id: 'id' + i }, { ora: (i + 1) * 1000 });
  let fascia = storiaComandoFascia();
  assert.equal(fascia[0].nome, 'auto 6', 'l\'ultima voce prima');
  assert.equal(fascia.length, 5, 'il limite del tooltip è 5');
  fascia = storiaComandoFascia({ last: 2 });
  assert.deepEqual(fascia.map((r) => r.nome), ['auto 6', 'auto 5']);
});

test('la memoria CEGLIA al taglio: oltre 12 voci le più vecchie escono', () => {
  storiaReset();
  for (let i = 0; i < 15; i++) storiaAggiungi({ stato: 'inviato', tipo: 'setcar', nome: 'auto ' + i, id: 'id' + i }, { ora: (i + 1) * 1000 });
  const doc = JSON.parse(readFileSync(FILE(), 'utf8'));
  assert.equal(doc.righe.length, 12, 'il file tiene le ultime 12');
  assert.equal(doc.righe[0].nome, 'auto 3', 'la testa del taglio: auto 0..2 escono');
  assert.equal(storiaComandoFascia()[0].nome, 'auto 14');
});

test('file assente o marcio: la memoria nasce VUOTA, niente fogliame', () => {
  rmSync(FILE(), { force: true });
  storiaReset();
  assert.deepEqual(storiaComandoFascia(), [], 'senza file la storia è vuota, non un errore');
  // e il primo giro dopo ricomincia a scrivere
  storiaAggiungi({ stato: 'inviato', tipo: 'evento', nome: 'F40 Leggenda', id: 'x' }, { ora: 5 });
  assert.equal(JSON.parse(readFileSync(FILE(), 'utf8')).righe.length, 1);
});
