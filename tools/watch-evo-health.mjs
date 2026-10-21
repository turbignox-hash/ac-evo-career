// watch-evo-health.mjs — spia una tantum per la verifica LIVE da Mauro 21/10:
//  1. aspetta che il processo del gioco (AssettoCorsaEVO.exe) compaia;
//  2. a quel punto accende il lettore shared memory (la parte «auto» del toggle);
//  3. registra nel log salute reader + i VALORI della prima sessione live:
//     tipo sessione, pista/layout, auto del pilota, grip, orario, meteo,
//     velocità/giri, lake air/asfalto — stampati quando arrivano VERI.
// Uso: node tools/watch-evo-health.mjs [minutiMax=15]
import { isGameRunning } from '../src/paths.mjs';
import { LiveReader } from '../src/shmem.mjs';

const maxMin = Number(process.argv[2]) || 15;
const t0 = Date.now();
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

log(`attesa EVO (massimo ${maxMin} min)…`);
const rd = new LiveReader({ intervalMs: 900 });
let started = false;
while (Date.now() - t0 < maxMin * 60_000) {
  if (!started && await isGameRunning()) {
    rd.start();
    started = true;
    log('PROCESSO EVO VISTO → lettore shared memory acceso (auto).');
  }
  if (started && !rd.child && !(await isGameRunning())) {
    started = false;
    log('EVO chiuso: lettore spento (ciclo auto corretto). Resta in attesa…');
  }
  const snap = rd.snapshot ?
    (started ? rd.snapshot() : { game: false }) : { game: false };
  if (started && !rd.child && await isGameRunning()) rd.start(); // idempotente
  if (snap.game) {
    const h = rd.health();
    log(`LIVE OK — reader: running=${h.reader.running} alive=${h.reader.alive} restarts=${h.reader.restarts}`);
    log('sessione: ' + JSON.stringify(snap.session));
    log('player: ' + JSON.stringify(snap.player));
    log('tempi/gap: ' + JSON.stringify(snap.timing ?? null));
    log('gauges: ' + JSON.stringify(snap.gauges ?? null));
    log('stato: live=' + snap.live + ' paused=' + snap.paused);
    // restano in ascolto 45s per dare la conferma di stabilità, poi esco
    const fine = Date.now() + 45_000;
    let tick = 0;
    while (Date.now() < fine) {
      await new Promise((r) => setTimeout(r, 15000));
      const s2 = rd.snapshot();
      log(`(${++tick}) ancora vivo: game=${s2.game} live=${s2.live} ` +
        (s2.player ? `auto=${s2.player.car} pos=${s2.player.position}` : ''));
    }
    rd.stop();
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
log('timeout senza EVO aperto in questo intervallo.');
process.exit(0);
