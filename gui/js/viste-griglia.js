'use strict';
/* viste-griglia.js — tab GRIGLIA: la pagina del bilanciamento.
 *
 * Fin qui le regole vivevano nel file (grid-classes.json) e si combaciavano da
 * riga di comando (grid-balance / griglia). Questa vista le gestisce a vista:
 *   • lo stato del customgrid in attesa (celle: auto, zavorre, penalità)
 *   • le classi con la loro storia di convalida (per-traccia incluso)
 *   • i bottoni: applica bilancio, rimuovi auto escluse, intervallo AI
 * Scrittura protetta: EVO deve essere CHIUSO (il guardiano lo dice da sé).
 */  function weekendBuilderHtml(card) {
  if (!card) return '';
  const t = (it, en) => tr({ it, en });
  const safe = (v) => (v == null || v === '' ? '—' : esc(String(v)));
  const auto = safe(card.carName ?? card.car);
  const pista = safe(card.trackName);
  // roundIndex è 0-based (la scheda gara scrive R${roundIndex+1}): qui si mostra
  // la stessa numerazione, così «ronda 2 di 4» combacia con la dashboard.
  const ronda = card.roundIndex != null
    ? `${t('ronda', 'round')} ${card.roundIndex + 1}${card.totalRounds ? ` ${t('di', 'of')} ${card.totalRounds}` : ''}`
    : esc(card.roundName ?? '');
  // etichetta della GARA dal piano meteo (già tradotta dal server: «nuvoloso»),
  // non il preset grezzo della ladder («Overcast») che parlerebbe un'altra lingua
  const raceWx = (card.weatherPlan ?? []).find((s) => s.session === 'Race');
  const meteo = safe(raceWx?.label ?? card.weather);
  const WX = { 0: '☀️', 1: '🌤️', 2: '☁️', 3: '🌦️', 4: '🌧️', 5: '⛈️' };
  // ALLINEAMENTO: il meteo che EVO ha ORA nel selettore (weatherNow) contro quello
  // che la ronda chiede. Se non combaciano il weekend non è ancora «preparato».
  const wxAligned = raceWx && card.weatherNow != null && card.weatherNow !== ''
    ? Number(card.weatherNow) === Number(raceWx.weather) : null;
  const nowLabel = (card.weatherPlan ?? []).find((s) => Number(s.weather) === Number(card.weatherNow))?.label;
  const stato = wxAligned === true
    ? `<span class="tag green">${t('meteo allineato', 'weather aligned')}</span>`
    : wxAligned === false
      ? `<span class="tag warn">${t('meteo da preparare', 'weather to prepare')}</span>` : '';
  const meteoDett = () => {
    if (wxAligned == null) return t('preset della ronda', 'round preset');
    if (wxAligned) return t('gara · EVO allineato', 'race · EVO aligned');
    return `${t('gara', 'race')} · EVO: ${safe(nowLabel)}`;
  };
  const chip = (s) => {
    const h = s.hour != null ? `${String(s.hour).padStart(2, '0')}:00` : '—';
    const gara = s.session === 'Race';
    return `<span class="tag" style="font-size:11.5px;padding:2px 7px${gara ? ';font-weight:700' : ''}">${WX[Number(s.weather)] ?? '🌡️'} ${esc(s.sessionLabel)} ${h} · ${esc(s.label)}</span>`;
  };
  const ora = card.raceHour != null ? `${String(card.raceHour).padStart(2, '0')}:00` : '—';
  const distanza = card.laps != null
    ? `${card.laps} ${t('giri', 'laps')}`
    : card.durationEff != null ? `${card.durationEff} ${t('minuti', 'minutes')}` : '—';
  const pieno = card.round?.durationMin != null && card.durationEff != null && card.durationEff !== card.round.durationMin
    ? ` · ${t('piena', 'full')} ${card.round.durationMin}′` : '';
  const griglia = card.gridSize != null
    ? `${card.gridSize} ${t('posti', 'seats')} · ${card.opponents ?? '—'} ${t('avversari', 'rivals')}`
    : '—';
  const ai = card.difficulty ? `AI ${card.difficulty.rangeMin}–${card.difficulty.rangeMax}%` : '';
  const gridExtra = card.gridAltraSerie
    ? `<br><span class="tag warn" style="font-size:11.5px;padding:1px 5px">${t('griglia di un’altra serie', 'grid from another series')}</span>` : '';
  const tile = (key, icon, label, value, detail, extra = '') => {
    const stile = 'text-align:left;display:flex;flex-direction:column;gap:2px;background:var(--panel2,#121822);border:1px solid var(--line,#2a3341);border-radius:8px;padding:8px 10px;color:inherit;font:inherit;min-height:74px';
    const corpo = `
      <span class="muted" style="font-size:11.5px">${icon} ${label}</span>
      <b style="font-size:14px">${value}</b>
      <span class="muted" style="font-size:11.5px;line-height:1.25">${detail}${extra}</span>`;
    const apre = key === 'car' || key === 'track';
    return apre
      ? `<button type="button" data-wb="${key}" style="${stile};cursor:pointer">${corpo}</button>`
      : `<div style="${stile}">${corpo}</div>`;
  };
  return `
  <div class="panel" id="weekend-builder">
    <h2>${t('Costruzione weekend', 'Weekend build')} <span class="muted" style="font-size:12px">${t('i sei parametri che «Prepara tutto» scrive in EVO', 'the six settings “Get everything ready” writes into EVO')}</span> ${stato}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px">
      ${tile('car', '🚗', t('Auto', 'Car'), auto, card.carChoices?.length > 1
        ? `${card.carChoices.length} ${t('ammesse: scegli nella scheda', 'allowed: choose in the sheet')}`
        : t('auto della giornata', 'today’s car'))}
      ${tile('track', '🏁', t('Pista', 'Track'), pista, ronda || t('pista della ronda', 'round track'))}
      ${tile('weather', '🌦', t('Meteo', 'Weather'), meteo, meteoDett())}
      ${tile('hour', '🕒', t('Ora', 'Time'), ora, t('ora della gara', 'race time'))}
      ${tile('distance', '📏', t('Giri / tempo', 'Laps / time'), distanza, `${t('distanza', 'distance')} ${card.distPct != null ? `${card.distPct}%` : '—'}${pieno}`)}
      ${tile('grid', '🧱', t('Griglia', 'Grid'), griglia, ai ? `${ai}${card.difficulty?.trim ? ` · ${t('trim', 'trim')} +${card.difficulty.trim}` : ''}` : t('AI da definire', 'AI to define'), gridExtra)}
    </div>
    <div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap;align-items:center">
      <span class="muted" style="font-size:11.5px">${t('Sessioni e meteo del weekend:', 'Weekend sessions and weather:')}</span>
      ${(card.weatherPlan ?? []).map(chip).join('')}
    </div>
    <div class="muted" style="margin-top:10px;font-size:11.5px">${t('Auto e pista aprono le rispettive schede.', 'Car and track open their sheets.')}</div>
  </div>`;
}

