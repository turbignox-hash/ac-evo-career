// carsetup.mjs — lettura/scrittura dei file .carsetup che EVO salva in
// Saved Games/ACE/Car Setups/<auto>/<pista>/<nome>.carsetup.
//
// Formato: protobuf senza schema pubblico, mappa EMPIRICA calibrata su
// Test.carsetup (Ferrari F2004 · v0.9.1) incrociata con gli screenshot del
// setup in gioco. Il gioco usa un encoding INCOERENTE fra i blocchi, qui decodificato:
//   • root.1 (barraggio/assetto) = nested, dentro:
//       .1 = ARB [ant, post]            RAW packed 2×f32 (niverso tag!)
//       .2 = f32 15 (non mappato)
//       .3 = freni: nested {1: bias %, 2: mult %}        (wire5 taggati)
//       .4 = diff:  nested {1: trazione, 2: rilascio, 3: precarico}
//   • root.2 (molle, ×6) = nested {1: molla N/m, 2: nested f32, 3: nested f32}
//   • root.3 (ammortizzatori, ×6) = nested {1: lentoCompr, 2: veloceCompr,
//                                            3: lentoEstr, 4: veloceEstr}
//   • root.4 (gomme, ×4) = nested {1: pressione, 2: camber, 3: toe, 4..6: extra}
//   • root.5 (elettronica) = nested {1: TC1, 5: altro}
//   • root.6 (aero) = nested {1: RAW pack, 2: altezza ant, 3: altezza post,
//                             4: ala ant, 5: ala post}
//   • root.7 (carburante) = nested {1: litri}
//   • root.9 (stringa preset estetico) / root.10 (varint): intatti.
//
// REGOLE DI SICUREZZA:
//   1. Si parte SEMPRE da un file esistente salvato dal gioco (mai da zero).
//   2. Ciò che non mappiamo resta BYTE PER BYTE (round-trip verificato identico).
//   3. Si patchano solo campi wire5 (f32) dentro blocchi nested già decodificati.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodeMsg, encodeMsg } from '../tools/evo-grid.mjs';

/* ---------- primitivi ---------- */
const decode = (buf) => decodeMsg(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
const bytesOf = (f) => Buffer.from(f?.bytes ?? []);
const f32Of = (b) => (b && b.length >= 4) ? Buffer.from(b).readFloatLE(0) : NaN;
const setF32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(Number(v), 0); return b; };
/** leggi un blob come f32 packed SE È multiplo di 4 (per ARB/altri raw) */
const f32PackOf = (b) => { const x = Buffer.from(b ?? []); return Array.from({ length: Math.floor(x.length / 4) }, (_, i) => x.readFloatLE(i * 4)); };
const packF32 = (vals) => { const b = Buffer.alloc(4 * vals.length); vals.forEach((v, i) => b.writeFloatLE(Number(v), i * 4)); return b; };
const r3 = (v) => Math.round(v * 1000) / 1000;
const RUOTE = ['ant sx', 'ant dx', 'post sx', 'post dx', 'extra5', 'extra6'];

/** mappa {nField: float} per i wire5 di un blob nested (ga per freni/diff/aero). */
function nestedF32Map(bytes) {
  const m = {}, list = decode(bytes);
  for (const k of list) if (k.wire === 5) m[k.field] = f32Of(k.bytes);
  return { map: m, list };
}

/** sostituisce SOLO i wire5 elencati in patches (chiave = field number) e re-encoda.
 *  Ritorna { bytes, msgs: [{fld, old, val}] } — il blob intatto resta uguale (round-trip). */
function editNestedF32(bytes, patches) {
  const g = decode(bytes);
  const msgs = [];
  for (const [fldStr, val] of Object.entries(patches)) {
    const fld = Number(fldStr);
    const k = g.find((z) => z.field === fld && z.wire === 5);
    if (!k) continue;
    const old = f32Of(k.bytes);
    if (!Number.isFinite(Number(val)) || Math.abs(Number(val) - old) < 1e-6) continue;
    k.bytes = setF32(val);
    msgs.push({ fld, old, val: Number(val) });
  }
  return { bytes: msgs.length ? encodeMsg(g) : bytes.slice(), msgs };
}

