// benzina.mjs — UNA formula per la benzina del meccanico (6/11 notte).
//
// Il difetto: la CARTA del meccanico (pianoSetup, src/meccanico-parla.mjs) e
// l'APPLICAZIONE del setup (mechanicExtraEdits, src/setup.mjs, usata da
// setup-apply) calcolavano gli stessi litri con due formule diverse:
//   carta:  ceil(consumo × giri × 1,05) + 3 L di riserva
//   setup:  ceil(consumo × giri × 1,05)              ← senza i 3 L
// e la qualifica esisteva solo sulla carta (2 giri di verifica + 1 + 3 L).
// Stesso consumo, stesso numero di giri: due numeri diversi, e in gioco si
// caricava quello del file, non quello detto a voce.
//
// Da qui in poi la formula è UNA e sta qui: chi la cambia la cambia per tutti,
// e test/benzina-allineata.test.mjs diventa rosso se qualcuno ne scrive una
// seconda copia nei due moduli.

/** Giri di verifica della qualifica (più il giro di riserva, sotto). */
export const QUALI_GIRI = 2;
/** Riserva minima a fine gara: sempre una pozzata di prudenza. */
export const RISERVA_L = 3;
/** +5% sul consumo per il degrado del ritmo in progressione. */
export const GARA_EXTRA = 1.05;
/** Tetto del serbatoio nel file: sopra non serve e l'indicatore mente. */
export const BENZINA_CAP_L = 120;
/** Sotto questo consumo non è una misura (è un dato sporco): niente benzina. */
export const CONSUMO_MIN_L = 0.3;
/** Senza giri di gara veri: la carta usa il piano di sempre (10 giri). */
export const GIRI_DEFAULT = 10;

/**
 * La benzina del meccanico, per la carta e per il setup applicato.
 *
 *   tipo      'qualifica' | 'gara' | 'bagnato'
 *   fuelPerLap consumo misurato (L/giro): telemetria o live, mai una stima
 *   raceLaps  giri della ronda (scheda del round); < 3 o assente → 10
 *
 * Ritorna { litri, giri, riserva, extraPct } oppure null quando non c'è un
 * consumo reale da cui partire (in quel caso NESSUNO dei due tocca la benzina).
 */
export function benzinaDelMeccanico({ tipo = 'gara', fuelPerLap = null, raceLaps = null } = {}) {
  const fpl = Number(fuelPerLap);
  if (!Number.isFinite(fpl) || fpl < CONSUMO_MIN_L) return null;
  const giri = tipo === 'qualifica'
    ? QUALI_GIRI
    : (Number.isFinite(Number(raceLaps)) && Number(raceLaps) >= 3 ? Math.round(Number(raceLaps)) : GIRI_DEFAULT);
  // qualifica: i giri di verifica + uno di rientro sul cronometro
  // gara/bagnato: i giri del piano con il degrado
  const base = tipo === 'qualifica'
    ? Math.ceil(fpl * (giri + 1))
    : Math.ceil(fpl * giri * GARA_EXTRA);
  const litri = Math.min(BENZINA_CAP_L, base + RISERVA_L);
  return { litri, giri, riserva: RISERVA_L, extraPct: tipo === 'qualifica' ? 0 : Math.round((GARA_EXTRA - 1) * 100) };
}

/** La riga che il meccanico dice: il numero è quello che il setup scrive. */
export function notaBenzina(benz, fuelPerLap, { tipo = 'gara', dec1 = (v) => String(v) } = {}) {
  if (!benz) return null;
  const consumo = dec1(Number(fuelPerLap));
  const quanti = dec1(benz.litri);
  if (tipo === 'qualifica') {
    return `Benzina da qualifica: ${quanti} L (consumo misurato ${consumo} L/giro, ${QUALI_GIRI} giri di verifica + riserva di ${RISERVA_L} L).`;
  }
  if (tipo === 'bagnato') {
    return `Benzina bagnato: ${quanti} L (${benz.giri} giri del piano + ${benz.extraPct}% per il degrado della pista, +${RISERVA_L} L di riserva).`;
  }
  return `Benzina da gara: ${quanti} L (${benz.giri} giri × consumo misurato ${consumo} L/giro, +${benz.extraPct}% per il degrado, +${RISERVA_L} L di riserva).`;
}
