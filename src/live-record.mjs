// live-record.mjs — registratore dei tick live (4/11/2026).
//
// Lo snapshot di /api/live è già caldo nel processo del server: questo modulo
// non rilegge la shared memory e non avvia un secondo PowerShell. Prende una
// funzione `source` (la CLI usa HTTP verso il server) e appende un record per
// tick. NDJSON conserva TUTTO lo snapshot, `raw` compreso; CSV estrae le colonne
// stabili che servono a strategia, HUD e analisi su foglio di calcolo.
//
// La cadenza del lettore PowerShell resta ~900 ms: va bene per strategia/HUD,
// NON per telemetria fine. Per quella serve un lettore più veloce del loop
// PowerShell, non un registratore che gira più forte di lui.

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const COLONNE_CSV = [
  'ts', 'iso', 'errore', 'game', 'live', 'session_id', 'session_type', 'track', 'layout',
  'car', 'position', 'drivers', 'lap', 'laps_done', 'laps_total',
  'speed_kmh', 'gear', 'rpm', 'gas', 'brake', 'steer',
  'fuel_l', 'fuel_per_lap', 'fuel_laps', 'gap_ahead', 'gap_behind',
  'current_lap_ms', 'last_lap_ms', 'best_lap_ms', 'delta_ms',
  'tyre_temp_fl', 'tyre_temp_fr', 'tyre_temp_rl', 'tyre_temp_rr',
  'tyre_core_fl', 'tyre_core_fr', 'tyre_core_rl', 'tyre_core_rr',
  'tyre_press_fl', 'tyre_press_fr', 'tyre_press_rl', 'tyre_press_rr',
  'brake_temp_fl', 'brake_temp_fr', 'brake_temp_rl', 'brake_temp_rr',
  'x', 'y', 'z', 'car_ids_count',
];

const n = (v) => (v == null || v === '' ? '' : v);
const at = (a, i) => (Array.isArray(a) ? n(a[i]) : '');

/** Appiattisce uno snapshot (compatto o raw) in una riga CSV stabile. */
export function flattenLive(snap = {}) {
  const g = snap.raw?.graphics ?? {};
  const p = snap.raw?.physics ?? {};
  const player = snap.player ?? {};
  const sess = snap.session ?? {};
  const map = snap.map ?? {};
  const pos = Array.isArray(map.cars?.[0]) ? map.cars[0] : null;
  const tyres = g.tyres ?? {};
  const temp = (k) => n(tyres[k]?.temperatureC);
  const core = (k) => n(tyres[k]?.temperatureInnerC);
  const press = (k) => n(tyres[k]?.pressurePsi);
  const brake = (k) => n(tyres[k]?.brakeTempC);
  return {
    errore: snap.error ?? '',
    game: snap.game ? 1 : 0,
    live: snap.live ? 1 : 0,
    session_id: n(sess.id),
    session_type: n(sess.type),
    track: n(sess.track),
    layout: n(sess.layout),
    car: n(player.car),
    position: n(player.position),
    drivers: n(player.drivers),
    lap: n(player.lapNo),
    laps_done: n(player.lapsDone),
    laps_total: n(player.lapsTotal),
    speed_kmh: n(player.speedKmh ?? g.speedKmh),
    gear: n(player.gear ?? g.gear),
    rpm: n(g.rpm),
    gas: n(g.gasPercent ?? p.gas),
    brake: n(g.brakePercent ?? p.brake),
    steer: n(g.steeringPercent ?? p.steerAngle),
    fuel_l: n(player.fuel ?? g.fuelLiters),
    fuel_per_lap: n(player.fuelPerLap ?? g.fuelPerLap),
    fuel_laps: n(player.lapsPossible ?? g.lapsPossibleFuel),
    gap_ahead: n(player.gapAheadRaw ?? player.gapAhead),
    gap_behind: n(player.gapBehindRaw ?? player.gapBehind),
    current_lap_ms: n(g.lapMs?.current ?? g.currentLapMs),
    last_lap_ms: n(g.lapMs?.last ?? g.lastLapMs),
    best_lap_ms: n(g.lapMs?.best ?? g.bestLapMs),
    delta_ms: n(snap.delta?.hudDv ?? snap.timing?.deltaCurrentP ?? g.deltaMs),
    tyre_temp_fl: temp('lf'), tyre_temp_fr: temp('rf'), tyre_temp_rl: temp('lr'), tyre_temp_rr: temp('rr'),
    tyre_core_fl: core('lf'), tyre_core_fr: core('rf'), tyre_core_rl: core('lr'), tyre_core_rr: core('rr'),
    tyre_press_fl: press('lf'), tyre_press_fr: press('rf'), tyre_press_rl: press('lr'), tyre_press_rr: press('rr'),
    brake_temp_fl: brake('lf'), brake_temp_fr: brake('rf'), brake_temp_rl: brake('lr'), brake_temp_rr: brake('rr'),
    x: at(pos, 0), y: at(pos, 1), z: at(pos, 2),
    car_ids_count: Array.isArray(g.carIds) ? g.carIds.length : 0,
  };
}

