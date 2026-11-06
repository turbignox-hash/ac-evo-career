/* viste-analisi.js — tab ANALISI (23/10/2026): quattro strumenti del pilota.
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
    <div id="an-mc" class="panel"></div>
    <div id="an-ab" style="margin-top:12px"></div>`;
  /* BANCO A/B tornato qui in ANALISI (1/11, domanda Mauro: «perché in garage?
     non sta meglio in analizza o setup?»): la sua materia sono I GIRI — due
     sessioni MoTeC, il diff canali e il tempo perso per zona — non i setup vero
     sul disco. Nel Garage era dalla mattina (ebra: «lì si prepara la gara»):
     fuori posto, come sospettava lui. Solo qui, niente doppio viso. */
  renderAutopsia($('#an-autopsia', m), audi);
  renderTetto($('#an-tetto', m), tetto);
  renderMC($('#an-mc', m), mc);
  renderAB($('#an-ab', m)); for (const t of m.querySelectorAll('table')) { const p = t.parentElement; if (p && !p.classList.contains('tscroll') && t.scrollWidth > p.clientWidth) { const w = document.createElement('div'); w.className = 'tscroll'; t.replaceWith(w); w.appendChild(t); } } /* 4/11: la tabella dei sedili misura 1032px e sfondava la pagina di 38px — ora scorre dentro il pannello */
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
  const flOwner = e.fl ? tr({ it: '🏁 firmato da te', en: '🏁 signed by you' }) : esc(d.fastestOfRace?.by ?? '');
  /* MARGINE sul PRECEDENTE (2/11): per P2 e P3 il KPI dice di quanto sei
     dietro chi ti sta davanti in classifica (P2 → P1, P3 → P2). Con giri
     in meno del precedente il tempo non misura il ritmo: il KPI tace ('—')
     e la voce Distanza lo commenta. P4+: resta il gap dal vincitore. */
  const stessoGiri = e.prevLaps != null && e.laps != null ? e.prevLaps === e.laps : false;
  const prevKpi = e.position === 2 || e.position === 3;
  const kpiGapLabel = e.position === 1
    ? tr({ it: 'Margine sul 2°', en: 'Margin to P2' })
    : prevKpi
      ? tr({ it: `Margine su P${e.position - 1}`, en: `Margin to P${e.position - 1}` })
      : tr({ it: 'Gap vincitore', en: 'To winner' });
  const kpiGapValue = e.position === 1
    ? (Number.isFinite(e.secondGapMs) ? fmtSecMs(e.secondGapMs, false) : '—')
    : prevKpi
      ? (Number.isFinite(e.prevGapMs) && stessoGiri ? fmtSecMs(e.prevGapMs, false) : '—')
      : (Number.isFinite(e.gapMs) ? fmtSecMs(e.gapMs, false).replace('+', '+') : '—');
  host.innerHTML = `<h2>🔬 ${tr({ it: 'Autopsia della gara', en: 'Race autopsy' })}
      <span class="h-act">${esc(d.node ?? '')} · S${d.season} R${(d.round ?? 0) + 1}${d.hasRaceRow ? '' : tr({ it: ' · griglia non in archivio', en: ' · grid not in archive' })}</span></h2>
    <div class="grid6" style="margin-bottom:12px">
      <div class="kpi"><div class="l">${tr({ it: 'Esito', en: 'Result' })}</div><div class="v ${e.dnf ? 'bad' : e.position === 1 ? 'good' : ''}">${e.dnf ? 'DNF' : 'P' + (e.position ?? '?')}<span class="faint" style="font-size:12.5px">/${e.gridSize ?? '?'}</span></div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Punti', en: 'Points' })}</div><div class="v">+${e.points ?? 0}</div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Giri', en: 'Laps' })}</div><div class="v">${e.laps ?? '—'}</div></div>
      <div class="kpi"><div class="l">${kpiGapLabel}</div><div class="v">${kpiGapValue}</div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Giro veloce', en: 'Fastest lap' })}</div><div class="v">${esc(e.fl ? (e.bestLap ?? '') : (d.fastestOfRace?.lap ?? e.bestLap ?? '—'))}<span class="faint" style="font-size:12.5px;display:block;margin-top:2px">${flOwner}</span></div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Partenza → arrivo', en: 'Grid → flag' })}</div><div class="v">${e.gridPosition != null ? 'P' + esc(e.gridPosition) + ' → ' + (e.dnf ? 'DNF' : 'P' + (e.position ?? '?')) : '—'}</div></div>
    </div>
    ${(d.attributions ?? []).map((a) => `
      <div style="display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px dashed var(--line,#ddd)">
        <span class="tag ${a.kind === 'good' ? 'green' : a.kind === 'bad' ? 'bad' : ''}" style="min-width:120px;text-align:center">${esc(a.title)}</span>
        <span style="flex:1">${esc(a.text)}</span>
      </div>`).join('')}
    ${(d.narrative ?? []).length ? `<details style="margin-top:10px"><summary class="muted" style="cursor:pointer;font-size:12.5px;text-transform:uppercase;letter-spacing:1.4px">${tr({ it: "Il racconto dell'ingegnere", en: "The engineer's story" })}</summary>
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
  // LA CELLA DELLA BUSTA (3/11, richiesta Mauro): il 0,00 non è quasi sempre un
  // no-score — col campo vivo è un CAMPIONE (tutti i settori del best della
  // griglia sono miei), senza campo è NESUN DATO (nessun rivale con sectoriali
  // misurabili nel file). Aureo/giallo solo sul campione; il nessun-dato
  // resta grigio e muto.
  function bustaCell(t) {
    if (t.campTopDeltaMs == null) {
      return `<span class="muted" title="${tr({
        it: 'nessun avversario con settoriali misurabili nel file: nessun dato, il delta non esiste',
        en: 'no opponent with measurable sector splits in the file: no data, the delta does not exist',
      })}">— ${tr({ it: 'senza dati', en: 'no data' })}</span>`;
    }
    const num = fmtSecMs(t.campTopDeltaMs, false);
    if (t.campTopDeltaMs !== 0) return num;
    return `${num} <span class="tag green" title="${tr({
      it: 'tutti i settori del best della griglia sono tuoi: sei il campione della pista',
      en: 'you hold every best sector of the field: you are the track champion',
    })}">🥇 ${tr({ it: 'campione', en: 'champion' })}</span>`;
  }
  // 2/11, richiesto Mauro: le colonne «Margine migliore» e «Ultimo margine» erano
  // MORTI e sono state SOSTITUITE da «Delta sul campione top» (campTopDeltaMs,
  // già calcolato dal server in tettoReport: la busta più grossa del riparto su
  // quella pista). «Best» mescolava gare di serie/auto diverse (margine non
  // confrontabile); «Ultimo» non era l'ultimo in tempo ma l'ultimo a caso
  // dell'ordine di Object.entries. Righe mostrate: SOLE le campagne con valori
  // VERI (riparto settoriale reale); le altre piste restano fuori con il conto.
  const veri = d.perTrack.filter((t) => t.worstSectorDeltaMs != null);
  if (!veri.length) {
    host.innerHTML = `<h2>🏔️ ${tr({ it: 'Tetto teorico', en: 'Theoretical ceiling' })}</h2>
      <div class="empty">${esc(d.hint ?? '')}</div>`;
    return;
  }
  host.innerHTML = `<h2>🏔️ ${tr({ it: 'Tetto teorico', en: 'Theoretical ceiling' })} <span class="h-act">${tr({ it: 'delta sul campione top = il colpo più grosso del riparto su quella pista · 0,00 con 🥇 campione = i settori del best sono tutti tuoi · «senza dati» = nessun avversario con settoriali misurabili nel file · reparto che pesa = mediana dei delta per settore · picco = il colpo singolo più grosso che la mediana nasconde (es. «S1 0,00s · picco S3 20,25s») · margine vero = best − somma dei migliori settoriali, dai log del gioco giro per giro (positivo = tempo da recuperare; negativo = i settori della sessione non superano il giro accreditato)', en: 'top campaign delta = the biggest hit of the sector split on that track · 0.00 with 🥇 champion = you hold every best sector · «no data» = no opponent with measurable sector splits in the file · costliest sector = median delta per sector · peak = the biggest single hit the median hides (e.g. "S1 0.00s · peak S3 20.25s") · true margin = best − sum of best sectors, read lap-by-lap from the game logs (positive = recoverable time; negative = session sectors do not beat the credited lap)' })}</span></h2>
    <table><thead><tr><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Gare', en: 'Races' })}</th>
      <th class="right">${tr({ it: 'Delta sul campione top', en: 'Top campaign delta' })}</th>
      <th>${tr({ it: 'Reparto che pesa', en: 'Costliest sector' })}</th>
      <th class="right">${tr({ it: 'Margine vero', en: 'True margin' })}</th></tr></thead>
    <tbody>${veri.map((t) => `<tr>
      <td><b>${esc(t.track)}</b></td>
      <td class="right">${t.sessions}</td>
      <td class="right">${bustaCell(t)}</td>
      <td>${t.worstSector != null ? `<span class="tag red">S${t.worstSector}</span> <span class="muted">${fmtSecMs(t.worstSectorDeltaMs, false).replace('+', '+')}</span>${t.picco != null ? ` · <span title="${tr({ it: 'picco: il colpo singolo più grosso che la mediana nasconde', en: 'peak: the biggest single hit the median hides' })}" class="tag" style="color:#f0a93c;border-color:#f0a93c55">${tr({ it: 'picco', en: 'peak' })}</span> ${t.picco.sector !== t.worstSector ? `<span class="tag red">S${t.picco.sector}</span> ` : ''}<span class="muted">${fmtSecMs(t.picco.deltaMs, false).replace('+', '+')}</span>` : ''}` : '—'}</td>
      <td class="right">${t.margineMs != null ? `${fmtSecMs(t.margineMs, false)}${t.margineMs < 0 ? ` <span class="tag" style="color:#f0a93c;border-color:#f0a93c55" title="${tr({ it: 'margine negativo: nel log del gioco i settori battono il giro accreditato — ma quel giro (vigliettato, fuori pista o di uscita) NON è stato accreditato dal gioco, conta solo a settori; il margine valuta anche quel potenziale, non un tempo riconosciuto', en: 'negative margin: in the game log the sectors beat the credited lap — but that lap (flagged, off track or an out lap) was NOT credited by the game, it counts only as sectors; the margin prices that potential too, not a time the game accepts' })}">⚠ ${tr({ it: 'giro non accreditato', en: 'uncredited lap' })}</span>` : ''}` : '—'}</td>
    </tr>`).join('')}</tbody></table>
    ${veri.some((t) => t.margineMs != null && t.margineMs < 0) ? `<div class="muted" style="margin-top:6px;font-size:12.5px">⚠ ${tr({ it: 'margine negativo: nei log del gioco esiste potenziale settoriale più veloce del giro che il gioco ha accreditato (es. ultima passata con settori validi ma giro non accreditato, vigliettato o fuori pista): è potenziale nascosto, non un tempo riconosciuto', en: 'negative margin: the game logs hold sector potential faster than the lap the game credited (e.g. a final flyer with valid sectors whose lap was not credited — flagged or off track): hidden potential, not a recognized time' })}</div>` : ''}
    ${veri.length < d.perTrack.length ? `<div class="muted" style="margin-top:6px;font-size:12.5px">${d.perTrack.length - veri.length} ${tr({ it: 'piste senza riparto settoriale vero: fuori dalla tabella', en: 'tracks without a real sector split: not listed' })}</div>` : ''}
    ${d.worstSectors?.length ? `<div style="margin-top:10px"><b class="muted" style="font-size:12.5px">${tr({ it: 'I settori peggiori della carriera:', en: 'Worst career sectors:' })}</b>
      <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">${d.worstSectors.map((w) => `<span class="chip" style="font-size:12.5px">${esc(w.track ?? '?')} S${w.sector} ${fmtSecMs(w.deltaMs, false)}</span>`).join('')}</div></div>` : ''}`;
}

