/* -------- risultati / import -------- */
async function drawImport(m){
  const [insp, card] = await Promise.all([api('import-inspect'), api('card')]);
  const pending = boot.header.pending;
  m.innerHTML = `
  <div class="panel">
    <h2>${tr({ it: 'Importa il risultato', en: 'Import the result' })}${pending ? ` <span class="h-act">${tr({ it: 'atteso: R', en: 'expected: R' })}${pending.round+1} ${esc(pending.trackNames[0])}</span>` : ''}</h2>
    <div class="row">
      <button class="act" id="b-import">${tr({ it: "Importa l'ultima gara compatibile", en: "Import the last compatible race" })}</button>
      <button class="ghost" id="b-reload">${tr({ it: 'Ricarica elenco', en: 'Reload list' })}</button>
    </div>
    <div id="imp-result"></div>
    <table style="margin-top:14px"><thead><tr><th>${tr({ it: 'File', en: 'File' })}</th><th>${tr({ it: 'Sessione', en: 'Session' })}</th><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Piloti', en: 'Drivers' })}</th><th>${tr({ it: 'Tu', en: 'You' })}</th></tr></thead>
    <tbody>${insp.files.map(f=>`<tr><td class="muted">${esc(f.name)}</td><td>${esc(f.session)}</td><td>${esc(f.track)}</td><td class="right">${f.drivers}</td><td>${f.me?`<span class="tag green">P${f.me.position}${f.me.dnf?` ${tr({ it: 'ritiro', en: 'DNF' })}`:''}</span> <span class="muted" title="${tr({ it: 'riconosciuto per: ', en: 'recognized by: ' })}${esc(f.me.how)} — ${tr({ it: 'il tuo nome nel file è quello senza pallino AI', en: 'your name in the file is the one without the AI dot' })}">${tr({ it: 'tu (', en: 'you (' })}${esc(f.me.car ?? '')})</span>`:'<span class="faint">—</span>'}</td></tr>`).join('')}</tbody>
    </table>
    <div class="muted" style="margin-top:12px">${tr({ it: 'Se il gioco non ti riconosce, inserisci la posizione a mano qui sotto (la vedi nella schermata risultati di EVO).', en: "If the game doesn't recognize you, enter the position by hand below (you'll see it on EVO's results screen)." })}</div>
    <form id="f-manual" class="row" style="margin-top:8px">
      <input type="number" id="i-pos" min="1" placeholder="${tr({ it: 'posizione', en: 'position' })}" style="width:120px" required>
      <input type="number" id="i-cars" min="2" placeholder="${tr({ it: 'auto in griglia', en: 'cars on grid' })}" style="width:150px" value="${card.gridSize}">
      <input type="number" id="i-laps" min="0" placeholder="${tr({ it: 'giri', en: 'laps' })}" style="width:90px" title="${tr({ it: 'facoltativo', en: 'optional' })}">
      <input type="text" id="i-bestlap" placeholder="${tr({ it: 'miglior giro (m:ss.mmm)', en: 'best lap (m:ss.mmm)' })}" style="width:180px" title="${tr({ it: 'facoltativo', en: 'optional' })}">
      <label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="i-dnf"> ${tr({ it: 'ritiro', en: 'DNF' })}</label>
      <label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="i-fl"> ${tr({ it: 'giro veloce', en: 'fastest lap' })}</label>
      <button class="ghost" type="submit">${tr({ it: 'Inserisci a mano', en: 'Enter by hand' })}</button>
    </form>
  </div>`;
  $('#b-reload').onclick = () => render();
  $('#b-import').onclick = async () => {
    const b = $('#b-import'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    await importCall({}); b.disabled=false; b.textContent=tr({ it: "Importa l'ultima gara compatibile", en: "Import the last compatible race" });
  };
  $('#f-manual').onsubmit = async (e) => {
    e.preventDefault();
    await importCall({ position: Number($('#i-pos').value), cars: Number($('#i-cars').value), dnf: $('#i-dnf').checked, fl: $('#i-fl').checked,
      laps: $('#i-laps').value ? Number($('#i-laps').value) : null, bestLap: $('#i-bestlap').value || null });
  };
}

async function importCall(body){
  const box = $('#imp-result');
  try {
    const r = await api('import', body);
    await refreshBoot();
    if (r.duplicate || !r.entry) {
      box.innerHTML = `<div class="banner warn"><b>${tr({ it: 'Nessun nuovo risultato registrato', en: 'No new result recorded' })}</b> — ${esc(r.source ?? tr({ it: 'file già incassato', en: 'file already collected' }))}<br><span class="muted">${tr({ it: 'I soldi, i punti e il registro rivali restano come erano: niente doppioni.', en: 'Money, points and the rivals ledger stay as they were: no duplicates.' })}</span></div>`;
      return;
    }
    const e = r.entry;
    box.innerHTML = `<div class="banner good">
      <b>${e.dnf ? tr({ it: 'Ritiro', en: 'DNF' }) : 'P'+(e.position ?? '?')} ${tr({ it: 'su ', en: 'of ' })}${e.gridSize}</b> · R${r.round} ${tr({ it: 'di ', en: 'of ' })}${esc(r.node)} — ${e.points} ${tr({ it: 'punti · premio ', en: 'points · prize ' })}${money(e.prize)} € · +${e.rep} rep<br>
      <span class="muted">${esc(r.source)}</span><br>
      Classifica: P${r.standing.before ?? '?'} → <b>P${r.standing.after ?? '?'}</b> (${r.standing.points} ${tr({ it: 'punti', en: 'points' })}) · ${tr({ it: 'banca ', en: 'bank ' })}${money(r.money)} €
      ${r.proposal ? `<br>${tr({ it: 'Difficoltà proposta: ', en: 'Proposed difficulty: ' })}${esc(r.proposal.reason)} — trim ${r.proposal.from} → ${r.proposal.to}. ${tr({ it: 'Accettala in Difficoltà.', en: 'Accept it under Difficulty.' })}` : ''}
      ${r.nudgeSuggested ? `<div class="banner warn" style="margin-top:8px"><b>🚀 ${tr({ it: 'Gara troppo facile?', en: 'Race too easy?' })} ${esc(r.nudgeSuggested.reason)}.<br>
        <button class="mini" id="b-nudge-accept" style="margin-top:6px">${tr({ it: 'Sì, porta la serie a +1', en: 'Yes, move the series up by +1' })}</button>
        <span class="muted" style="font-size:11px;margin-left:6px">${tr({ it: 'no, lascia come sta', en: 'no, leave it as is' })}</span></div>` : ''}
      ${r.challenge ? `<br>🎯 ${tr({ it: 'Sfida ', en: 'Challenge ' })}${r.challenge.won?`<b style="color:var(--good)">${tr({ it: 'vinta', en: 'won' })}</b>`:`<b style="color:var(--bad)">${tr({ it: 'persa', en: 'lost' })}</b>`}: ${esc(r.challenge.text)} (${r.challenge.won?'+':''}${r.challenge.won ? money(r.challenge.reward) : '−'+r.challenge.penalty+' rep'})` : ''}
      ${r.vendetta?.newNemesi?.length ? `<br>😬 <b>${tr({ it: 'Nuova nemesi:', en: 'New nemesis:' })}</b> ${esc(r.vendetta.newNemesi.join(', '))} — ${tr({ it: 'ti ha battuto due volte di fila.', en: 'beat you twice in a row.' })}` : ''}
      ${r.vendetta?.settled?.length ? `<br>⚔️ <b>${tr({ it: 'Vendetta assestata', en: 'Vendetta settled' })}</b> ${tr({ it: 'su ', en: 'on ' })}${esc(r.vendetta.settled.join(', '))}.` : ''}
      ${r.duel ? `<br>⚔️ ${tr({ it: 'Duello della stagione: ', en: 'Season duel: ' })}${esc(r.duel.name)} — ${tr({ it: 'tu ', en: 'you ' })}${r.duel.myPoints} pt, ${tr({ it: 'lui ', en: 'him ' })}${r.duel.hisPoints} pt.` : ''}
      ${r.news ? `<br>📰 <b>${esc(r.news.title)}</b><br><span class="muted" style="white-space:pre-wrap">${esc(r.news.body)}</span>` : ''}      ${r.seasonDone ? `<br><b>${tr({ it: 'Stagione completata!', en: 'Season complete!' })}</b> ${tr({ it: 'Puoi chiuderla dalla scheda in Cruscotto.', en: 'You can close it from the card on the Dashboard.' })}` : ''}
      ${r.entry?.sectors ? sectorRowsHtml(r.entry.sectors) : ''}
    </div>`;
  } catch(e){
    const d = e.data || {};
    let extra = '';
    if (d.code === 'PLAYER_NOT_FOUND') extra = `<br>${tr({ it: 'Piloti senza pallino AI: ', en: 'Drivers without the AI dot: ' })}<b>${esc((d.detail?.candidates||[]).join(', '))}</b>. ${tr({ it: 'Correggi il nome in Impostazioni, o inserisci a mano.', en: 'Fix the name under Settings, or enter it by hand.' })}`;
    if (d.code === 'TRACK_MISMATCH') extra = `<br>${tr({ it: 'Gara trovata su ', en: 'Race found at ' })}<b>${esc(d.detail?.actual)}</b>, ${tr({ it: 'attesa su ', en: 'expected at ' })}<b>${esc((d.detail?.expected||[]).join(' / '))}</b>.`;
    box.innerHTML = `<div class="banner bad">${esc(e.message)}${extra}</div>`;
  }
  $('#b-nudge-accept', box)?.addEventListener('click', async () => {
    try {
      const out = await api('difficulty-nudge', { delta: 1 });
      const b = $('#b-nudge-accept', box);
      const lo = out?.card?.difficulty?.rangeMin ?? '?', hi = out?.card?.difficulty?.rangeMax ?? '?';
      if (b) { b.disabled = true; b.textContent = `${tr({ it: 'Fatto: banda a ', en: 'Done: band at ' })}${lo}–${hi}%.`; }
      toast(`${tr({ it: 'Difficoltà della serie portata a ', en: 'Series difficulty moved to ' })}${lo}–${hi}%.`, 'ok');
      await refreshBoot();
    } catch(err){ toast(err.message, 'err'); }
  });
}

function sectorRowsHtml(sec){
  if (!sec?.sectors?.length) return '';
  const w = sec.worstSector ? `${tr({ it: 'Il settore ', en: 'Sector ' })}<b>${sec.worstSector.index}</b>${tr({ it: ' ti costa di più (+', en: ' costs you the most (+' })}${(sec.worstSector.deltaMs/1000).toFixed(3)}s ${tr({ it: 'sul migliore)', en: 'vs the best)' })}` : '';
  return `<div style="margin-top:10px"><b>${tr({ it: 'Settori', en: 'Sectors' })}</b> — ${tr({ it: 'tu contro il meglio della griglia', en: 'you against the best of the grid' })}${w?` · ${w}`:''}<table style="margin-top:6px"><thead><tr><th>S</th><th class="right">${tr({ it: 'Tuo', en: 'Yours' })}</th><th class="right">${tr({ it: 'Migliore', en: 'Best' })}</th><th>${tr({ it: 'Da chi', en: 'By whom' })}</th><th class="right">Δ</th><th class="right">${tr({ it: 'Δ media top3', en: 'Δ top3 avg' })}</th></tr></thead><tbody>
    ${sec.sectors.map((s,i)=>`<tr><td>S${s.index}</td><td class="right">${s.mineText}</td><td class="right">${s.bestText}</td><td class="muted">${esc(s.bestName??'—')}</td><td class="right">${s.deltaMs==null?'—':(s.deltaMs>=0?'+':'')+(s.deltaMs/1000).toFixed(3)}</td><td class="right">${sec.top3Deltas[i]==null?'—':(sec.top3Deltas[i]>=0?'+':'')+(sec.top3Deltas[i]/1000).toFixed(3)}</td></tr>`).join('')}
    <tr><td class="faint">${tr({ it: 'teorico', en: 'ideal' })}</td><td class="right"><b>${sec.theoreticalText}</b></td><td class="right">${sec.bestLapText}</td><td colspan="3" class="faint">${sec.theoreticalGainText?`${tr({ it: 'giro teorico ', en: 'theoretical lap ' })}${sec.theoreticalGainText} ${tr({ it: 'sotto il tuo best', en: 'under your best' })}`:''}</td></tr>
  </tbody></table></div>`;
}


/* -------- libro delle auto -------- */
async function drawCars(m){
  const b = await api('cars');
  const money = (n) => Number(n ?? 0).toLocaleString(window.LOCALE ?? 'it-IT');
  const inLadder = new Set(b.rows.filter(r=>r.ladderId).map(r=>r.ladderId));
  const nRoad = b.rows.filter(r=>r.category==='road').length;
  const nRacing = b.rows.filter(r=>r.category==='racing').length;
  m.innerHTML = `
  <div class="panel">
    <h2>${tr({ it: 'Libro delle auto', en: 'Car book' })} <span class="h-act">${b.rows.length} ${tr({ it: 'render ufficiali Kunos', en: 'official Kunos renders' })}</span></h2>
    <div class="row" style="align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <input id="cars-q" type="text" placeholder="${tr({ it: "cerca un'auto…", en: 'search a car…' })}" style="flex:1;max-width:280px">
      <div id="cars-cat" style="display:flex;gap:6px">
        <button class="mini" data-cat="" style="border-color:var(--acc)">${tr({ it: 'Tutte', en: 'All' })} (${b.rows.length})</button>
        <button class="mini" data-cat="road">${tr({ it: 'Stradali', en: 'Road' })} (${nRoad})</button>
        <button class="mini" data-cat="racing">${tr({ it: 'Racing', en: 'Racing' })} (${nRacing})</button>
      </div>
      <label class="muted" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="cars-ladder" checked> ${tr({ it: 'solo auto del ladder (', en: 'ladder cars only (' })}${inLadder.size})</label>
    </div>
    <div id="cars-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px"></div>
  </div>`;
  let cat = '';
  const draw = () => {
    const q = $('#cars-q').value.toLowerCase();
    const onlyLadder = $('#cars-ladder').checked;
    const rows = b.rows.filter(r => (!cat || r.category===cat) && (!onlyLadder || r.ladderId) && (!q || r.name.toLowerCase().includes(q) || (r.ladderName??'').toLowerCase().includes(q)));
    const piBadge = (pi) => pi==null ? '' : `<span class="tag blue" style="font-size:10px;padding:1px 6px" title="${tr({ it: 'Perf. index dal server dedicato', en: 'Perf. index from the dedicated server' })}">PI ${pi.toFixed(1)}</span>`;
    $('#cars-grid').innerHTML = rows.map((r,i)=>{
      const eco = r.ladderId ? b.economy?.[r.ladderId] : null;
      const inGar = r.ladderId && b.inGarage?.includes(r.ladderId);
      const price = r.realPrice != null
        ? `<div style="margin-top:6px"><span class="tag gold" style="font-size:12px;padding:2px 8px" title="${tr({ it: 'prezzo reale indicativo (listino o mercato)', en: 'indicative real price (list or market)' })}">💰 ${money(r.realPrice)} €</span></div>`
        : (eco?.buy != null
          ? `<div style="margin-top:6px"><span class="tag gold" style="font-size:12px;padding:2px 8px" title="${tr({ it: 'prezzo di gioco (serie più conveniente)', en: 'in-game price (cheapest series)' })}">💰 ${money(eco.buy)} € <span class="muted" style="font-weight:400">(${tr({ it: 'di gioco', en: 'in-game' })})</span></span></div>`
          : `<div class="muted" style="margin-top:6px;font-size:11px">${tr({ it: 'prezzo non noto', en: 'price unknown' })}</div>`);
      return `<div class="panel car-click" data-i="${rows.indexOf(r)}" style="padding:0;overflow:hidden;cursor:pointer" title="${tr({ it: 'clicca per tutti i dettagli', en: 'click for full details' })}">
      <img class="car-frame" src="${r.image}" alt="${esc(r.name)}" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#0d1118">
      <div style="padding:8px 10px"><b style="font-size:12.5px">${esc(r.name)}</b> ${piBadge(r.pi)} <span class="faint" style="font-size:10px">${r.category==='racing'?` ${tr({ it: 'racing', en: 'racing' })}`:` ${tr({ it: 'stradale', en: 'road' })}`}</span>${inGar?` <span class="tag gold" style="font-size:10px;padding:1px 6px" title="${tr({ it: 'già nel tuo garage', en: 'already in your garage' })}">🏠 ${tr({ it: 'garage', en: 'garage' })}</span>`:''}
      ${price}
      ${r.specs?.power!=null?`<div class="muted" style="font-size:11px;margin-top:4px">${r.specs.power} CV · ${r.specs.weight!=null?r.specs.weight+' kg · ':''}${esc(r.specs.drive??'')}</div>`:''}
      ${r.variants?.length?`<div class="muted" style="font-size:11px;margin-top:2px">${tr({ it: 'varianti: ', en: 'variants: ' })}${esc(r.variants.join(', '))}</div>`:''}</div>
    </div>`;
    }).join('') || `<div class="empty">${tr({ it: 'Nessuna auto trovata.', en: 'No car found.' })}</div>`;
    $$('#cars-grid .car-click').forEach(el => el.onclick = () => carDetail(rows[Number(el.dataset.i)], b));
  };

  /* grafico curve motore: potenza in kW (linea piena) e coppia in Nm (tratteggiata) */
  function curveChart(spec){
    const P = spec.powerCurve, T = spec.torqueCurve;
    if (!P?.length && !T?.length) return '';
    const kW = (hp) => hp * 0.7355;
    const rpms = [...(P ?? []), ...(T ?? [])].map((p) => p[0]);
    const minR = Math.min(...rpms), maxR = Math.max(...rpms);
    if (maxR <= minR) return '';
    const maxP = P?.length ? Math.max(...P.map((p) => kW(p[1]))) : 0;
    const maxT = T?.length ? Math.max(...T.map((p) => p[1])) : 0;
    const W = 470, H = 160, PAD = 30;
    const x = (r) => PAD + (r - minR) / (maxR - minR) * (W - 2 * PAD);
    const yP = (v) => H - PAD - (v / (maxP || 1)) * (H - 2 * PAD);
    const yT = (v) => H - PAD - (v / (maxT || 1)) * (H - 2 * PAD);
    const line = (arr, yf) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${yf(p[1]).toFixed(1)}`).join(' ');
    return `<div style="margin-top:10px">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;background:#0d1118;border:1px solid var(--line);border-radius:8px">
        <line x1="${PAD}" y1="${H-PAD}" x2="${W-PAD/2}" y2="${H-PAD}" stroke="var(--line2)"/>
        <text x="${PAD}" y="14" fill="#8fa" font-size="11">${tr({ it: 'potenza kW', en: 'power kW' })}</text>
        <text x="${W-110}" y="14" fill="#f96" font-size="11">${tr({ it: 'coppia Nm', en: 'torque Nm' })}</text>
        <text x="${PAD}" y="${H-8}" fill="var(--dim)" font-size="10">${minR} ${tr({ it: 'giri/min', en: 'rpm' })}</text>
        <text x="${W-PAD-60}" y="${H-8}" fill="var(--dim)" font-size="10">${maxR} ${tr({ it: 'giri/min', en: 'rpm' })}</text>
        ${T?.length?`<path d="${line(T, yT)}" fill="none" stroke="#f96" stroke-width="2" stroke-dasharray="5 4"/>`:''}
        ${P?.length?`<path d="${line(P, yP)}" fill="none" stroke="#8fa" stroke-width="2.4"/>`:''}
      </svg>
      <div class="muted" style="font-size:11px;margin-top:3px">${tr({ it: 'Picchi: ', en: 'Peaks: ' })}${maxP?maxP.toFixed(0)+' kW':'—'} · ${maxT?maxT.toFixed(0)+' Nm':'—'} (${tr({ it: "curve dall'installazione di Assetto Corsa 1", en: "curves from your Assetto Corsa 1 install" })})</div>
    </div>`;
  }

  /* finestra dettagli auto: scheda tecnica completa, grafico, economia e garage */
  function carDetail(r, book){
    const eco = r.ladderId ? book.economy?.[r.ladderId] : null;
    const inGar = r.ladderId && book.inGarage?.includes(r.ladderId);
    const s = r.specs ?? null;
    const row = (k, v) => v != null && v !== '' && v !== '—' ? `<div style="display:flex;justify-content:space-between;gap:14px;padding:5px 0;border-bottom:1px solid var(--line)"><span class="muted">${k}</span><b style="text-align:right">${v}</b></div>` : '';
    modal(r.name, `
      <img src="${r.image}" alt="${esc(r.name)}" style="width:100%;border-radius:10px;background:#0d1118;margin-bottom:12px">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        <span class="tag ${r.category==='racing'?'blue':''}">${r.category==='racing'?tr({ it: 'racing', en: 'racing' }):tr({ it: 'stradale', en: 'road' })}</span>
        ${r.pi!=null?`<span class="tag blue">PI ${r.pi.toFixed(1)}</span>`:''}
        ${r.realPrice!=null?`<span class="tag gold" title="${tr({ it: 'prezzo reale indicativo', en: 'indicative real price' })}">💰 ~${money(r.realPrice)} € ${tr({ it: 'reali', en: 'real' })}</span>`:(eco?.buy!=null?`<span class="tag gold">💰 ${tr({ it: 'acquisto ', en: 'buy ' })}${money(eco.buy)} € (${tr({ it: 'gioco', en: 'in-game' })})</span>`:'')}
        ${inGar?`<span class="tag gold">🏠 ${tr({ it: 'nel tuo garage', en: 'in your garage' })}</span>`:''}
      </div>
      ${s ? `
      <h3 style="margin:4px 0 2px;font-size:13px">${tr({ it: 'Scheda tecnica', en: 'Tech specs' })}</h3>
      ${row(tr({ it: 'Potenza', en: 'Power' }), s.power!=null?`${s.power} ${tr({ it: 'CV', en: 'hp' })} (${(s.power*0.7355).toFixed(0)} kW)`:null)}
      ${row(tr({ it: 'Coppia', en: 'Torque' }), s.torque!=null?`${s.torque} Nm`:null)}
      ${row(tr({ it: 'Peso', en: 'Weight' }), s.weight!=null?`${s.weight} kg`:null)}
      ${row(tr({ it: 'Peso/potenza', en: 'Power/weight' }), s.pwratio!=null?esc(String(s.pwratio)):(s.power&&s.weight?`${(s.weight/s.power).toFixed(2)} kg/${tr({ it: 'CV', en: 'hp' })}`:null))}
      ${row(tr({ it: 'Trazione', en: 'Drivetrain' }), s.drive?esc(s.drive):null)}
      ${row(tr({ it: 'Cambio', en: 'Gearbox' }), s.gearbox?esc(s.gearbox):null)}
      ${row(tr({ it: 'Velocità massima', en: 'Top speed' }), s.topspeed?esc(String(s.topspeed)):null)}
      ${row(tr({ it: 'Accelerazione', en: 'Acceleration' }), s.acceleration?esc(String(s.acceleration)):null)}
      ${row(tr({ it: 'Anno', en: 'Year' }), s.year??null)}
      ${row(tr({ it: 'Nazione', en: 'Country' }), s.country?esc(s.country):null)}
      ${curveChart(s)}` : `<div class="muted" style="margin-top:8px;font-size:12px">${tr({ it: 'Scheda tecnica non disponibile per questo modello.', en: 'No tech specs available for this model.' })}</div>`}
      <h3 style="margin:14px 0 2px;font-size:13px">${tr({ it: 'Nella carriera', en: 'In the career' })}</h3>
      ${row(tr({ it: 'Nome nella carriera', en: 'Name in the career' }), r.ladderName ? esc(r.ladderName) : (r.ladderId ? esc(r.ladderId) : null))}
      ${row(tr({ it: 'Prezzo reale indicativo', en: 'Indicative real price' }), r.realPrice != null ? money(r.realPrice) + ' €' : null)}
      ${row(tr({ it: 'Acquisto sedile (gioco)', en: 'Seat buy-out (in-game)' }), eco?.buy != null ? money(eco.buy) + ' €' : null)}
      ${row(tr({ it: 'Iscrizione per gara (da)', en: 'Entry fee per race (from)' }), eco?.entry != null ? money(eco.entry) + ' €' : null)}
      ${row(tr({ it: 'Premio di gara (fino a)', en: 'Race prize (up to)' }), eco?.prize != null ? money(eco.prize) + ' €' : null)}
      ${row(tr({ it: 'Varianti disponibili', en: 'Available variants' }), r.variants?.length ? esc(r.variants.join(', ')) : null)}
      ${eco?.series?.length ? `<div class="muted" style="margin-top:10px;font-size:12px">${tr({ it: 'Serie dove puoi correrla: ', en: 'Series where you can race it: ' })}${eco.series.map(esc).join(' · ')}</div>` : `<div class="muted" style="margin-top:10px;font-size:12px">${tr({ it: "Questa auto non è usata dalle serie di carriera: la puoi solo aggiungere al garage.", en: 'This car is not used by career series: you can only add it to the garage.' })}</div>`}
      ${r.shTop!=null?`<div class="muted" style="margin-top:6px;font-size:12px">${tr({ it: 'Baseline telemetry (SH) top: ', en: 'Baseline telemetry (SH) top: ' })}${(r.shTop*100).toFixed(1)}%</div>`:''}
    `, [[tr({ it: 'Chiudi', en: 'Close' }),'ghost',()=>{}]]);
  }
  $$('#cars-cat button').forEach(btn => btn.onclick = () => {
    cat = btn.dataset.cat;
    $$('#cars-cat button').forEach(x => x.style.borderColor = x===btn ? 'var(--acc)' : '');
    draw();
  });
  $('#cars-q').oninput = draw;
  $('#cars-ladder').onchange = draw;
  draw();
}

/* -------- garage personale -------- */
async function drawGarage(m){
  const g = await api('my-garage');
  const cat = await api('garage-catalog');
  const badge = (how, note) => String(note ?? '').startsWith('relic di famiglia')
    ? `<span class="tag gold" title="${tr({ it: 'auto dell\'antenato, arrivata con l\'eredità', en: 'the ancestor\'s car, arrived with the inheritance' })}">📜 ${tr({ it: 'relic di famiglia', en: 'family relic' })}</span>`
    : how === 'won'
    ? `<span class="tag gold" title="${tr({ it: 'vinta in un evento speciale', en: 'won in a special event' })}">🏆 ${tr({ it: 'vinta', en: 'won' })}</span>`
    : `<span class="tag blue" title="${tr({ it: 'acquistata', en: 'bought' })}">💰 ${tr({ it: 'comprata', en: 'bought' })}</span>`;
  m.innerHTML = `
  <div class="panel">
    <h2>${tr({ it: 'Garage', en: 'Garage' })} <span class="h-act">${g.total} ${tr({ it: 'auto · ', en: 'cars · ' })}${g.won} ${tr({ it: 'vinte · ', en: 'won · ' })}${g.bought} ${tr({ it: 'comprate · ', en: 'bought · ' })}${g.totalWins} ${tr({ it: 'vittorie · patrimonio ', en: 'wins · estate worth ' })}${money(g.patrimony)} €</span></h2>
    ${g.justImported?.length ? `<div class="banner ok" style="margin-bottom:10px">🏆 ${tr({ it: 'Entrate in garage: ', en: 'Cars joined the garage: ' })}${esc(g.justImported.join(', '))}</div>` : ''}
    <div class="row" style="align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <select id="g-add" style="flex:1;min-width:220px">
        <option value="">— ${tr({ it: "aggiungi un'auto dal catalogo…", en: 'add a car from the catalog…' })}</option>
        ${cat.cars.map(c=>`<option value="${esc(c.id)}" data-name="${esc(c.name)}">${esc(c.name)}${c.pi!=null?` (PI ${c.pi.toFixed(1)})`:''}</option>`).join('')}
      </select>
      <select id="g-how" style="width:130px"><option value="bought">${tr({ it: 'comprata', en: 'bought' })}</option><option value="won">${tr({ it: 'vinta', en: 'won' })}</option></select>
      <button class="act" id="g-addbtn" style="width:auto;padding:8px 14px">${tr({ it: 'Aggiungi', en: 'Add' })}</button>
      <span class="muted" style="font-size:11px">${tr({ it: 'Le auto vinte negli eventi speciali arrivano qui da sole.', en: 'Cars won in special events arrive here by themselves.' })}</span>
    </div>
    <div id="g-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px"></div>
  </div>`;
  const draw = (gg) => {
    $('#g-grid').innerHTML = gg.cars.map(c=>`
    <div class="panel" style="padding:0;overflow:hidden" data-car="${esc(c.carId)}">
      ${c.image?`<img class="car-frame" src="${c.image}" alt="${esc(c.carName)}" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#0d1118">`:''}
      <div style="padding:9px 11px">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b style="font-size:13px">${esc(c.carName)}</b> ${badge(c.how, c.note)}${c.pi!=null?`<span class="tag blue" style="font-size:10px;padding:1px 6px" title="Perf. index dal server dedicato">PI ${c.pi.toFixed(1)}</span>`:''}</div>
        <div class="muted" style="font-size:11px;margin-top:3px">${tr({ it: 'nel garage dal ', en: 'in the garage since ' })}${esc(new Date(c.since).toLocaleDateString(window.LOCALE ?? 'it-IT'))}${c.note?` · ${esc(legacyIt(c.note))}`:''}</div>
        <div style="display:flex;gap:10px;margin-top:7px;font-size:12px;flex-wrap:wrap">
          <span title="${tr({ it: 'gare con questa auto', en: 'races with this car' })}">🏁 ${c.stats.races} ${tr({ it: 'gare', en: 'races' })}</span>
          <span title="${tr({ it: 'vittorie', en: 'wins' })}" style="color:var(--good)">🥇 ${c.stats.wins}</span>
          <span title="${tr({ it: 'podio', en: 'podium' })}">🎯 ${c.stats.podiums}</span>
          <span title="${tr({ it: 'chilometri percorsi in gara con noi (giri × lunghezza pista)', en: 'kilometers raced with us (laps × track length)' })}">🛣 ${money(c.stats.km)} km</span>
          ${c.stats.bestLap?`<span class="muted" title="${tr({ it: 'miglior giro in carriera', en: 'career best lap' })}">⏱ ${esc(c.stats.bestLap)}</span>`:''}
        </div>
        <div style="margin-top:7px;font-size:12px"><b>${tr({ it: 'valutata ', en: 'appraised ' })}${money(c.value)} €</b> <span class="muted" style="font-size:10.5px" title="${tr({ it: 'prezzo reale svalutato dai km (', en: 'real price depreciated by km (' })}${Math.round(c.valueFactor*100)}%)">${c.realPrice!=null?`(${tr({ it: 'nuova ~', en: 'new ~' })}${money(c.realPrice)} €)`:''}</span> · <span style="color:var(--good)">${tr({ it: 'vendita ', en: 'sale ' })}${money(c.sale)} €</span></div>
        <div class="row" style="margin-top:8px;gap:6px">
          <input class="g-note" type="text" placeholder="${tr({ it: 'nota (es. livrea, assetto…)...', en: 'note (e.g. livery, setup…)...' })}" value="${esc(c.note ?? '')}" style="flex:1;min-width:120px;font-size:11px">
          <button class="mini g-savenote">${tr({ it: 'salva', en: 'save' })}</button>
          <button class="mini g-sell" title="${tr({ it: 'vendi al 70% della valutazione', en: 'sell at 70% of the appraisal' })}">${tr({ it: 'vendi', en: 'sell' })}</button>
        </div>
      </div>
    </div>`).join('') || `<div class="empty">${tr({ it: "Garage vuoto: vinci un evento speciale o aggiungi un'auto dal catalogo.", en: 'Empty garage: win a special event or add a car from the catalog.' })}</div>`;
    $$('#g-grid .g-savenote').forEach(b => b.onclick = async () => {
      const card = b.closest('[data-car]');
      try { const out = await api('garage-note', { carId: card.dataset.car, note: $('.g-note', card).value }); draw(out.garage); toast(tr({ it: 'Nota salvata.', en: 'Note saved.' }), 'ok'); }
      catch(e){ toast(e.message, 'err'); }
    });
    $$('#g-grid .g-sell').forEach(b => b.onclick = async () => {
      const card = b.closest('[data-car]');
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.style.borderColor = 'var(--bad)'; b.textContent = tr({ it: 'confermi?', en: 'confirm?' }); setTimeout(()=>{ b.dataset.armed=''; b.style.borderColor=''; b.textContent=tr({ it: 'vendi', en: 'sell' }); }, 3000); return; }
      try {
        const out = await api('garage-sell', { carId: card.dataset.car });
        draw(out.garage); paintHeader(out.header); refreshBoot();
        toast(`${tr({ it: 'Venduta: +', en: 'Sold: +' })}${money(out.sold.gain)} € (${money(out.sold.km)} km).`, 'ok');
      }
      catch(e){ toast(e.message, 'err'); }
    });
  };
  draw(g);
  $('#g-addbtn').onclick = async () => {
    const sel = $('#g-add');
    if (!sel.value) return toast(tr({ it: "Scegli prima un'auto dal menu.", en: 'Pick a car from the menu first.' }), 'err');
    try {
      const out = await api('garage-add', { carId: sel.value, carName: sel.selectedOptions[0].dataset.name, how: $('#g-how').value });
      sel.value = ''; draw(out.garage); toast(out.reused ? tr({ it: 'Auto già in garage.', en: 'Car already in the garage.' }) : tr({ it: 'Auto aggiunta al garage.', en: 'Car added to the garage.' }), out.reused ? 'info' : 'ok');
    } catch(e){ toast(e.message, 'err'); }
  };
}

/* -------- libro delle piste -------- */
async function drawTracks(m){
  const t = await api('tracks');
  const lapMs = (s) => { const m = String(s??'').match(/^(\d+):(\d{2})\.(\d{3})$/); return m ? (+m[1])*60000 + (+m[2])*1000 + (+m[3]) : null; };
  const flag = (c) => ({ 'Italia':'🇮🇹','Italy':'🇮🇹','Giappone':'🇯🇵','Japan':'🇯🇵','Austria':'🇦🇹','Australia':'🇦🇺','Germania':'🇩🇪','Germany':'🇩🇪','Stati Uniti':'🇺🇸','USA':'🇺🇸','Regno Unito':'🇬🇧','United Kingdom':'🇬🇧','Belgio':'🇧🇪','Belgium':'🇧🇪','Sudafrica':'🇿🇦','South Africa':'🇿🇦','Francia':'🇫🇷','France':'🇫🇷' }[c] ?? '🏁');
  const rows = t.rows.map((r) => `<tr>
    <td><b>${flag(r.info?.country)} ${esc(r.track)}</b>${r.id===t.next?.id?` <span class="tag gold" style="font-size:10px;padding:1px 6px">${tr({ it: 'prossima', en: 'next' })}</span>`:''}${r.inLadder?'':` <span class="faint">(${tr({ it: 'fuori ladder', en: 'off ladder' })})</span>`}</td>
    <td class="muted">${r.info?esc(tr({ it: r.info.nick, en: r.info.nickEn })):''}</td>
    <td class="right"><b>${r.personal?esc(r.personal.time):'—'}</b>${r.personal?`<br><span class="faint" style="font-size:11px">${esc(r.personal.car??'')}</span>`:''}</td>
    <td class="right">${r.session?`<b>${esc(r.session.time)}</b> <span class="faint">${esc(r.session.driver)}${r.session.mine?` (${tr({ it: 'tu', en: 'you' })})`:''}</span>`:'—'}</td>
    <td class="right">${(() => { const a=lapMs(r.personal?.time), b=lapMs(r.session?.time); return (a&&b)?(b<a?`<span class="tag gold" style="font-size:10px;padding:1px 6px">−${((a-b)/1000).toFixed(3)}</span>`:`<span class="tag green" style="font-size:10px;padding:1px 6px">+${((b-a)/1000).toFixed(3)}</span>`):'—'; })()}</td>
    <td>${r.info?`<button class="mini b-hist" data-hist="${esc(r.id)}">📚 ${tr({ it: 'storia & risultati', en: 'history & results' })}</button>`:''}</td>
  </tr>`).join('');
  m.innerHTML = `
  <div class="panel">
    <h2>${tr({ it: 'Libro delle piste', en: 'Track book' })} <span class="h-act">${tr({ it: 'record personali e di sessione, per tracciato e per layout, con la storia di ogni pista', en: 'personal and session records, per track and layout, with each track\'s history' })}</span></h2>
    <div class="muted" style="margin-bottom:10px">${tr({ it: 'Il <b>record personale</b> è il tuo miglior giro (carriera + prove). Il <b>record di sessione</b> è il migliore mai visto nei risultati sulla stessa auto (tuo o di un rivale: è il tempo da battere). La <b>📚 storia</b> apre la scheda completa: immagini, la storia del tracciato e i record di ogni configurazione.', en: 'The <b>personal record</b> is your best lap (career + practice). The <b>session record</b> is the best ever seen in results on the same car (yours or a rival\'s: it is the time to beat). The <b>📚 history</b> opens the full card: images, the track\'s history and each layout\'s records.' })}</div>
    <table><thead><tr><th>${tr({ it: 'Pista', en: 'Track' })}</th><th>${tr({ it: 'Soprannome', en: 'Nickname' })}</th><th class="right">${tr({ it: 'Tuo record', en: 'Your record' })}</th><th class="right">${tr({ it: 'Record di sessione', en: 'Session record' })}</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>
  <div id="track-hist"></div>`;
  $$('button[data-hist]').forEach((b) => b.onclick = () => {
    const r = t.rows.find((x) => x.id === b.dataset.hist);
    const i = r?.info;
    $('#track-hist').innerHTML = !i ? '' : `<div class="panel" style="margin-top:14px"><h2>${flag(i.country)} ${esc(i.fullName)} <span class="h-act">${esc(tr({ it: i.country, en: i.countryEn }))} · ${i.lengthKm} km · ${i.corners} ${tr({ it: 'curve · inaugurato nel ', en: 'corners · opened in ' })}${i.opened}</span></h2>
      ${i.photo ? `<img src="${i.photo}" alt="${tr({ it: 'vista aerea di ', en: 'aerial view of ' })}${esc(r.track)}" style="width:100%;max-width:520px;aspect-ratio:16/9;object-fit:cover;background:#000;border-radius:10px;margin-bottom:10px">` : (i.map ? `<img src="${i.map}" alt="${tr({ it: 'tracciato ', en: 'layout ' })}${esc(r.track)}" style="width:100%;max-width:420px;object-fit:contain;background:#000;border-radius:10px;padding:12px;margin-bottom:10px${i.map.endsWith('.svg')?';filter:invert(1);opacity:.92':''}">` : '')}
      ${r.layoutRows?.length>1 ? `<h3 style="margin:0 0 6px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim)">${tr({ it: 'Record per configurazione (', en: 'Records by configuration (' })}${r.layoutRows.length} ${tr({ it: 'layout)', en: 'layouts)' })}</h3>
      <table style="margin-bottom:10px"><thead><tr><th>${tr({ it: 'Layout', en: 'Layout' })}</th><th class="right">${tr({ it: 'Lunghezza', en: 'Length' })}</th><th class="right">${tr({ it: 'Box', en: 'Pits' })}</th><th class="right">${tr({ it: 'Tuo miglior', en: 'Your best' })}</th><th class="right">${tr({ it: 'Record di sessione', en: 'Session record' })}</th></tr></thead><tbody>${r.layoutRows.map(l=>`<tr><td><b>${esc(l.layout)}</b></td><td class="right">${l.lengthKm??'—'} km</td><td class="right">${l.pits??'—'}</td><td class="right">${l.mine?`<b>${esc(l.mine.time)}</b>${l.mineFallback?'<span class="faint"> *</span>':''}`:'—'}</td><td class="right">${l.session?`${esc(l.session.time)} <span class="faint">${esc(l.session.driver)}</span>`:'—'}</td></tr>`).join('')}</tbody></table><div class="faint" style="margin:-6px 0 10px;font-size:11px">* ${tr({ it: 'dal record personale in carriera/prove (una sola configurazione corsa: il save non distingue i layout)', en: 'from the personal record in career/practice (only one layout raced: the save does not distinguish layouts)' })}</div>` : ''}
      <div style="line-height:1.6">${esc(tr({ it: i.history, en: i.historyEn }))}</div></div>`;
    $('#track-hist').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
;
}

/* -------- grafico del giro: velocità + bande gas/freno + differenza --------- */
/* t = risposta di api('garage', {action:'laptrace'}): points/compare. SVG in stile curveChart */
function lapChartSvg(t){
  if (!t?.ok || !t.points?.length) return '';
  const P = t.points, C = t.compare;
  const W = 760, H = 250, PAD = 34, DBAND = 46;   // DBAND = banda della differenza in fondo
  const maxV = Math.max(...P.map((p) => p.v)) * 1.05 || 1, minV = 0;
  const maxDv = Math.max(1, ...(C?.dv ?? [0]).map(Math.abs));
  const x = (px) => PAD + px * (W - 2 * PAD);
  const yV = (v) => (H - PAD - DBAND) - ((v - minV) / (maxV - minV)) * (H - 2 * PAD - DBAND);
  const pol = (vals, yf) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(P[i].x).toFixed(1)},${yf(v).toFixed(1)}`).join(' ');
  /* bande gas/freno: segmento = zona fra due campioni col valore sopra soglia */
  const strip = (get, yTop, height, color, soglia = 0.12) => {
    const seg = [];
    let open = null;
    for (let i = 0; i < P.length; i++) {
      const on = get(P[i]) >= soglia;
      if (on && open == null) open = P[i].x;
      if ((!on || i === P.length - 1) && open != null) { seg.push(`<rect x="${x(open)}" y="${yTop}" width="${Math.max(1, x(P[i].x) - x(open))}" height="${height}" fill="${color}" opacity="0.8"/>`); open = null; }
    }
    return seg.join('');
  };
  const yDelta = (dv) => (H - 10) - ((dv / maxDv) * (DBAND / 2 - 4));
  const zeroY = yDelta(0);
  const dvPath = C ? C.dv.map((dv, i) => `${i ? 'L' : 'M'}${x(P[i].x).toFixed(1)},${yDelta(dv).toFixed(1)}`).join(' ') : '';
  const cmpLine = C ? `<path d="${pol(P.map((p, i) => p.v - C.dv[i]), yV)}" fill="none" stroke="#f96" stroke-width="2" stroke-dasharray="6 4"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;background:#0d1118;border:1px solid var(--line);border-radius:8px">
    <line x1="${PAD}" y1="${zeroY}" x2="${W - PAD / 2}" y2="${zeroY}" stroke="var(--line2)"/>
    <line x1="${PAD}" y1="${yV(0)}" x2="${PAD}" y2="${yV(maxV)}" stroke="var(--line2)"/>
    <text x="${PAD}" y="14" fill="#8fa" font-size="11">${tr({ it: 'giro ', en: 'lap ' })}${t.lap} (${t.durationSec}s) — km/h</text>
    ${C ? `<text x="${W - 300}" y="14" fill="#f96" font-size="11">${tr({ it: 'giro ', en: 'lap ' })}${C.lap} (${C.durationSec}s)</text>` : ''}
    <text x="${PAD}" y="${yV(maxV) + 14}" fill="var(--dim)" font-size="10">${Math.round(maxV)} km/h</text>
    <text x="${PAD}" y="${H - 6}" fill="#7f7" font-size="10">${tr({ it: 'differenza col confronto: verde = sei più veloce · rosso = più lento', en: 'delta vs comparison: green = you are faster · red = slower' })}</text>
    ${strip((p) => p.br ?? 0, H - PAD - DBAND + 4, 8, '#f55')}
    ${strip((p) => p.th ?? 0, H - PAD - DBAND + 14, 8, '#6f6')}
    ${C ? `<path d="M${x(P[0].x).toFixed(1)},${zeroY} ${C.dv.map((dv, i) => `L${x(P[i].x).toFixed(1)},${yDelta(dv).toFixed(1)}`).join(' ')} L${x(P[P.length - 1].x).toFixed(1)},${zeroY} Z" fill="#55886655"/>` : ''}
    ${C ? `<path d="${dvPath}" fill="none" stroke="#7f7" stroke-width="1.6"/>` : ''}
    ${cmpLine}
    <path d="${pol(P.map((p) => p.v), yV)}" fill="none" stroke="#8fa" stroke-width="2.4"/>
  </svg>`;
}

/* -------- setup / pressioni -------- */
async function drawSetup(m){
  const [b, card, live, h] = await Promise.all([api('garage', {}), api('card').catch(() => null), api('live').catch(() => null), api('system-health').catch(() => null)]);
  // l'auto SEGUE IL GIOCO: se EVO è aperto con un'auto attiva, quella è la voce
  // giusta (giri con la F2004 mentre la serie è la RX-7); se chiuso, resta
  // l'auto della serie corrente.
  const liveCar = live?.game && live?.player?.car ? String(live.player.car).trim() : null;
  /* SEGUE LA MACCHINA IN PISTA (Mauro 21/10: con la SF-25 a Monza il pannello
     restava sulla RX-7 della serie). Ordine di scelta dell'auto:
     1. EVO aperto con un'auto attiva → quella, come prima;
     2. EVO chiuso → l'auto della telemetria PIÙ RECENTE su qualunque pista
        (il server 'sessions' senza auto uscita già filtra a un'unica AUTOp vorbe);
     3. niente telemetria → l'auto della serie corrente (come prima). */
  let carSel = liveCar ? { carName: liveCar } : null;
  let any = null;
  if (!carSel) {
    any = await api('garage', { action: 'sessions', track: 'all' }).catch(() => null);
    const latestCar = any?.sessions?.[0]?.car ?? null;
    if (latestCar) carSel = { carName: latestCar };
  }
  if (!carSel && card?.carName) carSel = { carName: card.carName };
  function fmtLapS(s){ if(s==null||!Number.isFinite(s)) return '—'; const m=Math.floor(s/60); const r=s-m*60; return m+':'+r.toFixed(1).padStart(4,'0'); }
  const tel = (any && carSel && any.sessions?.length) ? any : await api('garage', { action: 'sessions', car: carSel?.carName ?? null, track: null }).catch(() => ({ found: false, sessions: [], advice: {} }));
  const list = tel.sessions ?? [];
  const cur = list[0];
  const psi = (v) => (v == null ? '—' : Number(v).toFixed(1));
  const telHtml = list.length ? (() => {
    const s = cur;
    const adv = tel.advice ?? {};
    const race = tel.raceAdvice ?? {};
    // il consiglio gara è onesto solo se la telemetria è della pista del round corrente
    const normTrk = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const offTrack = race.ok && tel.basisTrack && tel.trackDisplay && normTrk(tel.basisTrack) !== normTrk(tel.trackDisplay) && !normTrk(tel.trackDisplay).startsWith(normTrk(tel.basisTrack)) && !normTrk(tel.basisTrack).startsWith(normTrk(tel.trackDisplay));
    // I DUE consigli (gara vs base) spesso dicono la STESSA partenza: se combacia,
    // si mostra solo quello di gara con una nota “base telemetria conferma”.
    const doppio = race.ok && race.raceStartPsi != null && adv.ok && adv.suggestedStartPsi != null
      && Math.abs(race.raceStartPsi - adv.suggestedStartPsi) < 0.25;
    const advHtml = race.ok && race.raceStartPsi != null
      ? `<div class="banner good" style="margin-top:8px"><b>🏁 ${tr({ it: 'PER LA GARA (', en: 'FOR THE RACE (' })}${tel.raceLaps ?? '?'} ${tr({ it: 'giri): parti da ', en: 'laps): start from ' })}<b>${race.raceStartPsi} PSI</b></b> — ${tr({ it: 'finestra ', en: 'window ' })}${race.raceRange?.[0]}–${race.raceRange?.[1]} PSI<br>
         <span class="muted">${tr({ it: 'Qualifica / giri secchi: ', en: 'Quali / clean laps: ' })}${race.qualiStartPsi} PSI · ${tr({ it: 'Target a caldo ', en: 'Hot target ' })}${tel.target} PSI${doppio ? ` · <b>${tr({ it: 'base telemetria: conferma la stessa partenza', en: 'base telemetry: confirms the same start' })}</b> (${adv.suggestedStartPsi} PSI)` : ''}<br>${esc(race.raceAdvice ?? '')}${offTrack ? `<br>⚠️ ${tr({ it: "Consiglio basato sull'ultima uscita su ", en: 'Advice based on the last outing at ' })}<b>${esc(tel.basisTrack)}</b>${tr({ it: ', non su ', en: ', not on ' })}${esc(tel.trackDisplay)}: ${tr({ it: 'fai qualche giro lì per metterlo a punto su questa pista', en: 'run a few laps there to fine-tune it for this track' })}` : ''}</span></div>`
        + (doppio ? '' : `<div class="banner info" style="margin-top:6px"><b>💡 ${tr({ it: 'Base telemetria', en: 'Base telemetry' })}</b> (${tr({ it: 'uscite brevi', en: 'short outings' })}): ${tr({ it: 'parti da ', en: 'start from ' })}<b>${adv.suggestedStartPsi} PSI</b> (${tr({ it: 'finestra ', en: 'window ' })}${adv.range?.[0]}–${adv.range?.[1]})<br><span class="muted">${esc(adv.advice)}</span></div>`)
      : (adv.ok
        ? `<div class="banner good" style="margin-top:8px"><b>💡 ${tr({ it: 'Pressione consigliata (', en: 'Recommended pressure (' })}${esc(tel.classLabel ?? '')}): ${tr({ it: 'parti da ', en: 'start from ' })}<b>${adv.suggestedStartPsi} PSI</b></b> (${tr({ it: 'finestra ', en: 'window ' })}${adv.range?.[0]}–${adv.range?.[1]} PSI, ${tr({ it: 'target a caldo ', en: 'hot target ' })}${tel.target} PSI)<br><span class="muted">${esc(adv.advice)}</span></div>`
        : (adv.advice ? `<div class="banner info" style="margin-top:8px">${esc(adv.advice)}</div>` : ''));
    const logRows = (tel.log ?? []).map((e) => `<tr><td class="muted">${esc(String(e.at).replace('T',' ').slice(0,16))}</td><td>${esc(e.car)}</td><td>${esc(e.track)}</td><td class="right"><b>${e.suggestedStartPsi} PSI</b></td><td>${esc(e.basisKindLabel ?? '—')}</td></tr>`).join('');
    const telLaps = tel.telemetryLaps ?? 10;
    /* LA LISTA COLORATA DEL BOX: lo stato dell'assetto area per area, capibile
       al volo appena esci dal gioco (richiesta 21/10). Quando tutto è verde il
       meccanico «canta vittoria invece di ripetere lo stesso consiglio». */
    const cl = tel.checklist ?? null;
    /* l'IDENTITÀ del meccanico: la figura del box, col suo umore e i monitor
       di punta (richiesta Mauro 21/10: «il meccanico è una figura fondamentale») */
    const mechStato = {
      bad: (cl?.items ?? []).filter((i) => i.level === 'bad').length,
      warn: (cl?.items ?? []).filter((i) => i.level === 'warn').length,
      areas: cl?.items?.length ?? 0,
      stale: !!tel.stale?.changed,
      live: live?.game ? (live?.live ? tr({ it: 'in pista', en: 'on track' }) : tr({ it: 'aperto', en: 'open' })) : null,
      telem: h?.telem?.lastLd ? new Date(h.telem.lastLd.mtimeMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null,
    };
    /* SETUP PIÙ NUOVO DELL'ULTIMA SESSIONE: il meccanico giudica i dati vecchi —
       mostrato GRANDE sopra la checklist, non solo come chip (Mauro 21/10). */
    const staleHtml = tel.stale?.changed
      ? `<div class="banner warn" style="margin:10px 0 0;padding:10px 12px">⚠️ <b>${tr({ it: "Setup montato più recente dell'ultima uscita", en: 'Newer setup fitted after the last outing' })}</b> — ${tr({ it: 'la base dati del meccanico (giri, bump, camber, freni) parla della sessione di ', en: 'the mechanic\'s data (laps, bump, camber, brakes) refers to the session of ' })}<b>${esc(tel.stale.lastSession ?? '?')}</b>, ${tr({ it: 'ma il file di setup attivo è ', en: 'but the active setup file is ' })}<b>«${esc(tel.stale.file)}»</b> ${tr({ it: 'salvato alle ', en: 'saved at ' })}${esc(tel.stale.setupWhen ?? '')}.<br><span class="muted" style="font-size:11.5px">${tr({ it: 'Fai 2 giri con il nuovo assetto (telemetria attiva): appena il .ld esce, tutta l\'analisi si rigenera sui dati freschi. Il consiglio pressioni resta valido: si proietta sui TARGET, non sui valori del vecchio setup.', en: 'Do 2 laps with the new setup (telemetry on): as soon as the .ld appears, the whole analysis rebuilds on fresh data. The pressure advice stays valid: it projects onto TARGETS, not the old setup values.' })}</span></div>`
      : '';
    const DOT = { ok: '🟢', warn: '🟠', bad: '🔴', info: '🔸' };
    const clHtml = cl ? (
      cl.allGood
        ? `<div class="banner good" style="margin:10px 0;padding:10px 12px">🟢 <b>${tr({ it: 'Auto a punto — il meccanico non ha più niente da consigliare.', en: "Car dialed in — the mechanic has nothing more to suggest." })}</b> <span class="muted" style="font-size:11.5px">${tr({ it: 'Nessuna voce sotto soglia: puoi girare col setup attuale — la lista riparte colorata se qualcosa esce fuori al prossimo giro.', en: 'No item below threshold: you can run the current setup — the list lights up again if anything goes out on the next lap.' })}</span></div>`
        : `<ul style="margin:10px 0 4px;padding:0;list-style:none;font-size:13px;line-height:1.75">
      ${cl.items.map((i) => `<li style="margin:0">${DOT[i.level] ?? '🔸'} <b>${esc(i.area)}</b> — ${esc(i.text)}</li>`).join('\n      ')}
    </ul>`
    ) : '';
    /* SETUP RISISTEMATO: il GRAFICO DELLA TELEMETRIA è la prima cosa si vede,
       grande e a tutta larghezza; consigli, sessioni, diagnostica sotto. */
    return `<div class="panel setup-hero">
      <div class="setup-hero-head">
        <span class="setup-hero-title">📈 ${tr({ it: 'GRAFICO DEL GIRO', en: 'LAP CHART' })}</span>
        <span class="setup-hero-sub">${esc(tel.car ?? s.car ?? '')} · ${esc(s.track ?? tel.trackDisplay ?? '')} · ${tr({ it: 'velocità, gas e freno, confronto fra giri', en: 'speed, throttle and brake, lap comparison' })}</span>
      </div>
    <div id="meccanico-out" style="margin:0 0 10px"></div>
    <div class="lc-controls row" style="gap:10px;flex-wrap:wrap;align-items:center">
      <label class="muted">${tr({ it: 'Sessione', en: 'Session' })}<br><select id="lc-session" style="width:300px">${list.map((x) => `<option value="${esc(x.file)}" data-track="${esc(x.track ?? '')}" ${x.file === s.file ? 'selected' : ''}>${esc(x.whenLocal ?? x.when ?? '')} · ${esc(x.track ?? '')} · ${x.validLaps ?? '?'} ${tr({ it: 'giri', en: 'laps' })}</option>`).join('') || `<option value="">(${tr({ it: 'nessuna', en: 'none' })})</option>`}</select></label>
      <label class="muted">${tr({ it: 'Giro', en: 'Lap' })}<br><select id="lc-lap" style="width:170px">${(() => { const vl = (s.laps ?? []).filter(l => l.durationSec > 15); const best = vl.length ? vl.reduce((b, l) => (l.durationSec < b.durationSec ? l : b), vl[0]) : null; return vl.map(l => `<option value="${l.lap}" ${best && l.lap === best.lap ? 'selected' : ''}>${tr({ it: 'giro ', en: 'lap ' })}${l.lap} — ${(l.durationSec).toFixed(1)}s</option>`).join(''); })()}</select></label>
      <label class="muted">${tr({ it: 'Confronto', en: 'Compare' })}<br><select id="lc-cmp" style="width:190px"><option value="best">${tr({ it: 'miglior altro giro', en: 'best other lap' })}</option>${(() => { const vl = (s.laps ?? []).filter(l => l.durationSec > 15); const best = vl.length ? vl.reduce((b, l) => (l.durationSec < b.durationSec ? l : b), vl[0]) : null; return vl.filter(l => !best || l.lap !== best.lap).map(l => `<option value="${l.lap}">${tr({ it: 'giro ', en: 'lap ' })}${l.lap} — ${(l.durationSec).toFixed(1)}s</option>`).join(''); })()}</select></label>
      <button class="act" id="lc-go" type="button">🔄 ${tr({ it: 'Ridisegna', en: 'Redraw' })}</button>
    </div>
    <div id="lc-out" style="margin-top:10px"></div>
    <div class="muted" style="font-size:11px;margin-top:6px">${tr({ it: 'Il confronto allinea i due giri sulla distanza percorsa: la banda in fondo dice DOVE vince o perde km/h (frenata, staccata, rettifilo…). Le bande sottili: freno (rosso) e gas (verde). Sessione, giro e confronto si ricaricano da soli.', en: 'The comparison aligns the two laps on distance covered: the band at the bottom shows WHERE you gain or lose km/h (braking, hairpin, straight…). The thin bands: brake (red) and throttle (green). Session, lap and compare reload on their own.' })}</div>
    </div>
    <div class="panel" style="margin-top:14px">
    <h2>💡 ${tr({ it: 'Consigli del box', en: 'Garage advice' })} <span class="muted" style="font-size:12px">${tr({ it: 'target ', en: 'target ' })}${tel.target} PSI · ${list.length} ${tr({ it: 'sessioni recenti', en: 'recent sessions' })}</span></h2>
    ${window.mechIdentity(mechStato)}
    ${staleHtml}
    ${clHtml}
    <div class="row" style="margin-top:12px;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="act" id="b-apply-setup" type="button" style="font-size:15px;padding:10px 18px">⚡ ${tr({ it: 'Applica i consigli al setup', en: 'Apply the advice to the setup' })}</button>
      <span class="muted" style="font-size:11px">${tr({ it: 'scrive «(setup) — EVO-consigliato.carsetup» a fianco del tuo file · in EVO, A GIOCO APERTO: CARICA → il gioco rilegge il disco', en: 'writes «(setup) — EVO-advised.carsetup» next to your file · in EVO, WHILE IN GAME: LOAD → the game re-reads the disk' })}</span>
    </div>
    <div id="apply-out" style="margin-top:10px"></div>
    <details ${cl && !cl.allGood ? 'open' : ''} style="margin-top:6px"><summary style="cursor:pointer;font-size:12px" class="muted">${tr({ it: 'Da fare in EVO + consiglio pressioni completo (', en: 'To do in EVO + full pressure advice (' })}${telLaps} ${tr({ it: 'giri di telemetria)', en: 'telemetry laps)' })}</summary>
    <div class="banner warn" style="padding:10px 12px;margin-top:8px">
      <b>📌 ${tr({ it: 'DA FARE IN EVO A OGNI GARA', en: 'TO DO IN EVO EVERY RACE' })}</b> — ${tr({ it: 'Setup → Elettronica → ', en: 'Setup → Electronics → ' })}<b style="color:var(--warn,#ffb454)">${tr({ it: 'Telemetria', en: 'Telemetry' })}</b>: ${tr({ it: 'imposta ', en: 'set ' })}<b style="color:var(--warn,#ffb454)">${telLaps} ${tr({ it: 'giri', en: 'laps' })}</b> ${tr({ it: 'per questa auto', en: 'for this car' })}${telLaps >= 15 ? tr({ it: ' (è veloce: può registrare a lungo)', en: ' (it is quick: it can record for long)' }) : telLaps <= 8 ? tr({ it: ' (è lenta: ogni giro genera molti dati, non serve di più)', en: ' (it is slow: each lap yields lots of data, no need for more)' }) : ''}. ⚠️ ${tr({ it: 'Da riattivare a ogni gara, e mentre sei GIÀ nel setup, prima di avviare la sessione.', en: 'Re-enable it every race, while you are ALREADY in the setup, before starting the session.' })}
    </div>
    ${advHtml}
    </details>
    <table style="margin-top:10px"><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'Sessione', en: 'Session' })}</th><th class="right">${tr({ it: 'Fredda LF/RF', en: 'Cold LF/RF' })}</th><th class="right">${tr({ it: 'Calda LF/RF', en: 'Hot LF/RF' })}</th><th class="right">${tr({ it: 'Best lap', en: 'Best lap' })}</th><th class="right">${tr({ it: 'L/giro', en: 'L/lap' })}</th><th class="right">${tr({ it: 'Bumpstop RF', en: 'Bumpstop RF' })}</th><th class="right">${tr({ it: 'Δ int/ext RF', en: 'Δ in/out RF' })}</th><th>${tr({ it: 'Preset', en: 'Preset' })}</th><th>${tr({ it: 'Meteo', en: 'Weather' })}</th></tr></thead>
    <tbody>${list.map((r) => `<tr><td class="muted">${esc(r.when ?? '')}</td><td>${esc(r.kindLabel ?? 'n/d')}</td><td class="right"><b>${psi(r.cold?.LF)}</b> / ${psi(r.cold?.RF)}</td><td class="right">${psi(r.hot?.LF)} / ${psi(r.hot?.RF)}</td><td class="right">${fmtLapS(r.bestLapSec)}</td><td class="right">${r.fuelPerLap!=null?r.fuelPerLap+' L':'—'}</td><td class="right">${r.bump?.RF?.contactPct!=null?r.bump.RF.contactPct+'%':'—'}</td><td class="right">${r.camberProxy?.RF!=null?(r.camberProxy.RF>0?'+':'')+r.camberProxy.RF+'°':'—'}</td><td class="muted">${esc(r.preset ?? '—')}</td><td class="muted">${esc(r.weather ? r.weather.replace(/^.*_/,'') : '—')}</td></tr>`).join('')}</tbody></table>
    <details style="margin-top:10px"><summary class="muted">${tr({ it: 'Ultima sessione — dettaglio per giro (pressioni e temperature)', en: 'Last session — lap-by-lap detail (pressures and temperatures)' })}</summary>
    <table><thead><tr><th>${tr({ it: 'Giro', en: 'Lap' })}</th><th class="right">${tr({ it: 'Durata', en: 'Duration' })}</th><th class="right">${tr({ it: 'Benzina usata', en: 'Fuel used' })}</th><th class="right">${tr({ it: 'PSI LF (fine)', en: 'PSI LF (end)' })}</th><th class="right">${tr({ it: 'Temp gomma LF', en: 'Tyre temp LF' })}</th><th class="right">${tr({ it: 'Max bordo RF', en: 'Max edge RF' })}</th></tr></thead>
    <tbody>${(s.laps ?? []).filter(l=>l.durationSec>15).map(l=>`<tr><td>${l.lap}</td><td class="right">${l.durationSec}s</td><td class="right">${l.fuelUsed!=null?l.fuelUsed+' L':'—'}</td><td class="right">${l.pressures?.LF!=null?Number(l.pressures.LF).toFixed(1):'—'}</td><td class="right">${l.tair?.LF!=null?Number(l.tair.LF).toFixed(0)+'°':'—'}</td><td class="right">${l.surf?.RF?l.surf.RF.map(v=>Number(v).toFixed(0)).join('/'):'—'}°</td></tr>`).join('')}</tbody></table>
    </details>
    <div class="muted" style="margin-top:6px">${tr({ it: 'Bumpstop = % di tempo con la sospensione a fine corsa (alto → assetto troppo basso o molle troppo morbide) · Δ int/ext = differenza termica interno–esterno della gomma RF (effetto camber in pista) · condizioni ultima sessione: aria ', en: 'Bumpstop = % of time the suspension is at full travel (high → ride height too low or springs too soft) · Δ in/out = inner–outer thermal difference of the RF tyre (camber effect on track) · last session conditions: air ' })}${s.airTemp ?? '—'}° · ${tr({ it: 'pista ', en: 'track ' })}${s.roadTemp ?? '—'}° · ${tr({ it: 'scritta da EVO in Saved Games\\ACE\\MoTec', en: 'written by EVO in Saved Games\\ACE\\MoTec' })}</div>
    ${logRows ? `<details style="margin-top:10px"><summary class="muted">${tr({ it: 'Consigli già dati', en: 'Advice already given' })}</summary><table style="margin-top:6px"><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'Auto', en: 'Car' })}</th><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Partenza consigliata', en: 'Suggested start' })}</th><th>${tr({ it: 'Base', en: 'Basis' })}</th></tr></thead><tbody>${logRows}</tbody></table></details>` : ''}
    </div>`;
  })() : `<div class="panel" style="margin-top:14px"><h2>${tr({ it: 'Telemetria MoTeC', en: 'MoTeC telemetry' })}</h2><div class="muted">${esc(tel.hint ?? tr({ it: 'Nessuna sessione trovata per questa auto. Fai un giro: EVO scrive la telemetria da sola in Saved Games\\ACE\\MoTec.', en: "No session found for this car. Do a lap: EVO writes telemetry on its own in Saved Games\\ACE\\MoTec." }))}</div></div>`;
  const html = `
  <div class="panel" id="psi-panel">
    <h2>${tr({ it: 'Regola dei 4 PSI', en: 'The 4 PSI rule' })} <span class="h-act">${tr({ it: 'pressioni target a caldo per classe auto', en: 'hot target pressures per car class' })}</span></h2>
    <div class="muted" style="margin-bottom:10px">${tr({ it: "Fai 3–4 giri con la pressione di partenza scelta, poi leggi la pressione a caldo nell'HUD/MFD dei pneumatici. Inserisci i due valori: il tool calibra la partenza per arrivare sul target della classe.", en: "Do 3–4 laps with your chosen starting pressure, then read the hot pressure from the tyre HUD/MFD. Enter both values: the tool calibrates the start to reach the class target." })}
    ${tr({ it: 'Target Kunos: ', en: 'Kunos targets: ' })}${b.classes.map(c=>`${esc(c.label)} <b>${c.target}</b>`).join(' · ')} PSI.</div>
    <form id="f-psi" class="row" style="align-items:end;flex-wrap:wrap;gap:10px">
      <label class="muted">${tr({ it: 'Da freddo (PSI)', en: 'Cold (PSI)' })}<br><input type="number" id="i-cold" step="0.1" min="10" max="45" required style="width:110px"></label>
      <label class="muted">${tr({ it: 'A caldo (PSI)', en: 'Hot (PSI)' })}<br><input type="number" id="i-hot" step="0.1" min="10" max="50" required style="width:110px"></label>
      <label class="muted">${tr({ it: 'Classe auto', en: 'Car class' })}<br><select id="i-target" style="width:200px">${b.classes.map(c=>`<option value="${c.target}" ${c.id==='slicks'?'selected':''}>${esc(c.label)} — ${c.target} PSI</option>`).join('')}</select></label>
      <button class="act" type="submit">${tr({ it: 'Calibra', en: 'Calibrate' })}</button>
    </form>
    <div id="psi-result" style="margin-top:10px"></div>
  </div>
  <div class="panel" style="margin-top:14px">
    <h2>${tr({ it: 'Auto della serie — ', en: 'Series car — ' })}${esc(b.trackDisplay ?? tr({ it: 'pista n/d', en: 'track n/a' }))} <span class="muted" style="font-size:12px">${tr({ it: 'note salvate per auto+pista', en: 'notes saved per car+track' })}</span></h2>
    <table><thead><tr><th>${tr({ it: 'Auto', en: 'Car' })}</th><th>${tr({ it: 'Classe', en: 'Class' })}</th><th class="right">${tr({ it: 'Target caldo', en: 'Hot target' })}</th><th>${tr({ it: 'Nota di setup', en: 'Setup note' })}</th></tr></thead>
    <tbody>${b.rows.map(r=>`<tr>
      <td><b>${esc(r.carName)}</b></td><td class="muted">${esc(r.classLabel)}</td><td class="right"><b>${r.target}</b> PSI</td>
      <td>${r.note ? `<span class="muted">${esc(r.note)}</span> <button class="mini" data-carnote="${esc(r.car)}">${tr({ it: 'modifica', en: 'edit' })}</button>` : `<button class="mini" data-carnote="${esc(r.car)}">+ ${tr({ it: 'nota', en: 'note' })}</button>`}</td>
    </tr>`).join('')}</tbody></table>
  </div>`;
  /* STORIA comparativa dei setup (richiesta 21/10): ogni salvataggio, coi segni +/−
     per campo — cosa ha ALZATO e cosa ha ABBASSATO la persona (o il meccanico).
     Mauro 22/10: NON più pannello autonomo a fine vista — la storia si innesta
     SOTTO il pulsante ⚡ Applica, ravvicinata all'output dell'applicatore.
     Il BUILDER è una funzione riusabile: la riusa il ricalcolo dopo la conferma
     (la riga nuova compare DA SOLA, senza re-render) e i NOMI DEI FILE sono
     cliccabili — il click apre la scheda completa del salvataggio in un modale. */
  window.__setupHistHtml ??= (rows) => {
    if (!rows.length) return '';
    window.__setupHistRows = rows;   // i click sui file leggono da qui (data-hist = indice)
    const d1 = (v) => (v == null ? '—' : (Number.isFinite(Number(v)) && Number(v) % 1 ? Number(v).toFixed(1) : String(Math.round(Number(v)))));
    const dd = (d) => d == null ? '' : ` <b style="color:${d > 0 ? 'var(--ok,#7f7)' : '#f66'}">${d > 0 ? '+' : '−'}${d1(Math.abs(d))}</b>`;
    const grp = (vals, dts, unit = '') => (vals ?? []).map((v, i) => (v == null ? '—' : d1(v) + unit + dd(dts?.[i]))).join(' · ');
    const histRow = (r, i) => `<tr>
        <td class="muted">${esc(String(r.when).slice(0, 17))}</td>
        <td>${r.consigliato ? '🔧 ' : '📄 '}<a href="#" data-hist="${i}" style="color:var(--acc,#5da9ff);text-decoration:none;border-bottom:1px dotted var(--acc,#5da9ff)" title="scheda completa del salvataggio">${esc(String(r.name).slice(0, 34))}</a></td>
        <td class="right">${grp(r.pressures, r.deltas?.pressures, ' PSI')}</td>
        <td class="right">${grp(r.cambers, r.deltas?.cambers, '°')}</td>
        <td class="right">${d1(r.heightFront)}${dd(r.deltas?.heightFront)} / ${d1(r.heightRear)}${dd(r.deltas?.heightRear)}</td>
        <td class="right">${d1(r.wingFront)}${dd(r.deltas?.wingFront)} / ${d1(r.wingRear)}${dd(r.deltas?.wingRear)}</td>
        <td class="right">${d1(r.bias)}${dd(r.deltas?.bias)}</td>
        <td class="right">${d1(r.tc1)}${dd(r.deltas?.tc1)}</td>
        <td class="right">${r.fuel != null ? d1(r.fuel) + ' L' + (r.deltas?.fuel != null ? dd(r.deltas.fuel) : '') : '—'}</td>
      </tr>`;
    return `<div id="setup-hist" style="margin-top:8px">
      <div style="font-weight:700;font-size:14px">📜 ${tr({ it: 'Storia dei setup', en: 'Setup history' })} <span class="muted" style="font-weight:400;font-size:12px">${tr({ it: 'ogni salvataggio · ', en: 'every save · ' })}<b style="color:var(--ok,#7f7)">+</b> = ${tr({ it: 'alzato', en: 'raised' })} · <b style="color:#f66">−</b> = ${tr({ it: 'abbassato', en: 'lowered' })} · <span style="color:var(--acc,#5da9ff);font-size:11px">${tr({ it: 'i nomi dei file sono cliccabili', en: 'file names are clickable' })}</span></span></div>
      <table style="margin-top:6px"><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'File', en: 'File' })}</th><th class="right">${tr({ it: 'Pressioni (sx/dx ant · sx/dx post)', en: 'Pressures (LF/RF · LR/RR)' })}</th><th class="right">${tr({ it: 'Camber', en: 'Camber' })}</th><th class="right">${tr({ it: 'Alt. ant / post', en: 'Height F/R' })}</th><th class="right">${tr({ it: 'Ala ant / post', en: 'Wing F/R' })}</th><th class="right">${tr({ it: 'Bias freni', en: 'Brake bias' })}</th><th>${tr({ it: 'TC', en: 'TC' })}</th><th class="right">${tr({ it: 'Benzina', en: 'Fuel' })}</th></tr></thead>
      <tbody>${rows.map(histRow).join('')}</tbody></table>
      <div class="muted" style="font-size:11px;margin-top:6px">🔧 = ${tr({ it: "file scritto dall'applicatore del meccanico · 📄 = salvataggio tuo da EVO · i segni confrontano ogni riga col salvataggio PRECEDENTE in ordine di tempo.", en: 'file written by the mechanic\'s applier · 📄 = your own save from EVO · the signs compare each row with the PREVIOUS save in time order.' })}</div>
      </div>`;
  };
  let histHtml = '';
  try {
    const hist = await api('setup-history', { car: tel.car ?? carSel?.carName ?? null, track: tel.sessions?.[0]?.track ?? tel.trackDisplay ?? null }).catch(() => null);
    histHtml = window.__setupHistHtml(hist?.rows ?? []);
  } catch { /* la storia non blocca mai il pannello */ }
  m.innerHTML = telHtml + html;   // telemetria PRIMA degli attrezzi pressione: il grafico del giro è la prima cosa che si vede
  // la storia compare SOTTO il pulsante ⚡ Applica (e sopra l'output che esce
  // quando si genera il setup): la innesto qui, ravvicinata, non a fine vista.
  if (histHtml) document.querySelector('#apply-out')?.insertAdjacentHTML('afterend', histHtml);

  /* RICALCOLO della storia SENZA re-render (Mauro 22/10): dopo la conferma
     dell'applicatore la riga nuova compare da sola, in fondo (gridordine di
     tempo le righe si riordino da sole: fetch → builder → sostituzione nodo). */
  window.__drawSetupHist ??= async () => {
    const ctx = window.__applySetupCtx ?? {};
    let html = '';
    try {
      const hist = await api('setup-history', { car: ctx.car ?? null, track: ctx.track ?? null }).catch(() => null);
      html = window.__setupHistHtml(hist?.rows ?? []);
    } catch { return; }
    const out = document.querySelector('#setup-hist');
    if (!out) { if (html) document.querySelector('#apply-out')?.insertAdjacentHTML('afterend', html); return; }
    if (html) out.outerHTML = html; else out.remove();
  };
  /* NOMI CLICCABILI: il click apre la scheda completa di quel salvataggio
     (delegazione al document: i nodi della storia vengono ricreati a ogni refresh). */
  if (!window.__histDeleg) {
    window.__histDeleg = true;
    document.addEventListener('click', (ev) => {
      const a = ev.target?.closest?.('a[data-hist]');
      if (!a) return;
      ev.preventDefault();
      const r = (window.__setupHistRows ?? [])[Number(a.dataset.hist)];
      if (!r) return;
      const d1 = (v) => (v == null ? '—' : (Number.isFinite(Number(v)) && Number(v) % 1 ? Number(v).toFixed(1) : String(Math.round(Number(v)))));
      const riga = (k, v) => `<tr><td class="muted" style="width:45%">${k}</td><td class="right"><b>${esc(String(v))}</b></td></tr>`;
      const PS = ['ant sx', 'ant dx', 'post sx', 'post dx', 'extra 5', 'extra 6'];
      modal(`📜 ${String(r.name).slice(0, 60)}`,
        `<div class="muted" style="font-size:12px;margin-bottom:8px">${r.consigliato ? tr({ it: '🔧 file scritto dall\'applicatore del meccanico', en: "🔧 file written by the mechanic's applier" }) : tr({ it: '📄 salvataggio tuo da EVO', en: '📄 your own save from EVO' })} · ${esc(String(r.when).replace('T',' ').slice(0,19))}</div>
        <table>${(r.pressures ?? []).map((v, i) => riga(tr({ it: 'Pressione ', en: 'Pressure ' }) + (PS[i] ?? (tr({ it: 'gomma ', en: 'tyre ' }) + (i + 1))), d1(v) + ' PSI')).join('')}
        ${(r.cambers ?? []).map((v, i) => riga(tr({ it: 'Camber ', en: 'Camber ' }) + (PS[i] ?? (tr({ it: 'gomma ', en: 'tyre ' }) + (i + 1))), d1(v) + '°')).join('')}
        ${riga(tr({ it: 'Altezza ant / post', en: 'Height F/R' }), d1(r.heightFront) + ' / ' + d1(r.heightRear))}
        ${riga(tr({ it: 'Ala ant / post', en: 'Wing F/R' }), d1(r.wingFront) + ' / ' + d1(r.wingRear))}
        ${riga(tr({ it: 'Bias freni', en: 'Brake bias' }), d1(r.bias))}
        ${riga(tr({ it: 'TC (taglio 1)', en: 'TC (cut 1)' }), d1(r.tc1))}
        ${riga(tr({ it: 'Benzina', en: 'Fuel' }), r.fuel != null ? d1(r.fuel) + ' L' : '—')}</table>`,
        [[tr({ it: 'Chiudi', en: 'Close' }), 'act', () => {}]]);
    });
  }
  $('#f-psi').onsubmit = (ev) => {
    ev.preventDefault();
    const r = window.__lastPsi = null;
    api('garage', { action: 'psi', cold: Number($('#i-cold').value), hot: Number($('#i-hot').value), target: Number($('#i-target').value) })
      .then(p => {
        $('#psi-result').innerHTML = p.ok
          ? `<div class="banner ${Math.abs(p.hot-p.target)<0.15?'good':'info'}"><b>${esc(p.advice)}</b></div>`
          : `<div class="banner bad">${esc(p.error)}</div>`;
      })
      .catch(e => { $('#psi-result').innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; });
  };
  $$('button[data-carnote]').forEach(btn => btn.onclick = async () => {
    const car = btn.dataset.carnote;
    const row = b.rows.find(r => r.car === car);
    const text = prompt(`${tr({ it: 'Nota di setup per ', en: 'Setup note for ' })}${row.carName} ${tr({ it: 'su ', en: 'at ' })}${b.trackDisplay ?? tr({ it: 'questa pista', en: 'this track' })}:`, row.note ?? '');
    if (text === null) return;
    await api('garage', { action: 'note', car, track: b.track, text });
    toast(text ? tr({ it: 'Nota salvata.', en: 'Note saved.' }) : tr({ it: 'Nota rimossa.', en: 'Note removed.' }), 'ok'); render();
  });

  /* ⚡ APPLICA: chiude il CICLO — telemetria → consiglio → file di setup pronto
     sul disco. In EVO A GIOCO APERTO: setup → CARICA → «… — EVO-consigliato»:
     il gioco rilegge la carta a quel momento, niente da riavvio.
     Delegazione al DOCUMENT: i pannelli diagnostici in fondo alla vista fanno
     m.innerHTML += e RI-PARSEANO tutto — un listener attaccato ai nodi muore.
     Il contesto (auto/pista/giri) si aggiorna a ogni render qui sotto. */
  /* Pista del consiglio, ordine di verità (lezione 22/10 ore 20:49: dal pannello
     il_copy «— EVO-consigliato» partì su Nürburgring mentre ai box Paul Ricard):
     1. pista della sessione LIVE del gioco (ai box); 2. ultima telemetria (gioco
     chiuso); 3. pista del round. Prima si prendeva solo l'ultima .ld e la pista
     della telemetria di IERI mandò il salvataggio nella cartella sbagliata. */
  const liveTrack = live?.session?.track ?? null;
  window.__applySetupCtx = { car: carSel?.carName ?? tel.car ?? cur?.car ?? null, track: liveTrack ?? cur?.track ?? tel.trackDisplay ?? null, raceLaps: tel.raceLaps ?? null };
  if (!window.__applySetupDeleg) {
    window.__applySetupDeleg = true;
    const psiD = (v) => (v == null ? '—' : Number(v).toFixed(1));
    /* etichette gomme nell'ordine del file .carsetup (ant sx → ant dx → post sx → post dx:
       la lista RUOTE del decoder) — l'anteprima parlala per gomma. */    const RUOTE_LBL = ['ant sx', 'ant dx', 'post sx', 'post dx', 'extra 5', 'extra 6'];
    const bannerOk = (r, out) => {
      out.innerHTML = `<div class="banner good">
          <b>✅ ${tr({ it: 'File pronto:', en: 'File ready:' })}</b> ${esc(r.fileShort)}<br>
          <span class="muted" style="font-size:11.5px">${esc(r.file)}<br>base: ${esc(r.baseFile ?? '')}</span><br>
          Pressioni di partenza:          ${tr({ it: 'Pressioni di partenza: ', en: 'Starting pressures: ' })}<span class="muted">${(r.before?.pressures ?? []).map(psiD).join(' / ')}</span> → <b>${(r.after?.pressures ?? []).map(psiD).join(' / ')} PSI</b>
          ${(r.aero && (r.aero.before?.heightRear !== r.aero.after?.heightRear || r.aero.before?.wingRear !== r.aero.after?.wingRear)) ? `<br>${tr({ it: 'Aero: altezza post ', en: 'Aero: rear height ' })}${r.aero.before?.heightRear}→${r.aero.after?.heightRear} mm · ${tr({ it: 'ala post ', en: 'rear wing ' })}${r.aero.before?.wingRear}→${r.aero.after?.wingRear}` : ''}
          ${(r.changes ?? []).length === 0 ? `<br><span class="muted">${tr({ it: 'il file caricato era GIÀ sui valori consigliati: nessuna variazione scritta', en: 'the loaded file was ALREADY at the advised values: no change written' })}</span>` : ''}
          <br><span class="muted">${esc(r.adviceText ?? '')}</span>
          <div class="banner info" style="margin-top:8px"><b>🎮 ${tr({ it: "Nell'EVO, a gioco aperto:", en: 'In EVO, with the game open:' })}</b> ${tr({ it: 'setup → ', en: 'setup → ' })}<b>${tr({ it: 'CARICA', en: 'LOAD' })}</b> → «${esc(r.fileShort)}» → ${tr({ it: 'i valori si caricano nel setup corrente SUBITO, senza riavvio. Se li confermi: SALVA e restano.', en: 'the values load into the current setup IMMEDIATELY, no restart. If you keep them: SAVE and they stay.' })}</div>
        </div>`;
    };
    document.addEventListener('click', async (ev) => {
      const confirmBtn = ev.target?.closest?.('#b-confirm-apply');
      if (confirmBtn) {
        const out = document.querySelector('#apply-out');
        if (!out) return;
        confirmBtn.disabled = true; confirmBtn.innerHTML = '<span class="spin"></span>';
        const ctx = window.__applySetupCtx ?? {};
        try {
          const r = await api('setup-apply', { car: ctx.car ?? null, track: ctx.track ?? null, raceLaps: ctx.raceLaps ?? null, file: confirmBtn.dataset.baseFile ?? null });
          if (!r.ok) out.innerHTML = `<div class="banner warn">${esc(r.hint ?? tr({ it: 'Non riesco a scrivere il file.', en: 'I cannot write the file.' }))}</div>`;
          else { bannerOk(r, out); window.__drawSetupHist?.(); }   // la riga nuova entra nella storia da sola
        } catch (e) { out.innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; }
        return;
      }
      const btn = ev.target?.closest?.('#b-apply-setup');
      if (!btn) return;
      const out = document.querySelector('#apply-out');
      if (!out) return;
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
      const ctx = window.__applySetupCtx ?? {};
      try {
        /* ANTEPRIMA prima della scrittura (richiesta Mauro 21/10): il file NON è
           ancora creato — l'utente vede le migliorie e conferma o annulla. */
        const p = await api('setup-apply', { car: ctx.car ?? null, track: ctx.track ?? null, raceLaps: ctx.raceLaps ?? null, preview: true });
        if (!p.ok) { out.innerHTML = `<div class="banner warn">${esc(p.hint ?? tr({ it: 'Non riesco a calcolare il consiglio.', en: 'I cannot compute the advice.' }))}</div>`; }
        else {
          const righe = (p.before?.pressures ?? []).map((v, i) => {
            const dopo = (p.after?.pressures ?? [])[i] ?? v;
            const delta = Math.round(((dopo ?? 0) - (v ?? 0)) * 10) / 10;
            return `<tr><td class="muted">${esc(RUOTE_LBL[i] ?? (tr({ it: 'gomma ', en: 'tyre ' }) + (i + 1)))}</td><td class="right">${psiD(v)} PSI</td><td class="right"><b>${psiD(dopo)} PSI</b>${delta ? ` <span class="muted" style="font-size:10.5px">(${delta > 0 ? '+' : ''}${delta.toFixed(1)})</span>` : ''}</td></tr>`;
          }).join('');
          /* le voci OLTRE le gomme (altezza/ala): l'anteprima le elenca esattamente
             come saranno scritte nel file — niente sorprese in EVO. */
          const extra = p.extraChanges ?? [];
          const extraHtml = extra.length
            ? `<div style="margin-top:10px;font-size:12.5px"><b>${tr({ it: 'Oltre le gomme:', en: 'Beyond the tyres:' })}</b><div style="margin-top:4px">${extra.map((x) => `🔧 ${esc(x)}`).join('<br>')}</div></div>`
            : '';
          const cambia = extra.length > 0 || (p.before?.pressures ?? []).some((v, i) => Math.abs(((p.after?.pressures ?? [])[i] ?? v) - (v ?? 0)) >= 0.05);
          out.innerHTML = `<div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:0 0 10px;background:#0d1118">
            <b>👀 ${tr({ it: 'Anteprima del setup consigliato', en: 'Preview of the advised setup' })}</b> <span class="muted" style="font-size:11px">· ${tr({ it: 'base: ', en: 'base: ' })}${esc(p.baseName ?? '')}${p.basis ? ` · ${tr({ it: 'base dati: ', en: 'data basis: ' })}${esc(p.basis)}` : ''}${p.startPsi != null ? ` · ${tr({ it: 'partenza consigliata: ', en: 'suggested start: ' })}<b>${p.startPsi} PSI</b>` : ''}</span>
            <table style="margin-top:8px"><thead><tr><th>${tr({ it: 'Gomma', en: 'Tyre' })}</th><th class="right">${tr({ it: 'Adesso', en: 'Now' })}</th><th class="right">${tr({ it: 'Consigliato', en: 'Advised' })}</th></tr></thead><tbody>${righe}</tbody></table>
            ${extraHtml}
            ${cambia ? '' : `<div class="muted" style="font-size:12px;margin-top:6px">${tr({ it: 'Il setup attuale è GIÀ sui valori consigliati: nessuna modifica necessaria.', en: 'The current setup is ALREADY at the advised values: no change needed.' })}</div>`}
            ${p.adviceText ? `<div class="muted" style="font-size:11.5px;margin-top:6px">${esc(p.adviceText)}</div>` : ''}
            <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
              <button class="act" id="b-confirm-apply" type="button" data-base-file="${esc(p.baseFile ?? '')}">✅ ${tr({ it: 'CONFERMA: crea «', en: 'CONFIRM: create «' })}${esc((p.baseName ?? '') + ' — EVO-consigliato.carsetup')}»</button>
              <button class="act" id="b-cancel-apply" type="button" style="background:#3a2433">${tr({ it: 'Annulla', en: 'Cancel' })}</button>
            </div>
          </div>`;
          const cancel = document.querySelector('#b-cancel-apply');
          if (cancel) cancel.addEventListener('click', () => { out.innerHTML = ''; });
        }
      } catch (e) { out.innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; }
      const live = document.querySelector('#b-apply-setup');
      if (live) { live.disabled = false; live.textContent = tr({ it: '⚡ Applica i consigli al setup', en: '⚡ Apply the advice to the setup' }); }
    });
  }

  /* grafico del giro: DELEGAZIONE eventi (i re-render ricreano i nodi) e
     AUTODISEGNO al primo render con selettori: il giro selezionato è già
     il best (il select lo pre-seleziona) e il confronto è "miglior altro giro". */
  window.__lcDraw ??= async () => {
    const lapSel = document.querySelector('#lc-lap'), cmpSel = document.querySelector('#lc-cmp'), out = document.querySelector('#lc-out');
    const sessSel = document.querySelector('#lc-session');
    if (!lapSel || !out || (sessSel && !sessSel.value)) return;
    const lap = Number(lapSel.value);
    const cv = cmpSel?.value ?? 'best';
    const compare = cv === 'best' ? 'best' : Number(cv);
    out.innerHTML = `<div class="muted" style="font-size:11px">${tr({ it: 'campiono il file .ld…', en: 'sampling the .ld file…' })}</div>`;
    try {
      const t = await api('garage', { action: 'laptrace', car: window.__lcCar ?? null, file: sessSel ? sessSel.value : null, lap, compare, points: 300 });
      if (t.ok) {
        // sessione cambiata: i giri e il confronto si ricoegono con i VALORI della nuova sessione
        if (sessSel && Array.isArray(t.sessions)) {
          const old = sessSel.value;
          sessSel.innerHTML = (t.sessions ?? []).map((x) => `<option value="${esc(x.file)}" ${x.file === old ? 'selected' : ''}>${esc(x.when)} · ${esc(x.track ?? '')} · ${x.validLaps ?? '?'} ${tr({ it: 'giri', en: 'laps' })}</option>`).join('');
        }
        const vl = t.laps ?? [];
        lapSel.innerHTML = vl.map((l) => `<option value="${l.lap}" ${l.lap === t.lap ? 'selected' : ''}>${tr({ it: 'giro ', en: 'lap ' })}${l.lap} — ${l.durationSec.toFixed(1)}s</option>`).join('');
        if (cmpSel) cmpSel.innerHTML = `<option value="best">${tr({ it: 'miglior altro giro', en: 'best other lap' })}</option>` + vl.filter((l) => l.lap !== t.lap).map((l) => `<option value="${l.lap}">${tr({ it: 'giro ', en: 'lap ' })}${l.lap} — ${l.durationSec.toFixed(1)}s</option>`).join('');
      }
      if (!t.ok) { out.innerHTML = `<div class="banner info">${esc(t.hint ?? tr({ it: 'Nessun dato', en: 'No data' }))}</div>`; return; }
      const d = t.compare;
      out.innerHTML = lapChartSvg(t) + `<div class="muted" style="font-size:11px;margin-top:4px">${d ? tr({ it: 'Differenza media col giro {L}: {D} a favore del giro {T} · picco {MX} / minimo {MN} km/h · distanza giro {KM} km · tempo: {TD} rispetto al giro {L2}.', en: 'Average difference vs lap {L}: {D} in favour of lap {T} · peak {MX} / minimum {MN} km/h · lap distance {KM} km · time: {TD} versus lap {L2}.' }).replace('{L}', d.lap).replace('{D}', `<b style="color:${d.dvAvg >= 0 ? 'var(--ok,#7f7)' : '#f66'}">${d.dvAvg >= 0 ? '+' : ''}${d.dvAvg.toFixed(1)} km/h</b>`).replace('{T}', t.lap).replace('{MX}', d.dvMax >= 0 ? '+' : '' + ''.concat(d.dvMax >= 0 ? '+' : '', d.dvMax.toFixed(1))).replace('{MN}', d.dvMin.toFixed(1)).replace('{KM}', t.distanceKm).replace('{TD}', `${d.timeDelta >= 0 ? '+' : ''}${d.timeDelta.toFixed(1)}s`).replace('{L2}', d.lap) : tr({ it: 'senza confronto', en: 'no comparison' })}</div>`;
    } catch (e) { out.innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; }
  };
  if (!window.__lcDeleg) {
    window.__lcDeleg = true;
    document.addEventListener('click', (ev) => { if (ev.target?.closest?.('#lc-go')) window.__lcDraw(); });
  }
  if (!window.__lcSessDeleg) {
    window.__lcSessDeleg = true;
    document.addEventListener('change', (ev) => { if (ev.target?.id === 'lc-session') window.__lcDraw(); });
  }
  window.__lcCar = carSel?.carName ?? tel.car ?? cur?.car ?? null;   // l'auto del render CORRENTE (la chiusura non basta: resterebbe la prima)
  if (list.length) window.__lcDraw();   // il grafico nasce GIÀ disegnato: nessun click per vederlo

  /* IL MECCANICO: consigli di setup per pista sotto il titolo del grafico.
     Base dal carattere della pista + correzione dai dati telemetrici veri. */
  window.__lcMech ??= async () => {
    const out = document.querySelector('#meccanico-out');
    if (!out) return;
    try {
      // pista del PANNELLO (dalla sessione scelta, non dalla serie): il meccanico
      // valuta e registra l'allievo sulla pista che stai realmente guardando
      const trackPanel = sessSel?.selectedOptions?.[0] ? (sessSel.selectedOptions[0].dataset.track ?? null) : (cur?.track ?? null);
      const m = await api('garage', { action: 'meccanico', car: window.__lcCar ?? null, track: trackPanel ?? null });
      if (!m.ok) { out.innerHTML = ''; return; }
      const tag = { aero: tr({ it: '🪶 aerodinamica', en: '🪶 aero' }), trasmissione: tr({ it: '⚙️ cambio', en: '⚙️ gearbox' }), assetto: tr({ it: '🧱 assetto/altezza', en: '🧱 setup/height' }), camber: tr({ it: '📐 camber', en: '📐 camber' }), freni: tr({ it: '🛑 freni', en: '🛑 brakes' }), pressioni: tr({ it: '🛞 pressioni', en: '🛞 pressures' }), telemetria: tr({ it: '📡 telemetria', en: '📡 telemetry' }), memoria: tr({ it: '🧠 memoria', en: '🧠 memory' }) };
      const rows = (m.consigli ?? []).map((c, i) => `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:0 0 130px;font-size:11.5px;color:var(--dim)">${tag[c.vedi] ?? c.vedi}</span><span style="font-size:12.5px;line-height:1.5">${c.text}</span></div>`).join('');
      /* STORIA DELL'ALLIEVO: i round di consigli chiusi con l'esito (delta del
         giro migliore) e il setup migliore — Mauro 21/10 voleva vederla subito. */
      let storiaHtml = '';
      const a = m.allievo ?? null;
      if (a && (a.rounds?.length || a.best)) {
        const fmtT = (iso) => iso ? esc(String(iso).replace('T', ' ').slice(0, 16).replace(/:\d\d$/, '')) : '—';
        const fmtL = (v) => (v > 0 && v != null) ? `${Math.floor(v / 60)}:${(v % 60).toFixed(2).padStart(5, '0')}` : '—';
        const chip = (d) => d == null
          ? `<span class="tag" style="font-size:10px;padding:1px 8px;background:#26303d;color:#9fb3cc">${tr({ it: 'in attesa di una sessione nuova', en: 'waiting for a new session' })}</span>`
          : (d < -0.05
            ? `<span class="tag green" style="font-size:10px;padding:1px 8px">${tr({ it: 'guadagnati ', en: 'gained ' })}${(-d).toFixed(2)} s</span>`
            : (d > 0.15
              ? `<span class="tag" style="font-size:10px;padding:1px 8px;background:#3a1d1d;color:#ff9b9b">${tr({ it: 'persi +', en: 'lost +' })}${d.toFixed(2)} s</span>`
              : `<span class="tag" style="font-size:10px;padding:1px 8px;background:#26303d;color:#cdd9e8">${tr({ it: 'neutro (', en: 'neutral (' })}${d >= 0 ? '+' : ''}${d.toFixed(2)} s)</span>`));
        const righe = (a.rounds ?? []).map((r) => `<tr>
          <td class="muted" style="white-space:nowrap">${fmtT(r.at)}</td>
          <td style="white-space:nowrap"><span class="muted" style="font-size:11.5px">${fmtL(r.bestBefore)} → ${fmtL(r.bestAfter)}</span></td>
          <td>${chip(r.delta)}</td>
          <td style="font-size:11.5px;color:var(--dim)">${(r.campi ?? []).map((c) => esc(tag[c] ?? c)).join(' · ') || '—'}</td>
        </tr>`).join('');
        storiaHtml = `<details style="margin-top:10px" ${a.rounds?.length ? '' : 'open'}><summary style="cursor:pointer;font-size:12.5px"><b>🧠 ${tr({ it: 'Storia dell\'allievo', en: "Apprentice's history" })}</b> <span class="muted" style="font-size:11px">— ${(a.rounds ?? []).length} ${tr({ it: 'round di consigli', en: 'advice rounds' })}${a.best ? ` · ${tr({ it: 'migliore registrato: ', en: 'best on file: ' })}<b>${fmtL(a.best.lap)}</b> (${fmtT(a.best.at)})` : ''}</span></summary>
          ${(a.rounds ?? []).length ? `<table style="margin-top:8px"><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'Giro su questa pista', en: 'Lap on this track' })}</th><th>${tr({ it: 'Esito del round', en: 'Round outcome' })}</th><th>${tr({ it: 'Leve promosse', en: 'Levers pulled' })}</th></tr></thead><tbody>${righe}</tbody></table>` : `<div class="muted" style="font-size:12px;margin-top:6px">${tr({ it: "Nessun round chiuso: corri una sessione nuova dopo aver generato consigli e l'esito entra qui.", en: 'No closed rounds: run a new session after generating advice and the outcome lands here.' })}</div>`}
        </details>`;
      }
      out.innerHTML = `<div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:0 0 10px;background:#0d1118">
        <div style="font-size:12px;margin-bottom:6px"><b>🔧 ${tr({ it: 'Il meccanico', en: 'The mechanic' })}</b> — ${tr({ it: 'setup consigliato per ', en: 'advised setup for ' })}<b>${esc(m.track ?? '')}</b> <span class="muted" style="font-size:11px">· ${tr({ it: 'tracciato ', en: 'track type ' })}${esc(m.tipo ?? '?')}${m.densita ? ` · ${m.densita} ${tr({ it: 'curve/km', en: 'corners/km' })}` : ''}${m.sessFile ? tr({ it: ' · correzione su telemetria veri', en: ' · corrected on real telemetry' }) : tr({ it: ' · senza telemetria (solo pista)', en: ' · no telemetry (track profile only)' })}</span></div>
        ${rows || `<div class="muted" style="font-size:12px">${tr({ it: 'Nessun consiglio per questa pista: anagrafica non disponibile.', en: 'No advice for this track: profile not available.' })}</div>`}
        ${storiaHtml}
      </div>`;
    } catch { /* il meccanico non deve mai rompere la vista */ }
  };
  window.__lcMech();

  // diagnostica telemetria: stato dei file .ld scritti da EVO, per auto
  const diag = await api('telem-diagnostics').catch(() => ({ cars: [] }));
  const fmtKB = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const diagRows = (diag.cars ?? []).map((c) => {
    const files = (c.files ?? []).map((f) => `<tr>
      <td class="muted">${esc(f.whenLocal ?? '')}</td><td>${esc(f.track)}</td>
      <td class="right">${fmtKB(f.size)}</td>
      <td>${f.valid ? '<span class="tag green" style="font-size:10px;padding:1px 6px">dati ok</span>' : '<span class="tag" style="font-size:10px;padding:1px 6px;background:#3a1d1d;color:#ff9b9b">VUOTO</span>'}</td>
      <td class="right muted">${f.withData}/${f.channels} canali</td>
    </tr>`).join('');
    const emptyN = (c.files ?? []).filter((f) => !f.valid).length;
    const health = emptyN === 0
      ? '<span class="tag green" style="font-size:10px;padding:1px 6px">OK</span>'
      : `<span class="tag" style="font-size:10px;padding:1px 6px;background:#3a1d1d;color:#ff9b9b">${emptyN} vuoti</span>`;
    return `<details style="margin-top:6px" ${c.files.some(f=>!f.valid)?'open':''}><summary style="cursor:pointer;font-size:12.5px"><b>${esc(c.car)}</b> ${health} <span class="muted" style="font-size:11px">· ${c.total} file totali · ultimi ${c.files.length} elencati</span></summary>
      <table style="margin-top:6px"><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Dimensione', en: 'Size' })}</th><th>${tr({ it: 'Stato', en: 'State' })}</th><th class="right">${tr({ it: 'Canali con dati', en: 'Channels with data' })}</th></tr></thead><tbody>${files}</tbody></table>
    </details>`;
  }).join('');
  const anyEmpty = (diag.cars ?? []).some((c) => (c.files ?? []).some((f) => !f.valid));
  const diagHtml = (diag.cars ?? []).length ? `<div class="panel" style="margin-top:14px" id="telem-diag">
    <h2>Diagnostica telemetria <span class="h-act">i file .ld che EVO scrive in Saved Games\\ACE\\MoTec</span></h2>
    ${anyEmpty ? `<div class="banner warn" style="margin-bottom:8px">${tr({ it: 'Ci sono file vuoti (solo intestazione, 0 canali con dati): la telemetria non era attiva in EVO — si attiva in Setup → Elettronica (e i giri si impostano PRIMA di avviare la sessione). Riusa la sessione e i file conterranno dati veri. Finché così non fosse, i consigli del BOX su quelle auto usano la stima.', en: 'There are empty files (header only, 0 channels with data): telemetry was NOT active in EVO — turn it on in Setup → Electronics (and set laps BEFORE starting the session). Reuse the session and the files will hold real data. Until then, the BOX uses estimates for those cars.' })}</div>` : `<div class="banner good" style="margin-bottom:8px">${tr({ it: 'Tutti gli ultimi file hanno dati: la telemetria sta funzionando.', en: 'All recent files have data: telemetry is working.' })}</div>`}
    ${diagRows}
    <div class="muted" style="margin-top:8px">${tr({ it: 'Un file valido pesa 2–11 MB e ha 62 canali con dati; uno vuoto pesa ~19 KB (solo intestazione). Aggiorna la pagina per risentonare dopo una sessione.', en: 'A valid file weighs 2–11 MB and has 62 channels with data; an empty one weighs ~19 KB (header only). Refresh the page to re-listen after a session.' })}</div>
  </div>` : `<div class="panel" style="margin-top:14px"><h2>${tr({ it: 'Diagnostica telemetria', en: 'Telemetry diagnostics' })}</h2><div class="muted">${tr({ it: 'Nessun file MoTeC trovato in {P}: fai una sessione e EVO scriverà il primo file.', en: 'No MoTeC file found in {P}: run a session and EVO will write the first one.' }).replace('{P}', esc(diag.root ?? 'Saved Games\\ACE\\MoTec'))}</div></div>`;
  m.innerHTML += diagHtml;

  // salute sistema + registro errori: diagnostica degli strumenti, non della carriera
  const [health, warns] = await Promise.all([
    api('system-health').catch(() => null),
    api('warnings').catch(() => ({ total: 0, modules: [] })),
  ]);
  let healthHtml = `<div class="panel" style="margin-top:14px" id="system-health"><h2>${tr({ it: 'Salute sistema', en: 'System health' })} <span class="h-act">${tr({ it: 'lettore live e telemetria', en: 'live reader and telemetry' })}</span></h2>`;
  if (health) {
    const rd = health.reader ?? {};
    const liveRow = (label, ok, note) => `<div style="padding:3px 0;border-bottom:1px solid var(--line,#222)"><b>${label}:</b> ${ok ? '<span class="tag green" style="font-size:10px;padding:1px 6px">ok</span>' : '<span class="tag" style="font-size:10px;padding:1px 6px;background:#3a1d1d;color:#ff9b9b">no</span>'}${note ? ` <span class="muted" style="font-size:11px">${note}</span>` : ''}</div>`;
    healthHtml += liveRow(tr({ it: 'Processo PowerShell', en: 'PowerShell process' }), rd.running, rd.ps1Exists ? (rd.alive ? tr({ it: 'vivo e aggiorna', en: 'alive and updating' }) : (rd.running ? tr({ it: 'avviato ma silenzioso', en: 'started but quiet' }) : tr({ it: 'non ancora partito (si avvia al primo accesso al LIVE)', en: 'not started yet (starts at first LIVE access)' }))) : tr({ it: 'script tools/acevo-live.ps1 mancante', en: 'tools/acevo-live.ps1 script missing' }));
    healthHtml += liveRow(tr({ it: 'Gioco in sessione', en: 'Game in session' }), health.game, health.gameVersion ? tr({ it: `versione gioco ${esc(health.gameVersion)}`, en: `game version ${esc(health.gameVersion)}` }) : '');
    if (health.smVersion) healthHtml += `<div style="padding:3px 0"><b>${tr({ it: 'Shared memory:', en: 'Shared memory:' })}</b> <span class="muted" style="font-size:11px">${tr({ it: `interfaccia ${esc(health.smVersion)}`, en: `interface ${esc(health.smVersion)}` })}${health.gameVersion ? tr({ it: ` · gioco ${esc(health.gameVersion)}`, en: ` · game ${esc(health.gameVersion)}` }) : ''}${rd.restarts ? tr({ it: ` · ${rd.restarts} ricicli del lettore`, en: ` · ${rd.restarts} reader recycles` }) : ''}</span></div>`;
    if (health.stderrTail) healthHtml += `<div class="muted" style="font-size:11px;margin-top:4px">PowerShell stderr: ${esc(health.stderrTail)}</div>`;
    const ld = health.telem?.lastLd;
    if (ld) {
      healthHtml += `<div style="padding:3px 0;border-bottom:1px solid var(--line,#222)"><b>${tr({ it: 'Ultimo file .ld:', en: 'Last .ld file:' })}</b> ${ld.valid ? `<span class="tag green" style="font-size:10px;padding:1px 6px">${tr({ it: 'dati ok', en: 'data ok' })}</span>` : `<span class="tag" style="font-size:10px;padding:1px 6px;background:#3a1d1d;color:#ff9b9b">${tr({ it: 'VUOTO', en: 'EMPTY' })}</span>`} <span class="muted" style="font-size:11px">${esc(ld.car)} · ${esc(ld.file)} · ${Math.round(ld.size/1024)} KB · ${esc(ld.when)} · ${ld.withData}/${ld.channels} ${tr({ it: 'canali', en: 'channels' })}</span></div>`;
      if (!ld.valid) healthHtml += `<div class="banner warn" style="margin-top:6px">${tr({ it: "L'ultimo file scritto da EVO è vuoto (solo intestazione): la telemetria non era attiva in EVO (Setup → Elettronica, da impostare PRIMA di avviare la sessione). Finché non scrive dati veri, i consigli del BOX usano la stima.", en: 'The last file written by EVO is empty (header only): telemetry was NOT active in EVO (Setup → Electronics, set BEFORE starting the session). Until it writes real data, the BOX uses estimates.' })}</div>`;
    } else {
      healthHtml += `<div class="muted" style="font-size:11px">${tr({ it: 'Nessun file .ld trovato in', en: 'No .ld file found in' })} ${(health.telem?.dirsChecked ?? []).map((d) => esc(d)).join(', ')}.</div>`;
    }
  } else {
    healthHtml += '<div class="muted">Endpoint system-health non disponibile: riavvia il server del tool.</div>';
  }
  healthHtml += '</div>';

  let warnsHtml = `<div class="panel" style="margin-top:14px" id="warnings-panel"><h2>${tr({ it: 'Registro errori', en: 'Error log' })} <span class="h-act">${tr({ it: 'ultimi problemi degli strumenti (data/errors.jsonl)', en: 'latest tool problems (data/errors.jsonl)' })}</span></h2>`;
  const mods = warns.modules ?? [];
  if (!mods.length) {
    warnsHtml += `<div class="banner good">${tr({ it: 'Nessun errore registrato: gli strumenti lavorano puliti.', en: 'No errors recorded: the tools are running clean.' })}</div>`;
  } else {
    warnsHtml += mods.map((md) => `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:12.5px"><b>${esc(md.module)}</b> <span class="tag" style="font-size:10px;padding:1px 6px;background:#3a2a1d;color:#ffc78a">${md.count}</span> <span class="muted" style="font-size:11px">${tr({ it: 'ultimo:', en: 'last:' })} ${esc(String(md.last[0]?.at ?? '').slice(0,19).replace('T',' '))}</span></summary><div style="margin-top:4px">${md.last.map((w) => `<div style="padding:2px 0;border-bottom:1px solid var(--line,#222);font-size:12px"><span class="muted">${esc(String(w.at).slice(11,19))}</span> ${esc(w.message)}${w.extra?` <span class="muted">(${esc(w.extra)})</span>`:''}</div>`).join('')}</div></details>`).join('');
  }
  warnsHtml += '</div>';
  m.innerHTML += healthHtml + warnsHtml;

  /* AUTO-REFRESH MENTRE GIRI (Mauro 21/10): ogni 15 s guarda se è cambiato il
     dato che conta — l'ultimo .ld scritto da EVO, il suo numero di giri validi
     o il file di setup montato (staleness). Se la firma è cambiata ridisegna la
     vista mantenendo lo scrolling: al rientro dal box trovi i dati freschi
     SENZA F5. Fuori dal tab setup il timer muore (render lo ripulisce). */
  const sigFresh = (s, ldMs) => (s?.sessions?.[0]?.when ?? '') + '|' + (s?.sessions?.[0]?.validLaps ?? '') + '|' + (s?.stale?.file ?? '') + '|' + (ldMs ?? '');
  const sigAt = sigFresh(tel, h?.telem?.lastLd?.mtimeMs);
  if (window.__setupTimer) clearInterval(window.__setupTimer);
  window.__setupTimer = setInterval(async () => {
    if (tab !== 'setup') { clearInterval(window.__setupTimer); window.__setupTimer = null; return; }
    if (window.__setupBusy) return;
    window.__setupBusy = true;
    try {
      const [t2, h2] = await Promise.all([
        api('garage', { action: 'sessions', car: carSel?.carName ?? null, track: 'all', limit: 4 }).catch(() => null),
        api('system-health').catch(() => null),
      ]);
      const sig2 = sigFresh({ sessions: t2?.sessions, stale: t2?.stale }, h2?.telem?.lastLd?.mtimeMs);
      if (sig2 === sigAt || tab !== 'setup') return;   // niente da dire
      clearInterval(window.__setupTimer); window.__setupTimer = null;
      const y = window.scrollY;        // ricalcolo completo con i dati nuovi (il nuovo drawSetup riaggancia il timer
        // con la firma aggiornata: niente loop infinito di ridisegni)
        await drawSetup(document.querySelector('#main'));
      window.scrollTo(0, Math.max(0, y - 4));             // il rientro non perdere la posizione
    } catch { /* l'auto-refresh non deve mai rompere la vista */ }
    finally { window.__setupBusy = false; }
  }, 15000);
}
