// test/prova-prepara.test.mjs — il preparatore della prova in pista (31/10).
// Il rischio reale di un "prepara tutto" è la IDENTITÀ DOPPIA del livello
// radio: il server legge voceCopilota con le regole sue (voceServerLivello in
// webui.mjs) e il preparatore le ristampa qui sotto. Questo test tiene le due
// regole UNA: gli stessi raw del config devono dare lo stesso livello di
// entrambi i lati (false→off, vero/assente→normale, stringa nota→sua,
// refuso→normale).
import test from 'node:test';
import assert from 'node:assert/strict';
import { livelloVoceConfig } from '../tools/_prova-prepara.mjs';

test('il livello radio del preparatore combacia 1:1 col server (voceServerLivello)', () => {
  assert.equal(livelloVoceConfig(undefined), 'normale');     // assente = default di sempre
  assert.equal(livelloVoceConfig(null), 'normale');
  assert.equal(livelloVoceConfig(true), 'normale');          // true dei config vecchi = normale
  assert.equal(livelloVoceConfig(false), 'off');             // il off dei vecchi config resta off
  assert.equal(livelloVoceConfig('essenziale'), 'essenziale');
  assert.equal(livelloVoceConfig('normale'), 'normale');
  assert.equal(livelloVoceConfig('full'), 'full');
  assert.equal(livelloVoceConfig('off'), 'off');
  assert.equal(livelloVoceConfig('FULL'), 'normale');        // i refusi zittiscono al normale
  assert.equal(livelloVoceConfig('full '), 'normale');
  assert.equal(livelloVoceConfig(42), 'normale');
});
