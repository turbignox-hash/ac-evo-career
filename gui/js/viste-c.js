/* -------- risultati / import -------- */
async function drawImport(m){
  const [insp, card] = await Promise.all([api('import-inspect'), api('card')]);
  const pending = boot.header.pending;
  m.innerHTML = `
  <div class="panel">
    <h2>Importa il risultato${pending ? ` <span class="h-act">atteso: R${pending.round+1} ${esc(pending.trackNames[0])}</span>` : ''}</h2>
    <div class="row">
      <button class="act" id="b-import">Importa l'ultima gara compatibile</button>
      <button class="ghost" id="b-reload">Ricarica elenco</button>
    </div>
    <div id="imp-result"></div>
    <table style="margin-top:14px"><thead><tr><th>File</th><th>Sessione</th><th>Pista</th><th class="right">Piloti</th><th>Tu</th></tr></thead>
    <tbody>${insp.files.map(f=>`<tr><td class="muted">${esc(f.name)}</td><td>${esc(f.session)}</td><td>${esc(f.track)}</td><td class="right">${f.drivers}</td><td>${f.me?`<span class="tag green">P${f.me.position}${f.me.dnf?' ritiro':''}</span> <span class="muted" title="riconosciuto per: ${esc(f.me.how)} — il tuo nome nel file è quello senza pallino AI">tu (${esc(f.me.car ?? '')})</span>`:'<span class="faint">—</span>'}</td></tr>`).join('')}</tbody>
    </table>
    <div class="muted" style="margin-top:12px">Se il gioco non ti riconosce, inserisci la posizione a mano qui sotto (la vedi nella schermata risultati di EVO).</div>
    <form id="f-manual" class="row" style="margin-top:8px">
      <input type="number" id="i-pos" min="1" placeholder="posizione" style="width:120px" required>
      <input type="number" id="i-cars" min="2" placeholder="auto in griglia" style="width:150px" value="${card.gridSize}">
      <input type="number" id="i-laps" min="0" placeholder="giri" style="width:90px" title="facoltativo">
      <input type="text" id="i-bestlap" placeholder="miglior giro (m:ss.mmm)" style="width:180px" title="facoltativo">
      <label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="i-dnf"> ritiro</label>
      <label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="i-fl"> giro veloce</label>
      <button class="ghost" type="submit">Inserisci a mano</button>
    </form>
  </div>`;
  $('#b-reload').onclick = () => render();
  $('#b-import').onclick = async () => {
    const b = $('#b-import'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    await importCall({}); b.disabled=false; b.textContent="Importa l'ultima gara compatibile";
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
      box.innerHTML = `<div class="banner warn"><b>Nessun nuovo risultato registrato</b> — ${esc(r.source ?? 'file già incassato')}<br><span class="muted">I soldi, i punti e il registro rivali restano come erano: niente doppioni.</span></div>`;
      return;
    }
    const e = r.entry;
    box.innerHTML = `<div class="banner good">
      <b>${e.dnf ? 'Ritiro' : 'P'+(e.position ?? '?')} su ${e.gridSize}</b> · R${r.round} di ${esc(r.node)} — ${e.points} punti · premio ${money(e.prize)} € · +${e.rep} rep<br>
      <span class="muted">${esc(r.source)}</span><br>
      Classifica: P${r.standing.before ?? '?'} → <b>P${r.standing.after ?? '?'}</b> (${r.standing.points} punti) · banca ${money(r.money)} €
      ${r.proposal ? `<br>Difficoltà proposta: ${esc(r.proposal.reason)} — trim ${r.proposal.from} → ${r.proposal.to}. Accettala in Difficoltà.` : ''}
      ${r.nudgeSuggested ? `<div class="banner warn" style="margin-top:8px"><b>🚀 Gara troppo facile?</b> ${esc(r.nudgeSuggested.reason)}.<br>
        <button class="mini" id="b-nudge-accept" style="margin-top:6px">Sì, porta la serie a +1</button>
        <span class="muted" style="font-size:11px;margin-left:6px">no, lascia come sta</span></div>` : ''}
      ${r.challenge ? `<br>🎯 Sfida ${r.challenge.won?'<b style="color:var(--good)">vinta</b>':'<b style="color:var(--bad)">persa</b>'}: ${esc(r.challenge.text)} (${r.challenge.won?'+':''}${r.challenge.won ? money(r.challenge.reward) : '−'+r.challenge.penalty+' rep'})` : ''}
      ${r.vendetta?.newNemesi?.length ? `<br>😬 <b>Nuova nemesi:</b> ${esc(r.vendetta.newNemesi.join(', '))} — ti ha battuto due volte di fila.` : ''}
      ${r.vendetta?.settled?.length ? `<br>⚔️ <b>Vendetta assestata</b> su ${esc(r.vendetta.settled.join(', '))}.` : ''}
      ${r.duel ? `<br>⚔️ Duello della stagione: ${esc(r.duel.name)} — tu ${r.duel.myPoints} pt, lui ${r.duel.hisPoints} pt.` : ''}
      ${r.news ? `<br>📰 <b>${esc(r.news.title)}</b><br><span class="muted" style="white-space:pre-wrap">${esc(r.news.body)}</span>` : ''}
      ${r.seasonDone ? '<br><b>Stagione completata!</b> Puoi chiuderla dalla scheda in Cruscotto.' : ''}
      ${r.entry?.sectors ? sectorRowsHtml(r.entry.sectors) : ''}
    </div>`;
  } catch(e){
    const d = e.data || {};
    let extra = '';
    if (d.code === 'PLAYER_NOT_FOUND') extra = `<br>Piloti senza pallino AI: <b>${esc((d.detail?.candidates||[]).join(', '))}</b>. Correggi il nome in Impostazioni, o inserisci a mano.`;
    if (d.code === 'TRACK_MISMATCH') extra = `<br>Gara trovata su <b>${esc(d.detail?.actual)}</b>, attesa su <b>${esc((d.detail?.expected||[]).join(' / '))}</b>.`;
    box.innerHTML = `<div class="banner bad">${esc(e.message)}${extra}</div>`;
  }
  $('#b-nudge-accept', box)?.addEventListener('click', async () => {
    try {
      const out = await api('difficulty-nudge', { delta: 1 });
      const b = $('#b-nudge-accept', box);
      const lo = out?.card?.difficulty?.rangeMin ?? '?', hi = out?.card?.difficulty?.rangeMax ?? '?';
      if (b) { b.disabled = true; b.textContent = `Fatto: banda a ${lo}–${hi}%.`; }
      toast(`Difficoltà della serie portata a ${lo}–${hi}%.`, 'ok');
      await refreshBoot();
    } catch(err){ toast(err.message, 'err'); }
  });
}

function sectorRowsHtml(sec){
  if (!sec?.sectors?.length) return '';
  const w = sec.worstSector ? `Il settore <b>${sec.worstSector.index}</b> ti costa di più (+${(sec.worstSector.deltaMs/1000).toFixed(3)}s sul migliore)` : '';
  return `<div style="margin-top:10px"><b>Settori</b> — tu contro il meglio della griglia${w?` · ${w}`:''}<table style="margin-top:6px"><thead><tr><th>S</th><th class="right">Tuo</th><th class="right">Migliore</th><th>Da chi</th><th class="right">Δ</th><th class="right">Δ media top3</th></tr></thead><tbody>
    ${sec.sectors.map((s,i)=>`<tr><td>S${s.index}</td><td class="right">${s.mineText}</td><td class="right">${s.bestText}</td><td class="muted">${esc(s.bestName??'—')}</td><td class="right">${s.deltaMs==null?'—':(s.deltaMs>=0?'+':'')+(s.deltaMs/1000).toFixed(3)}</td><td class="right">${sec.top3Deltas[i]==null?'—':(sec.top3Deltas[i]>=0?'+':'')+(sec.top3Deltas[i]/1000).toFixed(3)}</td></tr>`).join('')}
    <tr><td class="faint">teorico</td><td class="right"><b>${sec.theoreticalText}</b></td><td class="right">${sec.bestLapText}</td><td colspan="3" class="faint">${sec.theoreticalGainText?`giro teorico ${sec.theoreticalGainText} sotto il tuo best`:''}</td></tr>
  </tbody></table></div>`;
}