/* ---------- PARSE ---------- */
export function parseSetup(buf) {
  const f = decode(buf);
  const s = { raw: f };

  const cat = f.find((x) => x.field === 1);
  if (cat) {
    const g = decode(bytesOf(cat));
    for (const k of g) {
      if (k.field === 1) {
        const vals = f32PackOf(bytesOf(k));
        if (vals.length >= 2) s.arb = { front: vals[0], rear: vals[1] };
      } else if (k.field === 3) {
        const { map } = nestedF32Map(bytesOf(k));
        if (map[1] != null) s.brakes = { bias: map[1], mult: map[2] ?? null };
      } else if (k.field === 4) {
        const { map } = nestedF32Map(bytesOf(k));
        if (map[1] != null) s.diff = { traction: map[1], coast: map[2] ?? null, preload: map[3] ?? null };
      }
      // field 2 (f32 15): non mappato — intatto
    }
  }

  s.springs = f.filter((x) => x.field === 2).map((e, i) => {
    const g = decode(bytesOf(e));
    const get = (fld) => { const k = g.find((z) => z.field === fld && z.wire === 5); return k ? f32Of(k.bytes) : null; };
    const sub2 = g.find((z) => z.field === 2);
    const sub3 = g.find((z) => z.field === 3);
    // i blocchi sub 2/3 sono nested {1: f1, 2: f2}: la f32 PACK sunta era sbagliata
    // (includeva i tag) — per la RIGIDITA' bumpstop il valore vero è sub2.f2
    // (calibrato sul 296 GT3: 500 N soft / 5000 N hard per lato, 21/10).
    const subVal = (entry) => {
      if (!entry) return { f1: null, f2: null };
      const m = decode(bytesOf(entry));
      const g2 = (fld) => { const k = m.find((z) => z.field === fld && z.wire === 5); return k ? f32Of(k.bytes) : null; };
      return { f1: g2(1), f2: g2(2) };
    };
    const s2 = subVal(sub2), s3 = subVal(sub3);
    return { spring: get(1), extra2: sub2 ? f32PackOf(sub2.bytes) : [], extra3: sub3 ? f32PackOf(sub3.bytes) : [],
             bumpRig: s2.f2, bumpAux: s2.f1, travel: s3.f1, travelCap: s3.f2 };
  });

  s.dampers = f.filter((x) => x.field === 3).map((e) => {
    const g = decode(bytesOf(e));
    const get = (fld) => { const k = g.find((z) => z.field === fld && z.wire === 5); return k ? f32Of(k.bytes) : null; };
    return { slowBump: get(1), fastBump: get(2), slowReb: get(3), fastReb: get(4) };
  });

  s.tires = f.filter((x) => x.field === 4).map((e) => {
    const g = decode(bytesOf(e));
    const get = (fld) => { const k = g.find((z) => z.field === fld && z.wire === 5); return k ? f32Of(k.bytes) : null; };
    return { pressure: get(1), camber: get(2), toe: get(3),
             extra4: get(4), extra5: get(5), extra6: get(6), flag: get(7) };
  });

  const e5 = f.find((x) => x.field === 5);
  if (e5) {
    const { map } = nestedF32Map(bytesOf(e5));
    s.elec = { tc1: map[1] ?? null, other5: map[5] ?? null };
  } else s.elec = null;

  const e6 = f.find((x) => x.field === 6);
  if (e6) {
    const { map } = nestedF32Map(bytesOf(e6));
    s.aero = { heightFront: map[2] ?? null, heightRear: map[3] ?? null, wingFront: map[4] ?? null, wingRear: map[5] ?? null };
  } else s.aero = null;

  const e7 = f.find((x) => x.field === 7);
  if (e7) {
    const { map } = nestedF32Map(bytesOf(e7));
    s.fuel = { liters: map[1] ?? null };
  } else s.fuel = null;

  return s;
}

/* ---------- APPLY ---------- */
/**
 * applyEdits(buf, edits) → { bytes: Buffer, changes: string[] }
 * edits (tutto facoltativo, si patcha solo ciò che passi):
 *   arb?:    { front?, rear? }
 *   brakes?: { bias?, mult? }
 *   diff?:   { traction?, coast?, preload? }
 *   springs?: [{ spring?, bumpRig? } ×6]  (ordinate FL, FR, RL, RR, +2 extra)
 *   dampers?: [{ slowBump?, fastBump?, slowReb?, fastReb? } ×6]
 *   tires?:   [{ pressure?, camber?, toe? } ×4]
 *   elec?:    { tc1? }
 *   aero?:    { heightFront?, heightRear?, wingFront?, wingRear? }
 *   fuel?:    { liters? }
 */
