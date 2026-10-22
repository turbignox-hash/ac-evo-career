#!/usr/bin/env node
// ac-evo-career — carriera persistente automatizzata per Assetto Corsa EVO, ispirata a un'app di carriera per AMS2.
//
// Uso:  node ac-evo-career.mjs <comando> [opzioni]
// Aiuto: node ac-evo-career.mjs help

import { main } from './src/cli.mjs';

try {
  const code = await main(process.argv.slice(2));
  process.exit(code ?? 0);
} catch (e) {
  console.error(`\n\x1b[31mErrore inatteso:\x1b[0m ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  else console.error('Rilancia con DEBUG=1 per lo stack completo.');
  process.exit(1);
}