/* -------- libro delle auto -------- */
async function drawCars(m){
  const b = await api('cars');
  const money = (n) => Number(n ?? 0).toLocaleString('it-IT');
  const inLadder = new Set(b.rows.filter(r=>r.ladderId).map(r=>r.ladderId));
  const nRoad = b.rows.filter(r=>r.category==='road').length;
  const nRacing = b.rows.filter(r=>r.category==='racing').length;
  m.innerHTML = `
  <div class="panel">
    <h2>Libro delle auto <span class="h-act">${b.rows.length} render ufficiali Kunos</span></h2>
    <div class="row" style="align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <input id="cars-q" type="text" placeholder="cerca un'auto…" style="flex:1;max-width:280px">
      <div id="cars-cat" style="display:flex;gap:6px">
        <button class="mini" data-cat="" style="border-color:var(--acc)">Tutte (${b.rows.length})</button>
        <button class="mini" data-cat="road">Stradali (${nRoad})</button>
        <button class="mini" data-cat="racing">Racing (${nRacing})</button>
      </div>
      <label class="muted" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="cars-ladder" checked> solo auto del ladder (${inLadder.size})</label>
    </div>
    <div id="cars-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px"></div>
  </div>`;
  let cat = '';
  const draw = () => {
    const q = $('#cars-q').value.toLowerCase();
    const onlyLadder = $('#cars-ladder').checked;
    const rows = b.rows.filter(r => (!cat || r.category===cat) && (!onlyLadder || r.ladderId) && (!q || r.name.toLowerCase().includes(q) || (r.ladderName??'').toLowerCase().includes(q)));
    const piBadge = (pi) => pi==null ? '' : `<span class="tag blue" style="font-size:10px;padding:1px 6px" title="Perf. index dal server dedicato">PI ${pi.toFixed(1)}</span>`;
    $('#cars-grid').innerHTML = rows.map((r,i)=>{
      const eco = r.ladderId ? b.economy?.[r.ladderId] : null;
      const inGar = r.ladderId && b.inGarage?.includes(r.ladderId);
      const price = r.realPrice != null
        ? `<div style="margin-top:6px"><span class="tag gold" style="font-size:12px;padding:2px 8px" title="prezzo reale indicativo (listino o mercato)">💰 ${money(r.realPrice)} €</span></div>`
        : (eco?.buy != null
          ? `<div style="margin-top:6px"><span class="tag gold" style="font-size:12px;padding:2px 8px" title="prezzo di gioco (serie più conveniente)">💰 ${money(eco.buy)} € <span class="muted" style="font-weight:400">(di gioco)</span></span></div>`
          : `<div class="muted" style="margin-top:6px;font-size:11px">prezzo non noto</div>`);
      return `<div class="panel car-click" data-i="${rows.indexOf(r)}" style="padding:0;overflow:hidden;cursor:pointer" title="clicca per tutti i dettagli">
      <img class="car-frame" src="${r.image}" alt="${esc(r.name)}" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#0d1118">
      <div style="padding:8px 10px"><b style="font-size:12.5px">${esc(r.name)}</b> ${piBadge(r.pi)} <span class="faint" style="font-size:10px">${r.category==='racing'?' racing':' stradale'}</span>${inGar?' <span class="tag gold" style="font-size:10px;padding:1px 6px" title="già nel tuo garage">🏠 garage</span':''}
      ${price}
      ${r.specs?.power!=null?`<div class="muted" style="font-size:11px;margin-top:4px">${r.specs.power} CV · ${r.specs.weight!=null?r.specs.weight+' kg · ':''}${esc(r.specs.drive??'')}</div>`:''}
      ${r.variants?.length?`<div class="muted" style="font-size:11px;margin-top:2px">varianti: ${esc(r.variants.join(', '))}</div>`:''}</div>
    </div>`;
    }).join('') || '<div class="empty">Nessuna auto trovata.</div>';
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
        <text x="${PAD}" y="14" fill="#8fa" font-size="11">potenza kW</text>
        <text x="${W-110}" y="14" fill="#f96" font-size="11">coppia Nm</text>
        <text x="${PAD}" y="${H-8}" fill="var(--dim)" font-size="10">${minR} giri/min</text>
        <text x="${W-PAD-60}" y="${H-8}" fill="var(--dim)" font-size="10">${maxR} giri/min</text>
        ${T?.length?`<path d="${line(T, yT)}" fill="none" stroke="#f96" stroke-width="2" stroke-dasharray="5 4"/>`:''}
        ${P?.length?`<path d="${line(P, yP)}" fill="none" stroke="#8fa" stroke-width="2.4"/>`:''}
      </svg>
      <div class="muted" style="font-size:11px;margin-top:3px">Picchi: ${maxP?maxP.toFixed(0)+' kW':'—'} · ${maxT?maxT.toFixed(0)+' Nm':'—'} (curve dall'installazione di Assetto Corsa 1)</div>
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
        <span class="tag ${r.category==='racing'?'blue':''}">${r.category==='racing'?'racing':'stradale'}</span>
        ${r.pi!=null?`<span class="tag blue">PI ${r.pi.toFixed(1)}</span>`:''}
        ${r.realPrice!=null?`<span class="tag gold" title="prezzo reale indicativo">💰 ~${money(r.realPrice)} € reali</span>`:(eco?.buy!=null?`<span class="tag gold">💰 acquisto ${money(eco.buy)} € (gioco)</span>`:'')}
        ${inGar?'<span class="tag gold">🏠 nel tuo garage</span>':''}
      </div>
      ${s ? `
      <h3 style="margin:4px 0 2px;font-size:13px">Scheda tecnica</h3>
      ${row('Potenza', s.power!=null?`${s.power} CV (${(s.power*0.7355).toFixed(0)} kW)`:null)}
      ${row('Coppia', s.torque!=null?`${s.torque} Nm`:null)}
      ${row('Peso', s.weight!=null?`${s.weight} kg`:null)}
      ${row('Peso/potenza', s.pwratio!=null?esc(String(s.pwratio)):(s.power&&s.weight?`${(s.weight/s.power).toFixed(2)} kg/CV`:null))}
      ${row('Trazione', s.drive?esc(s.drive):null)}
      ${row('Cambio', s.gearbox?esc(s.gearbox):null)}
      ${row('Velocità massima', s.topspeed?esc(String(s.topspeed)):null)}
      ${row('Accelerazione', s.acceleration?esc(String(s.acceleration)):null)}
      ${row('Anno', s.year??null)}
      ${row('Nazione', s.country?esc(s.country):null)}
      ${curveChart(s)}` : '<div class="muted" style="margin-top:8px;font-size:12px">Scheda tecnica non disponibile per questo modello.</div>'}
      <h3 style="margin:14px 0 2px;font-size:13px">Nella carriera</h3>
      ${row('Nome nella carriera', r.ladderName ? esc(r.ladderName) : (r.ladderId ? esc(r.ladderId) : null))}
      ${row('Prezzo reale indicativo', r.realPrice != null ? money(r.realPrice) + ' €' : null)}
      ${row('Acquisto sedile (gioco)', eco?.buy != null ? money(eco.buy) + ' €' : null)}
      ${row('Iscrizione per gara (da)', eco?.entry != null ? money(eco.entry) + ' €' : null)}
      ${row('Premio di gara (fino a)', eco?.prize != null ? money(eco.prize) + ' €' : null)}
      ${row('Varianti disponibili', r.variants?.length ? esc(r.variants.join(', ')) : null)}
      ${eco?.series?.length ? `<div class="muted" style="margin-top:10px;font-size:12px">Serie dove puoi correrla: ${eco.series.map(esc).join(' · ')}</div>` : '<div class="muted" style="margin-top:10px;font-size:12px">Questa auto non è usata dalle serie di carriera: la puoi solo aggiungere al garage.</div>'}
      ${r.shTop!=null?`<div class="muted" style="margin-top:6px;font-size:12px">Baseline telemetry (SH) top: ${(r.shTop*100).toFixed(1)}%</div>`:''}
    `, [['Chiudi','ghost',()=>{}]]);
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
    ? '<span class="tag gold" title="l\'auto dell\'antenato, arrivata con l\'eredità">📜 relic di famiglia</span>'
    : how === 'won'
    ? '<span class="tag gold" title="vinta in un evento speciale">🏆 vinta</span>'
    : '<span class="tag blue" title="acquistata">💰 comprata</span>';
  m.innerHTML = `
  <div class="panel">
    <h2>Garage <span class="h-act">${g.total} auto · ${g.won} vinte · ${g.bought} comprate · ${g.totalWins} vittorie · patrimonio ${money(g.patrimony)} €</span></h2>
    ${g.justImported?.length ? `<div class="banner ok" style="margin-bottom:10px">🏆 Entrate in garage: ${esc(g.justImported.join(', '))}</div>` : ''}
    <div class="row" style="align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <select id="g-add" style="flex:1;min-width:220px">
        <option value="">— aggiungi un'auto dal catalogo…</option>
        ${cat.cars.map(c=>`<option value="${esc(c.id)}" data-name="${esc(c.name)}">${esc(c.name)}${c.pi!=null?` (PI ${c.pi.toFixed(1)})`:''}</option>`).join('')}
      </select>
      <select id="g-how" style="width:130px"><option value="bought">comprata</option><option value="won">vinta</option></select>
      <button class="act" id="g-addbtn" style="width:auto;padding:8px 14px">Aggiungi</button>
      <span class="muted" style="font-size:11px">Le auto vinte negli eventi speciali arrivano qui da sole.</span>
    </div>
    <div id="g-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px"></div>
  </div>`;
  const draw = (gg) => {
    $('#g-grid').innerHTML = gg.cars.map(c=>`
    <div class="panel" style="padding:0;overflow:hidden" data-car="${esc(c.carId)}">
      ${c.image?`<img class="car-frame" src="${c.image}" alt="${esc(c.carName)}" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#0d1118">`:''}
      <div style="padding:9px 11px">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b style="font-size:13px">${esc(c.carName)}</b> ${badge(c.how, c.note)}${c.pi!=null?`<span class="tag blue" style="font-size:10px;padding:1px 6px" title="Perf. index dal server dedicato">PI ${c.pi.toFixed(1)}</span>`:''}</div>
        <div class="muted" style="font-size:11px;margin-top:3px">nel garage dal ${esc(new Date(c.since).toLocaleDateString('it-IT'))}${c.note?` · ${esc(c.note)}`:''}</div>
        <div style="display:flex;gap:10px;margin-top:7px;font-size:12px;flex-wrap:wrap">
          <span title="gare con questa auto">🏁 ${c.stats.races} gare</span>
          <span title="vittorie" style="color:var(--good)">🥇 ${c.stats.wins}</span>
          <span title="podio">🎯 ${c.stats.podiums}</span>
          <span title="chilometri percorsi in gara con noi (giri × lunghezza pista)">🛣 ${money(c.stats.km)} km</span>
          ${c.stats.bestLap?`<span class="muted" title="miglior giro in carriera">⏱ ${esc(c.stats.bestLap)}</span>`:''}
        </div>
        <div style="margin-top:7px;font-size:12px"><b>valutata ${money(c.value)} €</b> <span class="muted" style="font-size:10.5px" title="prezzo reale svalutato dai km (${Math.round(c.valueFactor*100)}%)">${c.realPrice!=null?`(nuova ~${money(c.realPrice)} €)`:''}</span> · <span style="color:var(--good)">vendita ${money(c.sale)} €</span></div>
        <div class="row" style="margin-top:8px;gap:6px">
          <input class="g-note" type="text" placeholder="nota (es. livrea, assetto…)..." value="${esc(c.note ?? '')}" style="flex:1;min-width:120px;font-size:11px">
          <button class="mini g-savenote">salva</button>
          <button class="mini g-sell" title="vendi al 70% della valutazione">vendi</button>
        </div>
      </div>
    </div>`).join('') || '<div class="empty">Garage vuoto: vinci un evento speciale o aggiungi un\'auto dal catalogo.</div>';
    $$('#g-grid .g-savenote').forEach(b => b.onclick = async () => {
      const card = b.closest('[data-car]');
      try { const out = await api('garage-note', { carId: card.dataset.car, note: $('.g-note', card).value }); draw(out.garage); toast('Nota salvata.', 'ok'); }
      catch(e){ toast(e.message, 'err'); }
    });
    $$('#g-grid .g-sell').forEach(b => b.onclick = async () => {
      const card = b.closest('[data-car]');
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.style.borderColor = 'var(--bad)'; b.textContent = 'confermi?'; setTimeout(()=>{ b.dataset.armed=''; b.style.borderColor=''; b.textContent='vendi'; }, 3000); return; }
      try {
        const out = await api('garage-sell', { carId: card.dataset.car });
        draw(out.garage); paintHeader(out.header); refreshBoot();
        toast(`Venduta: +${money(out.sold.gain)} € (${money(out.sold.km)} km).`, 'ok');
      }
      catch(e){ toast(e.message, 'err'); }
    });
  };
  draw(g);
  $('#g-addbtn').onclick = async () => {
    const sel = $('#g-add');
    if (!sel.value) return toast("Scegli prima un'auto dal menu.", 'err');
    try {
      const out = await api('garage-add', { carId: sel.value, carName: sel.selectedOptions[0].dataset.name, how: $('#g-how').value });
      sel.value = ''; draw(out.garage); toast(out.reused ? "Auto già in garage." : 'Auto aggiunta al garage.', out.reused ? 'info' : 'ok');
    } catch(e){ toast(e.message, 'err'); }
  };
}

/* -------- libro delle piste -------- */
async function drawTracks(m){
  const t = await api('tracks');
  const lapMs = (s) => { const m = String(s??'').match(/^(\d+):(\d{2})\.(\d{3})$/); return m ? (+m[1])*60000 + (+m[2])*1000 + (+m[3]) : null; };
  const flag = (c) => ({ 'Italia':'🇮🇹','Giappone':'🇯🇵','Austria':'🇦🇹','Australia':'🇦🇺','Germania':'🇩🇪','Stati Uniti':'🇺🇸' }[c] ?? '🏁');
  const rows = t.rows.map((r) => `<tr>
    <td><b>${flag(r.info?.country)} ${esc(r.track)}</b>${r.id===t.next?.id?` <span class="tag gold" style="font-size:10px;padding:1px 6px">prossima</span>`:''}${r.inLadder?'':' <span class="faint">(fuori ladder)</span>'}</td>
    <td class="muted">${r.info?esc(r.info.nick):'—'}</td>
    <td class="right"><b>${r.personal?esc(r.personal.time):'—'}</b>${r.personal?`<br><span class="faint" style="font-size:11px">${esc(r.personal.car??'')}</span>`:''}</td>
    <td class="right">${r.session?`<b>${esc(r.session.time)}</b> <span class="faint">${esc(r.session.driver)}${r.session.mine?' (tu)':''}</span>`:'—'}</td>
    <td class="right">${(() => { const a=lapMs(r.personal?.time), b=lapMs(r.session?.time); return (a&&b)?(b<a?`<span class="tag gold" style="font-size:10px;padding:1px 6px">−${((a-b)/1000).toFixed(3)}</span>`:`<span class="tag green" style="font-size:10px;padding:1px 6px">+${((b-a)/1000).toFixed(3)}</span>`):'—'; })()}</td>
    <td>${r.info?`<button class="mini b-hist" data-hist="${esc(r.id)}">📚 storia & risultati</button>`:''}</td>
  </tr>`).join('');
  m.innerHTML = `
  <div class="panel">
    <h2>Libro delle piste <span class="h-act">record personali e di sessione, per tracciato e per layout, con la storia di ogni pista</span></h2>
    <div class="muted" style="margin-bottom:10px">Il <b>record personale</b> è il tuo miglior giro (carriera + prove). Il <b>record di sessione</b> è il migliore mai visto nei risultati sulla stessa auto (tuo o di un rivale: è il tempo da battere). La <b>📚 storia</b> apre la scheda completa: immagini, la storia del tracciato e i record di ogni configurazione.</div>
    <table><thead><tr><th>Pista</th><th>Soprannome</th><th class="right">Tuo record</th><th class="right">Record di sessione</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>
  <div id="track-hist"></div>`;
  $$('button[data-hist]').forEach((b) => b.onclick = () => {
    const r = t.rows.find((x) => x.id === b.dataset.hist);
    const i = r?.info;
    $('#track-hist').innerHTML = !i ? '' : `<div class="panel" style="margin-top:14px"><h2>${flag(i.country)} ${esc(i.fullName)} <span class="h-act">${esc(i.country)} · ${i.lengthKm} km · ${i.corners} curve · inaugurato nel ${i.opened}</span></h2>
      ${i.photo ? `<img src="${i.photo}" alt="vista aerea di ${esc(r.track)}" style="width:100%;max-width:520px;aspect-ratio:16/9;object-fit:cover;background:#000;border-radius:10px;margin-bottom:10px">` : (i.map ? `<img src="${i.map}" alt="tracciato ${esc(r.track)}" style="width:100%;max-width:420px;object-fit:contain;background:#000;border-radius:10px;padding:12px;margin-bottom:10px${i.map.endsWith('.svg')?';filter:invert(1);opacity:.92':''}">` : '')}
      ${r.layoutRows?.length>1 ? `<h3 style="margin:0 0 6px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim)">Record per configurazione (${r.layoutRows.length} layout)</h3>
      <table style="margin-bottom:10px"><thead><tr><th>Layout</th><th class="right">Lunghezza</th><th class="right">Box</th><th class="right">Tuo miglior</th><th class="right">Record di sessione</th></tr></thead><tbody>${r.layoutRows.map(l=>`<tr><td><b>${esc(l.layout)}</b></td><td class="right">${l.lengthKm??'—'} km</td><td class="right">${l.pits??'—'}</td><td class="right">${l.mine?`<b>${esc(l.mine.time)}</b>${l.mineFallback?'<span class="faint"> *</span>':''}`:'—'}</td><td class="right">${l.session?`${esc(l.session.time)} <span class="faint">${esc(l.session.driver)}</span>`:'—'}</td></tr>`).join('')}</tbody></table><div class="faint" style="margin:-6px 0 10px;font-size:11px">* dal record personale in carriera/prove (una sola configurazione corsa: il save non distingue i layout)</div>` : ''}
      <div style="line-height:1.6">${esc(i.history)}</div></div>`;
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
    <text x="${PAD}" y="14" fill="#8fa" font-size="11">giro ${t.lap} (${t.durationSec}s) — km/h</text>
    ${C ? `<text x="${W - 300}" y="14" fill="#f96" font-size="11">giro ${C.lap} (${C.durationSec}s)</text>` : ''}
    <text x="${PAD}" y="${yV(maxV) + 14}" fill="var(--dim)" font-size="10">${Math.round(maxV)} km/h</text>
    <text x="${PAD}" y="${H - 6}" fill="#7f7" font-size="10">differenza col confronto: verde = sei più veloce · rosso = più lento</text>
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
      ? `<div class="banner good" style="margin-top:8px"><b>🏁 PER LA GARA (${tel.raceLaps ?? '?'} giri): parti da <b>${race.raceStartPsi} PSI</b></b> — finestra ${race.raceRange?.[0]}–${race.raceRange?.[1]} PSI<br>
         <span class="muted">Qualifica / giri secchi: ${race.qualiStartPsi} PSI · Target a caldo ${tel.target} PSI${doppio ? ` · <b>base telemetria: conferma la stessa partenza</b> (${adv.suggestedStartPsi} PSI)` : ''}<br>${esc(race.raceAdvice ?? '')}${offTrack ? `<br>⚠️ Consiglio basato sull'ultima uscita su <b>${esc(tel.basisTrack)}</b>, non su ${esc(tel.trackDisplay)}: fai qualche giro lì per metterlo a punto su questa pista` : ''}</span></div>`
        + (doppio ? '' : `<div class="banner info" style="margin-top:6px"><b>💡 Base telemetria</b> (uscite brevi): parti da <b>${adv.suggestedStartPsi} PSI</b> (finestra ${adv.range?.[0]}–${adv.range?.[1]})<br><span class="muted">${esc(adv.advice)}</span></div>`)
      : (adv.ok
        ? `<div class="banner good" style="margin-top:8px"><b>💡 Pressione consigliata (${esc(tel.classLabel ?? '')}): parti da <b>${adv.suggestedStartPsi} PSI</b></b> (finestra ${adv.range?.[0]}–${adv.range?.[1]} PSI, target a caldo ${tel.target} PSI)<br><span class="muted">${esc(adv.advice)}</span></div>`
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
      live: live?.game ? (live?.live ? 'in pista' : 'aperto') : null,
      telem: h?.telem?.lastLd ? new Date(h.telem.lastLd.mtimeMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null,
    };
    /* SETUP PIÙ NUOVO DELL'ULTIMA SESSIONE: il meccanico giudica i dati vecchi —
       mostrato GRANDE sopra la checklist, non solo come chip (Mauro 21/10). */
    const staleHtml = tel.stale?.changed
      ? `<div class="banner warn" style="margin:10px 0 0;padding:10px 12px">⚠️ <b>Setup montato più recente dell'ultima uscita</b> — la base dati del meccanico (giri, bump, camber, freni) parla della sessione di <b>${esc(tel.stale.lastSession ?? '?')}</b>, ma il file di setup attivo è <b>«${esc(tel.stale.file)}»</b> salvato alle ${esc(tel.stale.setupWhen ?? '')}.<br><span class="muted" style="font-size:11.5px">Fai 2 giri con il nuovo assetto (telemetria attiva): appena il .ld esce, tutta l'analisi si rigenera sui dati freschi. Il consiglio pressioni resta valido: si proietta sui TARGET, non sui valori del vecchio setup.</span></div>`
      : '';
    const DOT = { ok: '🟢', warn: '🟠', bad: '🔴', info: '🔸' };
    const clHtml = cl ? (
      cl.allGood
        ? `<div class="banner good" style="margin:10px 0;padding:10px 12px">🟢 <b>Auto a punto — il meccanico non ha più niente da consigliare.</b> <span class="muted" style="font-size:11.5px">Nessuna voce sotto soglia: puoi girare col setup attuale — la lista riparte colorata se qualcosa esce fuori al prossimo giro.</span></div>`
        : `<ul style="margin:10px 0 4px;padding:0;list-style:none;font-size:13px;line-height:1.75">
      ${cl.items.map((i) => `<li style="margin:0">${DOT[i.level] ?? '🔸'} <b>${esc(i.area)}</b> — ${esc(i.text)}</li>`).join('\n      ')}
    </ul>`
    ) : '';
    /* SETUP RISISTEMATO: il GRAFICO DELLA TELEMETRIA è la prima cosa si vede,
       grande e a tutta larghezza; consigli, sessioni, diagnostica sotto. */
    return `<div class="panel setup-hero">
      <div class="setup-hero-head">
        <span class="setup-hero-title">📈 GRAFICO DEL GIRO</span>
        <span class="setup-hero-sub">${esc(tel.car ?? s.car ?? '')} · ${esc(s.track ?? tel.trackDisplay ?? '')} · velocità, gas e freno, confronto fra giri</span>
      </div>
    <div id="meccanico-out" style="margin:0 0 10px"></div>
    <div class="lc-controls row" style="gap:10px;flex-wrap:wrap;align-items:center">
      <label class="muted">Sessione<br><select id="lc-session" style="width:300px">${list.map((x) => `<option value="${esc(x.file)}" data-track="${esc(x.track ?? '')}" ${x.file === s.file ? 'selected' : ''}>${esc(x.whenLocal ?? x.when ?? '')} · ${esc(x.track ?? '')} · ${x.validLaps ?? '?'} giri</option>`).join('') || '<option value="">(nessuna)</option>'}</select></label>
      <label class="muted">Giro<br><select id="lc-lap" style="width:170px">${(() => { const vl = (s.laps ?? []).filter(l => l.durationSec > 15); const best = vl.length ? vl.reduce((b, l) => (l.durationSec < b.durationSec ? l : b), vl[0]) : null; return vl.map(l => `<option value="${l.lap}" ${best && l.lap === best.lap ? 'selected' : ''}>giro ${l.lap} — ${(l.durationSec).toFixed(1)}s</option>`).join(''); })()}</select></label>
      <label class="muted">Confronto<br><select id="lc-cmp" style="width:190px"><option value="best">miglior altro giro</option>${(() => { const vl = (s.laps ?? []).filter(l => l.durationSec > 15); const best = vl.length ? vl.reduce((b, l) => (l.durationSec < b.durationSec ? l : b), vl[0]) : null; return vl.filter(l => !best || l.lap !== best.lap).map(l => `<option value="${l.lap}">giro ${l.lap} — ${(l.durationSec).toFixed(1)}s</option>`).join(''); })()}</select></label>
      <button class="act" id="lc-go" type="button">🔄 Ridisegna</button>
    </div>
    <div id="lc-out" style="margin-top:10px"></div>
    <div class="muted" style="font-size:11px;margin-top:6px">Il confronto allinea i due giri sulla distanza percorsa: la banda in fondo dice DOVE vince o perde km/h (frenata, staccata, rettifilo…). Le bande sottili: freno (rosso) e gas (verde). Sessione, giro e confronto si ricaricano da soli.</div>
    </div>
    <div class="panel" style="margin-top:14px">
    <h2>💡 Consigli del box <span class="muted" style="font-size:12px">target ${tel.target} PSI · ${list.length} sessioni recenti</span></h2>
    ${window.mechIdentity(mechStato)}
    ${staleHtml}
    ${clHtml}
    <div class="row" style="margin-top:12px;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="act" id="b-apply-setup" type="button" style="font-size:15px;padding:10px 18px">⚡ Applica i consigli al setup</button>
      <span class="muted" style="font-size:11px">scrive «(setup) — EVO-consigliato.carsetup» a fianco del tuo file · in EVO, A GIOCO APERTO: CARICA → il gioco rilegge il disco</span>
    </div>
    <div id="apply-out" style="margin-top:10px"></div>
    <details ${cl && !cl.allGood ? 'open' : ''} style="margin-top:6px"><summary style="cursor:pointer;font-size:12px" class="muted">Da fare in EVO + consiglio pressioni completo (${telLaps} giri di telemetria)</summary>
    <div class="banner warn" style="padding:10px 12px;margin-top:8px">
      <b>📌 DA FARE IN EVO A OGNI GARA</b> — Setup → Elettronica → <b style="color:var(--warn,#ffb454)">Telemetria</b>: imposta <b style="color:var(--warn,#ffb454)">${telLaps} giri</b> per questa auto${telLaps >= 15 ? ' (è veloce: può registrare a lungo)' : telLaps <= 8 ? ' (è lenta: ogni giro genera molti dati, non serve di più)' : ''}. ⚠️ Da riattivare a ogni gara, e mentre sei GIÀ nel setup, prima di avviare la sessione.
    </div>
    ${advHtml}
    </details>
    <table style="margin-top:10px"><thead><tr><th>Quando</th><th>Sessione</th><th class="right">Fredda LF/RF</th><th class="right">Calda LF/RF</th><th class="right">Best lap</th><th class="right">L/giro</th><th class="right">Bumpstop RF</th><th class="right">Δ int/ext RF</th><th>Preset</th><th>Meteo</th></tr></thead>
    <tbody>${list.map((r) => `<tr><td class="muted">${esc(r.when ?? '')}</td><td>${esc(r.kindLabel ?? 'n/d')}</td><td class="right"><b>${psi(r.cold?.LF)}</b> / ${psi(r.cold?.RF)}</td><td class="right">${psi(r.hot?.LF)} / ${psi(r.hot?.RF)}</td><td class="right">${fmtLapS(r.bestLapSec)}</td><td class="right">${r.fuelPerLap!=null?r.fuelPerLap+' L':'—'}</td><td class="right">${r.bump?.RF?.contactPct!=null?r.bump.RF.contactPct+'%':'—'}</td><td class="right">${r.camberProxy?.RF!=null?(r.camberProxy.RF>0?'+':'')+r.camberProxy.RF+'°':'—'}</td><td class="muted">${esc(r.preset ?? '—')}</td><td class="muted">${esc(r.weather ? r.weather.replace(/^.*_/,'') : '—')}</td></tr>`).join('')}</tbody></table>
    <details style="margin-top:10px"><summary class="muted">Ultima sessione — dettaglio per giro (pressioni e temperature)</summary>
    <table><thead><tr><th>Giro</th><th class="right">Durata</th><th class="right">Benzina usata</th><th class="right">PSI LF (fine)</th><th class="right">Temp gomma LF</th><th class="right">Max bordo RF</th></tr></thead>
    <tbody>${(s.laps ?? []).filter(l=>l.durationSec>15).map(l=>`<tr><td>${l.lap}</td><td class="right">${l.durationSec}s</td><td class="right">${l.fuelUsed!=null?l.fuelUsed+' L':'—'}</td><td class="right">${l.pressures?.LF!=null?Number(l.pressures.LF).toFixed(1):'—'}</td><td class="right">${l.tair?.LF!=null?Number(l.tair.LF).toFixed(0)+'°':'—'}</td><td class="right">${l.surf?.RF?l.surf.RF.map(v=>Number(v).toFixed(0)).join('/'):'—'}°</td></tr>`).join('')}</tbody></table>
    </details>
    <div class="muted" style="margin-top:6px">Bumpstop = % di tempo con la sospensione a fine corsa (alto → assetto troppo basso o molle troppo morbide) · Δ int/ext = differenza termica interno–esterno della gomma RF (effetto camber in pista) · condizioni ultima sessione: aria ${s.airTemp ?? '—'}° · pista ${s.roadTemp ?? '—'}° · scritta da EVO in Saved Games\\ACE\\MoTec</div>
    ${logRows ? `<details style="margin-top:10px"><summary class="muted">Consigli già dati</summary><table style="margin-top:6px"><thead><tr><th>Quando</th><th>Auto</th><th>Pista</th><th class="right">Partenza consigliata</th><th>Base</th></tr></thead><tbody>${logRows}</tbody></table></details>` : ''}
    </div>`;
  })() : `<div class="panel" style="margin-top:14px"><h2>Telemetria MoTeC</h2><div class="muted">${esc(tel.hint ?? 'Nessuna sessione trovata per questa auto. Fai un giro: EVO scrive la telemetria da sola in Saved Games\\ACE\\MoTec.')}</div></div>`;
  const html = `
  <div class="panel" id="psi-panel">
    <h2>Regola dei 4 PSI <span class="h-act">pressioni target a caldo per classe auto</span></h2>
    <div class="muted" style="margin-bottom:10px">Fai 3–4 giri con la pressione di partenza scelta, poi leggi la pressione a calfo nell'HUD/MFD dei pneumatici. Inserisci i due valori: il tool calibra la partenza per arrivare sul target della classe.
    Target Kunos: ${b.classes.map(c=>`${esc(c.label)} <b>${c.target}</b>`).join(' · ')} PSI.</div>
    <form id="f-psi" class="row" style="align-items:end;flex-wrap:wrap;gap:10px">
      <label class="muted">Da freddo (PSI)<br><input type="number" id="i-cold" step="0.1" min="10" max="45" required style="width:110px"></label>
      <label class="muted">A caldo (PSI)<br><input type="number" id="i-hot" step="0.1" min="10" max="50" required style="width:110px"></label>
      <label class="muted">Classe auto<br><select id="i-target" style="width:200px">${b.classes.map(c=>`<option value="${c.target}" ${c.id==='slicks'?'selected':''}>${esc(c.label)} — ${c.target} PSI</option>`).join('')}</select></label>
      <button class="act" type="submit">Calibra</button>
    </form>
    <div id="psi-result" style="margin-top:10px"></div>
  </div>
  <div class="panel" style="margin-top:14px">
    <h2>Auto della serie — ${esc(b.trackDisplay ?? 'pista n/d')} <span class="muted" style="font-size:12px">note salvate per auto+pista</span></h2>
    <table><thead><tr><th>Auto</th><th>Classe</th><th class="right">Target caldo</th><th>Nota di setup</th></tr></thead>
    <tbody>${b.rows.map(r=>`<tr>
      <td><b>${esc(r.carName)}</b></td><td class="muted">${esc(r.classLabel)}</td><td class="right"><b>${r.target}</b> PSI</td>
      <td>${r.note ? `<span class="muted">${esc(r.note)}</span> <button class="mini" data-carnote="${esc(r.car)}">modifica</button>` : `<button class="mini" data-carnote="${esc(r.car)}">+ nota</button>`}</td>
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
      <div style="font-weight:700;font-size:14px">📜 Storia dei setup <span class="muted" style="font-weight:400;font-size:12px">ogni salvataggio · <b style="color:var(--ok,#7f7)">+</b> = alzato · <b style="color:#f66">−</b> = abbassato · <span style="color:var(--acc,#5da9ff);font-size:11px">i nomi dei file sono cliccabili</span></span></div>
      <table style="margin-top:6px"><thead><tr><th>Quando</th><th>File</th><th class="right">Pressioni (sx/dx ant · sx/dx post)</th><th class="right">Camber</th><th class="right">Alt. ant / post</th><th class="right">Ala ant / post</th><th class="right">Bias freni</th><th class="right">TC</th><th class="right">Benzina</th></tr></thead>
      <tbody>${rows.map(histRow).join('')}</tbody></table>
      <div class="muted" style="font-size:11px;margin-top:6px">🔧 = file scritto dall'applicatore del meccanico · 📄 = salvataggio tuo da EVO · i segni confrontano ogni riga col salvataggio PRECEDENTE in ordine di tempo.</div>
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
        `<div class="muted" style="font-size:12px;margin-bottom:8px">${r.consigliato ? '🔧 file scritto dall\'applicatore del meccanico' : '📄 salvataggio tuo da EVO'} · ${esc(String(r.when).replace('T',' ').slice(0,19))}</div>
        <table>${(r.pressures ?? []).map((v, i) => riga('Pressione ' + (PS[i] ?? ('gomma ' + (i + 1))), d1(v) + ' PSI')).join('')}
        ${(r.cambers ?? []).map((v, i) => riga('Camber ' + (PS[i] ?? ('gomma ' + (i + 1))), d1(v) + '°')).join('')}
        ${riga('Altezza ant / post', d1(r.heightFront) + ' / ' + d1(r.heightRear))}
        ${riga('Ala ant / post', d1(r.wingFront) + ' / ' + d1(r.wingRear))}
        ${riga('Bias freni', d1(r.bias))}
        ${riga('TC (taglio 1)', d1(r.tc1))}
        ${riga('Benzina', r.fuel != null ? d1(r.fuel) + ' L' : '—')}</table>`,
        [['Chiudi', 'act', () => {}]]);
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
    const text = prompt(`Nota di setup per ${row.carName} su ${b.trackDisplay ?? 'questa pista'}:`, row.note ?? '');
    if (text === null) return;
    await api('garage', { action: 'note', car, track: b.track, text });
    toast(text ? 'Nota salvata.' : 'Nota rimossa.', 'ok'); render();
  });

  /* ⚡ APPLICA: chiude il CICLO — telemetria → consiglio → file di setup pronto
     sul disco. In EVO A GIOCO APERTO: setup → CARICA → «… — EVO-consigliato»:
     il gioco rilegge la carta a quel momento, niente da riavvio.
     Delegazione al DOCUMENT: i pannelli diagnostici in fondo alla vista fanno
     m.innerHTML += e RI-PARSEANO tutto — un listener attaccato ai nodi muore.
     Il contesto (auto/pista/giri) si aggiorna a ogni render qui sotto. */
  window.__applySetupCtx = { car: carSel?.carName ?? tel.car ?? cur?.car ?? null, track: cur?.track ?? tel.trackDisplay ?? null, raceLaps: tel.raceLaps ?? null };
  if (!window.__applySetupDeleg) {
    window.__applySetupDeleg = true;
    const psiD = (v) => (v == null ? '—' : Number(v).toFixed(1));
    /* etichette gomme nell'ordine del file .carsetup (ant sx → ant dx → post sx → post dx:
       la lista RUOTE del decoder) — l'anteprima parlala per gomma. */    const RUOTE_LBL = ['ant sx', 'ant dx', 'post sx', 'post dx', 'extra 5', 'extra 6'];
    const bannerOk = (r, out) => {
      out.innerHTML = `<div class="banner good">
          <b>✅ File pronto:</b> ${esc(r.fileShort)}<br>
          <span class="muted" style="font-size:11.5px">${esc(r.file)}<br>base: ${esc(r.baseFile ?? '')}</span><br>
          Pressioni di partenza: <span class="muted">${(r.before?.pressures ?? []).map(psiD).join(' / ')}</span> → <b>${(r.after?.pressures ?? []).map(psiD).join(' / ')} PSI</b>
          ${(r.aero && (r.aero.before?.heightRear !== r.aero.after?.heightRear || r.aero.before?.wingRear !== r.aero.after?.wingRear)) ? `<br>Aero: altezza post ${r.aero.before?.heightRear}→${r.aero.after?.heightRear} mm · ala post ${r.aero.before?.wingRear}→${r.aero.after?.wingRear}` : ''}
          ${(r.changes ?? []).length === 0 ? '<br><span class="muted">il file caricato era GIÀ sui valori consigliati: nessuna variazione scritta</span>' : ''}
          <br><span class="muted">${esc(r.adviceText ?? '')}</span>
          <div class="banner info" style="margin-top:8px"><b>🎮 Nell'EVO, a gioco aperto:</b> setup → <b>CARICA</b> → «${esc(r.fileShort)}» → i valori si caricano nel setup corrente SUBITO, senza riavvio. Se li confermi: SALVA e restano.</div>
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
          if (!r.ok) out.innerHTML = `<div class="banner warn">${esc(r.hint ?? 'Non riesco a scrivere il file.')}</div>`;
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
        if (!p.ok) { out.innerHTML = `<div class="banner warn">${esc(p.hint ?? 'Non riesco a calcolare il consiglio.')}</div>`; }
        else {
          const righe = (p.before?.pressures ?? []).map((v, i) => {
            const dopo = (p.after?.pressures ?? [])[i] ?? v;
            const delta = Math.round(((dopo ?? 0) - (v ?? 0)) * 10) / 10;
            return `<tr><td class="muted">${esc(RUOTE_LBL[i] ?? ('gomma ' + (i + 1)))}</td><td class="right">${psiD(v)} PSI</td><td class="right"><b>${psiD(dopo)} PSI</b>${delta ? ` <span class="muted" style="font-size:10.5px">(${delta > 0 ? '+' : ''}${delta.toFixed(1)})</span>` : ''}</td></tr>`;
          }).join('');
          /* le voci OLTRE le gomme (altezza/ala): l'anteprima le elenca esattamente
             come saranno scritte nel file — niente sorprese in EVO. */
          const extra = p.extraChanges ?? [];
          const extraHtml = extra.length
            ? `<div style="margin-top:10px;font-size:12.5px"><b>Oltre le gomme:</b><div style="margin-top:4px">${extra.map((x) => `🔧 ${esc(x)}`).join('<br>')}</div></div>`
            : '';
          const cambia = extra.length > 0 || (p.before?.pressures ?? []).some((v, i) => Math.abs(((p.after?.pressures ?? [])[i] ?? v) - (v ?? 0)) >= 0.05);
          out.innerHTML = `<div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:0 0 10px;background:#0d1118">
            <b>👀 Anteprima del setup consigliato</b> <span class="muted" style="font-size:11px">· base: ${esc(p.baseName ?? '')}${p.basis ? ` · base dati: ${esc(p.basis)}` : ''}${p.startPsi != null ? ` · partenza consigliata: <b>${p.startPsi} PSI</b>` : ''}</span>
            <table style="margin-top:8px"><thead><tr><th>Gomma</th><th class="right">Adesso</th><th class="right">Consigliato</th></tr></thead><tbody>${righe}</tbody></table>
            ${extraHtml}
            ${cambia ? '' : '<div class="muted" style="font-size:12px;margin-top:6px">Il setup attuale è GIÀ sui valori consigliati: nessuna modifica necessaria.</div>'}
            ${p.adviceText ? `<div class="muted" style="font-size:11.5px;margin-top:6px">${esc(p.adviceText)}</div>` : ''}
            <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
              <button class="act" id="b-confirm-apply" type="button" data-base-file="${esc(p.baseFile ?? '')}">✅ CONFERMA: crea «${esc((p.baseName ?? '') + ' — EVO-consigliato.carsetup')}»</button>
              <button class="act" id="b-cancel-apply" type="button" style="background:#3a2433">Annulla</button>
            </div>
          </div>`;
          const cancel = document.querySelector('#b-cancel-apply');
          if (cancel) cancel.addEventListener('click', () => { out.innerHTML = ''; });
        }
      } catch (e) { out.innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; }
      const live = document.querySelector('#b-apply-setup');
      if (live) { live.disabled = false; live.textContent = '⚡ Applica i consigli al setup'; }
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
    out.innerHTML = '<div class="muted" style="font-size:11px">campiono il file .ld…</div>';
    try {
      const t = await api('garage', { action: 'laptrace', car: window.__lcCar ?? null, file: sessSel ? sessSel.value : null, lap, compare, points: 300 });
      if (t.ok) {
        // sessione cambiata: i giri e il confronto si ricoegono con i VALORI della nuova sessione
        if (sessSel && Array.isArray(t.sessions)) {
          const old = sessSel.value;
          sessSel.innerHTML = (t.sessions ?? []).map((x) => `<option value="${esc(x.file)}" ${x.file === old ? 'selected' : ''}>${esc(x.when)} · ${esc(x.track ?? '')} · ${x.validLaps ?? '?'} giri</option>`).join('');
        }
        const vl = t.laps ?? [];
        lapSel.innerHTML = vl.map((l) => `<option value="${l.lap}" ${l.lap === t.lap ? 'selected' : ''}>giro ${l.lap} — ${l.durationSec.toFixed(1)}s</option>`).join('');
        if (cmpSel) cmpSel.innerHTML = `<option value="best">miglior altro giro</option>` + vl.filter((l) => l.lap !== t.lap).map((l) => `<option value="${l.lap}">giro ${l.lap} — ${l.durationSec.toFixed(1)}s</option>`).join('');
      }
      if (!t.ok) { out.innerHTML = `<div class="banner info">${esc(t.hint ?? 'Nessun dato')}</div>`; return; }
      const d = t.compare;
      out.innerHTML = lapChartSvg(t) + `<div class="muted" style="font-size:11px;margin-top:4px">${d ? `Differenza media col giro ${d.lap}: <b style="color:${d.dvAvg >= 0 ? 'var(--ok,#7f7)' : '#f66'}">${d.dvAvg >= 0 ? '+' : ''}${d.dvAvg.toFixed(1)} km/h</b> a favore del giro ${t.lap} · picco ${d.dvMax >= 0 ? '+' : ''}${d.dvMax.toFixed(1)} / minimo ${d.dvMin.toFixed(1)} km/h · distanza giro ${t.distanceKm} km · tempo: ${d.timeDelta >= 0 ? '+' : ''}${d.timeDelta.toFixed(1)}s rispetto al giro ${d.lap}.` : 'senza confronto'}</div>`;
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
      const tag = { aero: '🪶 aerodinamica', trasmissione: '⚙️ cambio', assetto: '🧱 assetto/altezza', camber: '📐 camber', freni: '🛑 freni', pressioni: '🛞 pressioni', telemetria: '📡 telemetria', memoria: '🧠 memoria' };
      const rows = (m.consigli ?? []).map((c, i) => `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:0 0 130px;font-size:11.5px;color:var(--dim)">${tag[c.vedi] ?? c.vedi}</span><span style="font-size:12.5px;line-height:1.5">${c.text}</span></div>`).join('');
      /* STORIA DELL'ALLIEVO: i round di consigli chiusi con l'esito (delta del
         giro migliore) e il setup migliore — Mauro 21/10 voleva vederla subito. */
      let storiaHtml = '';
      const a = m.allievo ?? null;
      if (a && (a.rounds?.length || a.best)) {
        const fmtT = (iso) => iso ? esc(String(iso).replace('T', ' ').slice(0, 16).replace(/:\d\d$/, '')) : '—';
        const fmtL = (v) => (v > 0 && v != null) ? `${Math.floor(v / 60)}:${(v % 60).toFixed(2).padStart(5, '0')}` : '—';
        const chip = (d) => d == null
          ? '<span class="tag" style="font-size:10px;padding:1px 8px;background:#26303d;color:#9fb3cc">in attesa di una sessione nuova</span>'
          : (d < -0.05
            ? `<span class="tag green" style="font-size:10px;padding:1px 8px">guadagnati ${(-d).toFixed(2)} s</span>`
            : (d > 0.15
              ? `<span class="tag" style="font-size:10px;padding:1px 8px;background:#3a1d1d;color:#ff9b9b">persi +${d.toFixed(2)} s</span>`
              : `<span class="tag" style="font-size:10px;padding:1px 8px;background:#26303d;color:#cdd9e8">neutro (${d >= 0 ? '+' : ''}${d.toFixed(2)} s)</span>`));
        const righe = (a.rounds ?? []).map((r) => `<tr>
          <td class="muted" style="white-space:nowrap">${fmtT(r.at)}</td>
          <td style="white-space:nowrap"><span class="muted" style="font-size:11.5px">${fmtL(r.bestBefore)} → ${fmtL(r.bestAfter)}</span></td>
          <td>${chip(r.delta)}</td>
          <td style="font-size:11.5px;color:var(--dim)">${(r.campi ?? []).map((c) => esc(tag[c] ?? c)).join(' · ') || '—'}</td>
        </tr>`).join('');
        storiaHtml = `<details style="margin-top:10px" ${a.rounds?.length ? '' : 'open'}><summary style="cursor:pointer;font-size:12.5px"><b>🧠 Storia dell'allievo</b> <span class="muted" style="font-size:11px">— ${(a.rounds ?? []).length} round di consigli${a.best ? ` · migliore registrato: <b>${fmtL(a.best.lap)}</b> (${fmtT(a.best.at)})` : ''}</span></summary>
          ${(a.rounds ?? []).length ? `<table style="margin-top:8px"><thead><tr><th>Quando</th><th>Giro su questa pista</th><th>Esito del round</th><th>Leve promosse</th></tr></thead><tbody>${righe}</tbody></table>` : '<div class="muted" style="font-size:12px;margin-top:6px">Nessun round chiuso: corri una sessione nuova dopo aver generato consigli e l\'esito entra qui.</div>'}
        </details>`;
      }
      out.innerHTML = `<div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:0 0 10px;background:#0d1118">
        <div style="font-size:12px;margin-bottom:6px"><b>🔧 Il meccanico</b> — setup consigliato per <b>${esc(m.track ?? '')}</b> <span class="muted" style="font-size:11px">· tracciato ${esc(m.tipo ?? '?')}${m.densita ? ` · ${m.densita} curve/km` : ''}${m.sessFile ? ' · correzione su telemetria veri' : ' · senza telemetria (solo pista)'}</span></div>
        ${rows || '<div class="muted" style="font-size:12px">Nessun consiglio per questa pista: anagrafica non disponibile.</div>'}
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
      <table style="margin-top:6px"><thead><tr><th>Quando</th><th>Pista</th><th class="right">Dimensione</th><th>Stato</th><th class="right">Canali con dati</th></tr></thead><tbody>${files}</tbody></table>
    </details>`;
  }).join('');
  const anyEmpty = (diag.cars ?? []).some((c) => (c.files ?? []).some((f) => !f.valid));
  const diagHtml = (diag.cars ?? []).length ? `<div class="panel" style="margin-top:14px" id="telem-diag">
    <h2>Diagnostica telemetria <span class="h-act">i file .ld che EVO scrive in Saved Games\\ACE\\MoTec</span></h2>
    ${anyEmpty ? `<div class="banner warn" style="margin-bottom:8px">Ci sono file <b>vuoti</b> (solo intestazione, 0 canali con dati): la <b>telemetria non era attiva</b> in EVO — si attiva in Setup → Elettronica (e i giri si impostano PRIMA di avviare la sessione). Riusa la sessione e i file conterranno dati veri. Finché così non fosse, i consigli del BOX su quelle auto usano la stima.</div>` : `<div class="banner good" style="margin-bottom:8px">Tutti gli ultimi file hanno dati: la telemetria sta funzionando.</div>`}
    ${diagRows}
    <div class="muted" style="margin-top:8px">Un file valido pesa 2–11 MB e ha 62 canali con dati; uno vuoto pesa ~19 KB (solo intestazione). Aggiorna la pagina per risentonare dopo una sessione.</div>
  </div>` : `<div class="panel" style="margin-top:14px"><h2>Diagnostica telemetria</h2><div class="muted">Nessun file MoTeC trovato in ${esc(diag.root ?? 'Saved Games\\ACE\\MoTec')}: fai una sessione e EVO scriverà il primo file.</div></div>`;
  m.innerHTML += diagHtml;

  // salute sistema + registro errori: diagnostica degli strumenti, non della carriera
  const [health, warns] = await Promise.all([
    api('system-health').catch(() => null),
    api('warnings').catch(() => ({ total: 0, modules: [] })),
  ]);
  let healthHtml = `<div class="panel" style="margin-top:14px" id="system-health"><h2>Salute sistema <span class="h-act">lettore live e telemetria</span></h2>`;
  if (health) {
    const rd = health.reader ?? {};
    const liveRow = (label, ok, note) => `<div style="padding:3px 0;border-bottom:1px solid var(--line,#222)"><b>${label}:</b> ${ok ? '<span class="tag green" style="font-size:10px;padding:1px 6px">ok</span>' : '<span class="tag" style="font-size:10px;padding:1px 6px;background:#3a1d1d;color:#ff9b9b">no</span>'}${note ? ` <span class="muted" style="font-size:11px">${note}</span>` : ''}</div>`;
    healthHtml += liveRow('Processo PowerShell', rd.running, rd.ps1Exists ? (rd.alive ? 'vivo e aggiorna' : (rd.running ? 'avviato ma silenzioso' : 'non ancora partito (si avvia al primo accesso al LIVE)')) : 'script tools/acevo-live.ps1 mancante');
    healthHtml += liveRow('Gioco in sessione', health.game, health.gameVersion ? `versione gioco ${esc(health.gameVersion)}` : '');
    if (health.smVersion) healthHtml += `<div style="padding:3px 0"><b>Shared memory:</b> <span class="muted" style="font-size:11px">interfaccia ${esc(health.smVersion)}${health.gameVersion ? ' · gioco ' + esc(health.gameVersion) : ''}${rd.restarts ? ` · ${rd.restarts} ricicli del lettore` : ''}</span></div>`;
    if (health.stderrTail) healthHtml += `<div class="muted" style="font-size:11px;margin-top:4px">PowerShell stderr: ${esc(health.stderrTail)}</div>`;
    const ld = health.telem?.lastLd;
    if (ld) {
      healthHtml += `<div style="padding:3px 0;border-bottom:1px solid var(--line,#222)"><b>Ultimo file .ld:</b> ${ld.valid ? '<span class="tag green" style="font-size:10px;padding:1px 6px">dati ok</span>' : '<span class="tag" style="font-size:10px;padding:1px 6px;background:#3a1d1d;color:#ff9b9b">VUOTO</span>'} <span class="muted" style="font-size:11px">${esc(ld.car)} · ${esc(ld.file)} · ${Math.round(ld.size/1024)} KB · ${esc(ld.when)} · ${ld.withData}/${ld.channels} canali</span></div>`;
      if (!ld.valid) healthHtml += `<div class="banner warn" style="margin-top:6px">L'ultimo file scritto da EVO è vuoto (solo intestazione): la <b>telemetria non era attiva</b> in EVO (Setup → Elettronica, da impostare PRIMA di avviare la sessione). Finché non scrive dati veri, i consigli del BOX usano la stima.</div>`;
    } else {
      healthHtml += `<div class="muted" style="font-size:11px">Nessun file .ld trovato in ${(health.telem?.dirsChecked ?? []).map((d) => esc(d)).join(', ')}.</div>`;
    }
  } else {
    healthHtml += '<div class="muted">Endpoint system-health non disponibile: riavvia il server del tool.</div>';
  }
  healthHtml += '</div>';

  let warnsHtml = `<div class="panel" style="margin-top:14px" id="warnings-panel"><h2>Registro errori <span class="h-act">ultimi problemi degli strumenti (data/errors.jsonl)</span></h2>`;
  const mods = warns.modules ?? [];
  if (!mods.length) {
    warnsHtml += '<div class="banner good">Nessun errore registrato: gli strumenti lavorano puliti.</div>';
  } else {
    warnsHtml += mods.map((md) => `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:12.5px"><b>${esc(md.module)}</b> <span class="tag" style="font-size:10px;padding:1px 6px;background:#3a2a1d;color:#ffc78a">${md.count}</span> <span class="muted" style="font-size:11px">ultimo: ${esc(String(md.last[0]?.at ?? '').slice(0,19).replace('T',' '))}</span></summary><div style="margin-top:4px">${md.last.map((w) => `<div style="padding:2px 0;border-bottom:1px solid var(--line,#222);font-size:12px"><span class="muted">${esc(String(w.at).slice(11,19))}</span> ${esc(w.message)}${w.extra?` <span class="muted">(${esc(w.extra)})</span>`:''}</div>`).join('')}</div></details>`).join('');
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