/** Un campo CSV: virgolette solo quando servono, niente `undefined`. */
function campo(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rigaCsv(snap, atMs = Date.now()) {
  const riga = { ts: atMs, iso: new Date(atMs).toISOString(), ...flattenLive(snap) };
  return COLONNE_CSV.map((k) => campo(riga[k])).join(',') + '\n';
}

/**
 * Registratore sincrono: `tick()` legge la fonte e appende un record.
 * `source` può essere HTTP, un lettore finto nei test, qualunque promessa.
 */
export class LiveRecorder {
  constructor({ source, file, format = 'ndjson', maxTicks = 0, onTick = null } = {}) {
    if (typeof source !== 'function') throw new Error('LiveRecorder: serve una funzione source');
    if (!file) throw new Error('LiveRecorder: serve un percorso file');
    if (!['ndjson', 'csv'].includes(format)) throw new Error(`LiveRecorder: formato sconosciuto «${format}»`);
    this.source = source;
    this.file = file;
    this.format = format;
    this.maxTicks = Number(maxTicks) || 0;
    this.onTick = onTick;
    this.count = 0;
    this.ultimoErrore = null;
    this._header = false;
    this._timer = null;
    this._inFlight = false;
  }

  _prepara() {
    mkdirSync(dirname(this.file), { recursive: true });
    if (this.format === 'csv' && !this._header) {
      this._header = true;
      if (!existsSync(this.file) || !this.file) writeFileSync(this.file, COLONNE_CSV.join(',') + '\n', 'utf8');
      // file già esistente: il chiamante ha scelto di accodare, non duplicare l'header
    }
  }

  /** Un tick: fonte → una riga. Non lancia per errori della fonte: li registra. */
  async tick(atMs = Date.now()) {
    let snap;
    try {
      snap = await this.source();
    } catch (e) {
      snap = { game: false, error: e?.message ?? String(e) };
    }
    this.ultimoErrore = snap?.error ?? null;
    this._prepara();
    const riga = this.format === 'csv'
      ? rigaCsv(snap, atMs)
      : JSON.stringify({ t: new Date(atMs).toISOString(), ts: atMs, snapshot: snap }) + '\n';
    appendFileSync(this.file, riga, 'utf8');
    this.count += 1;
    try { this.onTick?.(snap, this.count); } catch { /* il callback è un plus */ }
    if (this.maxTicks > 0 && this.count >= this.maxTicks) this.stop();
    return snap;
  }

  /** Avvio a intervallo; la CLI usa `tick()` in un loop per gestire SIGINT. */
  start(intervalMs = 900) {
    if (this._timer) return this;
    const passo = async () => {
      if (this._inFlight) return;
      this._inFlight = true;
      try { await this.tick(); } catch (e) { this.ultimoErrore = e?.message ?? String(e); } finally { this._inFlight = false; }
    };
    this._timer = setInterval(passo, Math.max(100, Number(intervalMs) || 900));
    this._timer.unref?.();
    void passo();
    return this;
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}
