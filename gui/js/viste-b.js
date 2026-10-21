/* -------- calendario -------- */
async function drawCalendar(m){
  const cal = await api('calendar');
  m.innerHTML = `<div class="panel"><h2>Calendario <span class="h-act">${esc(cal.node)} · stagione ${cal.season}</span></h2>
  <table><thead><tr><th></th><th>Round</th><th>Pista</th><th class="right">Gara</th><th class="right">Ora</th><th>Meteo</th></tr></thead>
  <tbody>${cal.rounds.map(r=>`<tr class="${r.current?'cur':''}"><td>${r.played?'✓':r.current?'►':''}</td><td>R${r.index+1} ${esc(r.name)}</td><td>${esc(r.track)}</td><td class="right">${r.durationMin?`${r.durationMin}′ a tempo`:`${r.laps} giri`}</td><td class="right">${String(r.hour).padStart(2,'0')}:00</td><td class="muted">${esc(r.weather)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

/* -------- centro gare (ex Agenda, stile cockpit: calendario grande,
   pulsanti del tempo in evidenza, schede-gara racing a colpo d'occhio) --- */
let agendaView = { day: null, filter: 'tutte', disc: null };

/* l'icona della DISCIPLINA sulla scheda: stessa famiglia di icone della nav,
   così le viste si uniformano senza creare diversità */
const DISC_ICONS = [
  ['entry', ICONS.cars], ['turismo', ICONS.griglia], ['touring', ICONS.griglia],
  ['monoposto', LI.bolt], ['formula', LI.bolt],
  ['gran turismo', LI.trophy], ['gt', LI.trophy],
  ['endurance', LI.stopwatch],
  ['strada', ICONS.tracks], ['rally', ICONS.tracks], ['historic', ICONS.archive],
  ['drift', ICONS.setup],
];
function discIcon(name){
  const n = String(name ?? '').toLowerCase();
  const hit = DISC_ICONS.find(([k]) => n.includes(k));
  return hit ? hit[1] : ICONS.series;
}

async function drawAgenda(m){
  const a = await api('agenda', {
    day: agendaView.day, filter: agendaView.filter, discipline: agendaView.disc,
  });
  agendaView.day = a.viewDay ?? a.day;   // resta sul giorno che stai GUARDANDO (dopo un avanzamento torna il reale)

  /* il bottone "Alla prossima gara" dice la DATA REALE + la distanza, non
     "giorno 12": GIO 24 APR 2025 · TRA 2 GIORNI */
  const nextRaceBtn = (a) => {
    if (!a.nextRaceDay) return '⯈ Alla prossima gara di campionato';
    const d = a.nextRaceDay - (a.day ?? 0);
    const strip = (a.strips ?? []).find(s => s.day === a.nextRaceDay);
    const when = strip?.date ?? `giorno ${a.nextRaceDay}`;
    const far = d > 0 ? ` · tra ${d} ${d===1?'giorno':'giorni'}` : '';
    return `⯈ recall: prossimo weekend (${esc(when)}${far})`;
  };

  const dNames = new Map((a.disciplines ?? []).map(d => [d.id, d.name]));
  const gareCard = (g) => {
    const cls = g.stato === 'iscritto' ? 'ag-iscritto' : g.fattibile ? 'ag-fattibile' : 'ag-bloccata';
    const stato = g.stato === 'iscritto'
      ? '<span class="tag gold">★ iscritto</span>'
      : g.fattibile
        ? '<span class="tag blue">disponibile</span>'
        : `<span title="${esc((g.gateReasons??[]).join(' · '))}">🔒 <span class="faint">bloccata</span></span>`;
    const cta = g.isCurrent
      ? '<span class="tag gold ag-cta">▶ serie attuale — Cruscotto</span>'
      : g.fattibile
        ? `<button class="btn-cta" data-corri="${esc(g.nodeId)}" data-name="${esc(g.display)}">SCEGLI PER OGGI</button>`
        : '';
    return `
    <div class="ag-card ${cls}" data-detail="${esc(g.nodeId)}" title="clicca la scheda per il dettaglio della serie">
      <div class="ag-top">
        <span class="ag-round">R${g.roundIndex+1}<i>/${g.totalRounds}</i></span>
        <span class="ag-disc" title="${esc(dNames.get(g.discipline) ?? g.discipline ?? '')}">${discIcon(dNames.get(g.discipline) ?? g.discipline)}</span>
        <div class="ag-nome" style="flex:1;min-width:0">${esc(g.display)}</div>
        <span class="ag-ora">${String(g.hour).padStart(2,'0')}:00</span>
      </div>
      <div class="ag-track">␦ ${esc(g.track)}${g.laps?` · ${g.laps} giri`:''}${g.scheduledDay && a.viewDay ? (g.scheduledDay === a.viewDay ? '' : ` · <span class="tag gold">in agenda il ${esc(a.viewLabel ?? '')}</span>`) : ''}</div>
      <div class="ag-bot">
        <span class="prz">${money(g.prize??0)}</span>
        <span class="aut">${g.gridSize??'—'} AUTO</span>
        ${g.griglia === 'monomarca' ? '<span class="tag blue" title="griglia con la sola auto della serie">monomarca</span>' : ''}
        ${g.griglia && g.griglia.indexOf('multi-marca') === 0 ? `<span class="tag gold" title="griglia multi-marca: pool d'epoca dichiarato per la serie">${esc(g.griglia)}</span>` : ''}
        ${g.late ? '<span class="tag gold">⚠ in ritardo</span>' : ''}
        ${stato}
        ${cta}
      </div>
    </div>`;
  };

  const discChips = [{id:null,name:'tutte le discipline'}].concat(a.disciplines).map(d =>
    `<button class="chip-f ${agendaView.disc===d.id?'on':''}" data-disc="${d.id??''}"><span class="cf-ico">${discIcon(d.name)}</span>${esc(d.name)}</button>`).join('');
  const filterChips = [
    ['tutte','TUTTE'], ['fattibili','DISPONIBILI'], ['iscritte','ISCRITTE'], ['bloccate','BLOCCATE'],
  ].map(([id,label]) =>
    `<button class="chip-f ${agendaView.filter===id?'on':''}" data-af="${id}">${label}</button>`).join('');
  // "nascondi le già iniziate": spegne le gare in corso/ritardo della giornata vista
  const hideStarted = `<button class="chip-f ${agendaView.hideStarted?'on':''}" data-hidestarted="1" title="nasconde le gare che sono già in programma da prima (in corso o in ritardo): restano solo quelle che partono esattamente nel giorno in vista">${agendaView.hideStarted?'☑':'☐'} nascondi gare già iniziate</button>`;
  const strip = (a.strips??[]).map(s => {
    const side = s.mine ? `<i class="mine">+${s.mine}</i>` : '';
    return `<button class="ag-day ${s.today?'today':''} ${s.mine?'hasmine':''}" data-goday="${s.day}" title="${esc(s.date)}: ${s.total} gare (${s.available} fattibili)${s.mine?`, ${s.mine} del tuo campionato (oro)`:''}">
      <span class="ag-day-date">${esc(s.date)}</span>
      <span class="ag-day-num">${s.total}</span>
      ${side}
    </button>`;
  }).join('');

  const impegniHtml = (a.impegni?.lista ?? []).length ? `<span class="impegni">(${a.impegni.iscritte} iscritte${a.impegni.conflitti.length?` · ⚠️ ${a.impegni.conflitti.length} conflitt${a.impegni.conflitti.length===1?'o':'i'}`:''})</span>` : '';
  const conflittiHtml = (a.impegni?.conflitti ?? []).map((c) => `
    <div class="conflitto">
      <div>${esc(c.date)} — ${c.gare.length} gare iscritte lo stesso giorno:</div>
      ${c.gare.map((g)=>`<span class="conf-item">
        <b>${esc(g.display)}</b> <span class="faint">R${g.roundIndex+1} · ${esc(g.track)}</span>
        <button class="mini" data-shift="${esc(g.nodeId)}" title="Sposta la serie in avanti di una cadenza (le prossime gare si spostano con lei)">sposta ⯈</button>
      </span>`).join('')}
    </div>`).join('');

  m.innerHTML = `
  <div class="panel ag-hero">
    <div class="ag-hero-top">
      <div class="ag-titolo">CENTRO GARE</div>
      <div class="ag-data">⯅ ${esc(a.todayLabel)} <i>· giorno ${a.day}</i> ${impegniHtml}</div>
    </div>
    <div class="ag-controls">
      <button class="btn-time primary" id="ag-advance">⯈ AVANZA UN GIORNO</button>
      <button class="btn-time" id="ag-next">${nextRaceBtn(a)}</button>
    </div>
    ${conflittiHtml}
    <div class="ag-strip">${strip}</div>
  </div>
  <div class="panel">
    <div class="gare-head">
      <div class="gare-title">GARE DEL GIORNO</div>
      <div class="chipbar">${filterChips}</div>
    </div>
    <div class="chipbar" style="margin-bottom:10px">${hideStarted}${discChips}</div>
    <div id="gare-wrap">…</div>
  </div>`;
  // dopo un avanzamento il boot andava ridato: paintHeader(boot.header) qui repingeva
  // la data VECCHIA (boot già risolto prima dell'avanzamento) → la data sembrava ferma
  $('#ag-advance').onclick = async () => { await api('agenda-advance', { method:'POST' }); agendaView.day = null; await refreshBoot(); render(); };
  const nb = $('#ag-next'); if (nb) nb.onclick = async () => { await api('agenda-skip-to-next', { method:'POST' }); agendaView.day = null; await refreshBoot(); render(); };
  $$('button[data-af]').forEach(b => b.onclick = () => { agendaView.filter = b.dataset.af; drawAgenda(m); });
  $$('button[data-hidestarted]').forEach(b => b.onclick = () => { agendaView.hideStarted = !agendaView.hideStarted; drawAgenda(m); });
  $$('button[data-disc]').forEach(b => b.onclick = () => { agendaView.disc = b.dataset.disc || null; drawAgenda(m); });
  $$('button[data-goday]').forEach(b => b.onclick = () => { agendaView.day = Number(b.dataset.goday); drawAgenda(m); });
  $$('button[data-corri]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      const r = await api('agenda-choose', { method:'POST', body:{ nodeId: b.dataset.corri, day: agendaView.day ?? undefined } });
      toast('Gara scelta per oggi ✔ (serie attiva nel cruscotto)', 'ok');
      tab = 'calendar'; drawNav(); render();
    } catch(e){ toast(e.message, 'err'); b.disabled = false; }
  });
  $$('button[data-shift]').forEach(b => b.onclick = async () => {
    await api('agenda-shift', { method:'POST', body:{ nodeId: b.dataset.shift } });
    render();
  });
  // "GARE DEL GIORNO" si riempie qui: conteggio + card racing in un colpo solo
  const wrapEl = $('#gare-wrap');
  {
    // stesso filtro di prima: "nascondi gare già iniziate" toglie late e champStarted
    const lista = agendaView.hideStarted ? a.gare.filter(g => !(g.late || g.champStarted)) : a.gare;
    const nascoste = a.gare.length - lista.length;
    const gt = $('.gare-title');
    if (gt) gt.insertAdjacentHTML('beforeend', `<span class="tuttecount">${lista.length} a programma${nascoste>0?` · ${nascoste} nascoste`:''} · max ${a.maxScelte}/giornata</span>`);
    if (!lista.length) wrapEl.innerHTML = '<div class="muted">Nessuna gara corrisponde ai filtri in questo giorno. Prova un altro giorno dalla striscia calendario.</div>';
    else wrapEl.innerHTML = `<div class="ag-grid">${lista.map(gareCard).join('')}</div>`;
    // ricola i click (le card sono appena create)
    $$('.ag-card', wrapEl).forEach(el => el.onclick = (e) => {
      if (e.target.closest('button')) return;
      raceCardModal(el.dataset.detail, a.viewDay);
    });
    $$('button[data-corri]', wrapEl).forEach(b => b.onclick = async () => {
      b.disabled = true;
      try {
        await api('agenda-choose', { method:'POST', body:{ nodeId: b.dataset.corri, day: agendaView.day ?? undefined } });
        toast('Gara scelta per oggi ✔ (serie attiva nel cruscotto)', 'ok');
        tab = 'calendar'; drawNav(); render();
      } catch(e){ toast(e.message, 'err'); b.disabled = false; }
    });
  }
}

