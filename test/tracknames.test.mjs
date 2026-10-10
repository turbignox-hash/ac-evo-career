// Il matching piste deve essere UNO SOLO (src/tracknames.mjs): qui si blindano le
// due regressioni realmente capitate — accenti ("Nürburgring") e suffissi layout
// ("Imola" vs "ImolaGP", "Nürburgring Gp Strecke") — più il contratto dei moduli
// che lo usano (results.trackMatches, testday, motec).
import test from 'node:test';
import assert from 'node:assert/strict';

const { normTrack, sameTrack, matchesAnyTrack, matchTrackName } = await import('../src/tracknames.mjs');
const { trackMatches } = await import('../src/results.mjs');
const testday = await import('../src/testday.mjs');

test('normTrack: accenti trascritti prima di spazzare i non-alfanumerici', () => {
  // la regression #1: la ü buttata via dava "nrburgringgp" e rompeva il match
  assert.equal(normTrack('Nürburgring GP'), 'nurburgringgp');
  assert.equal(normTrack('Nurburgring'), 'nurburgring');
  assert.equal(normTrack('Circuit de Spa-Francorchamps'), 'circuitdespafrancorchamps');
  assert.equal(normTrack(null), '');
  assert.equal(normTrack(undefined), '');
});

test('sameTrack: uguaglianza e prefisso in entrambe le direzioni (suffissi layout)', () => {
  // la regression #2: il nome corto del ladder vs nome cartella/file col layout
  assert.equal(sameTrack('Imola', 'ImolaGP'), true);
  assert.equal(sameTrack('ImolaGP', 'Imola'), true);
  assert.equal(sameTrack('Fuji Speedway', 'Fuji Speedway GP'), true);
  assert.equal(sameTrack('Nürburgring Gp Strecke', 'Nurburgring GP'), true);
  assert.equal(sameTrack('NürburgringGp Strecke', 'Nürburgring GP'), true);
  // il match DEVE restare a prefisso: "Monza" non è "Montmeló", e nomi diversi
  // che iniziano con la stessa lettera non combaciano
  assert.equal(sameTrack('Monza', 'Monterrey'), false);
  assert.equal(sameTrack('Imola', 'Monza'), false);
  // lato sconosciuto: non si può dire che NON combaci (regola del modulo)
  assert.equal(sameTrack('Imola', null), true);
  assert.equal(sameTrack('', ''), true);
});

test('matchesAnyTrack e matchTrackName: lista di nomi attesi (id ladder + display)', () => {
  const expected = ['nurburgring', 'Nürburgring GP'];
  assert.equal(matchesAnyTrack('Nurburgring', expected), true); //Results EVO scrive SENZA accento
  assert.equal(matchesAnyTrack('NürburgringGp Strecke', expected), true); // cartella MoTeC CON accento
  // NOTA: 'Nürburgring 24h' vs l'id corto 'nurburgring' combacia per prefisso: è il
  // comportamento storico del progetto (aliasOf in tracks.mjs fa lo stesso) — il perno
  // è il nome più corto. Diverso sarebbe con il SOLO display 'Nürburgring GP' atteso:
  assert.equal(matchesAnyTrack('Nürburgring 24h', ['Nürburgring GP']), false); // altra configurazione
  assert.equal(matchesAnyTrack('Fuji Speedway', expected), false);
  assert.equal(matchesAnyTrack(null, expected), false);
  assert.equal(matchTrackName('NürburgringGp Strecke', expected), 'Nürburgring GP');
  assert.equal(matchTrackName('Monza', ['Monza']), 'Monza');
  assert.equal(matchTrackName('Monza', ['Imola']), null);
});

test('contratto results.trackMatches: firme storicamente usate da import/quali', () => {
  assert.equal(trackMatches(['Fuji Speedway'], 'Fuji Speedway GP'), true);
  assert.equal(trackMatches(['fuji'], 'Fuji Speedway'), true);
  assert.equal(trackMatches([], 'Monza'), false);
  assert.equal(trackMatches(['Monza', null, undefined], 'Monza'), true);
  assert.equal(trackMatches(['Monza'], ''), false);
});

test('testday: prettyTrack risolve gli accenti e mostra il nome bello del ladder', () => {
  // prima del fix testday non trascriveva gli accenti: "Nürburgring" non tornava mai indietro
  const ladder = { contentNames: { tracks: { nurburgring: 'Nürburgring GP', fuji: 'Fuji Speedway' } } };
  const names = [], displayOf = new Map();
  for (const [id, display] of Object.entries(ladder.contentNames.tracks)) {
    names.push(display, id);
    displayOf.set(display, display);
    displayOf.set(id, display);
  }
  const pretty = (fileTrack) => {
    const hit = matchTrackName(fileTrack, names);
    return hit ? displayOf.get(hit) : fileTrack;
  };
  assert.equal(pretty('Nurburgring'), 'Nürburgring GP'); // nome Results (senza accento)
  assert.equal(pretty('NürburgringGp Strecke'), 'Nürburgring GP'); // nome cartella MoTeC
  assert.equal(pretty('Pista Inesistente'), 'Pista Inesistente'); // fallback onesto
  assert.equal(typeof testday.recordTestDay, 'function'); // il modulo resta integro
});
