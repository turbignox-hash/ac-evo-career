/* viste-analisi.js — tab ANALISI (23/10/2026): i cinque strumenti del pilota.
   Tutto dal server (src/analisi.mjs) in LETTURA pura: niente scritture, niente
   side-effect sulla carriera. */
'use strict';

/* separatore decimale in base alla lingua: it → virgola, en → punto */
const dec = (s) => String(s).replace('.', window.LOCALE === 'en-US' ? '.' : ',');
const fmtSecMs = (ms, sign = true) => (Number.isFinite(ms) && ms != null
  ? `${ms > 0 && sign ? '+' : ms < 0 ? '−' : ''}${dec((Math.abs(ms) / 1000).toFixed(2))}s`
  : '—');

async function drawAnalisi(m){
  const [audi, tetto, mc] = await Promise.all([
    api('autopsy').catch((e) => ({ error: e.message })),
    api('tetto').catch((e) => ({ error: e.message })),
    api('seat-mc', { sims: 400 }).catch((e) => ({ error: e.message })),
  ]);
  m.innerHTML = `
    <div id="an-autopsia" class="panel"></div>
    <div id="an-tetto" class="panel"></div>
    <div id="an-ab" class="panel"></div>
    <div id="an-mc" class="panel"></div>`;
  renderAutopsia($('#an-autopsia', m), audi);
  renderTetto($('#an-tetto', m), tetto);
  renderAB($('#an-ab', m));
  renderMC($('#an-mc', m), mc);
}

/* -------------------- 1) AUTOPSIA DELLA GARA -------------------- */
function renderAutopsia(host, d){
  if (!host) return;
  if (d?.error) {
    host.innerHTML = `<h2>🔬 ${tr({ it: 'Autopsia della gara', en: 'Race autopsy' })}</h2>
      <div class="empty">${esc(d.error)}</div>`;
    return;
  }
  const e = d.entry ?? {};
  host.innerHTML = `<h2>🔬 ${tr({ it: 'Autopsia della gara', en: 'Race autopsy' })}
      <span class="h-act">${esc(d.node ?? '')} · S${d.season} R${(d.round ?? 0) + 1}${d.hasRaceRow ? '' : tr({ it: ' · griglia non in archivio', en: ' · grid not in archive' })}</span></h2>
    <div class="grid4" style="margin-bottom:12px">
      <div class="kpi"><div class="l">${tr({ it: 'Esito', en: 'Result' })}</div><div class="v ${e.dnf ? 'bad' : e.position === 1 ? 'good' : ''}">${e.dnf ? 'DNF' : 'P' + (e.position ?? '?')}<span class="faint" style="font-size:11px">/${e.gridSize ?? '?'}</span></div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Punti', en: 'Points' })}</div><div class="v">+${e.points ?? 0}</div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Giri', en: 'Laps' })}</div><div class="v">${e.laps ?? '—'}</div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Gap vincitore', en: 'To winner' })}</div><div class="v">${Number.isFinite(e.gapMs) ? fmtSecMs(e.gapMs, false).replace('+', '+') : '—'}</div></div>
    </div>
    ${(d.attributions ?? []).map((a) => `
      <div style="display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px dashed var(--line,#ddd)">
        <span class="tag ${a.kind === 'good' ? 'green' : a.kind === 'bad' ? 'bad' : ''}" style="min-width:120px;text-align:center">${esc(a.title)}</span>
        <span style="flex:1">${esc(a.text)}</span>
      </div>`).join('')}
    ${(d.narrative ?? []).length ? `<details style="margin-top:10px"><summary class="muted" style="cursor:pointer">${tr({ it: "il racconto dell'ingegnere", en: "the engineer's story" })}</summary>
      <div style="margin-top:8px;font-size:12.5px;line-height:1.55">${(d.narrative ?? []).map((t) => `<div style="margin:4px 0">• ${esc(t)}</div>`).join('')}</div></details>` : ''}`;
}

