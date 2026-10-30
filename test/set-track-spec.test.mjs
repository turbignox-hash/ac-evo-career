// set-track-spec.test.mjs — LA SPEC dei campi pista deve essere ESATTAMENTE
// ciò che EVO scrive da solo al pick manuale. Il tag (3.5.3) è il percorso
// risorsa della tessera pista (lezione Paul Ricard 21/10: tag "GP" chiede
// una texture che non esiste e la finestra resta vuota), il layout lungo
// (3.5.6) deve essere quello vero del catalogo, e il pit slot (3.5.5) deve
// stare nella tabella PIT_SLOTS.
// Campione osservato 30/10 ore 18:31 SUL FILE RISCRITTO DAL GIOCO (backup
// bak-track-2026-10-30T18-31 dopo il pick manuale: tag "International",
// layout "International Race", pit 16 — tutti e 4 i blocchi sessione).
// Il giorno stesso le riscritture del tool con i default "GP"/"GP Race"
// hanno cancellato quei valori e AL RIAVVIO la finestra pista è tornata
// VUOTA: il pit slot della lezione 30/10 era giusto, il TAG era il secondo
// colpevole. Da qui la garanzia: Oulton esce dai TRACK_SPECIALS con i valori
// osservati, mai più dai default.
import test from 'node:test';
import assert from 'node:assert/strict';

const { specFor } = await import('../tools/set-track.mjs');

test('oulton: i valori che il GIOCO scrive al pick manuale, non i default GP', () => {
  const s = specFor('Oulton Park');
  assert.ok(s, 'Oulton Park è nel libro TRACK_INFO');
  assert.equal(s.tag, 'International', 'il tag è il LAYOUT vero (la texture della tessera nasce qui)');
  assert.equal(s.layout, 'International Race', 'layout lungo come sul campione del gioco 30/10 18:31');
  assert.equal(s.pitSlots, 16, 'pit slot International = 16 (lezione 30/10 sul crash 0xC0000005)');
  assert.equal(s.name, 'Oulton Park');
  assert.equal(s.nation, 'GBR');
  assert.equal(s.continent, 'Europe');
  assert.equal(s.lengthM, 4333);
});

test('paul ricard: lo special che lo aveva sistemato resta e non torna "GP"', () => {
  const s = specFor('Paul Ricard');
  assert.ok(s);
  assert.equal(s.tag, 'Layout 1C-V2');
  assert.equal(s.layout, 'Layout 1C-V2 Race');
});

test('le piste mono-layout sane restano sui default GP/GP Race', () => {
  // lezione 22/10 notte: Monza/Sebring/RBR/Suzuka visti SANI nei backup
  // sempre "GP" + "GP Race" — il default non va rotto per un'eccezione
  assert.equal(specFor('Monza')?.tag, 'GP');
  assert.equal(specFor('Monza')?.layout, 'GP Race');
  assert.equal(specFor('Monza')?.pitSlots, 30);
});