/* -------- scheda-gara cliccabile in Agenda -------- */
async function raceCardModal(nodeId, day){
  let d;
  try { d = await api('agenda-detail', { nodeId, day }); }
  catch(e){ toast(e.message, 'err'); return; }
  const auto = (d.cars ?? []).join(', ') || '—';
  const cal = (d.calendar ?? []).map((r) => {
    const mark = r.played ? '✓' : r.current ? '►' : '';
    return `<div style="display:flex;gap:8px;align-items:baseline;padding:1px 0">
      <span style="width:16px;color:${r.played?'var(--ok,#7bd88f)':'inherit'}">${mark}</span>
      <span class="faint" style="min-width:38px">R${r.index+1}/${d.calendar.length}</span>
      <span ${r.current?'style="font-weight:700"':''}>${esc(r.track)}</span>
      <span class="faint">· ${r.laps??'—'} giri · ${String(r.hour).padStart(2,'0')}:00</span>
    </div>`;
  }).join('');
  const standings = d.started && d.standings
    ? `<div class="muted" style="margin:8px 0 4px">Classifica in corso (stagione ${d.season}):</div>
      <table><tbody>${d.standings.map(r=>`<tr class="${r.isPlayer?'me':''}"><td class="faint">P${r.position}</td><td>${esc(r.name)}</td><td class="right">${r.points} pt</td></tr>`).join('')}</tbody></table>`
    : '<div class="muted" style="margin-top:8px">La stagione non è ancora cominciata: nessun punto in palio finora.</div>';
  const mie = (d.mine ?? []).length
    ? `<div class="muted" style="margin:8px 0 2px">I tuoi risultati in questa stagione:</div>
      ${d.mine.map(r=>`<span class="muted" style="margin-right:12px">R${r.round+1}: <b>${r.position}</b>${r.fl?' · giro veloce':''} · ${r.points} pt · ${esc(r.track)}</span>`).join('')}`
    : '';
  const statoTxt = d.stato === 'iscritto'
    ? '<span class="tag gold">★ tuo campionato</span>'
    : d.fattibile ? '<span class="tag blue">fattibile: puoi firmare dall\'agenda</span>'
    : `<span class="tag gold" title="${esc((d.gateReasons??[]).join(' · '))}">🔒 ${(d.gateReasons??[])[0] ?? 'bloccata'}</span>`;
  modal(`${esc(d.display)}${d.roundName ? ' — ' + esc(d.roundName) : ''}`, `
    <div class="row" style="gap:6px;flex-wrap:wrap">${statoTxt}
      <span class="faint">L${d.level} · ${esc(d.discipline)} · stagione ${d.season}</span></div>
    <div style="margin:8px 0 2px"><b>${esc(d.roundName ?? '')}</b> — ${esc(d.track)} · ${d.laps??'—'} giri · ore ${String(d.hour).padStart(2,'0')}:00${d.weather?' · '+esc(d.weather):''}</div>
    <div class="muted">Griglia: ${d.gridSize??'—'} auto${d.griglia ? ` · <b>${esc(d.griglia)}</b>`:''} · premio ${money(d.prize??0)} € · iscrizione ${money(d.entryFee??0)} €${d.repRequired?' · reputazione richiesta '+d.repRequired:''}</div>
    <div class="muted" style="margin-top:6px"><b>Auto della serie:</b> ${esc(auto)}</div>
    ${d.joinNote ? `<div class="tag gold" style="margin-top:6px;display:inline-block">⚠️ ${esc(d.joinNote)}</div>` : ''}
    <div class="sig-prev" style="margin-top:8px"><div class="muted" style="margin-bottom:4px">Calendario della stagione:</div>${cal}</div>
    ${mie}
    ${standings}`,
    [[d.stato === 'iscritto' && d.isCurrent ? 'Vai in pista (Cruscotto)' : 'Chiudi', 'act', () => {
      if (d.stato === 'iscritto' && d.isCurrent) { tab='dashboard'; drawNav(); render(); }
    }]]);
}

