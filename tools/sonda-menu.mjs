#!/usr/bin/env node
// sonda-menu.mjs — sonda i comandi read-only del menu EVO (4/11/2026).
//
// Uso:
//   node tools/sonda-menu.mjs                         // avvia i quattro comandi base
//   node tools/sonda-menu.mjs --comandi CurrentCar,CurrentTrack
//   node tools/sonda-menu.mjs --stato                 // solo lo stato
//   node tools/sonda-menu.mjs --url http://127.0.0.1:8642/api/sonda-menu --attesa 90
//
// Il server mette la richiesta nella fascia del Cruscotto; l'app in gioco la
// esegue UNA richiesta alla volta e deposita le risposte nel persist. Qui si
// polla lo stato. Non si scrive nel gioco e non si compra/vende nulla.

const opt = (() => {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
  }
  return out;
})();

if (opt.aiuto || opt.help) {
  console.log('Uso: node tools/sonda-menu.mjs [--stato] [--comandi CurrentCar,CurrentTrack,WeatherData,Opponents] [--url URL] [--attesa secondi]');
  process.exit(0);
}
const base = String(opt.url ?? 'http://127.0.0.1:8642/api/sonda-menu');
const attesaSec = Math.max(5, Number(opt.attesa ?? 60) || 60);
const dormi = (ms) => new Promise((r) => setTimeout(r, ms));

async function leggiStato() {
  const r = await fetch(base, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} da ${base}`);
  return r.json();
}

if (opt.stato) {
  console.log(JSON.stringify(await leggiStato(), null, 2));
  process.exit(0);
}

const comandi = String(opt.comandi ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const r = await fetch(base, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(comandi.length ? { comandi } : {}),
  signal: AbortSignal.timeout(5000),
});
const avvio = await r.json();
if (!avvio.ok) {
  console.error(`Sonda non avviata: ${avvio.motivo ?? avvio.error ?? `HTTP ${r.status}`}`);
  process.exit(1);
}
const id = avvio.pending?.id;
console.log(`Sonda in coda: ${id ?? '(id assente)'} — ${avvio.pending?.comandi?.length ?? 0} comandi.`);
const scadenza = Date.now() + attesaSec * 1000;
let ultimo = null;
while (Date.now() < scadenza) {
  await dormi(1000);
  const stato = await leggiStato();
  if (stato.ultima && (!id || stato.ultima.id === id)) {
    ultimo = stato.ultima;
    break;
  }
  if (!stato.pending && stato.ultima) { ultimo = stato.ultima; break; }
}
if (!ultimo) {
  console.error(`Nessuna risposta entro ${attesaSec}s. La sonda resta in coda; controlla che il menu di EVO sia aperto e il Cruscotto installato.`);
  process.exit(2);
}
console.log(JSON.stringify(ultimo, null, 2));