/* -------------------- 2) TETTO TEORICO -------------------- */
function renderTetto(host, d){
  if (!host) return;
  if (d?.error || !d?.ok) {
    host.innerHTML = `<h2>🏔️ ${tr({ it: 'Tetto teorico', en: 'Theoretical ceiling' })}</h2><div class="empty">${esc(d?.error ?? '?')}</div>`;
    return;
  }
  if (!d.perTrack.length) {
    host.innerHTML = `<h2>🏔️ ${tr({ it: 'Tetto teorico', en: 'Theoretical ceiling' })}</h2>
      <div class="empty">${esc(d.hint ?? '')}</div>`;
    return;
  }
  host.innerHTML = `<h2>🏔️ ${tr({ it: 'Tetto teorico', en: 'Theoretical ceiling' })} <span class="h-act">${tr({ it: 'margine = best reale − giro teorico (somma dei tuoi settoriali)', en: 'margin = real best − theoretical lap (sum of your best sectors)' })}</span></h2>
    <table><thead><tr><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Gare', en: 'Races' })}</th>
      <th class="right">${tr({ it: 'Margine migliore', en: 'Best margin' })}</th><th class="right">${tr({ it: 'Ultimo margine', en: 'Last margin' })}</th>
      <th>${tr({ it: 'Reparto che pesa', en: 'Costliest sector' })}</th></tr></thead>
    <tbody>${d.perTrack.map((t) => `<tr>
      <td><b>${esc(t.track)}</b></td>
      <td class="right">${t.sessions}</td>
      <td class="right">${fmtSecMs(t.marginBestMs, false).replace('+', '')}</td>
      <td class="right">${fmtSecMs(t.marginLastMs, false)}</td>
      <td>${t.worstSector != null ? `<span class="tag red">S${t.worstSector}</span> <span class="muted">${fmtSecMs(t.worstSectorDeltaMs, false).replace('+', '+')}</span>` : '—'}</td>
    </tr>`).join('')}</tbody></table>
    ${d.worstSectors?.length ? `<div style="margin-top:10px"><b class="muted" style="font-size:12px">${tr({ it: 'I settori peggiori della carriera:', en: 'Worst career sectors:' })}</b>
      <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">${d.worstSectors.map((w) => `<span class="chip" style="font-size:11px">${esc(w.track ?? '?')} S${w.sector} ${fmtSecMs(w.deltaMs, false)}</span>`).join('')}</div></div>` : ''}`;
}

