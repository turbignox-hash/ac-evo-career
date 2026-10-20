// hash-probe.mjs — ricerca dell'algoritmo di hash di guid_map / garage.drivergarage.
// Bersagli noti (coppia 4.1 del garage, etichettate dal test in gioco):
//   Audi RS 6 Avant        → 0x458E89C494E825A3
//   Alfa Romeo Giulia GTAm → 0x46D6B58D4B74055B  (etichetta utente "giulia gt")
//   Ford Escort RS Cosworth→ 0x4673D5C3FB5CA405
// Prova le famiglie classiche di hash 64-bit su molte varianti di stringa.
const M = 0xFFFFFFFFFFFFFFFFn;
const TARGETS = {
  AUDI_RS6: 0x458E89C494E825A3n,
  GIULIA_GTAM: 0x46D6B58D4B74055Bn,
  ESCORT_RS: 0x4673D5C3FB5CA405n,
};

const fnv1a = (b) => { let h = 0xcbf29ce484222325n; for (const c of b) h = ((h ^ BigInt(c)) * 0x100000001b3n) & M; return h; };
const fnv1 = (b) => { let h = 0xcbf29ce484222325n; for (const c of b) { h = (h * 0x100000001b3n) & M; h = (h ^ BigInt(c)) & M; } return h; };
const djb2 = (b) => { let h = 5381n; for (const c of b) h = ((((h << 5n) & M) + h + BigInt(c)) & M); return h; };
const sdbm = (b) => { let h = 0n; for (const c of b) h = (BigInt(c) + (h << 6n) + (h << 16n) - h) & M; return h; };
const P1 = 0x9E3779B185EBCA87n, P2 = 0xC2B2AE3D27D4EB4Fn, P5 = 0x27D4EB2F165667C5n;
const xxp = (x, r) => ((x << BigInt(r)) | (x >> BigInt(64 - r))) & M;
function xxh64(buf, seed = 0n) {
  const n = buf.length; let i = 0, h = (seed + P5) & M;
  while (i + 8 <= n) { const k = buf.readBigUInt64LE(i); h = ((h ^ xxp((k * P2) & M, 31) * P1 & M) * P1) & M; h = (xxp(h, 27) * P1 + P5) & M; i += 8; }
  while (i < n) { h = ((h ^ ((BigInt(buf[i]) * P5) & M)) * P1) & M; h = (xxp(h, 11) * P1) & M; i++; }
  h ^= h >> 33n; h = (h * P2) & M; h ^= h >> 29n; h = (h * P1) & M; h ^= h >> 32n;
  return h & M;
}
// CRC64 (poly ECMA reflected 0xC96C5795D7870F42)
function crc64(b) { let crc = 0xFFFFFFFFFFFFFFFFn; for (const c of b) { crc ^= BigInt(c); for (let k = 0; k < 8; k++) crc = (crc & 1n) ? (crc >> 1n) ^ 0xC96C5795D7870F42n : crc >> 1n; } return (~crc) & M; }

const SEED_STRINGS = [
  'Ford Escort RS Cosworth', 'audi rs 6 avant', 'Audi RS 6 Avant', 'Alfa Romeo Giulia GTAm',
  'Giulia GTAm', 'escortrs', 'rs6', 'gtam', 'Audi', 'audi', 'Ford',
  'ks_ford_escort_rs_cosworth', 'ks_audi_rs6_avant', 'ks_alfa_romeo_giulia_gtam',
  'escort_rs_cosworth', 'audi_rs6_avant', 'alfa_romeo_giulia_gtam',
];
const variants = new Set();
for (const s of SEED_STRINGS) {
  const t = s.trim();
  for (const x of [
    t, t.toLowerCase(), t.toUpperCase(), t.replace(/\s+/g, '_'), t.replace(/\s+/g, ''), t.replace(/\s+/g, '_').toLowerCase(),
    t.replace(/-/g, '_'), t.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(), t.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
  ]) variants.add(x);
}
const encoders = {
  utf8: (s) => Buffer.from(s, 'utf8'),
  utf16le: (s) => Buffer.from(s, 'utf16le'),
  utf16be: (s) => Buffer.from(s, 'utf16le').swap16(),
  asc_lower_noSpace: (s) => Buffer.from(s.toLowerCase().replace(/\s+/g, ''), 'utf8'),
};

const algos = { fnv1a, fnv1, djb2, sdbm, crc64, xxh64_0: (b) => xxh64(b, 0n), xxh64_1: (b) => xxh64(b, 1n) };
let hits = 0, tried = 0;
for (const [algoName, fn] of Object.entries(algos)) {
  for (const [encName, enc] of Object.entries(encoders)) {
    for (const s of variants) {
      tried++;
      const h = fn(enc(s));
      for (const [car, t] of Object.entries(TARGETS)) {
        if (h === t) { console.log(`HIT ${algoName}/${encName} ${JSON.stringify(s)} → ${car} 0x${h.toString(16)}`); hits++; }
      }
    }
  }
}
console.log(`stringhe·algoritmi·encodings provati: ${tried} · hits: ${hits}`);
console.log('coppia per Auto.getListOrder check: niente output sopra = ancora non trovato');
