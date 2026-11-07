import fs from 'node:fs';

const I = await import('./src/import.mjs');
const ladder = JSON.parse(fs.readFileSync('career.evo.ladder.json', 'utf8'));
const LEDGER = 'data/imports-ledger.json';
const ledgerBak = fs.readFileSync(LEDGER, 'utf8');
const liveDir = 'C:/Users/Mauro/Saved Games/ACE/Results';
const fakeName = '260926-2044_SP_Race.sessionresults.json';

const clearHashFor = (fname) => {
  const l = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  for (const [h, v] of Object.entries(l.imported)) if (v.file === fname) delete l.imported[h];
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
};

try {
  // TEST A: file finto (1 giro per tutti) deve essere scartato
  fs.copyFileSync('data/results-archive/' + fakeName, liveDir + '/' + fakeName);
  clearHashFor(fakeName);
  const stateA = JSON.parse(fs.readFileSync('data/evo-career.save.json', 'utf8'));
  try {
    await I.runImport(ladder, { resultsDirs: [liveDir] }, stateA, { persist: () => {} });
    console.log('TEST A: FALLITO - non ha scartato');
  } catch (e) {
    console.log('TEST A ok:', e.code, '-', e.message.slice(0, 90));
  }

  // TEST B: stesso file con 8 giri (da gara vera) deve passare la guardia
  const res = JSON.parse(fs.readFileSync(liveDir + '/' + fakeName, 'utf8'));
  for (const d of (res.drivers ?? [])) d.laps = 8;
  const okName = 'TEST-OK-8giri.sessionresults.json';
  fs.writeFileSync(liveDir + '/' + okName, JSON.stringify(res));
  clearHashFor(okName);
  const stateB = JSON.parse(fs.readFileSync('data/evo-career.save.json', 'utf8'));
  try {
    const r = await I.runImport(ladder, { resultsDirs: [liveDir] }, stateB, { persist: () => {} });
    console.log('TEST B ok: guardia superata, import ->', String(r.source).slice(0, 60), '| pos:', r.entry?.position, '(persist disattivato: save non toccato)');
  } catch (e) {
    console.log('TEST B: errore inatteso:', e.code, '-', e.message.slice(0, 100));
  }
} finally {
  fs.writeFileSync(LEDGER, ledgerBak);
  try { fs.unlinkSync(liveDir + '/' + fakeName); } catch {}
  try { fs.unlinkSync(liveDir + '/TEST-OK-8giri.sessionresults.json'); } catch {}
  console.log('ledger ripristinato, file di test rimossi');
}

const s = JSON.parse(fs.readFileSync('data/evo-career.save.json', 'utf8'));
console.log('save su disco invariato -> round:', s.round, '| mx5 results:', (s.results['trofeo_mx5'] ?? []).length, '| money:', s.money);