async function drawGridTab(m){
  const data = await api('grid');
  let card = null;
  try { card = await api('card'); } catch { /* la scheda gara non deve impedire la vista griglia */ }
  const builder = weekendBuilderHtml(card);
  const pct = (v) => Number(v ?? 0).toFixed(1).replace(/\.0$/, '') + '%';
  const kgpct = (c) => `${c.kg}kg / ${pct(c.pct)}`;
  const badgeOk = `<span class="tag green">${tr({ it: 'convalidata', en: 'validated' })}</span>`;
  const badgeKo = `<span class="tag warn">${tr({ it: 'da convalidare', en: 'to validate' })}</span>`;

  const confTag = (c) => c === 'alta' ? `<span class="tag green">${tr({ it: 'confidenza alta', en: 'high confidence' })}</span>`
    : c === 'media' ? `<span class="tag warn">${tr({ it: 'confidenza media', en: 'medium confidence' })}</span>`
    : c === 'bassa' ? `<span class="tag red">${tr({ it: 'confidenza bassa', en: 'low confidence' })}</span>` : '';

  // TINTE A VISTA (1/11, vetrina DA-10): il file in attesa racconta le LIVERE:
  // per modello quante tinte distinte (campo 11, letta in readCells) e - se un
  // modello esce con UNA sola - il grido con il gesto «più LIVERIES + APPLICA»
  // e la leva del parco (tintePrestate per serie in grid-classes.json).
  const tintePerModello = {};
  for (const c of data.cells ?? []) {
    (tintePerModello[c.name] ??= new Set()).add(c.tinta ?? '(default)');
  }
  const monoTinte = Object.entries(tintePerModello).filter(([, s]) => s.size < 2).map(([n]) => n);
  const tinteRiga = Object.entries(tintePerModello).map(([n, s]) => `${esc(n)} ×${s.size}`).join(' · ');
  // DUE REGISTRI A VISTA (richiesta Mauro 1/11: «mostra accanto al customgrid
  // anche la banda attiva dei cursori»): il campo AI del FILE (aiMin/aiMax,
  // sopra) è il registro scritto; la banda dei CURSORI del weekend
  // (84–85 + trim, pannello Difficoltà) è quello vivo del Prepara. L'uno non
  // comanda l'altro: un «Imposta intervallo AI» a mano sovrascrive il file
  // SENZA toccare i cursori — per questo li si legge accanto, con il
  // confronto pronto (allineata / da riscrivere col Prepara) e il bottone
  // «allinea al campo» (2/11) che copia la banda viva nel campo del file
  // IN UN CLIC, via grid-ai, senza aspettare il Prepara.
  const bS = data.bandaSerie ?? null;
  const bFile = (data.aiMin != null && data.aiMax != null) ? [Number(data.aiMin), Number(data.aiMax)] : null;
  const bAllineata = !!(bS && bFile && bFile[0] === bS.banda[0] && bFile[1] === bS.banda[1]);
  const bTag = bS
    ? (bFile == null ? `<span class="tag warn">${tr({ it: 'file senza AI scritta', en: 'file has no AI range' })}</span>`
      : bAllineata ? `<span class="tag green">${tr({ it: 'allineata al campo', en: 'aligned with the field' })}</span>`
      : `<span class="tag warn">${tr({ it: 'da riscrivere (Prepara · «allinea al campo»)', en: 'needs a rewrite (Prepara · "Align to field")' })}</span>`)
    : '';
  const bTesto = bS ? `${bS.banda[0]}–${bS.banda[1]}${bS.trim ? ` (trim ${bS.trim > 0 ? '+' : ''}${bS.trim})` : ''}` : null;
  m.innerHTML = `
  ${builder}
  <div class="panel">
    <h2>${tr({ it: 'Griglia', en: 'Grid' })} <span class="muted" style="font-size:12.5px">${data.exists ? `${data.cells.length} ${tr({ it: 'celle', en: 'cells' })} · ${data.drivers} ${tr({ it: 'piloti', en: 'drivers' })} · AI ${data.aiMin ?? '–'}–${data.aiMax ?? '–'} ${bS ? `<span class="muted">(${tr({ it: 'campo del file', en: 'file field' })})</span>` : ''} · PI ${data.piMin ?? '–'}–${data.piMax ?? '–'}` : ` (${tr({ it: 'file customgrid non trovato', en: 'customgrid file not found' })})`}</span></h2>
    ${bS ? `<div style="margin:2px 0 8px;font-size:12.5px">${tr({ it: 'Banda attiva dei cursori del weekend:', en: 'Active band of the weekend sliders:' })} <b>${bTesto}</b> ${bTag}</div>` : ''}
    ${data.classe ? `<div style="margin:6px 0 10px">${tr({ it: 'Classe combaciata:', en: 'Matched class:' })} <b>${esc(data.classe)}</b>${data.perTraccia ? ` · ${tr({ it: 'per-traccia', en: 'per-track' })} <b>${esc(data.perTraccia)}</b> ${data.convalidato ? badgeOk : badgeKo}` : ''}</div>` : `<div class="muted" style="margin:6px 0 10px">${tr({ it: 'Nessuna classe combacia con le auto della griglia', en: 'No class matches the grid cars' })}</div>`}
    ${data.exists && tinteRiga ? `<div class="muted" style="margin:2px 0 8px;font-size:12px">${tr({ it: 'Tinte (liverie):', en: 'Liveries:' })} ${tinteRiga}${monoTinte.length ? ` — <b style="color:#d9a83e">${tr({ it: 'MONOCOLORE:', en: 'MONOCHROME:' })} ${esc(monoTinte.join(', '))}</b> → ${tr({ it: 'in EVO genera più LIVERIE della stessa auto e APPLICA, oppure (avversari) tintePrestate: true dalla serie in grid-classes.json', en: 'in EVO create more LIVERIES of the same car and APPLICA, or (rivals) tintePrestate: true on the series in grid-classes.json' })}` : ''}</div>` : ''}
    ${data.escluseClasse?.length || data.escluseTraccia?.length ? `<div class="banner" style="border-color:#d9a83e">${tr({ it: 'Auto escluse ancora presenti nel file: {A} → usa "Applica bilancio" per rimuoverle', en: 'Excluded cars still in the file: {A} → use "Apply balance" to remove them' }).replace('{A}', esc([...(data.escluseClasse ?? []), ...(data.escluseTraccia ?? [])].join(' · ')))}</div>` : ''}
    <table><thead><tr><th>#</th><th data-ord="auto" style="cursor:pointer">${tr({ it: 'Auto', en: 'Car' })}</th><th>${tr({ it: 'Preset', en: 'Preset' })}</th><th>${tr({ it: 'Tinta', en: 'Livery' })}</th><th class="right" data-ord="pz" style="cursor:pointer">${tr({ it: 'Zavorra / Penalità', en: 'Ballast / Penalty' })}</th></tr></thead>
    <tbody id="g-tbody">${(data.cells ?? []).map((c, i) => `<tr><td class="muted">${i + 1}</td><td><span class="car-link" data-car="${esc(c.name)}" style="cursor:pointer;text-decoration:underline dotted">${esc(c.name)}</span></td><td class="muted" style="font-size:11.5px">${esc(c.preset ?? '—')}</td><td class="muted" style="font-size:11.5px">${esc(c.tinta ?? '(default)')}</td><td class="right">${kgpct(c)}</td></tr>`).join('')}</tbody>
    </table>
  </div>

  <div class="panel">
    <h2>${tr({ it: 'Classi e regole', en: 'Classes and rules' })}</h2>
    ${(data.classi ?? []).map((cl) => `
      <details ${data.classe === cl.id ? 'open' : ''} style="margin-bottom:10px;border:1px solid var(--line,#333);border-radius:8px;padding:10px">
        <summary style="cursor:pointer"><b>${esc(cl.id)}</b> ${cl.aiStandard ? `<span class="muted">· AI ${cl.aiStandard[0]}–${cl.aiStandard[1]}</span>` : ''}
          ${cl.tintePrestate === true ? `<span class="tag" style="border-color:#d9a83e">${tr({ it: 'tinte prestate (parco)', en: 'borrowed liveries (park)' })}</span>` : ''}
          ${(cl.convalidatoSu || []).length ? ` · ${tr({ it: 'su ', en: 'on ' })}${esc(cl.convalidatoSu.join(', '))}: ${badgeOk}` : ''}</summary>
        <div class="row" style="align-items:start;gap:14px;margin-top:10px;flex-wrap:wrap">
          <div style="flex:1 1 280px;min-width:0">
            <div class="muted" style="margin-bottom:4px">${tr({ it: 'Regole base', en: 'Base rules' })}${cl.autoBase ? ` — ${tr({ it: 'base: ', en: 'base: ' })}<b>${esc(legacyIt(cl.autoBase))}</b>` : ''}</div>
            <table><tbody>${cl.regole.map((r) => `<tr><td><span class="car-link" data-car="${esc(r.auto)}" style="cursor:pointer;text-decoration:underline dotted">${esc(r.auto)}</span></td><td class="muted" style="font-size:11.5px">${esc(r.preset ?? '')}</td><td class="right">${r.kg}kg / ${pct(r.pct)}</td><td>${r.escluso ? `<span class="tag red">${tr({ it: 'esclusa', en: 'excluded' })}</span>` : ''}</td></tr>`).join('')}</tbody></table>
          </div>
          <div style="flex:1 1 280px;min-width:0">
            <div class="muted" style="margin-bottom:4px">${tr({ it: 'Supplementi per-traccia', en: 'Per-track supplements' })}</div>
            ${cl.perTraccia.length ? cl.perTraccia.map((pt) => `
              <div style="margin-bottom:8px;padding:8px;border-left:3px solid var(--line,#333)">
                <b>${esc(pt.traccia)}</b> ${pt.convalidato ? badgeOk : badgeKo}
                ${pt.restrictorPct ? `<div class="muted" style="font-size:11.5px">${esc(Object.entries(pt.restrictorPct).map(([p, v]) => `${p.replace(/^preset_/, '')} → ${pct(v)}`).join(' · '))}</div>` : ''}
                ${pt.aiStandard ? `<div class="muted" style="font-size:11.5px">${tr({ it: 'AI per-traccia', en: 'per-track AI' })} ${pt.aiStandard[0]}–${pt.aiStandard[1]}</div>` : ''}
                ${pt.escludiAuto?.length ? `<div class="muted" style="font-size:11.5px">${esc(pt.escludiAuto.join(' · '))}</div>` : ''}
                ${pt.nota ? `<div class="muted" style="font-size:11.5px;margin-top:4px">${esc(String(pt.nota).slice(0, 200))}${String(pt.nota).length > 200 ? '…' : ''}</div>` : ''}
              </div>`).join('')
            : `<div class="faint">${tr({ it: 'nessuna variante per-traccia', en: 'no per-track variant' })}</div>`}
          </div>
        </div>
      </details>`).join('')}
  </div>

  <div class="panel">
    <h2>${tr({ it: 'Sede del weekend', en: 'Weekend venue' })} <span class="muted" style="font-size:12px">${tr({ it: 'pista della ronda corrente · scrittura a gioco APERTO', en: 'current round track · write allowed with the GAME OPEN' })}</span></h2>
    <div id="wtrack-box" class="muted" style="font-size:12px">${tr({ it: 'carico…', en: 'loading…' })}</div>
  </div>

  <div class="panel">
    <h2>${tr({ it: 'Calibrazione dai risultati reali', en: 'Calibration from real results' })} <span class="muted" style="font-size:12px">${data.calib?.eventi ? `${data.calib.eventi} ${tr({ it: 'gare nel registro', en: 'races in the log' })} · ${esc((data.calib.file ?? '').split('/').slice(-1)[0])}` : tr({ it: 'si riempie da sola ad ogni import', en: 'fills itself at every import' })}</span></h2>
    ${(data.calib?.gruppi ?? []).length ? data.calib.gruppi.map((g) => `
      <details open style="margin-bottom:10px;border:1px solid var(--line,#333);border-radius:8px;padding:10px">
        <summary style="cursor:pointer"><b>${esc(g.classe)}</b> · <b>${esc(g.trkKey)}</b> — ${g.obs} ${tr({ it: 'gare', en: 'races' })} (${g.ok} ${tr({ it: 'in tolleranza', en: 'within tolerance' })}) ${confTag(g.confidenza)} ${g.convalidatoAdesso ? badgeOk : ''}</summary>
        <table><thead><tr><th>${tr({ it: 'Auto (AI)', en: 'Car (AI)' })}</th><th class="right">${tr({ it: 'Δ mediana vs base', en: 'Δ median vs base' })}</th></tr></thead>
        <tbody>${g.perAuto.map((a) => `<tr><td><span class="car-link" data-car="${esc(a.auto)}" style="cursor:pointer;text-decoration:underline dotted">${esc(a.auto)}</span></td><td class="right" style="color:${a.medSec <= -0.8 ? '#e07070' : a.medSec < 0.8 ? '#7ec97e' : 'inherit'}">${a.medSec > 0 ? '+' : ''}${Number(a.medSec).toFixed(2)}s</td></tr>`).join('') || `<tr><td colspan="2" class="muted">${tr({ it: 'nessun dato per-auto (base nuda o cap raggiunto)', en: 'no per-car data (bare base or cap reached)' })}</td></tr>`}</tbody></table>
        ${(g.ultimaProposta ?? []).length ? `<div class="banner" style="margin-top:8px;border-color:#d9a83e"><b>${tr({ it: 'Ultima proposta (', en: 'Last proposal (' })}${esc(String(g.ultimoAt ?? '').slice(0, 10))}):</b><br>${g.ultimaProposta.map((p) => p.leva === 'campo-ai' ? `${tr({ it: 'campo AI', en: 'AI field' })} ${esc(p.da)} → <b>${esc(p.a)}</b> — ${esc(legacyIt(p.perche))}` : `${esc(p.auto ?? '')}: ${esc(p.da)} → <b>${esc(p.a)}</b> — ${esc(legacyIt(p.perche))}`).join('<br>')}</div>` : `<div class="muted" style="margin-top:8px">${tr({ it: 'nessuna proposta: i supplementi tengono', en: 'no proposal: supplements hold' })}</div>`}
        ${g.suggerisciConvalida ? `<div class="muted" style="margin-top:6px">${tr({ it: 'convalidabile ora da terminale:', en: 'validatable now from the terminal:' })} <b>node ac-evo-career.mjs griglia-calib --convalida "${esc(g.trkKey)}"</b></div>` : ''}
      </details>`).join('')
    : `<div class="muted">${tr({ it: "Ancora nessuna gara nella classe conosciuta dopo l'attivazione: ogni import con auto di una classe nota aggiunge qui osservazione e proposte. Sistema: node ac-evo-career.mjs griglia-calib", en: 'No race in a known class yet since activation: every import with cars of a known class adds an observation and proposals here. Fix it: node ac-evo-career.mjs griglia-calib' })}</div>`}
  </div>

  <div class="panel">
    <h2>${tr({ it: 'Azioni', en: 'Actions' })} <span class="muted" style="font-size:12px">${tr({ it: '(EVO deve essere chiuso)', en: '(EVO must be closed)' })}</span></h2>
    <div class="row" style="flex-wrap:wrap">
      <select id="g-classe" style="flex:1 1 180px;min-width:0;max-width:100%;width:auto">${(data.classi ?? []).map((c) => `<option value="${esc(c.id)}" ${data.classe === c.id ? 'selected' : ''}>${esc(c.id)}</option>`).join('')}</select>
      <input id="g-track" type="text" placeholder="${tr({ it: 'traccia (es. Sebring International Raceway)', en: 'track (e.g. Sebring International Raceway)' })}" style="width:260px" value="${esc(data.perTraccia ?? '')}">
      <button class="act" id="g-apply">${tr({ it: 'Applica bilancio', en: 'Apply balance' })}</button>
    </div>
    <div class="row" style="flex-wrap:wrap;margin-top:8px">
      <span class="muted">AI</span>
      <input id="g-ai-min" type="number" min="0" max="100" value="${data.aiMin ?? 99}" style="width:70px">
      <span class="muted">–</span>
      <input id="g-ai-max" type="number" min="0" max="100" value="${data.aiMax ?? 100}" style="width:70px">
      <button class="ghost" id="g-ai">${tr({ it: 'Imposta intervallo AI', en: 'Set AI range' })}</button>
      <button class="ghost" id="g-align" ${!bS || bAllineata ? 'disabled' : ''} title="${tr({ it: 'riscrive il campo AI del customgrid con la banda viva dei cursori del pannello Difficoltà', en: 'rewrites the customgrid AI field with the live band of the Difficulty sliders' })}">${tr({ it: 'Allinea al campo', en: 'Align to field' })}</button>
      <button class="ghost" id="g-drop">${tr({ it: 'Rimuovi auto escluse dal file', en: 'Remove excluded cars from file' })}</button>
      <button class="ghost" id="g-reload">${tr({ it: 'Ricarica', en: 'Reload' })}</button>
    </div>
    ${bS ? `<div class="muted" style="font-size:11.5px">${tr({ it: 'banda viva dei cursori: ', en: 'live slider band: ' })}<b>${bTesto}</b>${bAllineata ? ` — <span class="tag green" style="font-size:11.5px">${tr({ it: 'il campo del file combacia', en: 'the file field matches' })}</span>` : tr({ it: ' — il Prepara la scrive nel file', en: ' — Prepara writes it into the file' })}</div>` : ''}
    <div id="grid-out" style="margin-top:12px"></div>
    <div class="muted" style="font-size:11.5px;margin-top:10px">${tr({ it: '"Applica bilancio" riscrive zavorre/penalità della classe (con supplementi per-traccia se la traccia combacia) e rimuove dal pool le auto in escludiAuto (di classe o per-traccia).', en: '"Apply balance" rewrites the class ballast/penalties (with per-track supplements if the track matches) and removes escludiAuto cars from the pool (class-level or per-track).' })}</div>
  </div>`;

  /* AZIONI IN CIMA (4/11): i bottoni che scrivono il file stavano in fondo a
     una pagina da 21.000 caratteri. Il pannello è lo stesso (gli handler si
     registrano qui sotto): lo si porta davanti a tutto appena disegnato. */
  const pAzioni = [...m.querySelectorAll('.panel')].find(p => p.querySelector('#g-apply'));
  if (pAzioni) m.prepend(pAzioni);

  // NAVIGZIONE incrociata (28/10, stile Football Manager): ogni nome auto → scheda auto nel libro
  $$('.car-link', m).forEach((e) => { e.onclick = () => vai('cars', { search: e.dataset.car }); });

  // ORDINE in zavorre e penalità (richiesta 1/11): la tavola celle si RIGHE col
  // click sull'intestazione — default «Zavorra / Penalità» AL RIBASSO (la più
  // pesante in cima, la base a 0kg/0% in fondo). La colonna # non si tocca:
  // resta la POSIZIONE REALE della cella nel customgrid (quella di partenza),
  // solo che le righe vengono mostrate ordinate. kg pesa di più della %:
  // i pari si spezzano sui grammi di penalità, infine sul posto di riga.
  const gTbody = $('#g-tbody');
  const ord = { chiave: 'pz', dir: -1 };
  const valDi = (c) => ord.chiave === 'auto'
    ? String(c.name).toLowerCase()
    : Number(c.kg ?? 0) * 10000 + Number(c.pct ?? 0);
  const disegnaRighe = () => {
    gTbody.innerHTML = (data.cells ?? []).map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const va = valDi(a.c), vb = valDi(b.c);
        return ord.dir * (va < vb ? -1 : va > vb ? 1 : 0) || a.i - b.i;
      })
      .map(({ c, i }) => `<tr><td class="muted">${i + 1}</td><td><span class="car-link" data-car="${esc(c.name)}" style="cursor:pointer;text-decoration:underline dotted">${esc(c.name)}</span></td><td class="muted" style="font-size:11.5px">${esc(c.preset ?? '—')}</td><td class="muted" style="font-size:11.5px">${esc(c.tinta ?? '(default)')}</td><td class="right">${kgpct(c)}</td></tr>`)
      .join('');
    $$('.car-link', gTbody).forEach((e) => { e.onclick = () => vai('cars', { search: e.dataset.car }); });
  };
  const etichettaDi = (k) => k === 'auto' ? tr({ it: 'Auto', en: 'Car' }) : tr({ it: 'Zavorra / Penalità', en: 'Ballast / Penalty' });
  const aggiornaFrecce = () => {
    $$('th[data-ord]', m).forEach((t) => {
      t.textContent = etichettaDi(t.dataset.ord)
        + (ord.chiave === t.dataset.ord ? (ord.dir > 0 ? ' ▲' : ' ▼') : '');
    });
  };
  $$('th[data-ord]', m).forEach((th) => {
    th.onclick = () => {
      if (ord.chiave === th.dataset.ord) ord.dir = -ord.dir;
      else { ord.chiave = th.dataset.ord; ord.dir = th.dataset.ord === 'auto' ? 1 : -1; }
      aggiornaFrecce();
      disegnaRighe();
    };
  });
  aggiornaFrecce();
  disegnaRighe();

  const out = (html, kind) => { $('#grid-out').innerHTML = html ? `<div class="banner ${kind ?? ''}">${html}</div>` : ''; };
  const busy = (btn, on, text) => { btn.disabled = on; btn.innerHTML = on ? '<span class="spin"></span>' : text; };

  $('#g-reload').onclick = () => render();

  $('#g-apply').onclick = async () => {
    const b = $('#g-apply'); busy(b, true, tr({ it: 'Applica', en: 'Apply' }));
    try {
      const r = await api('grid-apply', { serie: $('#g-classe').value, track: $('#g-track').value.trim() || null });
      out(tr({ it: 'scrivto per {C}{T} · {N} celle toccate — rileggo…', en: 'written for {C}{T} · {N} cells touched — reloading…' }).replace('{C}', `<b>${esc(r.classe)}</b>`).replace('{T}', esc(r.trkMsg ?? '')).replace('{N}', r.report.length));
      setTimeout(render, 900);
    } catch (e) { out(esc(e.message), 'bad'); busy(b, false, tr({ it: 'Applica', en: 'Apply' })); }
  };

  $('#g-ai').onclick = async () => {
    try { await api('grid-ai', { min: Number($('#g-ai-min').value), max: Number($('#g-ai-max').value) }); out(tr({ it: 'Intervallo AI riscritto sul customgrid.', en: 'AI range rewritten on the customgrid.' })); setTimeout(render, 600); }
    catch (e) { out(esc(e.message), 'bad'); }
  };

  // ALLINEA AL CAMPO (richiesta Mauro 2/11): il campo AI del file assume la
  // banda viva dei cursori (pannello Difficoltà) SENZA aspettare il Prepara.
  // Stessa strada di «Imposta intervallo AI» (grid-ai → applyAi, backup e
  // custode del gioco chiuso inclusi) ma i due numeri li calcola il server:
  // niente campi da copiare a mano. A banda già allineata resta spento:
  // allineare due volte non insegna niente.
  $('#g-align').onclick = async () => {
    if (!bS) return;
    const b = $('#g-align'); busy(b, true, tr({ it: 'Allinea', en: 'Align' }));
    try {
      await api('grid-ai', { min: bS.banda[0], max: bS.banda[1] });
      out(tr({ it: 'Campo AI allineato alla banda viva {B} — rileggo…', en: 'AI field aligned with the live band {B} — reloading…' }).replace('{B}', `<b>${bS.banda[0]}–${bS.banda[1]}</b>`));
      setTimeout(render, 600);
    } catch (e) { out(esc(e.message), 'bad'); }
    busy(b, false, tr({ it: 'Allinea al campo', en: 'Align to field' }));
  };

  // BATTITO DEL TAG (3/11, richiesta Mauro: «il tag giallo si spegne nel
  // momento, senza ricarica del browser»): il Prepara (scheda Campionati) e
  // gli altri rami scrivono il campo AI del customgrid quando vogliono, ma
  // questa tab finora si ridisegnava SOLO a click (Ricarica o i bottoni): il
  // tag giallo «da riscrivere» restava appeso finché riaprivi il tab. Ora un
  // beat leggero (3 s, SOLO finché il tab è a vista: il selettore di prima,
  // stesso patto delle strip live di viste-d / dello stato di viste-b) rilegge
  // /api/grid e se convcbia campo AI o banda dei cursori cambiano ridipinge
  // il tab da solo con render() — la PAGINA del browser non si ricarica
  // (nessun location.reload: la verifica dal vivo lo prova col sentinella).
  const _ancora = $('#g-apply');
  // L'IMPRONTA porta ANCHE le celle e la finestra PI (lezione della prova del
  // 1/11 sera): il restore del backup torna al file con STESSA AI ma SERIE
  // DIVERSA (21 celle del flusso dal vivo vs 22 della ricostruzione) — con
  // soltanto AI+banda nella chiave il tab restava sulla vecchia stampa.
  const impronta = (d) => JSON.stringify([
    d.bandaSerie ?? null,
    (d.aiMin != null && d.aiMax != null) ? [Number(d.aiMin), Number(d.aiMax)] : null,
    (d.piMin != null && d.piMax != null) ? [Number(d.piMin), Number(d.piMax)] : null,
    (d.cells ?? []).length,
  ]);
  const _chiaveTag = impronta(data);
  const _beat = setInterval(async () => {
    if (!_ancora || !_ancora.isConnected) { clearInterval(_beat); return; }
    try {
      const d = await api('grid');
      if (impronta(d) !== _chiaveTag && _ancora.isConnected) render();   // tab ridipinto da solo: tag attuale, zero ricarica
    } catch { /* server occupato: il beat riprova al giro dopo */ }
  }, 3000);

  // SEDE DEL WEEKEND: la pista della ronda corrente scritta nel gamemodesave.
  // A differenza delle azioni griglia, QUESTA è permessa a gioco aperto: il menu
  // di EVO adotta il file riscritto (verificato 3/3 con Suzuka ↔ Red Bull Ring).
  try {
    const wt = await api('weekend-track');
    const wtBox = $('#wtrack-box');
    if (wtBox) {
      const assert = wt.same === true
        ? `<span class="tag green">${tr({ it: 'già a posto', en: 'already in place' })}</span>`
        : wt.same === false ? `<span class="tag warn">${tr({ it: 'da sistemare', en: 'needs fixing' })}</span>` : '';
      wtBox.innerHTML = `
        <div>${tr({ it: 'sul file: ', en: 'on file: ' })}<b>${esc(wt.current ?? tr({ it: 'file non trovato', en: 'file not found' }))}</b> · ${tr({ it: 'ronda attesa: ', en: 'expected round: ' })}<b>${esc(wt.expected ?? '—')}</b> ${assert}</div>
        ${wt.expected ? `<div class="row" style="margin-top:8px;flex-wrap:wrap">
          <button class="act" id="wtrack-set">${tr({ it: 'Porta il weekend su "{T}"', en: 'Move the weekend to "{T}"' }).replace('{T}', esc(wt.expected))}</button>
          ${tr({ it: '<span class="muted" style="font-size:11.5px">scrive anche con EVO aperto · backup automatico</span>', en: '<span class="muted" style="font-size:11.5px">writes even with EVO open · automatic backup</span>' })}
        </div>` : ''}`;
      $('#wtrack-set')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = tr({ it: 'scrivo…', en: 'writing…' });
        try {
          const r = await api('weekend-track', { track: wt.expected });
          wtBox.innerHTML = `<div class="banner ok">${tr({ it: 'settata: ', en: 'set: ' })}<b>${esc(r.current)}</b>${r.written ? ` · ${tr({ it: 'backup ', en: 'backup ' })}${esc(String(r.backup).split('/').pop())}` : ` (${tr({ it: 'già in piedi', en: 'already in place' })})`} — ${tr({ it: 'nel menu di EVO esci e rientra nella schermata pista per vederla.', en: 'in the EVO menu leave and re-enter the track screen to see it.' })}</div>`;
        } catch (err) { wtBox.innerHTML = `<div class="banner bad">${esc(err.message)}</div>`; }
      });
    }
  } catch { /* il pannello sede non deve mai rompere la tab */ }

  $$('[data-wb]', m).forEach((b) => {
    b.onclick = () => (b.dataset.wb === 'car'
      ? vai('cars', { search: card?.carName ?? '' })
      : vai('tracks', { search: card?.trackName ?? '' }));
  });
$('#g-drop').onclick = async () => {
    const b = $('#g-drop'); busy(b, true, tr({ it: 'Rimuovi', en: 'Remove' }));
    try {
      const preset = prompt(tr({ it: 'Preset o Nome auto da rimuovere (es. preset_mk8gti_mech_1):', en: 'Preset or car Name to remove (e.g. preset_mk8gti_mech_1):' }));
      if (!preset) { busy(b, false, tr({ it: 'Rimuovi', en: 'Remove' })); return; }
      const cls = (data.classi ?? []).find((c) => c.id === data.classe);
      const escluse = [...(cls?.regole?.filter((r) => r.escluso).map((r) => r.preset ?? r.auto) ?? [])];
      const matchers = preset === 'ESCLUSE' ? escluse : [preset];
      const r = await api('grid-drop', { matchers });
      out(r.droppate?.length ? `${tr({ it: 'Rimosse: ', en: 'Removed: ' })}${esc(r.droppate.join(' · '))}` : tr({ it: 'Nessuna cella corrispondente.', en: 'No matching cell.' }));
      setTimeout(render, 600);
    } catch (e) { out(esc(e.message), 'bad'); }
    busy(b, false, tr({ it: 'Rimuovi', en: 'Remove' }));
  };
}
