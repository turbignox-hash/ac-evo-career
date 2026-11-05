// uiapp-publisher-avvio.test.mjs — IL PUBLISHER NON MUORE SE L'APP ARRIVA DOPO
// (4/11/2026). Prima startUiappPublisher guardava la cartella una volta sola:
// se il server nasceva prima dell'installazione, restava fermo fino al riavvio.
// Qui si prova il patto nuovo: senza app non parte, ma resta in attesa; appena
// la cartella compare, parte da solo e scrive la prima fascia.
//
// La stanza è finta: ACE_SAVEDIR comanda (src/paths.mjs), quindi nessuna
// scrittura nelle app vere. Il save della carriera è quello del progetto, in
// sola lettura; il tick scrive soltanto ui-<slot>.json nella radice temporanea.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startUiappPublisher } from '../src/uiapp-pub.mjs';
import { SAVE_FILE } from '../src/webui-env.mjs';

test('publisher: attende la cartella app e parte appena compare', async (t) => {
  // La fascia del Cruscotto nasce dalla CARRIERA del progetto (SAVE_FILE, in
  // data/ e fuori dal repo): su un checkout pulito manca e il publisher non ha
  // NIENTE da pubblicare (esce «no app o no carriera» prima di scrivere).
  // Saltare qui è l'onestà, non il perdono: sul PC con la carriera il test gira
  // e pesa tutto il patto d'attesa.
  if (!existsSync(SAVE_FILE)) {
    t.skip('carriera del progetto assente (checkout senza data/): niente fasce da pubblicare');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'evo-pub-attesa-'));
  // L'env resta puntato alla radice finta per tutto il processo di test: così
  // il timer (unref) non può svegliarsi dopo e scrivere nell'app vera.
  process.env.ACE_SAVEDIR = root;
  t.after(() => { rmSync(root, { recursive: true, force: true }); });

  const loader = join(root, 'ACE', 'mods', 'uiresources', 'ACEUIAppLoader');
  mkdirSync(loader, { recursive: true });
  const subito = startUiappPublisher(null, { attesaMs: 20 });
  assert.equal(subito, null, 'senza la cartella app il publisher non deve partire subito');

  const app = join(loader, 'cruscotto');
  mkdirSync(app);
  await new Promise((resolve) => setTimeout(resolve, 500));

  const fasce = existsSync(app) ? readdirSync(app).filter((f) => /^ui-\d+\.json$/.test(f)) : [];
  assert.ok(fasce.length > 0,
    'la cartella app è comparsa ma il publisher non ha scritto la prima fascia: il server resterebbe muto fino al riavvio');
});
