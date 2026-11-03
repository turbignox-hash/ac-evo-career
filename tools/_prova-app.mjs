// tools/_prova-app.mjs — stato dal vivo del ponte Paddock
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { appRoot, appHome, appCalendar, appCatalog, appLedger, appTeams, appHistory } from '../src/app-carriera.mjs';

const root = appRoot();
console.log('root:', root);
if (root) {
  const files = readdirSync(root).filter((f) => f.startsWith('pd-') && f.endsWith('.json')).sort();
  for (const f of files) {
    const st = statSync(join(root, f));
    console.log(f.padEnd(30), new Date(st.mtimeMs).toISOString(), (st.size + ' B').padStart(8));
  }
}
console.log('--- bridge server:');
for (const [k, fn] of Object.entries({ home: appHome, calendar: appCalendar, catalog: appCatalog, ledger: appLedger, teams: appTeams, history: appHistory })) {
  const v = fn();
  console.log(k.padEnd(9), 'ok:' + v.ok, k === 'catalog' ? ('auto: ' + v.cars.length) : '', k === 'calendar' ? `serie: ${JSON.stringify(v.series ?? v.seriesId ?? null)} · ronde: ${v.rounds?.length ?? 0} · auto: ${v.car ? JSON.stringify(v.car) : '—'}` : '');
}
