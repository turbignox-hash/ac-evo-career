// test/riavvia-webui.test.mjs — IL PID SI SCOPRE DA SOLO (2/11). La lezione
// della mattina: «node tools/riavvia-webui.mjs» senza PID partiva col rientro
// senza ammazzare il vecchio — il nuovo processo moriva sulla porta occupata.
// Il riconoscitore ora legge netstat. Qui SOLO IL PARSING (righe iniettate):
// mai lanciare kill né netstat in test — nessuno processo viene toccato.
import test from 'node:test';
import assert from 'node:assert/strict';

const { pidSullaPorta } = await import('../tools/riavvia-webui.mjs');

const righe = [
  '',
  'Connessioni attive',
  '',
  '  Proto  Indirizzo locale        Indirizzo remoto       Stato           PID',
  '  TCP    127.0.0.1:8642         0.0.0.0:0              LISTENING       20736',
  '  TCP    127.0.0.1:8643         0.0.0.0:0              LISTENING       1080',
  '  TCP    [::]:8642              [::]:0                 LISTENING       20736',
  '  TCP    127.0.0.1:9000         93.184.216.34:443      ESTABLISHED     771',
  '  UDP    0.0.0.0:8642           *:*                                    4242',
];

test('la riga LISTENING della porta scopre il PID (anche con doppio v4/v6 = stesso PID)', () => {
  assert.equal(pidSullaPorta(8642, { righe }), 20736, 'v4 e v6 condividono il PID: un solo vincitore');
});

test('porta altra o senza LISTENING: niente PID (mai ammazzare il vicino)', () => {
  assert.equal(pidSullaPorta(8643, { righe }), 1080, '8643 ha il suo PID');
  assert.equal(pidSullaPorta(9999, { righe }), null, 'portascoperta: nessuno da ammazzare');
});

test('due PID DIVERSI sulla stessa porta: niente decisione arbitraria, esce null', () => {
  const conflitto = [...righe, '  TCP    127.0.0.1:8642         0.0.0.0:0              LISTENING       999'];
  assert.equal(pidSullaPorta(8642, { righe: conflitto }), null, 'non si decide da soli quale ammazzare');
});

test('netstat guasto o muto: null, niente lancio', () => {
  assert.equal(pidSullaPorta(8642, { righe: [] }), null, 'output vuoto = porta libera (o muto)');
});
