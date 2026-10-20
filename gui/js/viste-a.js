/* -------- onboarding -------- */
function drawOnboarding(m){
  $('#idblock').classList.add('hidden');
  $('#hstats').classList.add('hidden');
  const s = boot.setup;
  m.innerHTML = `
  <div class="hero">
    <div class="kicker">Assetto Corsa EVO · gestionale carriera</div>
    <div class="big">Costruisci la tua carriera<br>dal basso fino alla Formula Apex</div>
    <div class="lead">29 serie · 6 discipline · contratti, rivali e difficoltà adattiva.</div>
    <div class="setup-facts">
      <span class="chip">${s.content.cars} auto viste</span>
      <span class="chip">${s.content.tracks} piste viste</span>
      <span class="chip">${s.ladder.nodes} serie</span>
      ${s.gameExe ? '<span class="chip green">gioco trovato</span>' : '<span class="chip red">gioco non trovato</span>'}
    </div>
    <form id="f-new">
      <div class="field"><label>Nome pilota — uguale a come corri in EVO</label><input type="text" id="i-name" placeholder="es. Mauro Turbigno" required></div>
      <div class="grid2">
        <div class="field"><label>Nazione</label><input type="text" id="i-nation" value="ITA" maxlength="3"></div>
        <div class="field"><label>Disciplina iniziale</label>
          <select id="i-disc">
            <option value="">consigliata (touring)</option>
            ${['gt','touring','formula','endurance','historic','drift'].map(d=>`<option value="${d}">${d}</option>`).join('')}
          </select></div>
      </div>
      <label class="muted" style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" id="i-force"> ricomincia da zero (sovrascrive la carriera esistente)</label>
      <button class="act" type="submit" style="width:100%">Inizia la carriera</button>
    </form>
  </div>`;
  $('#f-new').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('new-career', { name: $('#i-name').value.trim(), nation: $('#i-nation').value.trim().toUpperCase() || 'ITA', discipline: $('#i-disc').value || null, force: $('#i-force').checked });
      await refreshBoot(); tab='dashboard'; drawNav(); render();
      toast('Carriera creata: benvenuto nel paddock.', 'ok');
    } catch(err){ toast(err.message, 'err'); }
  };
}

