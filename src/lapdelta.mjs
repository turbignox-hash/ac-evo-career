// lapdelta.mjs — le MATEMATICHE del delta di ritmo, da sole e senza gioco:
// partono da liste di punti {x, z, t} (coordinate del tracciato + tempo del
// giro) raccolte dalla shared memory, e restituiscono il delta verso il miglior
// giro della sessione, punto per punto.
//
// L'idea: il «best della sessione» ha una traccia spaziale del giro; il giro
// che si sta facendo corre sopra quella stessa forma. Per ogni campione del
// giro corrente si cerca il punto del best più vicino IN AVANZAMENTO (la
// frazione di giro 0..1 deve crescere: così un circuito che si incrocia
// ricade sulla parte giusta, non su quella di mezz'ora prima), e il delta è
//         delta = tempo del giro corrente lì − tempo del best in quel punto.
//
// Funzioni PURE: niente filesystem, niente shared memory, niente stato.

const r = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;

/**
 * Costruisce il PERCORSO del giro: ogni punto con la frazione di distanza
 * (0..1) percorsa dall'inizio della traccia e, se c'è il tempo, il momento
 * (ms) in cui l'auto è passata da lì.
 * points = [{x, z, t?}] in ordine di percorrenza. Ritorna
 * { pts: [{x, z, p, t?}] } o null con meno di 4 punti validi.
 */
export function buildPathProg(points) {
  const pts = (points ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  if (pts.length < 4) return null;
  let acc = 0;
  const cum = pts.map((p, i) => {
    if (i) { const q = pts[i - 1]; acc += Math.hypot(p.x - q.x, p.z - q.z); }
    return acc;
  });
  if (acc <= 0) return null;
  return { pts: pts.map((p, i) => ({
    x: p.x, z: p.z, p: cum[i] / acc, ...(Number.isFinite(p.t) ? { t: p.t } : {}),
  })) };
}

/**
 * Il punto più vicino del percorso per posizione XZ con interpolazione sul
 * segmento. window = mezzo-larghezza della fascia di progresso ammessa
 * (0 = nessuna limitazione). Ritorna { x, z, p, t } o null.
 */
export function nearestOnPath(path, x, z, prog = null, window = 0) {
  if (!path?.pts?.length || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const { pts } = path;
  let bestI = -1, bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (prog != null && window > 0) {
      let dp = Math.abs(pts[i].p - prog);
      if (dp > 0.5) dp = 1 - dp;             // il circuito chiude il cerchio
      if (dp > window) continue;             // fuori fascia: non è il punto giusto
    }
    const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
    if (d < bestD) { bestD = d; bestI = i; }
  }
  if (bestI < 0) return null;
  const a = pts[bestI], b = pts[(bestI + 1) % pts.length];
  const den = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
  const t = den > 0 ? Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / den)) : 0;
  return {
    x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z),
    p: a.p + t * (b.p - a.p),
    t: a.t != null && b.t != null ? a.t + t * (b.t - a.t) : null,
  };
}

/**
 * Allinea la traccia del giro corrente al percorso del best: per ogni campione
 * del giro corrente trova il punto del best più vicino SOLO IN AVANZAMENTO
 * (progresso crescente ±0.02 di revocato, con salto ammesso fino a +0.22 per
 * un campione più raro del battito del lettore). Ritorna:
 * [{ p, tBest, curMs, x, z, dz }] in ordine — o null se niente di usabile.
 */
export function matchTrack(curTrack, bestPath) {
  const cur = (curTrack ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.t));
  if (!bestPath?.pts?.length || cur.length < 3) return null;
  const out = [];
  let lastP = null;
  for (const s of cur) {
    // fascia in AVANZAMENTO: [lastP+0.005, lastP+0.22] (o [0, 0.22] al primo)
    const from = lastP == null ? -0.02 : lastP + 0.005;
    let hit = null, bestD = Infinity;
    for (const q of bestPath.pts) {
      let dp = q.p - from;
      if (dp < -0.5) dp += 1;                  // wrap: da 0.97 a 0.02 vicino
      if (dp < -0.02 || dp > 0.22) continue;
      const d = (q.x - s.x) ** 2 + (q.z - s.z) ** 2;
      if (d < bestD) { bestD = d; hit = q; }
    }
    if (!hit) continue;
    if (lastP != null && hit.p <= lastP - 0.001) continue;
    out.push({ p: hit.p, tBest: hit.t, curMs: s.t, x: hit.x, z: hit.z, dz: s.t - hit.t });
    lastP = hit.p;
  }
  return out.length >= 3 ? out : null;
}

/**
 * Il delta LIVE al punto corrente del giro: l'ultimo allineamento riuscito
 * di matchTrack. curLapMs = tempo del giro corrente (ms, dalla MMF: è la
 * misura più fresca). Ritorna { deltaMs, prog } o null.
 */
export function liveDelta(curTrack, bestPath, curLapMs = null) {
  const m = matchTrack(curTrack, bestPath);
  if (!m?.length) return null;
  const last = m[m.length - 1];
  const curMs = Number.isFinite(curLapMs) ? curLapMs : last.curMs;
  if (!Number.isFinite(curMs) || last.tBest == null) return null;
  return { deltaMs: r(curMs - last.tBest, 0), prog: last.p };
}

/**
 * Il delta PER FASCIA per la mappa «dove perdo tempo»: divide il giro in `n`
 * fette di progresso 0..1 e per ogni fetta riassume il delta medio dei
 * campioni del giro corrente che cadono lì. Ritorna [{ p, dv }] con dv = delta
 * medio in SECONDS (null dove il giro corrente non ha ancora passato campioni).
 */
export function deltaSegments(curTrack, bestPath, n = 48) {
  const m = matchTrack(curTrack, bestPath);
  if (!m?.length) return null;
  const grid = Array.from({ length: n }, () => ({ sum: 0, k: 0 }));
  for (const w of m) {
    if (!Number.isFinite(w.dz)) continue;
    const i = Math.min(n - 1, Math.max(0, Math.floor(w.p * n)));
    grid[i].sum += w.dz / 1000;
    grid[i].k++;
  }
  return grid.map((g, i) => ({ p: r((i + 0.5) / n, 4), dv: g.k ? r(g.sum / g.k, 2) : null }));
}