/* -------------------- 3) BANCO A/B DEI SETUP -------------------- */
async function renderAB(host){
  if (!host) return;
  host.innerHTML = `<h2>⚖️ ${tr({ it: 'Banco A/B dei setup', en: 'Setup A/B bench' })} <span class="h-act">${tr({ it: 'due sessioni MoTeC, il diff e il tempo perso per zona', en: 'two MoTeC sessions, the channel diff and time lost per zone' })}</span></h2>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center">
      <select id="ab-a" style="min-width:250px"><option value="">${tr({ it: 'sessione A (base)…', en: 'session A (base)…' })}</option></select>
      <select id="ab-b" style="min-width:250px"><option value="">${tr({ it: 'sessione B (prova)…', en: 'session B (trial)…' })}</option></select>
      <button class="mini acc" id="ab-go">${tr({ it: 'Confronta', en: 'Compare' })}</button>
    </div>
    <div id="ab-note" class="muted" style="margin-top:8px;text-align:center;font-size:12px">${tr({ it: 'EVO registra il setup nel nome file (preset_…): due preset in due sessioni = un confronto A/B giusto.', en: "EVO stores the setup in the file name (preset_…): two presets across two sessions make a fair A/B." })}</div>`;
  let list = [];
  try {
    const d = await api('ab-list');
    list = d.sessions ?? [];
  } catch { /* senza telemetria i select restano vuoti */ }
  const opt = (s) => `<option value="${esc(s.file)}">${esc(s.car)} · ${esc(s.track)} · ${esc(s.when)}</option>`;
  $('#ab-a', host).innerHTML += list.map(opt).join('');
  $('#ab-b', host).innerHTML += list.map(opt).join('');
  $('#ab-go', host).onclick = async () => {
    const a = $('#ab-a', host).value, b = $('#ab-b', host).value;
    if (!a || !b) return toast(tr({ it: 'Scegli le due sessioni (A e B).', en: 'Pick the two sessions (A and B).' }), 'err');
    if (a === b) return toast(tr({ it: 'A e B non possono essere la stessa sessione.', en: 'A and B cannot be the same session.' }), 'err');
    const btn = $('#ab-go', host);
    btn.disabled = true; btn.textContent = tr({ it: 'Analizzo…', en: 'Analysing…' });
    try {
      const d = await api('ab-setup', { fileA: a, fileB: b });
      if (d.error) return toast(d.error, 'err');
      const sign = (v, fixed = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${dec(Number(v).toFixed(fixed))}`);
      modal(tr({ it: 'Banco A/B — confronto', en: 'A/B bench — comparison' }), `
        <div class="grid2" style="margin-bottom:12px">
          <div class="kpi"><div class="l">A · ${esc(d.A.preset ?? '?')}</div><div class="v">${d.A.bestLapSec != null ? dec(Number(d.A.bestLapSec).toFixed(2)) + 's' : '—'}</div><div class="faint" style="font-size:11px">${esc(d.A.file ?? '')} · ${d.A.laps ?? '?'} ${tr({ it: 'giri', en: 'laps' })}</div></div>
          <div class="kpi"><div class="l">B · ${esc(d.B.preset ?? '?')}</div><div class="v">${d.B.bestLapSec != null ? dec(Number(d.B.bestLapSec).toFixed(2)) + 's' : '—'}</div><div class="faint" style="font-size:11px">${esc(d.B.file ?? '')} · ${d.B.laps ?? '?'} ${tr({ it: 'giri', en: 'laps' })}</div></div>
        </div>
        ${d.deltaBest != null ? `<div class="banner ${d.deltaBest > 0 ? 'good' : 'warn'}" style="margin-bottom:12px">${d.deltaBest > 0 ? 'A più lento' : 'B più lento'}: differenza giro-best ${sign(d.deltaBest, 2).replace('+', '')}s</div>` : ''}
        <table><thead><tr><th>${tr({ it: 'Canale', en: 'Channel' })}</th><th class="right">A</th><th class="right">B</th><th class="right">${tr({ it: 'Δ (B−A)', en: 'Δ (B−A)' })}</th></tr></thead>
        <tbody>${d.rows.map((r) => `<tr><td>${esc(r.k)}</td><td class="right">${r.a ?? '—'}</td><td class="right">${r.b ?? '—'}</td><td class="right ${r.delta == null ? '' : r.k.startsWith('s') && r.delta < 0 ? 'good' : ''}">${r.delta == null ? '—' : sign(r.delta, r.fixed)}</td></tr>`).join('')}</tbody></table>
        <div class="banner" style="margin-top:12px">⏱️ ${esc(d.zonesText)}</div>
        <div class="muted" style="margin-top:8px;font-size:12px">${tr({ it: 'Tempo perso: ', en: 'Time lost: ' })}${dec((d.lostS ?? 0).toFixed(2))}s · ${tr({ it: 'tempo guadagnato: ', en: 'time gained: ' })}${dec((d.gainedS ?? 0).toFixed(2))}s</div>`,
        [[tr({ it: 'Chiudi', en: 'Close' }), 'ghost', () => {}]]);
    } catch (e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = tr({ it: 'Confronta', en: 'Compare' });
  };
}

/* -------------------- 4) MONTE CARLO DEI SEDILI -------------------- */
function renderMC(host, d){
  if (!host) return;
  if (d?.error || !d?.ok) {
    host.innerHTML = `<h2>🎲 ${tr({ it: 'Monte Carlo del sedile', en: 'Seat Monte Carlo' })}</h2><div class="empty">${esc(d?.error ?? '?')}</div>`;
    return;
  }
  const b = d.basis ?? {};
  host.innerHTML = `<h2>🎲 ${tr({ it: 'Monte Carlo del sedile', en: 'Seat Monte Carlo' })} <span class="h-act">${d.sims} ${tr({ it: 'stagioni per sedile', en: 'seasons per seat' })}</span></h2>
    <div class="muted" style="font-size:12px;margin-bottom:10px">
      ${tr({ it: 'Proiezione dal', en: 'Projected from' })} <b>${esc(b.current ?? '?')}</b>: ${b.paceOffset != null ? (b.paceOffset > 0 ? '+' : '') + b.paceOffset : '—'} ${tr({ it: 'dal centro serie (base+trim)', en: 'from the series centre (base+trim)' })}
      · ${tr({ it: 'variabilità', en: 'variability' })} σ ${b.variability ?? '—'} ${tr({ it: 'su', en: 'over' })} ${b.racesMeasured ?? 0} ${tr({ it: 'gare vere', en: 'real races' })} · DNF ${b.dnfRate ?? '—'}%
      ${b.fromOffers ? tr({ it: ' · candidati = le offerte di fine stagione', en: ' · candidates = end-of-season offers' }) : tr({ it: ' · candidati = serie aperte col gate superato', en: ' · candidates = open series with the gate passed' })}
    </div>
    ${d.seats.length ? `<table><thead><tr>
      <th>${tr({ it: 'Sedile', en: 'Seat' })}</th><th class="right">${tr({ it: 'Punti/ronda', en: 'Pts/round' })}</th>
      <th class="right">${tr({ it: 'Punti stagione', en: 'Season pts' })}</th><th class="right">${tr({ it: 'Posto mediano', en: 'Median pos' })}</th>
      <th class="right">${tr({ it: 'Podio', en: 'Podium' })}</th><th class="right">${tr({ it: 'Vittorie', en: 'Wins' })}</th>
      <th class="right">${tr({ it: 'Titolo', en: 'Title' })}</th><th class="right">${tr({ it: 'Top 3 in classifica', en: 'Top 3 in standings' })}</th>
      <th class="right">${tr({ it: 'Premio atteso', en: 'Expected prize' })}</th><th class="right">${tr({ it: 'Saldo stagione', en: 'Season balance' })}</th>
      </tr></thead><tbody>
      ${d.seats.map((s) => `<tr>
        <td><b>${esc(s.display)}</b>${s.note ? ` <span class="tag ${s.note === 'rinnovo' ? '' : ''}" style="font-size:10px">${esc(s.note)}</span>` : ''}
          <div class="faint" style="font-size:11px">${s.gridSize ?? '?'} ${tr({ it: 'auto', en: 'cars' })} · ${s.rounds} ${tr({ it: 'ronde', en: 'rounds' })}${s.access === 'closed' ? ' · ' + tr({ it: 'parco chiuso (solo contratto)', en: 'closed grid (contract only)' }) : ''}</div></td>
        <td class="right">${s.expPointsPerRound}</td>
        <td class="right">${s.expSeasonPoints}</td>
        <td class="right">P${s.medianPos ?? '—'}</td>
        <td class="right">${s.podiumPct}%</td>
        <td class="right">${s.winPct}%</td>
        <td class="right ${s.titlePct >= 40 ? 'good' : ''}">${s.titlePct}%</td>
        <td class="right">${s.top3StandingsPct}%</td>
        <td class="right">${Number(s.expPrizeSeason ?? 0).toLocaleString(window.LOCALE ?? 'it-IT')} €</td>
        <td class="right ${s.netSeason >= 0 ? 'good' : 'bad'}">${Number(s.netSeason ?? 0).toLocaleString(window.LOCALE ?? 'it-IT')} €</td>
      </tr>`).join('')}</tbody></table>
      <div class="muted" style="margin-top:8px;font-size:11.5px">${esc(d.caveat ?? '')}</div>`
      : `<div class="empty">${tr({ it: 'Nessun candidato simulabile al momento.', en: 'No simulable candidate right now.' })}</div>`}`;
}