/* -------- cruscotto -------- */
async function drawDashboard(m){
  const [st, card] = await Promise.all([api('status'), api('card')]);
  const h = st.header, d = st.difficulty, node = h.node;
  const res = st.results;
  const races = res.length;
  const wins = res.filter(r=>!r.dnf && r.position===1).length;
  const podiums = res.filter(r=>!r.dnf && r.position<=3).length;
  const pts = res.reduce((a,r)=>a+r.points,0);
  const fls = res.filter(r=>r.fl).length;
  const prize = res.reduce((a,r)=>a+(r.prize||0),0);
  const played = res.length;
  const total = card.totalRounds ?? h.rounds;
  const maxPts = Math.max(1, ...res.map(r=>r.points));

  m.innerHTML = `
  <div class="grid2">
    <div>
      <div class="panel hero">
        <svg class="flagart" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 2h1.6v20H4z"/><path d="M5.6 3h12.8l-3 4.5 3 4.5H5.6z"/></svg>
        <h2>${LI.flag} ${esc(node.display)} · stagione ${h.season}</h2>
        <div class="seasonprog">
          <div class="sp-bar"><i style="width:${total ? Math.min(100, Math.round(played/total*100)) : 0}%"></i></div>
          <div class="sp-meta"><span>${card.seasonDone ? 'calendario completato' : `prossima gara: <b style="color:var(--text)">${esc(card.roundName)}</b>`}</span><span>${played}/${total} gare disputate</span></div>
        </div>
        <div class="grid3">
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.gauge}</span><div class="l">Classifica</div></div><div class="v acc">P${h.position ?? '–'}<small>/${h.gridSize}</small></div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.bolt}</span><div class="l">Punti</div></div><div class="v acc2">${pts}</div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.trophy}</span><div class="l">Vittorie</div></div><div class="v">${wins}</div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.medal}</span><div class="l">Podi</div></div><div class="v">${podiums}</div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.euro}</span><div class="l">Premi stagione</div></div><div class="v good">${money(prize)}<small> €</small></div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.stopwatch}</span><div class="l">Giri veloci</div></div><div class="v">${fls}</div></div>
        </div>
        ${races ? `<div class="formchips"><span class="muted">forma:</span>${res.slice(-5).reverse().map(r=>`<span class="chip ${r.dnf?'red':r.position===1?'gold':r.position<=3?'green':''}">${r.dnf?'rit.':`P${r.position}`}</span>`).join('')}</div>` : ''}
        ${races ? `<div class="barchart">${res.map(r=>`<div class="bar ${r.points?'':'zero'}" style="height:${Math.max(6, r.points/maxPts*100)}%" data-tip="R${r.round} · ${r.dnf?'ritiro':'P'+r.position} · ${r.points} pt" title="R${r.round} · ${esc(r.track ?? '')} — ${r.dnf?'ritiro':'P'+r.position} · ${r.points} pt"></div>`).join('')}</div>` : ''}
        <div class="muted" style="margin-top:12px">${esc(node.discipline)} · livello ${node.level} (${node.tier}) · ${esc(node.access==='closed'?'parco chiuso':'serie aperta')} · iscrizione ${money(st.econ.entry)} € · premio ${money(st.econ.prize)} € · ${fls} giro veloce</div>
        ${races ? `<table style="margin-top:12px"><thead><tr><th>Gare della stagione</th><th class="right">Pos</th><th class="right">Punti</th><th class="right">Premio</th></tr></thead>
          <tbody>${res.map(r=>`<tr${r.dnf?' style="color:var(--bad)"':''}><td>R${r.round} · ${esc(r.track)}${r.fl?' <span class="tag gold">giro veloce</span>':''}</td><td class="right">${r.dnf?'ritiro':'P'+r.position}</td><td class="right">${r.points}</td><td class="right">${money(r.prize)} €</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty" style="margin-top:10px">Nessuna gara disputata in questa serie.</div>'}
      </div>
      <div class="panel">
        <h2>${LI.chat} Messaggi recenti</h2>
        ${st.messages.length ? st.messages.slice(0,6).map(msgRow).join('') : '<div class="empty">Tutto quieto nel paddock.</div>'}
        ${h.offers.length ? `<div class="banner info" style="margin-top:10px">Ci sono <b>${h.offers.length} offerte</b> sul tavolo: sezione Messaggi per firmare.</div>` : ''}
      </div>
      <div class="panel" id="p-life"><h2>Vita fuori pista</h2><div class="empty">…</div></div>
      <div class="panel" id="p-heritage"><h2>📜 Eredità di famiglia</h2><div class="empty">…</div></div>
      <div class="panel" id="p-events"><h2>Eventi speciali</h2><div class="empty">…</div></div>
      <div class="panel">
        <h2>${LI.gauge} Strumenti rapidi</h2>
        <div class="grid2">
          <button class="qtile" id="b-review">${LI.book}<span><b>Rassegna di fine stagione</b><small>il bilancio completo dell'anno</small></span></button>
          <button class="qtile" id="b-integrity-quick">${LI.shield}<span><b>Verifica integrità</b><small>controllo di coerenza della carriera</small></span></button>
        </div>
      </div>
    </div>
    <div class="racecard panel" id="card-panel"></div>
  </div>`;
  drawCardInto($('#card-panel'), card);
  drawLifePanel();
  drawHeritagePanel();
  drawEventsPanel();
  $('#b-review').onclick = () => showReview();
  $('#b-integrity-quick').onclick = async () => {
    try {
      const r = await api('integrity');
      if (!r.issues.length) return toast('Carriera sotto controllo: tutto torna.', 'ok');
      modal('Verifica integrità', `<div class="banner warn"><b>${r.issues.length} anomalie:</b><ul style="margin:6px 0 0 18px">${r.issues.map(i=>`<li>${esc(i.text)}</li>`).join('')}</ul></div>`, [['Chiudi','ghost',()=>{}]]);
    } catch(e){ toast(e.message,'err'); }
  };
}

async function showReview(){
  try {
    const integ = await api('integrity');
    const seasons = integ.seasons ?? [];
    if (!seasons.length) return toast('Ancora nessuna gara disputata.', 'warn');
    const r = await api('season-review', { season: seasons[0] });
    const draw = (rev) => {
      modal(`Stagione ${rev.season} — ${rev.node}`, `
        <div style="max-height:60vh;overflow:auto">
          ${rev.champion?'<div class="banner good" style="margin-bottom:10px">🏆 CAMPIONE!</div>':''}
          <div class="muted" style="margin-bottom:10px">${rev.stats.races} gare · ${rev.stats.wins} vittorie · ${rev.stats.podiums} podi · ${rev.stats.poles} pole · ${rev.stats.fls} giri veloci · ${rev.stats.points} punti · ${money(rev.stats.prize)} € di premi</div>
          <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.55">${esc(rev.text)}</pre>
        </div>`,
        [ ...seasons.filter(s=>s!==rev.season).slice(0,2).map(s=>[`Stagione ${s}`,'ghost',()=>{ api('season-review',{season:s}).then(draw).catch(e=>toast(e.message,'err')); }]),
          ['Salva su file','ghost',async()=>{ try{ const r=await api('review-export',{season:rev.season}); toast('Rassegna salvata in '+r.file,'ok'); }catch(e){ toast(e.message,'err'); } }],
          ['Copia testo','ghost',async()=>{ try{ await navigator.clipboard.writeText(rev.text); toast('Rassegna copiata.','ok'); }catch{ toast('Appunti negati.','err'); } }],
          ['Chiudi','ghost',()=>{}]]);
    };
    draw(r);
  } catch(e){ toast(e.message, 'err'); }
}

/* -------- vita fuori pista: contratto, sponsor, sfida, voci -------- */
async function drawLifePanel(){
  const el = $('#p-life'); if (!el) return;
  try {
    const v = await api('life');
    const rows = [];
    if (v.contract) rows.push(`<div class="liferow"><span class="lico">${LI.scroll}</span><div class="lt"><b>Contratto ${esc(v.contract.display)}</b> <span class="muted">· premio ${money(v.contract.payout)} € a fine stagione</span>
      ${v.contract.rows.map(c=>`<div style="font-size:12.5px;margin-top:3px">${c.decided===false?'<span style="color:var(--bad)">✗</span>':c.ok?'<span style="color:var(--good)">✓</span>':'•'} ${esc(c.text)} — <span class="muted">${esc(c.progress)}</span></div>`).join('')}</div></div>`);
    if (v.duel) rows.push(`<div class="liferow"><span class="lico red">${LI.swords}</span><div class="lt"><b>Duello della stagione</b><div style="font-size:12.5px">tu <b>${v.duel.myPoints} pt</b> vs ${esc(v.duel.name)} <b>${v.duel.hisPoints} pt</b></div></div></div>`);
    if (v.sponsorActive) rows.push(`<div class="liferow"><span class="lico green">${LI.handshake}</span><div class="lt"><b>${esc(v.sponsorActive.name)}</b><div style="font-size:12.5px">${money(v.sponsorActive.perRace)} € a gara${v.sponsorActive.missionDone?' · missione completata ✓':` · missione: podio entro R${v.sponsorActive.deadlineRound+1} (+${money(v.sponsorActive.bonus)} €)`}</div></div></div>`);
    else if (v.sponsor?.length) rows.push(`<div class="liferow"><span class="lico green">${LI.handshake}</span><div class="lt"><b>Proposta: ${esc(v.sponsor[v.sponsor.length-1].name)}</b><div style="font-size:12.5px">${esc(v.sponsor[v.sponsor.length-1].note)} <button class="mini" id="b-sponsor-sign">firma</button> <button class="mini" id="b-sponsor-no">rifiuta</button></div></div></div>`);
    const voci = [
      ...(v.pulse?.hot ?? []).map(n=>`<b>${esc(n)}</b> è in forma`),
      ...(v.pulse?.cold ?? []).map(n=>`${esc(n)} è in declino`),
      v.pulse?.rookie ? `l'esordiente <b>${esc(v.pulse.rookie)}</b> ha debuttato nel campionato` : '',
    ].filter(Boolean);
    if (voci.length) rows.push(`<div class="liferow"><span class="lico blue">${LI.chat}</span><div class="lt"><b>Voci dal paddock</b><div style="font-size:12.5px">${voci.join(' · ')}</div></div></div>`);
    el.innerHTML = `<h2>${LI.compass} Vita fuori pista</h2>
      ${rows.join('') || '<div class="empty">Il contratto arriva quando firmi il sedile.</div>'}
      ${v.challenge && !v.challenge.verdict ? `<div class="banner ${v.challenge.accepted?'info':'warn'}" style="margin-top:6px">${LI.target} <b>Sfida della ronda</b> — ${esc(v.challenge.text)}<br><span class="muted">premio ${money(v.challenge.reward)} € · penale −${v.challenge.penalty} rep${v.challenge.accepted?' · accettata':''}</span>${v.challenge.accepted?'':' <button class="mini" id="b-chal-acc" style="margin-top:6px">accetta</button>'}</div>` : ''}`;
    $('#b-sponsor-sign')?.addEventListener('click', async ()=>{ try{ await api('sponsor-accept',{tier:999}); toast('Sponsor firmato.','ok'); drawLifePanel(); }catch(e){toast(e.message,'err')} });
    $('#b-sponsor-no')?.addEventListener('click', async ()=>{ try{ await api('sponsor-decline',{}); toast('Proposta rifiutata.','ok'); drawLifePanel(); }catch(e){toast(e.message,'err')} });
    $('#b-chal-acc')?.addEventListener('click', async ()=>{ try{ await api('challenge-accept',{}); toast('Sfida accettata: in bocca al lupo.','ok'); drawLifePanel(); }catch(e){toast(e.message,'err')} });
  } catch { el.innerHTML = '<h2>Vita fuori pista</h2><div class="empty">Non disponibile.</div>'; }
}

/* -------- eredità di famiglia (memorie stile Zero to Apex) -------- */
async function drawHeritagePanel(){
  const el = $('#p-heritage'); if (!el) return;
  try {
    const v = await api('heritage');
    if (!v.active && !v.completedCount){
      el.innerHTML = `<h2>📜 Eredità di famiglia</h2><div class="empty">Vinci il tuo primo titolo: la famiglia ti affiderà un'impresa d'altri tempi da rifare, con la sua auto e la sua eredità.</div>`;
      return;
    }
    let html = `<h2>📜 Eredità di famiglia <span class="h-act">${v.rank} · ${v.completedCount}/${v.totalChapters} capitoli</span></h2>`;
    if (v.active){
      const a = v.active;
      html += `<div class="liferow"><span class="lico">📜</span><div class="lt"><b>${esc(a.title)}</b> — ${esc(a.ancestor)}, tuo ${esc(a.relation)} (${esc(a.era)})
        <div style="font-size:12.5px;margin-top:3px">${esc(a.series)} · auto: <b>${esc(a.carName ?? 'n/d')}</b>${a.seat?` #${a.seat}`:''} · obiettivo: <b>${esc(a.objective.text)}</b></div>
        <div style="font-size:12.5px">Prove: ${a.rounds.map((t)=>{const pr=(a.progress??[]).find(p=>p.track===t); return `<span class="tag ${pr?.ok ? 'green':''}" style="font-size:10px;padding:1px 6px" title="${esc(pr?.detail ?? 'da correre')}">${esc(t)}</span>`;}).join(' ')}</div>
        <div style="font-size:12px;margin-top:4px" class="muted">Leggende in griglia: ${esc(a.legends.join(' · '))}</div>
        ${a.done ? `<div class="banner good" style="margin-top:8px">🏁 Impresa rifatta! L'eredità di <b>${money(a.inherit)} €</b> è pronta. <button class="mini" id="b-her-claim" style="margin-top:4px">Incassa l'eredità</button></div>` : `<div class="muted" style="font-size:12px;margin-top:5px">Vali in palio: ${money(a.inherit)} € (dopo: ${money(a.repeat)} € a ripetizione) · relic: ${esc(a.relic)}</div>`}
      </div></div>`;
    }
    if (v.completed.length){
      html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${v.completed.map(c=>`<span class="tag gold" style="font-size:11px;padding:3px 9px" title="${esc(c.ancestor)} · ${esc(c.era)} · ${esc(c.series)} · +${money(c.inherit)} €">${esc(c.crest)} ${esc(c.title)}</span>`).join('')}</div>`;
    }
    if (v.allDone) html += `<div class="banner good" style="margin-top:8px">Saga completa: la famiglia è entrata nella leggenda. 🏛️</div>`;
    el.innerHTML = html;
    $('#b-her-claim')?.addEventListener('click', async ()=>{
      try { const r = await api('heritage-claim',{}); toast(`Eredità incassata: +${money(r.claimed)} € — ${r.completed}`,'ok'); refreshBoot().then(render); }
      catch(e){ toast(e.message,'err'); }
    });
  } catch { el.innerHTML = '<h2>📜 Eredità di famiglia</h2><div class="empty">Non disponibile.</div>'; }
}

/* -------- eventi speciali: inviti, scheda gara, vetrina -------- */
async function drawEventsPanel(){
  const el = $('#p-events'); if (!el) return;
  try {
    const v = await api('events');
    if (!v.active && !(v.showCase ?? []).length && !(v.history ?? []).length){
      el.innerHTML = `<h2>Eventi speciali</h2><div class="empty">Nessun invito per ora: gli organizzatori ti cercano quando il paddock comincia a conoscerti.</div>`;
      return;
    }
    let html = '<h2>Eventi speciali</h2>';
    if (v.active){
      const a = v.active, c = v.card;
      const pending = !a.acceptedAt;
      html += `<div class="banner ${pending ? 'info' : 'good'}" style="margin-bottom:8px">
        <b>⭐ ${esc(a.theme.name)}</b> <span class="tag" style="font-size:10px;padding:1px 6px">${a.tier === 'finale' ? 'FINALE DI STAGIONE' : 'invito speciale'}</span><br>
        <span class="muted" style="font-size:12.5px">${esc(a.theme.intro)}</span><br>
        <span style="font-size:12.5px;margin-top:4px;display:inline-block">🏁 ${esc(a.trackDisplay)} · ${a.laps} giri · ${a.guests.join(' · ')} · premio: <b>${a.prize.duplicateCash ? money(a.prize.money) + ' €' : esc(a.prize.carName) + ' + ' + money(a.prize.money) + ' €'}</b>${a.prize.rep ? ` · +${a.prize.rep} rep` : ''}${a.tier !== 'finale' && !a.acceptedAt ? ` · <span class="muted">scade dopo ${a.deadlineRounds} gare di campionato</span>` : ''}</span>
      </div>`;
      if (pending){
        html += `<div class="row"><button class="act" id="b-ev-acc">Accetto l'invito</button><button class="ghost" id="b-ev-dec">Rifiuta</button></div>`;
      } else {
        html += `<details open style="margin:6px 0"><summary style="cursor:pointer;font-size:12.5px"><b>📋 Scheda da impostare in EVO</b> <span class="muted" style="font-size:11px">— spuntala come la gara di campionato</span></summary>
          <table style="margin-top:6px"><tbody>${c.settings.map((s,i)=>`<tr><td style="width:130px" class="muted">${esc(s[0])}</td><td>${esc(s[1])}</td></tr>`).join('')}</tbody></table>
          <div class="muted" style="margin-top:6px;font-size:12px">Difficoltà AI consigliata per la tua serie: ${'→'} usa gli slider della scheda gara normale. Se ti serve, guarda il pannello Prossima gara.</div>
        </details>
        <div class="row" style="margin-top:8px;flex-wrap:wrap;align-items:end">
          <label class="muted">Posizione d'arrivo<br><input type="number" id="i-ev-pos" min="1" max="30" value="1" style="width:80px"></label>
          <label class="muted">Miglior giro (secondi, opzionale)<br><input type="number" id="i-ev-lap" step="0.1" min="20" max="1200" style="width:100px" placeholder="es. 102.4"></label>
          <button class="act" id="b-ev-fin">Registra il risultato</button>
          <button class="ghost" id="b-ev-aban">Ripensamento</button>
        </div>`;
      }
    }
    if ((v.showCase ?? []).length){
      html += `<h3 style="margin-top:10px">🏆 La tua vetrina</h3><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">${v.showCase.map(c=>`<span class="tag good" style="font-size:11.5px;padding:4px 10px">${esc(c.carName)} <span class="muted">· ${esc(c.theme)} · S${c.season}</span></span>`).join('')}</div>`;
    }
    if ((v.history ?? []).length){
      html += `<details style="margin-top:10px"><summary class="muted" style="cursor:pointer;font-size:12px">Storia eventi (${v.history.length})</summary><table style="margin-top:6px"><thead><tr><th>Quando</th><th>Evento</th><th>Esito</th></tr></thead><tbody>${v.history.map(h2=>`<tr><td class="muted">${esc(String(h2.finishedAt ?? h2.declinedAt ?? h2.createdAt ?? '').slice(0,10))}</td><td>${esc(h2.theme?.name ?? '')}</td><td>${h2.outcome==='won'?'<span class="tag good">vinto</span>':h2.outcome==='declined'?'<span class="muted">rifiutato</span>':h2.outcome==='expired'?'<span class="muted">scaduto</span>':`P${h2.position ?? '—'}`}</td></tr>`).join('')}</tbody></table></details>`;
    }
    el.innerHTML = html;
    $('#b-ev-acc')?.addEventListener('click', async ()=>{ try{ await api('event-accept',{eventId:v.active.id}); toast('Invito accettato: la scheda è pronta.','ok'); refreshBoot().then(render); }catch(e){toast(e.message,'err')} });
    $('#b-ev-dec')?.addEventListener('click', async ()=>{ try{ await api('event-decline',{eventId:v.active.id}); toast('Invito rifiutato.','ok'); refreshBoot().then(render); }catch(e){toast(e.message,'err')} });
    $('#b-ev-fin')?.addEventListener('click', async ()=>{
      try{
        const pos = Number($('#i-ev-pos').value);
        if (!Number.isFinite(pos) || pos < 1) return toast('Inserisci la posizione d\'arrivo.','err');
        const lapRaw = $('#i-ev-lap')?.value;
        const lap = lapRaw ? Number(lapRaw) : null;
        const r = await api('event-finish',{position:pos, bestLapSec:lap});
        const res = r.result;
        if (res.won && res.showcaseEntry) toast('🏆 ' + res.showcaseEntry.carName + ' è tua! Entra in vetrina.','ok');
        else if (res.money > 0) toast('Evento chiuso P' + res.position + ': +' + money(res.money) + ' €','ok');
        else toast('Evento chiuso P' + res.position + '.','warn');
        refreshBoot().then(render);
      }catch(e){toast(e.message,'err')}
    });
    $('#b-ev-aban')?.addEventListener('click', async ()=>{ try{ await api('event-abandon',{}); toast('Invito liberato: puoi decidere ancora.','ok'); refreshBoot().then(render); }catch(e){toast(e.message,'err')} });
  } catch { el.innerHTML = '<h2>Eventi speciali</h2><div class="empty">Non disponibile.</div>'; }
}

function msgRow(m){
  return `<div class="msg ${esc(m.kind||'')}"><span class="d">${esc((m.at||'').slice(0,10))}</span><span class="t">${esc(m.text)}</span></div>`;
}

function drawCardInto(el, card){
  if (card.seasonDone){
    el.innerHTML = `<h2>${LI.medal} Stagione completata</h2>
      <div class="muted">Hai chiuso il calendario di ${esc(card.nodeDisplay)}: arriva il momento del bilancio e delle offerte.</div>
      <div class="row" style="margin-top:16px"><button class="act" id="b-season-end">Chiudi la stagione</button></div>`;
    $('#b-season-end', el).onclick = () => seasonEndFlow(false);
    return;
  }
  const key = 'evo-ckl:' + card.nodeDisplay + ':' + (card.roundIndex+1);
  let checked = [];
  try { checked = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  const isDone = (i) => checked.includes(i);
  const doneCount = card.settings.filter((_,i)=>isDone(i)).length;    el.innerHTML = `<h2>${LI.flag} Prossima gara <span class="h-act">R${card.roundIndex+1} di ${card.totalRounds}${card.agendaDayLabel ? ` · ${esc(card.agendaDayLabel)}` : ''}</span></h2>

    <div class="title">${CFLAG} ${esc(card.roundName)}</div>
    <div class="sub">${esc(card.nodeDisplay)} · iscrizione ${money(card.entryFee)} € · si paga una volta per round${card.agendaDay ? (card.agendaDay <= (boot.header?.day ?? 0) ? '' : ' · in calendario per il ' + esc(card.agendaDayLabel ?? ('giorno ' + card.agendaDay))) : ''}</div>
    ${card.carImage ? `<div style="display:flex;align-items:center;gap:12px;margin:8px 0 4px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel2,#121822)">
      <img src="${card.carImage}" alt="${esc(card.carName ?? '')}" style="width:150px;aspect-ratio:16/9;object-fit:cover;border-radius:8px;background:#0d1118">
      <div style="font-size:12.5px"><b>Auto della giornata</b><br>${esc(card.carName ?? '')} <span class="muted">${card.carChoices?.length>1?'· puoi cambiarla dal selettore':''}</span></div>
    </div>` : ''}
    <div class="cklbar"><i style="width:${doneCount/card.settings.length*100}%"></i></div>
    <div class="cklmeta"><span class="muted">checklist di configurazione: ${doneCount}/${card.settings.length}</span><button class="link" id="b-ckl-reset">azzera</button></div>
    ${card.boxRadio?.tips?.length ? `<details style="margin-top:8px" open><summary style="cursor:pointer;font-size:12px"><b>📻 Consigli dal BOX</b> <span class="muted" style="font-size:11px">— la scheda dell'ingegnere di gara</span></summary>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${card.boxRadio.tips.map(t=>`<div style="display:flex;gap:10px;align-items:flex-start;background:var(--panel2,#121822);border:1px solid var(--line);border-radius:8px;padding:7px 10px"><span style="flex:none;font-size:15px">${t.icon}</span><div style="font-size:12px;line-height:1.45"><b>${esc(t.title)}</b> — <span class="muted">${esc(t.text)}</span></div></div>`).join('')}</div></details>` : ''}
    <div id="ingegnere-live" style="margin-top:10px"></div>
    ${card.outlook ? `<div style="margin-top:10px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel2,#151a24)">
      <div style="font-size:12px;margin-bottom:4px"><b>Obiettivo giro</b> · ${card.outlook.lapTarget ? `il tuo best qui: <b style="color:var(--acc)">${esc(card.outlook.lapTarget.time)}</b> <span class="muted">(${esc(card.outlook.lapTarget.car ?? '')}, ${esc((card.outlook.lapTarget.at||'').slice(0,10))})</span>` : '<span class="muted">prima volta su questo tracciato: tutto da scrivere</span>'}${card.outlook.mastery ? ` · <span class="tag ${card.outlook.mastery.level>=3?'gold':'blue'}" style="font-size:10px;padding:1px 6px">maestria: ${esc(card.outlook.mastery.name)}</span>` : ''}</div>
      <div style="font-size:12px;margin-bottom:4px"><b>Stagione</b> · ${card.outlook.standingPosition?`P${card.outlook.standingPosition} in classifica · `:''}${card.outlook.racesRun}/${card.outlook.totalRounds} gare corse · ${card.outlook.seasonPoints} punti${card.outlook.duel?` · ⚔️ duello con <b>${esc(card.outlook.duel.name)}</b> a ${card.outlook.duel.gap} pt`:''}${card.outlook.crowd?` · <span title="stima spettatori dalla pista (stile audience di Zero to Apex)">🧑‍🤝‍🧑 ${(card.outlook.crowd/1000).toFixed(0)}k attesi</span>`:''}</div>
      ${card.outlook.contract?.length ? `<div style="font-size:12px;margin-bottom:4px"><b>Contratto</b> · ${card.outlook.contract.map(c=>`<span title="${esc(c.progress)}" style="white-space:nowrap">${c.decided===false?'<span style="color:var(--bad)">✗</span>':c.ok?'<span style="color:var(--good)">✓</span>':'•'} ${esc(c.text.split(' ').slice(0,4).join(' '))}…</span>`).join(' ')}</div>` : ''}
    ${(card.timeMultiplier ?? 1) !== 1 ? `<div style="font-size:12px;margin-bottom:4px"><b>Tempo</b> · moltiplicatore consigliato: <b>${card.timeMultiplier}x</b> <span class="muted">(col gioco che corre più in fretta il pomeriggio si comprime: le ore di sessione restano quelle del calendario)</span></div>` : ''}
      ${card.outlook.rivals?.length ? `<div style="font-size:12px"><b>Rivali già visti</b> · ${card.outlook.rivals.map(r=>`<span class="chip ${r.h2h.beats>r.h2h.losses?'':'gold'}" style="font-size:10px;padding:1px 6px" title="tu-lui: ${r.h2h.losses}-${r.h2h.beats}">${esc(r.name.split(' ')[0])} ${r.h2h.losses}-${r.h2h.beats}</span>`).join(' ')}</div>` : ''}
    </div>` : ''}
    ${card.outlook?.trackInfo ? `<div style="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2,#121822);display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      ${card.outlook.trackInfo.map ? `<img src="${card.outlook.trackInfo.map}" alt="tracciato di ${esc(card.trackName)}" style="width:180px;height:118px;flex:none;object-fit:contain;background:#000;border-radius:8px;padding:8px${card.outlook.trackInfo.map.endsWith('.svg')?';filter:invert(1);opacity:.92':''}">` : (card.outlook.trackInfo.outline ? `<svg viewBox="0 0 100 64" style="width:170px;height:110px;flex:none;background:#0d1118;border-radius:8px;padding:6px" aria-label="tracciato di ${esc(card.trackName)}"><path d="${card.outlook.trackInfo.outline}" fill="none" stroke="var(--acc)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>` : '')}
      <div style="flex:1;min-width:230px">
        <div style="font-size:13px;margin-bottom:5px"><b>${flagOf(card.outlook.trackInfo.country)} ${esc(card.trackName)}</b> <span class="muted">· ${esc(card.outlook.trackInfo.nick)} · ${esc(card.outlook.trackInfo.country)}, ${card.outlook.trackInfo.lengthKm} km, ${card.outlook.trackInfo.corners} curve, dal ${card.outlook.trackInfo.opened}</span></div>
        ${card.outlook.trackRec ? `<div style="font-size:12.5px"><b>🏁 Giro più veloce in pista</b> · <b style="color:var(--acc);font-size:15px">${esc(card.outlook.trackRec.time)}</b> — ${esc(card.outlook.trackRec.driver)}${card.outlook.trackRec.mine?' <span class="tag green" style="font-size:10px;padding:1px 6px">tu</span>':''}<br><span class="muted">${esc(card.outlook.trackRec.car ?? '')}${card.outlook.trackRec.sameCar?'':' · altra auto'} · ${esc((card.outlook.trackRec.at ?? '').slice(0, 10))}${card.outlook.lapTarget&&card.outlook.lapTarget.time!==card.outlook.trackRec.time?` · il tuo migliore: ${esc(card.outlook.lapTarget.time)}`:''}</span></div>` : ''}
        <details style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:12px">📖 la storia di ${esc(card.trackName)}</summary>
        <div class="muted" style="margin-top:5px;font-size:12px;line-height:1.55">${esc(card.outlook.trackInfo.history)}</div>
        <button class="mini" style="margin-top:6px" onclick="document.querySelector('#nav button[data-tab=tracks]').click()">Apri il libro delle piste</button></details>
      </div>
    </div>` : ''}
    ${card.heritageActive ? `<div class="banner warn" style="margin-top:10px">📜 <b>Impresa di famiglia: ${esc(card.heritageActive.title)}</b> — ${esc(card.heritageActive.ancestor)}, tuo ${esc(card.heritageActive.relation)} (${esc(card.heritageActive.era)}). Questa gara vale per l'obiettivo «${esc(card.heritageActive.objective)}» (${card.heritageActive.done}/${card.heritageActive.total} superate · eredità ${money(card.heritageActive.inherit)} €).</div>` : ''}
    ${!card.heritageActive && card.heritageHint ? `<div class="banner info" style="margin-top:10px">📜 L'impresa di famiglia ${card.heritageHint ? 'prosegue a <b>'+esc(card.heritageHint)+'</b>' : ''}: corri la ronda indicata per farla contare (vedi pannello Eredità).</div>` : ''}
    ${card.challenge && !card.challenge.verdict ? `<div class="banner ${card.challenge.accepted?'info':'warn'}" style="margin-top:10px">${LI.target} <b>Sfida della ronda</b> — ${esc(card.challenge.text)}<br><span class="muted">facoltativa · premio ${money(card.challenge.reward)} € se ci riesci · −${card.challenge.penalty} rep se fallisci${card.challenge.accepted?' · <b>accettata</b>':''}</span>${card.challenge.accepted?'':' <button class="mini" id="b-accept-chal" style="margin-top:6px">Accetta la sfida</button>'}</div>` : ''}
    ${card.pendingNudge ? `<div class="banner warn" style="margin-top:10px"><b>🚀 La serie è troppo facile?</b> ${esc(card.pendingNudge.reason)} su ${esc(card.pendingNudge.nodeDisplay)}.<br>
      <button class="mini" id="b-nudge-apply" style="margin-top:6px">Applica +1 alla banda della serie</button>
      <button class="mini" id="b-nudge-skip" style="margin-top:6px;margin-left:6px">No, va bene così</button></div>` : ''}
    ${card.pendingProposal ? `<div class="banner warn" style="margin-top:10px"><b>🎯 Il tool suggerisce il trim</b> ${esc(card.pendingProposal.reason)}: trim ${card.pendingProposal.from >= 0 ? '+' : ''}${card.pendingProposal.from} → <b>${card.pendingProposal.to >= 0 ? '+' : ''}${card.pendingProposal.to}</b>. Accettare sposta anche la banda EVO della serie di ${Math.abs((card.pendingProposal.to - card.pendingProposal.from) * 5)} punti (${card.pendingProposal.to > card.pendingProposal.from ? 'in salita' : 'in discesa'}).<br>
      <button class="mini" id="b-prop-accept" style="margin-top:6px">Accetta (trim ${card.pendingProposal.to >= 0 ? '+' : ''}${card.pendingProposal.to})</button>
      <button class="mini" id="b-prop-reject" style="margin-top:6px;margin-left:6px">Rifiuta</button></div>` : ''}
    ${card.difficulty?.trim >= (20) ? `<div class="banner warn" style="margin-top:10px"><b>Difficoltà al massimo</b> — il trim adattivo è arrivato a +20 e la serie resta troppo facile: il passo successivo è passare a una serie più alta (bottone 🎯 nel cruscotto).</div>` : ''}
    <div class="panel" style="margin-top:12px; padding:14px 16px" id="rs-panel">
      <h2 style="margin-bottom:10px">${LI.gauge} Regole di questo weekend <span class="h-act">lo slider EVO va da 0 a 100% e si imposta come intervallo</span></h2>
      <div class="rs-grid">
        <div class="field"><label>Difficoltà AI — minimo (consigliato ${Math.max(0,card.difficulty.slider-5)}%)</label>
          <div class="row"><input type="range" id="rs-dmin" min="0" max="100" step="1" value="${card.difficulty.rangeMin}" style="flex:1;padding:0"><b id="rs-dmin-v" style="min-width:44px;text-align:right">${card.difficulty.rangeMin}%</b></div>
        </div>
        <div class="field"><label>Difficoltà AI — massimo (consigliato ${Math.min(100,card.difficulty.slider+5)}%)</label>
          <div class="row"><input type="range" id="rs-dmax" min="0" max="100" step="1" value="${card.difficulty.rangeMax}" style="flex:1;padding:0"><b id="rs-dmax-v" style="min-width:44px;text-align:right">${card.difficulty.rangeMax}%</b></div>
        </div>
        <div class="field"><label>Inizio prove libere (ora del gioco)</label><input type="number" id="rs-pstart" min="0" max="23" value="${card.practiceStart}"></div>
        <div class="field"><label>Inizio qualifiche (ora del gioco)</label><input type="number" id="rs-qstart" min="0" max="23" value="${card.qualifyStart}"></div>
        <div class="field"><label>Moltiplicatore tempo</label>
          <select id="rs-time">${[1,2,3,4,5,6,8,10,12,24,48].map(t=>`<option value="${t}" ${t===(card.timeMultiplier??1)?'selected':''}>${t}x</option>`).join('')}</select>
        </div>
        <div class="field"><label>Piano orario della serie <span class="faint">(notte, tramonto→alba, orari variabili)</span></label>
          <select id="rs-piano">
            <option value="">— nessun piano (orari del calendario) —</option>
            ${Object.entries(card.piani||{}).map(([id,p])=>`<option value="${id}" ${card.pianoCurrent===id?'selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Distanza gara <span class="faint">(piena: ${card.baseLaps ?? card.round.laps} giri · premio ${money(card.prizeFull ?? card.round.econ?.prize)} €)</span></label>
          <select id="rs-dist">${[100,75,50,25].map(p=>`<option value="${p}" ${p===(card.distPct??100)?'selected':''}>${p}% — ${Math.max(2,Math.round((card.baseLaps ?? card.round.laps)*p/100))} giri · premio fino a ${money(Math.round((card.prizeFull ?? 0)*p/100))} €</option>`).join('')}</select>
        </div>
        <div class="row" style="align-items:end"><button class="mini" id="rs-save">Salva regole</button><button class="mini" id="rs-reset">Torna ai consigli</button></div>
      </div>
      <div class="muted" style="font-size:11.5px;margin-top:8px">Aggressività AI: in EVO è ancora bloccata (grigia), il tool la mostra solo come riferimento (${card.aggression}% consigliato). Consigli = difficoltà adattiva ±5 + orari calcolati sull'ora di gara; “Torna ai consigli” azzera le tue scelte.</div>
    </div>
    <div style="margin-top:8px">
      ${card.settings.map(([k,v],i)=>{
        const isDiff = k === 'Difficoltà AI';
        return `<div class="ckl ${isDone(i)?'done':''}" style="display:flex;align-items:center;gap:8px">
          <label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer"><input type="checkbox" data-i="${i}" ${isDone(i)?'checked':''}><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></label>
          ${isDiff?`<span class="row" style="gap:4px;margin:0" title="la gara è stata troppo facile? alza o abbassa la banda di 1 punto: vale per la serie (qualsiasi auto) e si riflette anche nella pagina Difficoltà">
            <button class="mini d-nudge" data-d="-1" style="padding:1px 8px">−1</button>
            <button class="mini d-nudge" data-d="+1" style="padding:1px 8px">+1</button>
          </span>`:''}
        </div>`;
      }).join('')}
    </div>
    ${card.warnings.length ? `<ul class="warnlist">${card.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    <div class="row" style="margin-top:16px">
      <select id="sel-car" style="flex:1;min-width:200px">${card.carChoices.map(c=>`<option value="${esc(c.id)}"${c.id===card.car?' selected':''}>${esc(c.display)}</option>`).join('')}</select>
      <button class="ghost" id="b-copy">Copia scheda</button>
    </div>
    <button class="act" id="b-race" style="width:100%;margin-top:10px">🏁 Prepara tutto e divertiti</button>
    <div class="muted" style="margin-top:10px">Imposta i campi nella gara personalizzata di EVO spuntando la lista qui sopra; a scheda completa, premi Invio.</div>`;
  const save = () => {
    checked = $$('.ckl input', el).filter(c=>c.checked).map(c=>Number(c.dataset.i));
    localStorage.setItem(key, JSON.stringify(checked));
    $$('.ckl', el).forEach((row,i)=>row.classList.toggle('done', checked.includes(i)));
    $('.cklbar i', el).style.width = (checked.length/card.settings.length*100) + '%';
    $('.cklmeta .muted', el).textContent = `checklist di configurazione: ${checked.length}/${card.settings.length}`;
    if (checked.length === card.settings.length) toast('Scheda completa: sei pronto a partire in EVO.', 'ok');
  };
  $$('.ckl input', el).forEach(c => c.onchange = save);
  $('#b-ckl-reset', el).onclick = (e) => { e.preventDefault(); localStorage.removeItem(key); drawCardInto(el, card); };
  // RADIO LIVE DELL'INGEGNERE: benzina residua, usura gomme, gap — dati veri
  // della shared memory mentre il gioco gira. Se non c'è gara in corso il
  // pannello resta buio (nessun rumore, il cruscotto non si sporca).
  window.__ingLiveStop?.();
  const ingOut = $('#ingegnere-live', el);
  const ingDraw = async () => {
    if (!document.body.contains(ingOut)) { window.__ingLiveStop?.(); return; }
    try {
      const m = await api('ingegnere', {});
      if (!document.body.contains(ingOut)) return;
      if (!m?.live) { ingOut.innerHTML = ''; return; }
      const wearRow = (m.gauges?.wear || []).length === 4 ? `<span class="muted" style="font-size:11px">gomme LF ${m.gauges.wear[0]}% · RF ${m.gauges.wear[1]}% · LR ${m.gauges.wear[2]}% · RR ${m.gauges.wear[3]}%${m.gauges.temp&&m.gauges.temp.every(v=>v>0)?' · core '+m.gauges.temp.map(v=>v+'°C').join('/'):''}</span>` : '';
      ingOut.innerHTML = `<div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:9px 12px;background:#0d1118">
        <div style="font-size:12px;margin-bottom:5px"><b>🎧 Ingegnere LIVE</b> <span class="muted" style="font-size:11px">· P${m.gauges.position??'—'}/${m.gauges.drivers??'—'}${m.gauges.lapsTotal!=null?` · giro ${m.gauges.lapsDone+1}/${m.gauges.lapsTotal}`:''}${m.gauges.timeLeft?` · resta ${esc(m.gauges.timeLeft)}`:''}${m.gauges.fuel!=null?` · benzina ${m.gauges.fuel} L`:''}${m.telemTrack?` · consumo da ${esc(m.telemTrack)}`:''}</span></div>
        <div style="display:flex;flex-direction:column;gap:4px">${(m.tips||[]).map(t=>`<div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;line-height:1.4"><span style="flex:none">${t.icon}</span><span><b>${esc(t.title)}</b> — <span class="muted">${esc(t.text)}</span></span></div>`).join('')}</div>
        ${wearRow ? `<div style="margin-top:6px">${wearRow}</div>` : ''}
      </div>`;
    } catch { /* il live non deve mai rompere la vista */ }
  };
  if (ingOut) {
    ingDraw();
    const t = setInterval(ingDraw, 4000);
    window.__ingLiveStop = () => { clearInterval(t); window.__ingLiveStop = null; };
  }
  // pannello "regole del weekend": intervallo slider AI (min-max come in EVO), orari, moltiplicatore
  const rsWire = (id, vid, suffix='') => {
    const inp = $(id, el); if (!inp) return;
    inp.oninput = () => { $(vid, el).textContent = inp.value + suffix; };
  };
  rsWire('#rs-dmin', '#rs-dmin-v', '%');
  rsWire('#rs-dmax', '#rs-dmax-v', '%');
  $('#rs-save', el)?.addEventListener('click', async () => {
    try {
      await api('race-settings', {
        sliderMin: Number($('#rs-dmin', el).value),
        sliderMax: Number($('#rs-dmax', el).value),
        practiceStart: Number($('#rs-pstart', el).value),
        qualifyStart: Number($('#rs-qstart', el).value),
        timeScale: Number($('#rs-time', el).value),
        distPct: Number($('#rs-dist', el).value),
        piano: $('#rs-piano', el)?.value || null,
      });
      toast('Regole salvate: valle a impostare in EVO.', 'ok');
      drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null }));
    } catch(e){ toast(e.message, 'err'); }
  });
  $('#rs-reset', el)?.addEventListener('click', async () => {
    try {
      await api('race-settings', { clear: true });
      toast('Tornati i consigli del tool.', 'ok');
      drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null }));
    } catch(e){ toast(e.message, 'err'); }
  });
  $('#b-accept-chal', el)?.addEventListener('click', async () => {
    try { await api('challenge-accept', {}); toast('Sfida accettata: in bocca al lupo.', 'ok'); drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null })); }
    catch(e){ toast(e.message, 'err'); }
  });
  $$('.d-nudge', el).forEach(b => b.onclick = async (e) => {
    e.preventDefault();
    try {
      const out = await api('difficulty-nudge', { delta: Number(b.dataset.d), car: $('#sel-car', el)?.value ?? null });
      drawCardInto(el, out.card);
      toast(`Difficoltà serie: ${out.card.difficulty.rangeMin}–${out.card.difficulty.rangeMax}%.`, 'ok');
    } catch(err){ toast(err.message, 'err'); }
  });
  $('#b-nudge-apply', el)?.addEventListener('click', async () => {
    try {
      const out = await api('difficulty-nudge', { delta: Number(card.pendingNudge?.delta ?? 1), car: $('#sel-car', el)?.value ?? null });
      drawCardInto(el, out.card);
      toast(`Difficoltà serie: ${out.card.difficulty.rangeMin}–${out.card.difficulty.rangeMax}%.`, 'ok');
    } catch(err){ toast(err.message, 'err'); }
  });
  $('#b-nudge-skip', el)?.addEventListener('click', async () => {
    try { await api('nudge-dismiss', {}); drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null })); toast('Suggerimento scartato.', 'info'); }
    catch(err){ toast(err.message, 'err'); }
  });
  $('#b-prop-accept', el)?.addEventListener('click', async () => {
    try {
      await api('difficulty-action', { op: 'accept' });
      drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null }));
      toast('Suggerimento accettato: trim aggiornato, banda EVO spostata.', 'ok');
      await refreshBoot();
    } catch(err){ toast(err.message, 'err'); }
  });
  $('#b-prop-reject', el)?.addEventListener('click', async () => {
    try {
      await api('difficulty-action', { op: 'reject' });
      drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null }));
      toast('Suggerimento rifiutato.', 'info');
    } catch(err){ toast(err.message, 'err'); }
  });
  $('#sel-car', el).onchange = async () => drawCardInto(el, await api('card', {car: $('#sel-car', el).value}));
  $('#b-copy', el).onclick = async () => {
    const text = `${card.nodeDisplay} — ${card.roundName} (R${card.roundIndex+1}/${card.totalRounds})\n` +
      card.settings.map(([k,v])=>`${k}: ${v}`).join('\n') + `\nDifficoltà AI: ${card.difficulty.slider}% · aggressività ${card.aggression}%`;
    try { await navigator.clipboard.writeText(text); toast('Scheda copia negli appunti.', 'ok'); }
    catch { toast('Il browser ha negato gli appunti.', 'err'); }
  };
  // banda live: stato della memoria condivisa + verifica automatica della config
  const liveBox = document.createElement('div');
  liveBox.className = 'livebar live-off';
  liveBox.innerHTML = '<span class="dot"></span><span class="st">Live</span><span class="muted">in attesa del gioco…</span>';
  el.appendChild(liveBox);
  const pollLive = async () => {
    if (!document.body.contains(liveBox)) return;
    try {
      const car = $('#sel-car', el)?.value ?? null;
      const r = await api('live', { car });
      if (!document.body.contains(liveBox)) return;
      if (!r.game) {
        liveBox.className = 'livebar live-off';
        liveBox.innerHTML = '<span class="dot"></span><span class="st">Live</span><span class="muted">EVO chiuso — la verifica parte quando lo apri</span>';
      } else if (r.waiting) {
        liveBox.className = 'livebar live-off';
        liveBox.innerHTML = '<span class="dot on"></span><span class="st">EVO aperto</span><span class="muted">— carica una sessione (anche solo prove libere) e la verifica parte da sola</span>';
      } else if (r.check?.rows?.length) {
        const okN = r.check.rows.filter(x=>x.ok).length;
        const cls = r.check.ready ? 'livebar live-ok' : 'livebar live-bad';
        // suono quando TUTTI i pallini diventano verdi (una sola volta per configurazione)
        if (r.check.ready && !window._lastReady) {
          try { new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=').play().catch(()=>{}); } catch {}
        }
        window._lastReady = !!r.check.ready;
        liveBox.className = cls;
        const det = r.check.rows.map(x=>`<div class="ckrow"><span class="mark">${x.ok?'✅':'❌'}</span><span class="k">${esc(x.key)}</span>${x.ok?`<span class="lv">${esc(x.live)}</span>`:`<span class="exp">${esc(x.expected ?? '?')}</span> <span class="lv" style="color:var(--warn)">${esc(x.live ?? '—')}</span>`}</div>`).join('');
        liveBox.innerHTML = `<span class="dot ${r.check.ready?'on':''}"></span><span class="st">${r.check.ready?'Configurazione corretta!':'Configura in EVO:'}</span>
          <span class="muted">${okN}/${r.check.rows.length} ok</span><div style="width:100%">${det}</div>`;
      } else {
        liveBox.className = 'livebar live-off';
        const s = r.session ?? {};
        liveBox.innerHTML = `<span class="dot on"></span><span class="st">EVO aperto</span><span class="sep">·</span><span class="muted">${esc(s.type ?? '')} · ${esc(s.track ?? '?')} ${esc(s.layout ?? '')} · ${esc(s.session.name || 'sessione libera')}</span>`;
      }
    } catch { /* server occupato: riprova al prossimo giro */ }
    setTimeout(pollLive, 2000);
  };
  pollLive();
  $('#b-race', el).onclick = async () => {
    const btn = $('#b-race', el); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('race', {car: $('#sel-car', el)?.value});
      const note = r.gameRunning ? 'EVO è già aperto: imposta la gara nella finestra esistente.' : (r.launched && !r.launched.error ? 'Gioco avviato.' : 'Gioco non avviato: aprilo tu.');
      toast(`Gara segnata${r.fee?` · iscrizione ${money(r.fee)} €`:''}. ${note}`, 'ok');
      drawCardInto(el, r.card);
      await refreshBoot();
    } catch(e){ toast(e.message, 'err'); btn.disabled=false; btn.textContent='🏁 Prepara tutto e divertiti'; }
  };
}