export function applyEdits(buf, edits) {
  const changes = [];
  const fields = decode(buf);
  const touch = (entry, patches, ok) => {
    if (!entry) return false;
    const r = editNestedF32(bytesOf(entry), patches);
    if (r.msgs.length) {
      entry.bytes = r.bytes;
      for (const m of r.msgs) changes.push(ok(m));
      return true;
    }
    return false;
  };
  const tagOf = (fld) => `campo ${fld}`;

  /* 1 = barraggio: ARB raw + freni/diff nested */
  const e1 = fields.find((x) => x.field === 1);
  if (e1 && (edits.arb || edits.brakes || edits.diff)) {
    const g = decode(bytesOf(e1));
    const arbE = g.find((k) => k.field === 1);
    if (arbE && edits.arb) {
      const vals = f32PackOf(bytesOf(arbE));
      if (vals.length >= 2) {
        const want = [Number(edits.arb.front ?? vals[0]), Number(edits.arb.rear ?? vals[1])];
        if (want.some((v, i) => Math.abs(v - vals[i]) > 1e-6)) {
          arbE.bytes = packF32(want);
          changes.push(`Barre: ${Math.round(vals[0])}→${want[0] ? Math.round(want[0]) : want[0]} / ${Math.round(vals[1])}→${Math.round(want[1])} N/m`);
        }
      }
    }
    if (edits.brakes) touch(g.find((k) => k.field === 3), { 1: edits.brakes.bias, 2: edits.brakes.mult },
      (m) => `Freni #${m.fld === 1 ? 'bias' : 'mult'}: ${r3(m.old)}→${r3(m.val)}`);
    if (edits.diff) touch(g.find((k) => k.field === 4), { 1: edits.diff.traction, 2: edits.diff.coast, 3: edits.diff.preload },
      (m) => `Diff ${['trazione', 'rilascio', 'precarico'][m.fld - 1]}: ${r3(m.old)}→${r3(m.val)}`);
    e1.bytes = encodeMsg(g);
  }

  /* 2 = molle + bumpstop */
  if (edits.springs?.length) {
    const idx = fields.map((x, i) => (x.field === 2 ? i : -1)).filter((i) => i >= 0);
    idx.forEach((iIdx, k) => {
      const wantSpring = Number(edits.springs[k]?.spring);
      const wantRig = Number(edits.springs[k]?.bumpRig);
      if (!Number.isFinite(wantSpring) && !Number.isFinite(wantRig)) return;
      const e = fields[iIdx];
      const g = decode(bytesOf(e));
      let touched = false;
      /* molla */
      if (Number.isFinite(wantSpring)) {
        const sp = g.find((z) => z.field === 1 && z.wire === 5);
        if (sp) {
          const old = f32Of(sp.bytes);
          if (Math.abs(wantSpring - old) >= 1) {
            sp.bytes = setF32(wantSpring);
            changes.push(`Molla ${RUOTE[k] ?? k}: ${Math.round(old)}→${Math.round(wantSpring)} N/m`);
            touched = true;
          }
        }
      }
      /* bumpstop: solo il f2 del blocco sub2 = rigidità (calibrato sul 296 GT3) */
      if (Number.isFinite(wantRig)) {
        const sub2 = g.find((z) => z.field === 2 && z.wire === 2);
        if (sub2) {
          const r = editNestedF32(bytesOf(sub2), { 2: wantRig });
          if (r.msgs.length) {
            sub2.bytes = r.bytes;
            changes.push(`Bumpstop ${RUOTE[k] ?? k}: ${Math.round(r.msgs[0].old)}→${Math.round(wantRig)} N`);
            touched = true;
          }
        }
      }
      if (touched) e.bytes = encodeMsg(g);
    });
  }

  /* 3 = ammortizzatori */
  if (edits.dampers?.length) {
    const idx = fields.map((x, i) => (x.field === 3 ? i : -1)).filter((i) => i >= 0);
    idx.forEach((iIdx, k) => {
      const want = edits.dampers[k] ?? {};
      const e = fields[iIdx];
      const g = decode(bytesOf(e));
      const NOMI = { 1: 'lento compr', 2: 'veloce compr', 3: 'lento estr', 4: 'veloce estr' };
      let dentro = false;
      for (const [nome, fld] of [['slowBump', 1], ['fastBump', 2], ['slowReb', 3], ['fastReb', 4]]) {
        const val = Number(want[nome]);
        if (!Number.isFinite(val)) continue;
        const sp = g.find((z) => z.field === fld && z.wire === 5);
        if (!sp) continue;
        const old = f32Of(sp.bytes);
        if (Math.abs(val - old) < 0.5) continue;
        sp.bytes = setF32(val);
        changes.push(`Ammortiz. ${RUOTE[k] ?? k} ${NOMI[fld]}: ${Math.round(old)}→${Math.round(val)} Ns/m`);
        dentro = true;
      }
      if (dentro) e.bytes = encodeMsg(g);
    });
  }

  /* 4 = gomme */
  if (edits.tires?.length) {
    const idx = fields.map((x, i) => (x.field === 4 ? i : -1)).filter((i) => i >= 0);
    idx.forEach((iIdx, k) => {
      const want = edits.tires[k] ?? {};
      const e = fields[iIdx];
      const g = decode(bytesOf(e));
      let dentro = false;
      for (const [nome, fld, eps] of [['pressure', 1, 0.001], ['camber', 2, 0.001], ['toe', 3, 0.001]]) {
        const val = Number(want[nome]);
        if (!Number.isFinite(val)) continue;
        const sp = g.find((z) => z.field === fld && z.wire === 5);
        if (!sp) continue;
        const old = f32Of(sp.bytes);
        if (Math.abs(val - old) < eps) continue;
        sp.bytes = setF32(val);
        changes.push(`${nome === 'pressure' ? 'Pressione' : nome === 'camber' ? 'Campanatura' : 'Convergenza'} ${RUOTE[k] ?? k}: ${r3(old)}→${r3(val)}${nome === 'pressure' ? ' PSI' : '°'}`);
        dentro = true;
      }
      if (dentro) e.bytes = encodeMsg(g);
    });
  }

  /* 5 = elettronica TC1 */
  if (edits.elec?.tc1 != null) {
    const e5 = fields.find((x) => x.field === 5);
    if (e5 && touch(e5, { 1: Number(edits.elec.tc1) }, (m) => `TC1: ${r3(m.old)}→${r3(m.val)}`)) { /* già dentro */ }
  }

  /* 6 = aero */
  if (edits.aero) {
    const e6 = fields.find((x) => x.field === 6);
    const NOMI = { 2: 'Altezza ant', 3: 'Altezza post', 4: 'Ala ant', 5: 'Ala post' };
    if (e6 && touch(e6, { 2: edits.aero.heightFront, 3: edits.aero.heightRear, 4: edits.aero.wingFront, 5: edits.aero.wingRear },
      (m) => `${NOMI[m.fld]}: ${r3(m.old)}→${r3(m.val)}${m.fld <= 3 ? ' mm' : '°'}`)) { /* dentro */ }
  }

  /* 7 = carburante */
  if (edits.fuel?.liters != null) {
    const e7 = fields.find((x) => x.field === 7);
    if (e7) touch(e7, { 1: Number(edits.fuel.liters) }, (m) => `Benzina: ${r3(m.old)}→${r3(m.val)} L`);
  }

  return { bytes: Buffer.from(encodeMsg(fields)), changes };
}