/* -------- campionati: le serie iscritte coi loro calendari e classifiche -------- */
async function drawChampionships(m){
  const v = await api('championships');
  if (!(v.championships ?? []).length) {
    m.innerHTML = '<div class="panel"><h2>Campionati</h2><div class="empty">Nessun campionato iscritto: firma un sedile dal Centro gare quando la giornata ti offre una serie adatta.</div></div>';
    return;
  }
  // BADGE cliccabili in alto: ogni campionato in corso con auto, pista e prossimo
  // round. Un click porta direttamente alla scheda del campionato, senza sfogliare
  // tutta la pagina quando i campionati sono tanti.
  const badges = v.championships.map((c) => {
    const nxt = c.nextRound ? `R${c.nextRound.index + 1} · ${c.nextRound.track}` : 'calendario finito';
    const played = c.calendar.filter(r=>r.played).length;
    return `<button class="champ-badge ${c.isCurrent ? 'cur' : ''}" data-node="${esc(c.nodeId)}" title="${esc(c.display)} · L${c.level} ${esc(c.discipline)} — clicca per aprire la scheda completa">
      <b>${esc(c.display)}</b>
      <span class="muted" style="font-size:11px">${nxt} · ${played}/${c.calendar.length} gare</span>
      <span class="muted" style="font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${(c.cars ?? []).map(esc).join(' · ')}</span>
      ${c.isCurrent ? '<span class="tag gold" style="font-size:9px;padding:0 5px">attiva</span>' : ''}
    </button>`;
  }).join('');
  m.innerHTML = `<div class="panel" style="padding:10px 14px"><div style="display:flex;gap:8px;flex-wrap:wrap">${badges}</div></div>`
    + v.championships.map((c) => {
    const rounds = c.calendar.map((r) => {
      const mark = r.played ? '✓' : r.current ? '►' : '';
      return `<div style="display:flex;gap:8px;align-items:baseline;padding:1px 0">
        <span style="width:16px;color:${r.played?'var(--ok,#7bd88f)':'inherit'}">${mark}</span>
        <span class="faint" style="min-width:38px">R${r.index+1}/${c.calendar.length}</span>
        <span>${esc(r.track)}</span>
        <span class="faint">· ${r.laps??'—'} giri · ${String(r.hour).padStart(2,'0')}:00</span>
      </div>`;
    }).join('');
    const mine = (c.mine ?? []).length
      ? `<div class="muted" style="margin:6px 0 2px">I tuoi risultati (${c.mine.length} gare):</div>
        ${c.mine.map(r=>`<span class="muted" style="margin-right:12px">R${r.round+1}: <b>${r.position}</b>${r.fl?' · giro veloce':''} · ${r.points} pt · ${esc(r.track)}</span>`).join('')}`
      : '<div class="muted" style="margin:6px 0">Ancora nessuna gara corsa in questa stagione.</div>';
    const table = c.standings
      ? `<table><thead><tr><th></th><th>Pilota</th><th class="right">Punti</th></tr></thead>
        <tbody>${c.standings.map(r=>`<tr class="${r.isPlayer?'me':''}"><td class="faint">P${r.position}</td><td>${esc(r.name)}${r.isPlayer?' <span class="tag gold">tu</span>':''}</td><td class="right">${r.points}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Classifica non disponibile.</div>';
    const dayNum = c.seatDay ? Math.ceil(1 + (c.calendar.length - 1) * 0) : null; // niente calcolo qui
    return `<div class="panel" id="champ-${esc(c.nodeId)}">
      <h2>${esc(c.display)} <span class="h-act">stagione ${c.season}${c.isCurrent?' · <span class="tag gold">serie attuale</span>':''}</span></h2>
      <div class="muted" style="margin:-4px 0 8px">L${c.level} · ${esc(c.discipline)} · una gara a settimana</div>
      <div class="grid2">
        <div>
          <div class="muted" style="margin-bottom:4px">Calendario della stagione:</div>
          <div class="sig-prev">${rounds}</div>
          ${mine}
        </div>
        <div>
          <div class="muted" style="margin-bottom:4px">Classifica:</div>
          ${table}
        </div>
      </div>
    </div>`;
  }).join('');
  // un click su un badge = scroll fluido alla sezione del campionato
  $$('.champ-badge').forEach(b => b.onclick = () => {
    const sec = $(`#champ-${CSS.escape(b.dataset.node)}`);
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* -------- classifica MONDIALE per prestigio -------- */
/* icone uniformi con la vista Rivali: avatar a iniziali determinista + bandiera,
   chip tratti uguali, riga cliccabile identica — un solo viso per i piloti */
async function drawWorldRanking(m){
  const w = await api('world-ranking');
  m.innerHTML = `<div class="panel">
  <h2>${ICONS.championships} Classifica Mondiale — prestigio <span class="h-act">${w.total} piloti · tu sei P${w.myPosition}</span></h2>
  <div class="muted" style="margin:-6px 0 10px">I più forti del mondo (le monoposto il vertice): skill innata di ogni pilota. La tua stima cresce passando a serie di livello più alto. <b>Clicca un pilota per la scheda completa.</b></div>
  <table><thead><tr><th class="right">#</th><th>Pilota</th><th></th><th class="right">Skill</th><th class="right">Età</th><th>Profilo</th><th></th></tr></thead>
  <tbody>${w.rows.map(r=>`<tr class="${r.isPlayer?'me':''} wr-row" data-k="${esc(String(r.name))}" style="${r.isPlayer?'':'cursor:pointer'}">
    <td class="right pos"><b>P${r.position}</b></td>
    <td><span style="display:inline-flex;align-items:center;gap:8px">${rivalAvatar(r.name, 30)}<span><b>${esc(r.name)}</b>${r.isPlayer?' <span class="tag gold">tu</span>':''}${r.hot?' <span title="in forma: in griglia alza il ritmo">🔥</span>':''}</span></span></td>
    <td class="faint">${flagOf(r.country)} ${esc(r.country)}</td><td class="right"><b>${r.skill}</b>${r.iconic?' <span title="tra i più forti in circolazione">⭐</span>':''}</td><td class="right">${r.age??'—'}</td>
    <td>${r.traits?.length?r.traits.map(t=>`<span class="chip blue" style="font-size:10px;padding:1px 6px">${esc(t)}</span>`).join(' '):''}</td>
    <td class="muted" style="font-size:11px">${esc(r.archName ?? '')}</td></tr>`).join('')}</tbody>
  </table></div>`;
  $$('.wr-row').forEach(tr => tr.onclick = () => showWorldPilot(tr.dataset.k, w.rows));
}

function showWorldPilot(name, rows){
  const r = rows.find(x => String(x.name) === name);
  if (!r) return;
  modal(`Scheda pilota — ${r.name}`, `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">${rivalAvatar(r.name, 46)}
      <div><b style="font-size:16px">${esc(r.name)}</b><div class="muted" style="font-size:12px">${flagOf(r.country)} ${esc(r.country ?? '')} · P${r.position} del mondo${r.iconic?' · ⭐ tra i più forti':''}${r.hot?' · 🔥 in forma':''}</div></div>
    </div>
    <div class="grid4" style="margin-bottom:12px">
      <div class="kpi"><div class="l">Skill</div><div class="v acc">${r.skill}</div></div>
      <div class="kpi"><div class="l">Età</div><div class="v">${r.age ?? '—'}</div></div>
      <div class="kpi"><div class="l">Costanza</div><div class="v">${r.cons != null ? r.cons : '—'}</div></div>
      <div class="kpi"><div class="l">Aggressività</div><div class="v">${r.aggr != null ? r.aggr : '—'}</div></div>
    </div>
    <div style="margin-bottom:10px">${(r.traits ?? []).map(t=>`<span class="chip blue" style="font-size:11px;padding:2px 8px">${esc(t)}</span>`).join(' ')}</div>
    <div class="muted" style="margin-bottom:8px"><b>${esc(r.archName ?? 'n/d')}</b> — ${esc(r.archDesc ?? '')}</div>
    <div class="muted" style="font-size:12.5px">${r.isPlayer ? 'Questo sei tu: la skill cresce coi risultati reali (vittorie e podi spingono sopra la banda della serie).' : r.hot ? '🔥 È in forma: in griglia alza il ritmo, attenzione.' : 'Statista in forma normale: dati in tempo reale aggiornati a ogni import di gara.'}</div>
    ${r.iconic ? '<div class="banner info" style="margin-top:8px">⭐ Pilota <b>fice</b> del World: il suo livello è tra il vertice in assoluto di questa carriera.</div>' : ''}`,
    [['Chiudi','ghost',()=>{}]]);
}

function serieDetail(n){
  const wxName = (w) => ({'Clear':'sereno','Scattered clouds':'nuvole sparse','Overcast':'coperto','Light rain':'pioggia leggera','Rain':'pioggia','Heavy rain':'pioggia forte'}[w] ?? w ?? '—');
  const repOk = n.rep>=(n.repRequired??0);
  const champ=(n.champSeasons??[]).length;
  const blocked = !n.open && (n.reasons?.length ? `<div class="banner warn" style="margin-top:12px"><b>Reputazione insufficiente:</b> ${n.reasons.map(esc).join(' · ')}</div>` : '');
  const auto = (n.carImages?.length ? n.carImages : (n.cars??[]).map(c=>({name:c,image:null}))).map(c=>`
    <div style="display:flex;align-items:center;gap:8px;background:#000;border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:0">
      ${c.image?`<img src="${c.image}" alt="" style="width:86px;height:48px;object-fit:cover;border-radius:5px">`:''}
      <span style="font-size:11.5px;line-height:1.25">${esc(c.name)}</span>
    </div>`).join('');
  const cal = (n.calendar??[]).map((r,i)=>`<tr>
    <td class="faint">R${i+1}</td><td>${esc(r.track)}</td><td class="right">${r.durationMin?`${r.durationMin}′ a tempo`:`${r.laps} giri`}</td>
    <td class="right">${String(r.hour).padStart(2,'0')}:00</td><td class="muted">${wxName(r.weather)}</td></tr>`).join('');
  const pts = n.pointsInfo ? `Punti: ${n.pointsInfo.table.join('–')} ${n.pointsInfo.fl?`· +${n.pointsInfo.fl} giro veloce`:''} ${n.pointsInfo.pole?`· +${n.pointsInfo.pole} pole`:''}` : '';
  const palmares = champ ? `<div style="margin-top:10px"><span class="tag gold">🏆 campione: stagioni ${n.champSeasons.join(', ')}</span></div>`
    : n.bestFinish ? `<div class="muted" style="margin-top:10px">🏁 già corso: miglior risultato P${n.bestFinish}</div>` : '';
  modal(`L${n.level} · ${esc(n.display)}`, `
    <div class="muted" style="margin-bottom:10px">${n.gridSize} auto in griglia · premio stagione <b>${money(n.econ.prize)} €</b>${n.access==='closed'?' · <b>parco chiuso</b>: niente affitto né riscatto, solo contratto':`${n.econ.buy?` · riscatto sedile ${money(n.econ.buy)} €`:''}${n.econ.rent?` · affitto ${money(n.econ.rent)} €`:''}`}${n.econ.entry?` · iscrizione ${money(n.econ.entry)} € a gara`:''}</div>
    <div style="margin-bottom:10px">Reputazione richiesta: <b style="color:${repOk?'var(--ok,#7bd88f)':'var(--bad,#e05d5d)'}">${n.repRequired??0}</b> <span class="muted">(la tua: ${n.rep})</span></div>
    <h3 style="margin:10px 0 6px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim)">Auto della serie</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${auto}</div>
    ${n.format?.length?`<div class="muted" style="margin-top:10px">Formato weekend: ${n.format.map(esc).join(' · ')}</div>`:''}
    ${n.calendar?.length?`<div class="muted" style="margin-top:4px">Distanza gara piena: <b>${Math.max(...n.calendar.map(r=>r.laps??0))} giri</b> max — nel cruscotto puoi accorciare al 25/50/75% (i premi scalano con la distanza)</div>`:''}
    ${n.ai?.length?`<div class="muted" style="margin-top:4px">Difficoltà AI consigliata: <b>${n.ai[0]}–${n.ai[1]}%</b></div>`:''}
    ${pts?`<div class="muted" style="margin-top:4px">${esc(pts)}</div>`:''}
    ${palmares}
    ${cal?`<h3 style="margin:14px 0 6px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim)">Calendario (${(n.calendar??[]).length} gare)</h3><table><thead><tr><th></th><th>Pista</th><th class="right">Gara</th><th class="right">Ora</th><th>Meteo</th></tr></thead><tbody>${cal}</tbody></table>`:''}
    ${blocked}`, [['Chiudi','ghost',()=>{}]]);
}

async function enterFlow(nodeId, name, econ){
  const closed = econ?.access === 'closed';
  const rent = closed ? 0 : (econ?.rent ?? 0);
  const cost = closed
    ? 'Serie a <b>parco chiuso</b>: ci si entra solo con il contratto ufficiale del team — niente affitto né riscatto del sedile, la vettura la mettono loro.'
    : rent > 0
    ? `L'affitto del sedile costa <b>${money(rent)} €</b>, addebitato subito alla firma.`
    : 'Sedile a contratto ufficiale: nessun costo di ingresso.';
  // ANTEPRIMA CONFLITTI: come cadrebbe il calendario della serie e dove collide
  // con i campionati già iscritti. Si vede PRIMA di spendere soldi/reputazione.
  let preview = null;
  try { preview = await api('agenda-sign-preview', { nodeId }); } catch {}
  const confs = preview?.conflictsTotal ?? 0;
  const prevHtml = !preview ? '' : `
    <div class="sig-prev">
      <div class="muted" style="margin-bottom:4px">Calendario previsto della serie (una gara ogni settimana da ${esc(preview.startLabel)}):</div>
      ${preview.future.map(f=>`<div style="display:flex;gap:8px;align-items:baseline;padding:2px 0">
        <span class="faint" style="min-width:120px">${esc(f.dateLabel)}</span>
        <span>R${f.index+1} · ${esc(f.track)}${f.laps?' · '+f.laps+' giri':''}</span>
        ${f.conflicts.length
          ? `<span class="tag gold" title="${esc(f.conflicts.map(c=>c.display+' R'+(c.roundIndex+1)+' ('+c.dateLabel+')').join(', '))}">⚠️ conflitto: ${esc(f.conflicts.map(c=>c.display).join(', '))}</span>`
          : '<span class="faint">✓</span>'}
      </div>`).join('')}
      ${confs
        ? `<div class="tag gold" style="margin-top:6px;display:inline-block">⚠️ ${confs} conflitt${confs===1?'o':'i'} con i campionati già iscritti: al giorno di gara dovrai scegliere, e la gara saltata vale 0 punti.</div>`
        : '<div class="muted" style="margin-top:6px">✓ Nessun conflitto con i campionati già iscritti.</div>'}
    </div>`;
  modal(`Firma del sedile — ${esc(name)}`, `
    <p>Stai per lasciare la serie attuale e trasferirti in <b>${esc(name)}</b>.</p>
    <p class="muted" style="margin-top:8px">${cost} L'iscrizione si paga gara per gara; il calendario riparte dal round 1 della nuova serie.</p>
    ${prevHtml}`,
    [['Annulla','ghost',()=>{}], [confs?'Firma comunque':'Firma il contratto','act', async () => {
      try { const r = await api('enter', {nodeId}); toast('Contratto firmato: ' + r.header.node.display, 'ok'); await refreshBoot(); render(); }
      catch(e){ toast(e.message,'err'); return false; }
    }]]);
}

/* -------- archivio risultati -------- */
async function drawArchive(m){
  const c = await api('catalog');
  m.innerHTML = `
  <div class="panel">
    <h2>Archivio sessioni <span class="h-act">${c.archive.total} file nei Results di EVO</span></h2>
    <div class="row"><input type="text" id="arc-q" placeholder="Cerca pista, pilota, sessione…" style="max-width:280px"></div>
    <div id="arc-body"></div>
  </div>`;
  const all = c.archive.rows;
  const rowHtml = (r, tries) => `<tr data-file="${esc(r.file)}" class="arc-row" style="cursor:pointer">
    <td class="muted">${esc(r.when.slice(0,16).replace('T',' '))}</td>
    <td><span class="tag ${r.session==='Race'?'gold':'blue'}">${esc(r.session)}</span></td>
    <td>${esc(r.track)} <span class="faint">${esc(r.layout)}</span></td>
    <td class="muted">${esc(r.kind)}</td>
    <td class="right">${r.drivers}${tries>1?` <span class="faint" title="${tries} tentativi nella stessa ora: clicca per aprire ognuno">×${tries}</span>`:''}</td>
    <td>${r.me ? `<span class="tag ${r.me.position===1?'gold':r.me.position<=3?'green':''}">P${r.me.position}</span>` : '<span class="faint" title="non presente in questa sessione (riprove, spettatore o server)">—</span>'}</td>
    <td class="muted">${esc(r.winner ?? '—')}</td></tr>`;
  const body = $('#arc-body');
  const paint = (q='') => {
    q = q.toLowerCase();
    const rows = all.filter(r=>!q || `${r.track} ${r.session} ${r.winner ?? ''} ${r.kind}`.toLowerCase().includes(q));
    // raggruppa i tentativi ripetuti (stessa ora/sessione/pista): una riga con il
    // migliore, il conteggio dei tentativi e i file tutti apribili dal dettaglio
    const groups = new Map();
    for (const r of rows) {
      const key = `${r.when.slice(0,13)}|${r.session}|${r.track}`;
      (groups.get(key) ?? groups.set(key, []).get(key)).push(r);
    }
    const flat = [...groups.values()].map(g => {
      const best = [...g].sort((a,b)=>(a.me?.position??99)-(b.me?.position??99))[0];
      return { r: best, tries: g.length, files: g.map(x=>x.file) };
    });
    body.innerHTML = flat.length ? `<table><thead><tr><th>Quando</th><th>Sessione</th><th>Pista</th><th>Tipo</th><th class="right">Piloti</th><th>Tu</th><th>Vincitore</th></tr></thead>
    <tbody>${flat.map(({r,tries})=>rowHtml(r,tries)).join('')}</tbody></table><div class="muted" style="margin-top:8px">Clicca una riga per la classificazione completa con tempi e gap. ×N = più tentativi nella stessa ora (si aprono dal dettaglio).</div>`
    : '<div class="empty">Nessuna sessione trovata.</div>';
    $$('.arc-row', body).forEach(tr => tr.onclick = () => openResult(tr.dataset.file));
  };
  paint();
  $('#arc-q').oninput = () => paint($('#arc-q').value);
}

async function openResult(file){
  const d = await api('result-detail', { file });
  if (d.error) return toast(d.error, 'err');
  modal(`Classificazione · ${d.track} ${d.layout}`, `
    <div class="muted" style="margin-bottom:10px">${esc(d.session)} · ${esc(d.event)} · ora ${d.hour ?? '?'}:${String(d.min ?? 0).padStart(2,'0')} · meteo ${esc(d.weather ?? 'n/d')} · ${d.rows.length} piloti</div>
    <table><thead><tr><th></th><th>Pilota</th><th>Auto</th><th class="right">Giri</th><th class="right">Miglior giro</th><th class="right">Tempo</th><th class="right">Gap</th></tr></thead>
    <tbody>${d.rows.map(r=>`<tr class="${r.me?'me':''}">
      <td class="muted">P${r.position}</td>
      <td>${esc(r.name)}${r.isAI?'':' <span class="tag gold">tu</span>'}</td>
      <td class="muted">${esc(r.car)}</td>
      <td class="right">${r.laps}</td>
      <td class="right">${r.hasBest?'<b>'+esc(r.bestLap)+'</b>':esc(r.bestLap||'—')}</td>
      <td class="right">${esc(r.totalTime||'—')}</td>
      <td class="right">${r.gap!=null?fmtGap(r.gap):'—'}</td>
    </tr>`).join('')}</tbody></table>`,
    [['Chiudi','ghost',()=>{}]]);
}

/* -------- Statistiche — rifatte in stile racing: coppe in vetrina,
   quadri con icone, tabelle pulite. Deve colpire a prima vista. -------- */
const STI = {
  cup: LI.trophy, medal: LI.medal, flag: LI.flag, bolt: LI.bolt, clock: LI.stopwatch,
  euro: LI.euro, gauge: LI.gauge, shield: LI.shield, scroll: LI.scroll, book: LI.book,
};
function stPan(title, ico, body, { note = '', bodyClass = '' } = {}){
  return `<div class="panel st-panel"><h2><span class="st-ico">${ico}</span> ${esc(title)} <span class="h-act">${esc(note)}</span></h2>${bodyClass ? `<div class="${bodyClass}">` : ''}${body}${bodyClass ? '</div>' : ''}</div>`;
}
function stKpis(items){
  return `<div class="st-kpis">${items.map(([l, v, cls, t]) => `<div class="kpi st-kpi" ${t ? `title="${esc(t)}"` : ''}><div class="l">${esc(l)}</div><div class="v ${cls ?? ''}">${v}</div></div>`).join('')}</div>`;
}
function fmtGap(ms){
  if (!Number.isFinite(ms) || ms == null) return '—';
  if (ms >= 60000) return `+${Math.floor(ms/60000)}'${String(Math.round((ms%60000)/1000)).padStart(2,'0')}"`;
  return `+${(ms/1000).toFixed(1)}"`;
}
function svgLine(values, { height=90, color='var(--acc2)', lowerBetter=false }={}){
  const vals = values.filter(v=>v!=null);
  if (vals.length < 2) return vals.length ? `<div style="font-size:32px;font-weight:700;color:${color};padding:8px 0">${vals[0]}</div>` : '';
  const w=560, h=height, pad=8;
  const max=Math.max(...vals), min=Math.min(...vals);
  const span=Math.max(1,max-min);
  const x=(i)=>pad+i*(w-2*pad)/(vals.length-1);
  const y=(v)=> lowerBetter ? pad+(v-min)*(h-2*pad)/span : h-pad-(v-min)*(h-2*pad)/span;
  const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;display:block">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${vals.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.2" fill="${color}"><title>${v}</title></circle>`).join('')}
  </svg>`;
}
async function drawStats(m){
  const s = await api('stats');
  const t = s.totals;
  /* 1) la VETRINA: trofei + sigilli, la prima cosa che guardi */
  const vetrina = (s.trophies?.length || s.sigils?.length) ? `
  <div class="panel st-vetrina">
    <h2><span class="st-ico">${STI.cup}</span> SALA TROFEI <span class="h-act">tutto quello che la carriera ha vinto</span></h2>
    ${s.trophies?.length ? `<div class="st-trophies">${s.trophies.map(t=>`<div class="st-trophy">${rivalAvatarText(t.icon, 40)}<div><b>${esc(t.label)}</b><div class="muted" style="font-size:12px">${esc(t.detail)}</div></div></div>`).join('')}</div>` : ''}
    ${s.sigils?.length ? `<details style="margin-top:10px" open><summary style="cursor:pointer;font-size:12.5px"><b>Sigilli del pilota</b> <span class="muted" style="font-size:11.5px">— ${s.sigils.length} sbloccati</span></summary>
      <div class="st-kpis" style="margin-top:8px">${s.sigils.map(x=>`<div class="kpi st-kpi" title="dal ${esc(String(x.at||'').slice(0,10))}"><div class="l">${esc(x.label ?? x.id)}</div><div class="v" style="font-size:13.5px;font-weight:500">${esc(x.detail ?? '')}</div></div>`).join('')}</div></details>` : ''}
  </div>` : '';
  /* 2) grafici andamento */
  const grafici = s.history.length >= 2 ? `
  <div class="grid2">
    ${stPan('Punti gara per gara', STI.bolt, `${svgLine(s.history.slice().reverse().map(r=>r.points))}<div class="muted" style="font-size:11px;margin-top:6px">dal più vecchio (sinistra) al più recente (destra)</div>`)}
    ${stPan('Posizioni in gara', STI.gauge, `${svgLine(s.history.slice().reverse().map(r=>r.dnf?(r.gridSize??10):r.position),{lowerBetter:true,color:'var(--acc)'})}<div class="muted" style="font-size:11px;margin-top:6px">P1 in alto · i ritiri valgono ultima posizione</div>`)}
  </div>` : '';
  /* 3) carriera in numeri: i quadri grandi */
  const numeri = stPan('Carriera in numeri', STI.flag, stKpis([
    ['Gare', t.races, '', 'gare importate dai file risultato di EVO'],
    ['Vittorie', t.wins, t.wins ? 'acc' : '', 'P1 nelle gare della carriera'],
    ['Podi', t.podiums, t.podiums ? 'acc2' : '', 'arrivi nei primi 3'],
    ['Titoli', t.titles, t.titles ? 'good' : '', 'campionati vinti'],
    ['% vittorie', t.winRate + '%', '', 'vittorie / gare'],
    ['% podi', t.podiumRate + '%', '', 'podi / gare'],
    ['Pole', t.poles, t.poles ? 'good' : '', 'partenze davanti a tutti'],
    ['Giri veloci', t.fastestLaps, '', 'miglior giro in gara'],
    ['Giri percorsi', t.laps, '', 'giri completati in totale'],
    ['Rimonte', t.comebacks, '', ' piazzamenti migliori della griglia di partenza'],
    ['Gare in testa', t.ledAll, '', 'gare intere sempre al comando'],
    ['Posiz. guadagnate/gara', t.avgGain==null ? '—' : (t.avgGain>0?'+':'') + t.avgGain, '', 'media posizioni guadagnate rispetto alla partenza'],
  ]));
  /* 4) tabelle: giri personali, piste, stagioni, saga e ultime gare */
  const bestLaps = stPan('Migliori giri personali', STI.clock, s.bestLaps.length
    ? `<table><thead><tr><th>Pista</th><th class="right">Giro</th><th>Auto</th><th>Quando</th></tr></thead><tbody>${s.bestLaps.map(b=>`<tr><td><b>${esc(b.display)}</b></td><td class="right"><b style="color:var(--acc2)">${esc(b.time)}</b></td><td class="muted">${esc(b.car ?? '—')}</td><td class="muted">${esc((b.at||'').slice(0,10))}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Importa la tua prima gara: il miglior giro viene registrato dal file risultati.</div>', { note: 'dai file risultato di EVO' });
  const tracksTab = stPan('Piste corse', STI.book, s.tracks.length
    ? `<table><thead><tr><th>Pista</th><th class="right">Gare</th><th class="right">Vittorie</th><th class="right">Best</th></tr></thead><tbody>${s.tracks.map(x=>`<tr><td><b>${esc(x.display)}</b></td><td class="right">${x.races}</td><td class="right">${x.wins?'<span style="color:var(--good);font-weight:700">'+x.wins+'</span>':'0'}</td><td class="right">${x.bestLap?`<b>${esc(x.bestLap.time)}</b>`:'—'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Ancora nessuna pista.</div>');
  const seasonsTab = stPan('Stagioni', STI.scroll, s.seasons.length
    ? `<table><thead><tr><th>Stagione</th><th>Serie</th><th class="right">Pos</th><th class="right">Punti</th><th>Contratto</th></tr></thead><tbody>${s.seasons.map(x=>`<tr><td><b>S${x.season}</b></td><td>${esc(x.display)}</td><td class="right"><b>P${x.position}</b></td><td class="right">${x.points}</td><td>${x.champion?'<span class="tag gold">titolo</span> ':''}${x.contract==='kept'?'<span class="tag good">clausole ✓</span>':x.contract==='failed'?'<span class="tag bad">clausole ✗</span>':''}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">La prima stagione è in corso.</div>');
  const sagaTab = s.saga?.length ? stPan('La saga', STI.book, `<table><thead><tr><th>#</th><th>Gara</th><th class="right">Pos</th><th class="right">Punti</th></tr></thead><tbody>${s.saga.slice().reverse().map((x,i)=>`<tr${x.dnf?' style="color:var(--bad)"':''}><td class="faint">${s.saga.length-i}</td><td>${esc(x.track)} <span class="faint">S${x.season} · ${esc(x.series)}</span></td><td class="right"><b>${x.dnf?'rit.':x.position?'P'+x.position:'—'}</b></td><td class="right">${x.points}</td></tr>`).join('')}</tbody></table>`, { note: 'ultime gare in ordine cronologico' }) : '';
  const ultimeTab = stPan('Ultime gare', STI.flag, s.history.length
    ? `<table><thead><tr><th>Gara</th><th class="right">Pos</th><th class="right">Giri</th><th class="right">Giro</th><th class="right">Gap</th><th class="right">Punti</th></tr></thead><tbody>${s.history.map(r=>`<tr${r.dnf?' style="color:var(--bad)"':''}><td>${esc(r.track)} <span class="faint">S${r.season} R${r.round}</span>${r.fl?' <span class="tag gold">gv</span>':''}</td><td class="right"><b>${r.dnf?'rit.':r.position?'P'+r.position:'—'}</b></td><td class="right">${r.laps ?? '—'}</td><td class="right">${r.bestLap?esc(r.bestLap):'—'}</td><td class="right">${fmtGap(r.gapMs)}</td><td class="right"><b>${r.points}</b></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Nessuna gara in archivio.</div>', { note: 'telemetria dal file di EVO' });
  m.innerHTML = `<div id="stats-vetrina">${vetrina}</div>${grafici}${numeri}
  <div class="grid2">${bestLaps}${tracksTab}</div>
  <div class="grid2">${seasonsTab}${sagaTab || ''}${ultimeTab}</div>`;
}
/* avatar "testuale" per i trofei: serve un contenitore visibile con l'emoji */
function rivalAvatarText(emoji, size = 38){
  return `<span class="rava st-trophy-ava" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.5)}px">${emoji ?? '🏆'}</span>`;
}

/* -------- Finanze: entrate e uscite dalla cassa (registro flussi) -------- */
async function drawBanca(m){
  const f = await api('flows');
  const rows = f.flows ?? [];
  const KIND = {
    prize:{icon:'🏆',label:'premio gara',side:'in'}, sponsor:{icon:'🤝',label:'sponsor',side:'in'},
    bonus:{icon:'⭐',label:'bonus',side:'in'}, contract:{icon:'📜',label:'contratto',side:'in'},
    income:{icon:'💰',label:'vendita',side:'in'}, seed:{icon:'🌱',label:'ripartenza',side:'in'},
    entry:{icon:'🎟️',label:'iscrizione',side:'out'}, rent:{icon:'🏠',label:'affitto',side:'out'},
    buy:{icon:'🛒',label:'acquisto',side:'out'}, penalty:{icon:'⚠️',label:'penalità',side:'out'},
    rep:{icon:'📊',label:'reputazione',side:null},
  };
  const tot = rows.reduce((a,r)=>{ const v=Number(r.money??0); if(!r.money) return a; (v>0?a.in:a.out)[0]+=0; if(v>0)a.in[0]+=v; else a.out[0]-=v; return a; }, {in:[0],out:[0]});
  const filtri=[['tutte',null],['entrate','in'],['uscite','out']];
  const rowsHtml = rows
    .filter(r=>bancaView.filter==='in' ? Number(r.money??0)>0 : bancaView.filter==='out' ? Number(r.money??0)<0 : true)
    .map((r)=>{ const k=KIND[r.kind]||{icon:'•',label:r.kind,side:null}; const m=Number(r.money??0);
      return `<tr><td class="faint" style="white-space:nowrap">${esc(String(r.at||'').slice(5,16).replace('T',' '))}</td><td>${k.icon} <span class="muted">${esc(k.label)}</span></td><td>${esc(r.reason??'')}</td><td class="right" style="white-space:nowrap">${m?`<span style="color:${m>0?'var(--good)':'var(--bad)'};font-weight:600">${m>0?'+':''}${money(m)} €</span>`:(r.rep?`<span class="faint">rep ${r.rep>0?'+':''}${r.rep}</span>`:'')}</td></tr>`;
    }).join('');
  m.innerHTML = `
  <div class="panel">
    <h2>${STI.euro} FINANZE <span class="h-act">saldo attuale ${money(boot.header.money)} € · ${tot.in[0]>0?'+'+money(tot.in[0]):'0'} € entrate · ${money(tot.out[0])} € uscite (ultimi ${rows.length} movimenti)</span></h2>
    <div style="display:flex;gap:6px;margin:8px 0 10px">${filtri.map(([id,lab])=>`<button class="mini ${bancaView.filter===id?'acc':''}" data-bf="${id}">${lab??id}</button>`).join('')}</div>
    ${rowsHtml
      ? `<table><thead><tr><th>Quando</th><th>Tipo</th><th>Motivo</th><th class="right">Importo</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
      : '<div class="empty">Nessun movimento del tipo scelto.</div>'}
    <div class="muted" style="margin-top:10px;font-size:12px">Il registro parte dalla nascita del registro flussi: i tempi passati della carriera risultano come un unico movimento "ripartenza", calcolato a posteriori.</div>
  </div>`;
  $$('button[data-bf]').forEach(b=>b.onclick=()=>{ bancaView.filter=b.dataset.bf; drawBanca(m); });
}
let bancaView = { filter:'tutte' };