/* — QUADRO-ZONE (1/11): la striscia del giro — DOVE il netto A/B nasce,      */
/*   punto per punto, con la stessa soglia zona del riparto del server.       */
/*   Nata dall'A/B su Imola: il TOTALE per zona c'era già, ma il «dove» era   */
/*   rimasto in numeri. Segmenti: colorati per zona, alti quanto il tempo     */
/*   perso (sopra la riga) o guadagnato (sotto) su quella fetta di giro.      */
const AB_ZONE_TINT = { frenata: '#e15b64', uscita: '#f0a93c', gas: '#4bbf73' };
const abZoneLabel = (z) => (z === 'frenata' ? tr({ it: 'frenata', en: 'braking' }) : z === 'uscita' ? tr({ it: 'uscita', en: 'exit' }) : tr({ it: 'gas', en: 'throttle' }));
function abZoneStrip(zl, points = 240) {
  if (!zl?.segs?.length) return '';
  // RINFORZO (2/11): i secondi per zona e il netto, dalla STESSA striscia —
  // le sommo qui così pannello e modale regalano la stessa cifra persa/guadagnata.
  // REGISTRO (2/11, richiesta Mauro «confronta il riparto del banco con
  // quello del quadro-zone e segnala se non tornano»): il server li manda
  // già sommati (zl.somme) con il verdetto a scarti (zl.check) — niente più
  // doppie somme in vista, il pannello parla con lo stesso numero del banco.
  const tot = zl.somme ?? (() => { const t = { frenata: 0, uscita: 0, gas: 0 }; for (const g of zl.segs) if (g.zone in t) t[g.zone] += g.s; return t; })();
  const net = +(tot.frenata + tot.uscita + tot.gas).toFixed(2);
  const H = 48, BASE = H - 14;
  const maxAbs = Math.max(...zl.segs.map((g) => Math.abs(g.s)), 0.05);
  const body = zl.segs.map((g) => {
    const x = +(g.x1 * points).toFixed(1), w = Math.max(1.2, (g.x2 - g.x1) * points);
    const h = Math.max(3, Math.round((Math.abs(g.s) / maxAbs) * (BASE - 6)));
    const col = AB_ZONE_TINT[g.zone] ?? AB_ZONE_TINT.gas;
    const tip = `${abZoneLabel(g.zone)}: ${g.s > 0 ? '+' : '−'}${Math.abs(g.s).toFixed(2)}s ${g.s > 0 ? tr({ it: 'perso da A', en: 'lost by A' }) : tr({ it: 'guadagnati da A', en: 'gained by A' })}`;
    const y = g.s > 0 ? BASE - h : BASE;
    return `<g><title>${esc(tip)}</title><rect x="${+x.toFixed(1)}" y="${y.toFixed(1)}" width="${+w.toFixed(1)}" height="${h}" fill="${col}" opacity="${g.s > 0 ? '0.92' : '0.45'}"/>${g.s < 0 ? `<line x1="${+x.toFixed(1)}" x2="${+(x + w).toFixed(1)}" y1="${(BASE + h / 2).toFixed(1)}" y2="${(BASE + h / 2).toFixed(1)}" stroke="${col}" stroke-width="1"/>` : ''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${points} ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="display:block;background:rgba(255,255,255,0.04);border:1px solid var(--line,#ddd);border-radius:6px" role="img">
      <line x1="0" x2="${points}" y1="${BASE}" y2="${BASE}" stroke="var(--line,#999)" stroke-width="0.6"/>
      ${body}</svg>
    <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;margin-top:3px;align-items:baseline">
      ${['frenata', 'uscita', 'gas'].map((z) => {
        const v = (tot[z] ?? 0);
        // RINFORZO (2/11, richiesta Mauro): il colore dice la zona, il NUMERO
        // dice quanto — niente più leggere i secondi solo col tooltip.
        return `<span><span style="color:${AB_ZONE_TINT[z]}">■</span> ${esc(abZoneLabel(z))} <b style="color:${AB_ZONE_TINT[z]}">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}s</b></span>`;
      }).join('')}
      <span class="muted" style="font-size:12.5px">${tr({ it: 'netto', en: 'net' })} <b style="color:${net >= 0 ? '#e15b64' : '#4bbf73'}">${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(2)}s</b></span>
      <span class="muted" style="margin-left:auto;font-size:12.5px">${tr({ it: 'in alto: tempo perso da A · in basso (tratteggiato): guadagnato', en: 'above the line: lost by A · below (hatched): gained' })}</span>
    </div>
    ${abZoneVerdetto(zl)}`;
}

/* — verdetto del REGISTRO (2/11, richiesta Mauro): la striscia dichiara se
/* torna col riparto del banco — verde «tornano», giallo con gli scarti in fila
/* quando non tornano (zona per zona, e netto vs lostS−gainedS). Il pannello ha
/* una sola fonte di verità: il check fatto LENTAMENTE sul server — la GUI solo
/* lo racconta. */
function abZoneVerdetto(zl) {
  const chk = zl?.check;
  if (!chk) return '';
  const fmt = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}s`;
  const lbl = (z) => (z === 'netto' ? tr({ it: 'netto', en: 'net' }) : abZoneLabel(z));
  if (chk.ok) {
    const extra = chk.netRiparto != null ? ` — ${tr({ it: 'netto', en: 'net' })} <b>${fmt(chk.netto)}</b> ${tr({ it: 'vs', en: 'vs' })} <b>${fmt(chk.netRiparto)}</b>` : '';
    return `<div class="muted" style="font-size:12.5px;margin-top:3px">✔ ${tr({ it: 'registro: striscia e riparto del banco tornano', en: 'ledger: strip and bench split agree' })}${extra}</div>`;
  }
  const scarti = (chk.scarti ?? []).map((s) => `${esc(lbl(s.zone))} striscia <b>${fmt(s.striscia)}</b> ${tr({ it: 'vs riparto', en: 'vs split' })} <b>${fmt(s.riparto)}</b>`);
  return `<div style="font-size:12.5px;margin-top:3px;color:#f0a93c">⚠ ${tr({ it: 'registro: NON tornano', en: 'ledger: they do NOT agree' })} — ${scarti.join(' · ')}</div>`;
}

/* -------------------- 3) BANCO A/B DEI SETUP -------------------- */
async function renderAB(host){
  if (!host) return;
  host.innerHTML = `<h2>⚖️ ${tr({ it: 'Banco A/B dei setup', en: 'Setup A/B bench' })} <span class="h-act">${tr({ it: 'due sessioni MoTeC, il diff e il tempo perso per zona', en: 'two MoTeC sessions, the channel diff and time lost per zone' })}</span></h2>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;margin-bottom:6px">
      <select id="ab-f-car" style="flex:1 1 180px;min-width:0;max-width:100%"><option value="">${tr({ it: 'tutte le auto…', en: 'all cars…' })}</option></select>
      <select id="ab-f-track" style="flex:1 1 180px;min-width:0;max-width:100%"><option value="">${tr({ it: 'tutte le piste…', en: 'all tracks…' })}</option></select>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center">
      <select id="ab-a" style="flex:1 1 220px;min-width:0;max-width:100%"><option value="">${tr({ it: 'sessione A (base)…', en: 'session A (base)…' })}</option></select>
      <select id="ab-b" style="flex:1 1 220px;min-width:0;max-width:100%"><option value="">${tr({ it: 'sessione B (prova)…', en: 'session B (trial)…' })}</option></select>
      <button class="mini acc" id="ab-go">${tr({ it: 'Confronta', en: 'Compare' })}</button>
    </div>
    <div id="ab-note" class="muted" style="margin-top:8px;text-align:center;font-size:12.5px">${tr({ it: 'EVO registra il setup nel nome file (preset_…): due preset in due sessioni = un confronto A/B giusto.', en: "EVO stores the setup in the file name (preset_…): two presets across two sessions make a fair A/B." })}</div>
    <div id="ab-cnt" class="muted" style="margin-top:4px;text-align:center;font-size:12.5px"></div>`;
  let list = [];
  let senza = [];
  let prefer = null;
  let last = null;
  try {
    const d = await api('ab-list');
    list = d.sessions ?? [];
    /* SENZA GIRO CRONOMETRATO (2/11, richiesta Mauro): il server prova i
       beacon del .ldx e ESCLUDE le voci 0-beacon da `sessions`; qui le
       leggiamo da `senzaGiri` e le rimettiamo in menu DISABILITATE, sotto
       l'etichetta del gruppo — visibili ma non puntabili (non diventano
       A né B per un «confronto» che non esisterebbe: out-lap morti fuori).
       Stessi filtri delle voci attive e stesso `opt`: il giorno completo
       resta leggibile anche in voce spenta. */
    senza = d.senzaGiri ?? [];
    prefer = d.prefer ?? null;
    last = d.last ?? null;
  } catch { /* senza telemetria i select restano vuoti */ }
  /* CONTATORE DEL FOOT (3/11, richiesta Mauro: «senzaGiri (0 beacon) nel contatore
     delle sessioni del foot, per accorgersene a colpo d'occhio»): la riga sotto
     alla nota conta DAL DISCO, non coi filtri — N sessioni cronometrate, e le
     0 beacon SOLO se ci sono, col numero in evidenza e il nome che ha già la
     coda del menu («senza giri (0 beacon)»): i gruppi muto del menu lo
     raccontano solo col menu APERTO, la voce del foot lo dice SEMPRE. */
  const cnt = $('#ab-cnt', host);
  if (cnt) cnt.innerHTML = `${list.length} ${tr({ it: 'sessioni cronometrate', en: 'timed sessions' })}${senza.length ? ` · <b style="color:var(--warn,#ffb454)">${senza.length} ${tr({ it: 'senza giri (0 beacon)', en: 'without timed laps (0 beacons)' })}</b>` : ''}`;
  if (!list.length && $('#ab-note', host)) $('#ab-note', host).textContent = tr({
    it: 'Nessuna sessione MoTeC ancora: il banco si attiva da solo dopo la prima uscita in pista (EVO scrive il file .ld quando chiudi la sessione).',
    en: 'No MoTeC session yet: the bench fills up by itself after the first track outing (EVO writes the .ld file when you close the session).',
  });
  /* GIORNO NELLA VOCE (2/11, richiesta Mauro: «mostra il giorno completo anche
     dentro le voci dei menu A/B, non solo nel titolo del gruppo»): l'optgroup
     mostra il titolo solo quando il menu è aperto in pochi browser — la voce
     chiusa e i riferimenti (note, modale) vedono soltanto il testo dell'option,
     che ora porta AUTO · PISTA · GIORNO ORA e regge da solo quando il gruppo
     non si vede. */
  /* DISABLED (2/11): flag degli out-lap — value resta il .ld (la spunta non
     si muove, ma un confronto su quelle voci non può nascere). */
  const opt = (s, dis) => `<option value="${esc(s.file)}"${dis ? ' disabled' : ''}>${esc(s.car || '—')} · ${esc(s.track || '—')} · ${esc(abGiorno(s))} ${esc(abOra(s))}</option>`;
  /* GIORNO DELLA SESSIONE (2/11, richiesta Mauro): i menu A/B si raggruppano
     per GIORNO (optgroup), oltre ai filtri auto/pista — due gare sulla STESSA
     pista restano distinte pure dentro lo stesso gruppo (l'orario distingue);
     in giorni diversi finiscono in gruppi diversi e si vedono subito.
     DATARIO VERO (2/11): la data/ora è sessionMs (token dal nome file:
     «…_Sat Sep 26 193715 2026.ld»), non il mtime — copiando i .ld in blocco
     tutti prendevano l'orario della copia («22:08 del 25/10») e le MX-5 di
     Imola restavano indistinguibili a menu. Fallback mtimeMs per i nomi
     senza token; il when del server (stringa 'it-IT') non si ripara in EN. */
  const abData = (s) => new Date(s.sessionMs ?? s.mtimeMs ?? Date.parse(s.when) ?? Date.now());
  const abGiorno = (s) => abData(s).toLocaleDateString(window.LOCALE === 'en-US' ? 'en-GB' : 'it-IT', { day: '2-digit', month: 'numeric', year: 'numeric' });
  const abOra = (s) => abData(s).toLocaleTimeString(window.LOCALE === 'en-US' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' });
  /* DATA NEL MODALE (3/11, richiesta Mauro: «mostra anche la data di ogni
  sessione accanto al nome file»): i due cartoncini del confronto portano
  il nome file, ma la data DEVE venire dalla SESSIONE della list (token
  sessionMs dal nome file, non dal mtime — la lezione del datario 2/11 vale
  anche qua); sessione sparita dalla lista = niente data, il cartoncino
  resta leggibile solo col nome file. */
  const dataDi = (f) => {
    const s = list.find((x) => x.file === f);
    return s ? `${abGiorno(s)} ${abOra(s)}` : '';
  };
  /* FILTRI A/B (1/11): auto e pista selezionabili. Con una decina di sessioni
     sparse su più auto e piste, i due menu di sessione diventano lunghi da
     scorrere: i filtri restringono le opzioni SENZA azzerare le scelte già
     fatte (A/B restano selezionati finché la sessione è ancora visibile). */
  const notaBase = $('#ab-note', host)?.textContent ?? '';
  const uniqSorted = (key) => Array.from(new Set(list.map((s) => String(s[key] ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  $('#ab-f-car', host).innerHTML += uniqSorted('car').map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $('#ab-f-track', host).innerHTML += uniqSorted('track').map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const riempiMenu = () => {
    const fc = $('#ab-f-car', host).value, ft = $('#ab-f-track', host).value;
    const visibili = list.filter((s) => (!fc || String(s.car ?? '') === fc) && (!ft || String(s.track ?? '') === ft));
    for (const id of ['#ab-a', '#ab-b']) {
      const sel = $(id, host), prima = sel.value;
      // voci raggruppate per giorno (2/11): primo giorno visto = primo gruppo
      const gruppi = [];
      const visto = new Map();
      for (const s of visibili) {
        const g = abGiorno(s);
        if (!visto.has(g)) { visto.set(g, gruppi.length); gruppi.push({ titolo: g, ses: [] }); }
        gruppi[visto.get(g)].ses.push(s);
      }
      /* ESCLUSE (2/11): gruppo muto «senza giri cronometrati» in fondo,
         colgap per auto/pista degli stessi filtri; nessun match = niente
         footer visibile, il menu respira. */
      const escluse = senza.filter((s) => (!fc || String(s.car ?? '') === fc) && (!ft || String(s.track ?? '') === ft));
      sel.innerHTML = sel.options[0].outerHTML + gruppi.map((gr) => `<optgroup label="${esc(gr.titolo)}">${gr.ses.map(opt).join('')}</optgroup>`).join('')
        + (escluse.length ? `<optgroup label="${esc(tr({ it: 'senza giri cronometrati', en: 'no timed laps' }))}">${escluse.map((s) => opt(s, true)).join('')}</optgroup>` : '');
      if (prima && visibili.some((s) => s.file === prima)) sel.value = prima;
    }
    if ($('#ab-note', host)) $('#ab-note', host).textContent = visibili.length ? notaBase
      : tr({ it: 'Nessuna sessione con questi filtri: azzera auto o pista.', en: 'No session with these filters: reset car or track.' });
  };
  $('#ab-f-car', host).onchange = () => guardoConfronto();   // chiamata DEFERITA: la funzione è dichiarata più sotto; al cambio filtri risistema bordi e nota
  $('#ab-f-track', host).onchange = () => guardoConfronto();
  riempiMenu();
  /* AUTOPUNTAMENTO (2/11, richiesta Mauro: «seleziona le due sessioni di Imola
     MX-5»): con i menu vergini il banco si punta DA SOLO sulla coppia dominante
     calcolata dal server (abPreferite): filtri al binomio (menu ripuliti:

     solo le sessioni di quella auto su quella pista) e A = la più vecchia,
     B = la più recente. Una scelta già fatta dal pilota vince SEMPRE: il
     default passa solo quando i menu non hanno niente. */
  const inlist = (f) => list.some((s) => s.file === f);
  const puntata = (q) => {
    if (!q || !inlist(q.fileA) || !inlist(q.fileB)) return false;
    $('#ab-f-car', host).value = q.car ?? '';
    $('#ab-f-track', host).value = q.track ?? '';
    riempiMenu();
    $('#ab-a', host).value = q.fileA;
    $('#ab-b', host).value = q.fileB;
    return true;
  };
  // AUTOPUNTAMENTO (2/11, richiesta Mauro «seleziona le due sessioni di Imola
  // MX-5»): primo il banco richiama l'ULTIMA comparazione riuscita (last, nel
  // save); in assenza cade sul prefer del server (coppia dominante). Una
  // selezione appena fatta dal pilota vince su entrambe: si vede solo se i
  // menu partono vergini.
  if (!$('#ab-a', host).value && !$('#ab-b', host).value) {
    if (!puntata(last)) puntata(prefer);
  }
  /* CONFRONTO GIUSTO (1/11, richiesta Mauro): quando A e B sono scelte, auto e
     pista devono coincidere — altrimenti avviso visibile (bordo dei menu + nota).
     La scelta resta all'utente, ma il banco difetta. Stessa regola di
     tracknames.mjs: uguaglianza o prefisso, in entrambe le direzioni (il gioco
     aggiunge versioni/varianti ai nomi: «Mazda RX-7 FD» vs «… Spirit R»),
     lato sconosciuto NON nega il match. */
  const normAB = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const stessoAB = (x, y) => { const a = normAB(x), b = normAB(y); return !a || !b ? true : a === b || a.startsWith(b) || b.startsWith(a); };
  const divergono = (sa, sb) => {
    if (!sa || !sb) return [];
    const parti = [];
    if (!stessoAB(sa.car, sb.car)) parti.push(tr({ it: `auto ${sa.car} ≠ ${sb.car}`, en: `car ${sa.car} ≠ ${sb.car}` }));
    if (!stessoAB(sa.track, sb.track)) parti.push(tr({ it: `pista ${sa.track} ≠ ${sb.track}`, en: `track ${sa.track} ≠ ${sb.track}` }));
    return parti;
  };
  const guardoConfronto = () => {
    const nota = $('#ab-note', host);
    const sa = list.find((s) => s.file === $('#ab-a', host)?.value) ?? null;
    const sb = list.find((s) => s.file === $('#ab-b', host)?.value) ?? null;
    const parti = divergono(sa, sb);
    for (const id of ['#ab-a', '#ab-b']) {
      const el = $(id, host);
      if (el) el.style.borderColor = parti.length ? 'var(--warn,#ffb454)' : '';
    }
    if (parti.length) {
      if (nota) nota.innerHTML = `⚠️ <b style="color:var(--warn,#ffb454)">${tr({ it: 'Non è un confronto giusto', en: 'Not a fair comparison' })}</b> (${esc(parti.join(' · '))}): ${tr({ it: 'macchine o piste diverse danno tempi non paragonabili.', en: 'different cars or tracks give non-comparable lap times.' })}`;
    } else riempiMenu();   // la nota torna quella giusta (base o «nessuna con filtri»)
  };
  $('#ab-a', host).onchange = guardoConfronto;
  $('#ab-b', host).onchange = guardoConfronto;
  guardoConfronto();
  $('#ab-go', host).onclick = async () => {
    const a = $('#ab-a', host).value, b = $('#ab-b', host).value;
    if (!a || !b) return toast(tr({ it: 'Scegli le due sessioni (A e B).', en: 'Pick the two sessions (A and B).' }), 'err');
    if (a === b) return toast(tr({ it: 'A e B non possono essere la stessa sessione.', en: 'A and B cannot be the same session.' }), 'err');
    const partiAB = divergono(list.find((s) => s.file === a) ?? null, list.find((s) => s.file === b) ?? null);
    const btn = $('#ab-go', host);
    btn.disabled = true; btn.textContent = tr({ it: 'Analizzo…', en: 'Analysing…' });
    try {
      const d = await api('ab-setup', { fileA: a, fileB: b });
      if (d.error) return toast(d.error, 'err');
      const sign = (v, fixed = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${dec(Number(v).toFixed(fixed))}`);
      /* AVVISO GIRO SINGOLO (3/11, richiesta Mauro: «un avviso quando una delle
         due sessioni ha un solo giro valido») — i confronti storti si vedono a
         colpo d'occhio. Lezione dell'indagine odierna (Monza 296 · 18:13,
         «best» 133,10s): se il .ldx non ha beacon il parser tratta la SESSIONE
         INTERA come unico giro, e quel «best» è la durata della uscita, non un
         giro. Quindi 1 giro valido ≠ sempre un giro vero: puo essere un
         out-lap senza cronometro. Il confronto resta possibile (chance di
         esito legittimo con un solo giro secco), ma va VISIBILITÀ: banner in
         testa, sempre, quando A o B arriva con un solo giro. */
      const unSoloGiro = (d.A.laps === 1 || d.B.laps === 1)
        ? d.A.laps === 1 && d.B.laps === 1 ? 'AB' : (d.A.laps === 1 ? 'A' : 'B') : null;
      const avvisoGiro = unSoloGiro ? `<div class="banner warn" style="margin-bottom:12px">⚠️ <b>${esc(tr({ it: 'Attenzione: un solo giro valido', en: 'Careful: only one valid lap' }))}</b> — ${esc(unSoloGiro === 'AB'
        ? tr({ it: 'entrambe le sessioni portano un solo giro: il «best» può essere un out-lap senza transito cronometrato (nessun beacon), guardalo prima di fidarlo.', en: 'both sessions have a single lap: the “best” may be an out-lap with no timed crossing (no beacons) — check it before trusting it.' })
        : tr({ it: `la sessione ${unSoloGiro} ha un solo giro: il «best» può essere un out-lap senza transito cronometrato (nessun beacon), guardalo prima di fidarlo.`, en: `session ${unSoloGiro} has a single lap: the “best” may be an out-lap with no timed crossing (no beacons) — check it before trusting it.` }))}</div>` : '';
      modal(tr({ it: 'Banco A/B — confronto', en: 'A/B bench — comparison' }), `
        <div class="grid2" style="margin-bottom:12px">
          <div class="kpi"><div class="l">A · ${esc(d.A.preset ?? '?')}</div><div class="v">${d.A.bestLapSec != null ? dec(Number(d.A.bestLapSec).toFixed(2)) + 's' : '—'}</div><div class="faint" style="font-size:12.5px">${esc(d.A.file ?? '')}${dataDi(a) ? ` · ${esc(dataDi(a))}` : ''} · ${d.A.laps ?? '?'} ${tr({ it: 'giri', en: 'laps' })}</div></div>
          <div class="kpi"><div class="l">B · ${esc(d.B.preset ?? '?')}</div><div class="v">${d.B.bestLapSec != null ? dec(Number(d.B.bestLapSec).toFixed(2)) + 's' : '—'}</div><div class="faint" style="font-size:12.5px">${esc(d.B.file ?? '')}${dataDi(b) ? ` · ${esc(dataDi(b))}` : ''} · ${d.B.laps ?? '?'} ${tr({ it: 'giri', en: 'laps' })}</div></div>
        </div>
        ${avvisoGiro}
        ${d.deltaBest != null ? `<div class="banner ${d.deltaBest > 0 ? 'good' : 'warn'}" style="margin-bottom:12px">${d.deltaBest > 0 ? 'A più lento' : 'B più lento'}: differenza giro-best ${sign(d.deltaBest, 2).replace('+', '')}s</div>` : ''}
        ${partiAB.length ? `<div class="banner warn" style="margin-bottom:12px">⚠️ <b>${esc(tr({ it: 'Non è un confronto giusto', en: 'Not a fair comparison' }))}</b> (${esc(partiAB.join(' · '))}): ${tr({ it: 'stai confrontando tempi fra macchine o piste diverse.', en: 'you are comparing lap times across different cars or tracks.' })}</div>` : ''}
        <table><thead><tr><th>${tr({ it: 'Canale', en: 'Channel' })}</th><th class="right">A</th><th class="right">B</th><th class="right">${tr({ it: 'Δ (B−A)', en: 'Δ (B−A)' })}</th></tr></thead>
        <tbody>${d.rows.map((r) => `<tr><td>${esc(r.k)}</td><td class="right">${r.a ?? '—'}</td><td class="right">${r.b ?? '—'}</td><td class="right ${r.delta == null ? '' : r.k.startsWith('s') && r.delta < 0 ? 'good' : ''}">${r.delta == null ? '—' : sign(r.delta, r.fixed)}</td></tr>`).join('')}</tbody></table>
        <div class="banner" style="margin-top:12px">⏱️ ${esc(d.zonesText)}</div>
        ${abZoneStrip(d.zoneTimeline) ? `<div style="margin-top:10px">${abZoneStrip(d.zoneTimeline)}</div>` : ''}
        ${d.brake?.text ? `<div class="banner info" style="margin-top:8px">🎯 ${esc(d.brake.text)}</div>` : ''}
        ${d.A?.launch?.verdict || d.B?.launch?.verdict ? `<div class="banner" style="margin-top:8px">🚀 ${esc(d.A?.launch?.verdict ?? d.B.launch.verdict)}</div>` : ''}
        ${d.A?.evolution?.verdict || d.B?.evolution?.verdict ? `<div class="banner" style="margin-top:8px">🌡️ ${esc(d.A?.evolution?.verdict ?? d.B.evolution.verdict)}</div>` : ''}
        <div class="muted" style="margin-top:8px;font-size:12.5px">${tr({ it: 'Tempo perso: ', en: 'Time lost: ' })}${dec((d.lostS ?? 0).toFixed(2))}s · ${tr({ it: 'tempo guadagnato: ', en: 'time gained: ' })}${dec((d.gainedS ?? 0).toFixed(2))}s</div>`,
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
    <div class="muted" style="font-size:12.5px;margin-bottom:10px">
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
        <td><b>${esc(s.display)}</b>${s.note ? ` <span class="tag ${s.note === 'rinnovo' ? '' : ''}" style="font-size:12.5px">${esc(s.note)}</span>` : ''}
          <div class="faint" style="font-size:12.5px">${s.gridSize ?? '?'} ${tr({ it: 'auto', en: 'cars' })} · ${s.rounds} ${tr({ it: 'ronde', en: 'rounds' })}${s.access === 'closed' ? ' · ' + tr({ it: 'parco chiuso (solo contratto)', en: 'closed grid (contract only)' }) : ''}</div></td>
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
      <div class="muted" style="margin-top:8px;font-size:12.5px">${esc(d.caveat ?? '')}</div>`
      : `<div class="empty">${tr({ it: 'Nessun candidato simulabile al momento.', en: 'No simulable candidate right now.' })}</div>`}`;
}