/* ---------- iscrizione file (per il TEST in gioco) ---------- */
export function setupsRoot(savedDir) { return join(savedDir, 'Car Setups'); }
export function listSetups(savedDir, { car = null, track = null } = {}) {
  const root = setupsRoot(savedDir);
  if (!existsSync(root)) return [];
  const out = [];
  const cars = car ? [car] : readdirSync(root);
  for (const c of cars) {
    const cdir = join(root, c);
    const trks = track ? [track] : (existsSync(cdir) ? readdirSync(cdir) : []);
    for (const t of trks) {
      const tdir = join(cdir, t);
      for (const fname of (existsSync(tdir) ? readdirSync(tdir) : [])) {
        if (fname.toLowerCase().endsWith('.carsetup')) out.push({ car: c, track: t, name: fname.replace(/\.carsetup$/i, ''), file: join(tdir, fname) });
      }
    }
  }
  return out;
}
/** Legge un .carsetup dal disco e ritorna { buf, setup } (o null se assente). */
export function readSetupFile(file) {
  if (!existsSync(file)) return null;
  const buf = readFileSync(file);
  return { buf, setup: parseSetup(buf) };
}
/** Scrive un .carsetup ritoccato su un NUOVO nome (NON sovrascrive l'originale). */
export function writeSetupCopy(srcBuf, destFile, edits) {
  const { bytes, changes } = applyEdits(srcBuf, edits ?? {});
  mkdirSync(dirname(destFile), { recursive: true });
  writeFileSync(destFile, bytes);
  return { file: destFile, changes, setup: parseSetup(bytes) };
}

export const CARSETUP_HELP = [
  'Formato .carsetup (protobuf senza schema):',
  '  Car Setups/<auto>/<pista>/<nome>.carsetup',
  '  mossi gestiti: barre, freni, diff, molle, ammortizzatori, gomme (pressione/camber/toe),',
  '  TC1, aero (altezze + ali) e carburante. Il resto resta byte per byte.',
];
