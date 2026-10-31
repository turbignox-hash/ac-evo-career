/* -------- calendario -------- */
async function drawCalendar(m){
  const cal = await api('calendar');
  m.innerHTML = `<div class="panel"><h2>${tr({ it: 'Calendario', en: 'Calendar' })} <span class="h-act">${esc(cal.node)} · ${tr({ it: 'stagione', en: 'season' })} ${cal.season}</span></h2>
  <table><thead><tr><th></th><th>${tr({ it: 'Round', en: 'Round' })}</th><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Gara', en: 'Race' })}</th><th class="right">${tr({ it: 'Ora', en: 'Time' })}</th><th>${tr({ it: 'Meteo', en: 'Weather' })}</th></tr></thead>
  <tbody>${cal.rounds.map(r=>`<tr class="${r.current?'cur':''}"><td>${r.played?'✓':r.current?'►':''}</td><td>R${r.index+1} ${esc(r.name)}</td><td>${window.trackLinkHtml(r.track)}</td><td class="right">${r.durationMin?`${r.durationMin}′ ${tr({ it: 'a tempo', en: 'by time' })}`:`${r.laps} ${tr({ it: 'giri', en: 'laps' })}`}</td><td class="right">${String(r.hour).padStart(2,'0')}:00</td><td class="muted">${esc(r.weather)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

/* -------- centro gare (ex Agenda, stile cockpit: calendario grande,
   pulsanti del tempo in evidenza, schede-gara racing a colpo d'occhio) --- */
const agendaView = { day: null, filter: 'tutte', disc: null };

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
    if (!a.nextRaceDay) return tr({ it: '⯈ Alla prossima gara di campionato', en: '⯈ To the next championship race' });
    const d = a.nextRaceDay - (a.day ?? 0);
    const strip = (a.strips ?? []).find(s => s.day === a.nextRaceDay);
    const when = strip?.date ?? `${tr({ it: 'giorno ', en: 'day ' })}${a.nextRaceDay}`;
    const far = d > 0 ? ` · ${tr({ it: 'tra ', en: 'in ' })}${d} ${d===1?tr({ it: 'giorno', en: 'day' }):tr({ it: 'giorni', en: 'days' })}` : '';
    return `${tr({ it: '⯈ recall: prossimo weekend (', en: '⯈ skip ahead: next race weekend (' })}${esc(when)}${far})`;
  };

  const dNames = new Map((a.disciplines ?? []).map(d => [d.id, d.name]));
  const gareCard = (g) => {
    const cls = g.stato === 'iscritto' ? 'ag-iscritto' : g.fattibile ? 'ag-fattibile' : 'ag-bloccata';
    const stato = g.stato === 'iscritto'
      ? `<span class="tag gold">★ ${tr({ it: 'iscritto', en: 'signed up' })}</span>`
      : g.fattibile
        ? `<span class="tag blue">${tr({ it: 'disponibile', en: 'available' })}</span>`
        : `<span title="${esc((g.gateReasons??[]).join(' · '))}">🔒 <span class="faint">${tr({ it: 'bloccata', en: 'locked' })}</span></span>`;
    const cta = g.isCurrent
      ? `<span class="tag gold ag-cta">▶ ${tr({ it: 'serie attuale — Cruscotto', en: 'current series — Dashboard' })}</span>`
      : g.fattibile
        ? `<button class="btn-cta" data-corri="${esc(g.nodeId)}" data-name="${esc(g.display)}">${tr({ it: 'SCEGLI PER OGGI', en: 'PICK FOR TODAY' })}</button>`
        : '';
    return `
    <div class="ag-card ${cls}" data-detail="${esc(g.nodeId)}" title="${tr({ it: 'passa col mouse sopra la scheda per il dettaglio della serie (o clicca)', en: 'hover the card for the series details (or click it)' })}">
      <div class="ag-top">
        <span class="ag-round">R${g.roundIndex+1}<i>/${g.totalRounds}</i></span>
        <span class="ag-disc" title="${esc(dNames.get(g.discipline) ?? g.discipline ?? '')}">${discIcon(dNames.get(g.discipline) ?? g.discipline)}</span>
        <div class="ag-nome" style="flex:1;min-width:0">${esc(g.display)}</div>
        <span class="ag-ora">${String(g.hour).padStart(2,'0')}:00</span>
      </div>
      <div class="ag-track">␦ ${esc(g.track)}${g.laps?` · ${g.laps} ${tr({ it: 'giri', en: 'laps' })}`:''}${g.scheduledDay && a.viewDay ? (g.scheduledDay === a.viewDay ? '' : ` · <span class="tag gold">${tr({ it: 'in agenda il ', en: 'scheduled for ' })}${esc(a.viewLabel ?? '')}</span>`) : ''}</div>
      <div class="ag-bot">
        <span class="prz">${money(g.prize??0)}</span>
        <span class="aut">${g.gridSize??'—'} ${tr({ it: 'AUTO', en: 'CARS' })}</span>
        ${g.griglia === 'monomarca' ? `<span class="tag blue" title="${tr({ it: 'griglia con la sola auto della serie', en: 'grid limited to the series car' })}">${tr({ it: 'monomarca', en: 'one-make' })}</span>` : ''}
        ${g.griglia && g.griglia.indexOf('multi-marca') === 0 ? `<span class="tag gold" title="${tr({ it: "griglia multi-marca: pool d'epoca dichiarato per la serie", en: 'multi-class grid: declared vintage pool for the series' })}">${esc(g.griglia)}</span>` : ''}
        ${g.late ? `<span class="tag gold">⚠ ${tr({ it: 'in ritardo', en: 'running late' })}</span>` : ''}
        ${stato}
        ${cta}
      </div>
    </div>`;
  };

  const discChips = [{id:null,name:tr({ it: 'tutte le discipline', en: 'all disciplines' })}].concat(a.disciplines).map(d =>
    `<button class="chip-f ${agendaView.disc===d.id?'on':''}" data-disc="${d.id??''}"><span class="cf-ico">${discIcon(d.name)}</span>${esc(d.name)}</button>`).join('');
  const filterChips = [
    ['tutte',tr({ it: 'TUTTE', en: 'ALL' })], ['fattibili',tr({ it: 'DISPONIBILI', en: 'AVAILABLE' })], ['iscritte',tr({ it: 'ISCRITTE', en: 'SIGNED' })], ['bloccate',tr({ it: 'BLOCCATE', en: 'LOCKED' })],
  ].map(([id,label]) =>
    `<button class="chip-f ${agendaView.filter===id?'on':''}" data-af="${id}">${label}</button>`).join('');
  // "nascondi le già iniziate": spegne le gare in corso/ritardo della giornata vista
  const hideStarted = `<button class="chip-f ${agendaView.hideStarted?'on':''}" data-hidestarted="1" title="${tr({ it: 'nasconde le gare che sono già in programma da prima (in corso o in ritardo): restano solo quelle che partono esattamente nel giorno in vista', en: 'hides races that were already scheduled before (running or late): only races that start exactly on the day in view remain' })}">${agendaView.hideStarted?'☑':'☐'} ${tr({ it: 'nascondi gare già iniziate', en: 'hide races already started' })}</button>`;
  const strip = (a.strips??[]).map(s => {
    const side = s.mine ? `<i class="mine">+${s.mine}</i>` : '';
    return `<button class="ag-day ${s.today?'today':''} ${s.mine?'hasmine':''}" data-goday="${s.day}" title="${esc(s.date)}: ${s.total} ${tr({ it: 'gare', en: 'races' })} (${s.available} ${tr({ it: 'fattibili', en: 'pickable' })})${s.mine?`, ${s.mine} ${tr({ it: 'del tuo campionato (oro)', en: 'from your championship (gold)' })}`:''}">
      <span class="ag-day-date">${esc(s.date)}</span>
      <span class="ag-day-num">${s.total}</span>
      ${side}
    </button>`;
  }).join('');

  const impegniHtml = (a.impegni?.lista ?? []).length ? `<span class="impegni">(${a.impegni.iscritte} ${tr({ it: 'iscritte', en: 'signed' })}${a.impegni.conflitti.length?` · ⚠️ ${a.impegni.conflitti.length} ${a.impegni.conflitti.length===1?tr({ it: 'conflitto', en: 'conflict' }):tr({ it: 'conflitti', en: 'conflicts' })}`:''})</span>` : '';
  // ORE SPOSTABILI (1/11, richiesta Mauro: «due gare lo stesso giorno, uno la
  // mattina e una la sera»): accanto a ogni gara del conflitto un selettore
  // dell'ORA. '' = torna l'ora scritta nel calendario; il resto = move della
  // SOLA ronda (la serie resta a cadenza fissa). Le gare del giorno si
  // riaccavagliano senza più dover slittare l'intera serie con «sposta ⯈».
  const oraOpts = (cur) => {
    const opt = (h) => `<option value="${h}" ${String(h)===String(cur)?'selected':''}>${String(h).padStart(2,'0')}:00</option>`;
    return `<option value="" ${cur===''?'selected':''}>${tr({ it: 'come calendario', en: 'as scheduled' })}</option>`
      + [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(opt).join('')
      + [0,1,2,3,4,5,22,23].map(opt).join('');
  };
  const conflittiHtml = (a.impegni?.conflitti ?? []).map((c) => `
    <div class="conflitto">
      <div>${esc(c.date)} — ${c.gare.length} ${tr({ it: 'gare iscritte lo stesso giorno:', en: 'races signed up on the same day:' })}</div>
      ${c.gare.map((g)=>`<span class="conf-item">
        <b>${esc(g.display)}</b> <span class="faint">R${g.roundIndex+1} · ${esc(g.track)}</span>
        <select class="mini ora-sel" data-ora-node="${esc(g.nodeId)}" data-ora-round="${g.roundIndex}" data-ora-cur="${g.hour ?? ''}" title="${tr({ it: 'sposta questa ronda a un\u2019altra ora (stesso giorno): 00 = torna l\u2019ora del calendario', en: 'move this round to a different hour (same day): 00 = back to the calendar hour' })}">${oraOpts(g.hour ?? 14)}</select>
        <button class="mini" data-shift="${esc(g.nodeId)}" title="${tr({ it: 'Sposta la serie in avanti di una cadenza (le prossime gare si spostano con lei)', en: 'Shift the series forward by one interval (upcoming races move with it)' })}">${tr({ it: 'sposta ⯈', en: 'shift ⯈' })}</button>
      </span>`).join('')}
    </div>`).join('');

  m.innerHTML = `
  <div class="panel ag-hero">
    <div class="ag-hero-top">
      <div class="ag-titolo">${tr({ it: 'CENTRO GARE', en: 'RACE CENTRE' })}</div>
      <div class="ag-data">⯅ ${esc(a.todayLabel)} <i>· ${tr({ it: 'giorno ', en: 'day ' })}${a.day}</i> ${impegniHtml}</div>
    </div>
    <div class="ag-controls">
      <button class="btn-time primary" id="ag-advance">⯈ ${tr({ it: 'AVANZA UN GIORNO', en: 'ADVANCE ONE DAY' })}</button>
      <button class="btn-time" id="ag-next">${nextRaceBtn(a)}</button>
    </div>
    ${conflittiHtml}
    <div class="ag-strip">${strip}</div>
  </div>
  <div class="panel">
    <div class="gare-head">
      <div class="gare-title">${tr({ it: 'GARE DEL GIORNO', en: 'RACES OF THE DAY' })}</div>
      <div class="chipbar">${filterChips}</div>
    </div>
    <div class="chipbar" style="margin-bottom:10px">${hideStarted}${discChips}</div>
    <div id="gare-wrap">…</div>
  </div>`;
  // dopo un avanzamento il boot andava ridato: paintHeader(boot.header) qui repingeva
  // la data VECCHIA (boot già risolto prima dell'avanzamento) → la data sembrava ferma
  $('#ag-advance').onclick = async () => { await api('agenda-advance', { method:'POST' }); agendaView.day = null; await refreshBoot(); render(); };
  const nb = $('#ag-next'); if (nb) nb.onclick = async () => { await api('agenda-skip-to-next', { method:'POST' }); agendaView.day = null; await refreshBoot(); render(); };
  $$('button[data-af]').forEach(b => { b.onclick = () => { agendaView.filter = b.dataset.af; drawAgenda(m); }; });
  $$('button[data-hidestarted]').forEach(b => { b.onclick = () => { agendaView.hideStarted = !agendaView.hideStarted; drawAgenda(m); }; });
  $$('button[data-disc]').forEach(b => { b.onclick = () => { agendaView.disc = b.dataset.disc || null; drawAgenda(m); }; });
  $$('button[data-goday]').forEach(b => { b.onclick = () => { agendaView.day = Number(b.dataset.goday); drawAgenda(m); }; });
  $$('button[data-corri]').forEach(b => { b.onclick = async () => {
    b.disabled = true;
    try {
      await api('agenda-choose', { method:'POST', body:{ nodeId: b.dataset.corri, day: agendaView.day ?? undefined } });
      toast(tr({ it: 'Gara scelta per oggi ✔ (serie attiva nel cruscotto)', en: "Race picked for today ✔ (series now active on the Dashboard)" }), 'ok');
      tab = 'calendar'; drawNav(); render();
    } catch(e){ toast(e.message, 'err'); b.disabled = false; }
  }; });
  $$('button[data-shift]').forEach(b => { b.onclick = async () => {
    await api('agenda-shift', { method:'POST', body:{ nodeId: b.dataset.shift } });
    render();
  }; });
  // selettore ora per ronda (1/11): '' REINSERISCE l'ora del calendario;
  // qualunque altro valore è l'ora nuova di QUESTA ronda sola.
  $$('select[data-ora-node]').forEach(s => { s.onchange = async () => {
    try {
      const r = await api('agenda-hour', { method:'POST', body:{ nodeId: s.dataset.oraNode, roundIndex: Number(s.dataset.oraRound), hour: s.value } });
      toast(r.hour == null
        ? tr({ it: 'Ora della ronda tornata a calendario ✔', en: 'Round hour back to calendar ✔' })
        : tr({ it: `Ronda spostata alle ${String(r.hour).padStart(2,'0')}:00 ✔`, en: `Round moved to ${String(r.hour).padStart(2,'0')}:00 ✔` }), 'ok');
      render();
    } catch(e){ toast(e.message, 'err'); }
  }; });
  // "GARE DEL GIORNO" si riempie qui: conteggio + card racing in un colpo solo
  const wrapEl = $('#gare-wrap');
  {
    // stesso filtro di prima: "nascondi gare già iniziate" toglie late e champStarted
    const lista = agendaView.hideStarted ? a.gare.filter(g => !(g.late || g.champStarted)) : a.gare;
    const nascoste = a.gare.length - lista.length;
    const gt = $('.gare-title');
    if (gt) gt.insertAdjacentHTML('beforeend', `<span class="tuttecount">${lista.length} ${tr({ it: 'a programma', en: 'on the schedule' })}${nascoste>0?` · ${nascoste} ${tr({ it: 'nascoste', en: 'hidden' })}`:''} · ${tr({ it: 'max ', en: 'max ' })}${a.maxScelte}${tr({ it: '/giornata', en: '/day' })}</span>`);
    if (!lista.length) wrapEl.innerHTML = `<div class="muted">${tr({ it: 'Nessuna gara corrisponde ai filtri in questo giorno. Prova un altro giorno dalla striscia calendario.', en: 'No race matches the filters on this day. Try another day from the calendar strip.' })}</div>`;
    else wrapEl.innerHTML = `<div class="ag-grid">${lista.map(gareCard).join('')}</div>`;
    // ricola i click (le card sono appena create) — e DAL 27/10 l'APERTURA
    // al passaggio del mouse: lo stesso dettaglio che prima voleva il click.
    // Per non far piovere modali mentre il mouse attraversa la griglia,
    // l'hover ATTESA 380ms: se svani prima la scheda non apre niente; se
    // ti fermi (o clicchi) la scheda si apre come prima. Il bottone SCEGLI
    // e gli altri comandi restano untouched: i click sui button non aprono
    // la scheda né in hover né al click. */
    $$('.ag-card', wrapEl).forEach(el => {
      /* i timer vivono sull'ELEMENTO (el._hov / el._esco) e non in variabili
         di chiusura: il pannello volante, quando il cursore entra in lui,
         deve poter cancellare il ritardo di chiusura della card (vedi
         agPopHover) — a distanza non può toccare le locali. */
      const apri = () => { agPopChiudi(); raceCardModal(el.dataset.detail, a.viewDay); };
      el.onmouseenter = () => { clearTimeout(el._hov); clearTimeout(el._esco); clearTimeout(AG_POP_ESC); el._hov = setTimeout(() => agPopHover(el, a.viewDay), 380); };
      // mousemove si ricorda DOVE sta il cursore: la volante si ancora a LUI
      el.onmousemove = (e) => { el._mx = e.clientX; el._my = e.clientY; };
      // al lascio della card: fermare il timer che non ha ancora aperto e
      // chiudere la volante DOPO 100ms di garanzia — il tempo di passare dalla
      // card al pannello. Ma se DENTRO 100ms il cursore entra nel pannello,
      // quello cancella el._esco (vedi sotto) e resta aperto a leggere.
      // La scheda nata da CLICK resta fino alla chiusura esplicita, come
      // sempre. (richiesta Mauro 31/10 e 27/10: «non deve stare aperta, si
      // chiude appena esco dalla card»)
      el.onmouseleave = () => { clearTimeout(el._hov); clearTimeout(el._esco); el._esco = setTimeout(agPopChiudi, 100); };
      el.onclick = (e) => {
        if (e.target.closest('button')) return;
        clearTimeout(el._hov); clearTimeout(el._esco);
        apri();
      };
    });
    $$('button[data-corri]', wrapEl).forEach(b => { b.onclick = async () => {
      b.disabled = true;
      try {
        await api('agenda-choose', { method:'POST', body:{ nodeId: b.dataset.corri, day: agendaView.day ?? undefined } });
        toast(tr({ it: 'Gara scelta per oggi ✔ (serie attiva nel cruscotto)', en: "Race picked for today ✔ (series now active on the Dashboard)" }), 'ok');
        tab = 'calendar'; drawNav(); render();
      } catch(e){ toast(e.message, 'err'); b.disabled = false; }
    }; });
  }
}

/* -------- scheda-gara volante ALL'HOVER (27/10, seconda versione) --------
   Prima (31/10) l'hover apriva la MODALE a tutto schermo come il click: il
   fondale di quella modale copriva la card, il mouse perdeva l'hover e la
   scheda pulsava ad intermittenza (chiusa → raiperta → chiusa) — E centrate
   nello schermo, mai dove stava il cursore («centrata rispetto il mouse»).
   Ora l'hover costruisce un PANNELLO VOLANTE ancorato al cursore: si chiude
   al lascio della card (100 ms di garanzia per fare due passi fino a lui) e
   resta fermo mentre lo leggi. La modale a pieno schermo resta SOLO per il
   click — che chiude la volante e apre la scheda intera come sempre. */
let AG_POP = null, AG_POP_ESC = 0;
function agPopChiudi(){ clearTimeout(AG_POP_ESC); if (AG_POP) { AG_POP.remove(); AG_POP = null; } }
async function agPopHover(el, day){
  let d;
  try { d = await api('agenda-detail', { nodeId: el.dataset.detail, day }); }
  catch(e){ return; }   /* svani mentre aspettavamo la risposta: niente pannello orfano */
  if (!el.matches(':hover')) return;   /* uscito dalla card: non apre nulla */
  const rpos = el.getBoundingClientRect();
  const mx = el._mx ?? (rpos.left + rpos.width / 2);
  const my = el._my ?? (rpos.top + rpos.height / 2);
  agPopChiudi();
  const pop = document.createElement('div');
  pop.className = 'ag-pop'; pop._per = el;
  pop.innerHTML = `<div class="ag-pop-h"><span>${esc(d.display)}${d.roundName ? ' — ' + esc(d.roundName) : ''}</span><span class="ag-pop-x" title="${esc(tr({ it: 'chiudi (o esci dalla card)', en: 'close (or leave the card)' }))}">×</span></div>${raceCardBody(d)}`;
  /* NOTA: appesa al BODY, non a #modal-root — quel contenitore, quando non
     vuoto, diventa fondale scuro a tutto schermo con centro forzato (CSS
     :not(:empty)): la stessa trappola che causava pulsazione e
     «centrata lontano dal mouse». Nel body la volante vive da sé. */
  document.body.appendChild(pop);
  AG_POP = pop;
  pop.onmouseenter = () => { const p = pop._per; if (p) { clearTimeout(p._esco); clearTimeout(p._hov); } };
  pop.onmouseleave = () => agPopChiudi();
  $('.ag-pop-x', pop).onclick = () => agPopChiudi();
  /* POSIZIONE: centrata orizzontalmente sul cursore, sotto di lui; se in basso
     manca lo spazio si capovolge SOPRA il cursore. Sbordare dallo schermo: non. */
  const r = pop.getBoundingClientRect();
  pop.style.left = Math.min(Math.max(8, mx - r.width / 2), Math.max(8, innerWidth - r.width - 8)) + 'px';
  pop.style.top = (my + 20 + r.height > innerHeight - 8 ? Math.max(8, my - r.height - 20) : my + 20) + 'px';
}
function raceCardBody(d){
  const auto = (d.cars ?? []).join(', ') || '—';
  const cal = (d.calendar ?? []).map((r) => {
    const mark = r.played ? '✓' : r.current ? '►' : '';
    return `<div style="display:flex;gap:8px;align-items:baseline;padding:1px 0">
      <span style="width:16px;color:${r.played?'var(--ok,#7bd88f)':'inherit'}">${mark}</span>
      <span class="faint" style="min-width:38px">R${r.index+1}/${d.calendar.length}</span>
      <span ${r.current?'style="font-weight:700"':''}>${window.trackLinkHtml(r.track)}</span>
      <span class="faint">· ${r.laps??'—'} ${tr({ it: 'giri', en: 'laps' })} · ${String(r.hour).padStart(2,'0')}:00</span>
    </div>`;
  }).join('');
  const standings = d.started && d.standings
    ? `<div class="muted" style="margin:8px 0 4px">${tr({ it: 'Classifica in corso (stagione ', en: 'Current standings (season ' })}${d.season}):</div>
      <table><tbody>${d.standings.map(r=>`<tr class="${r.isPlayer?'me':''}"><td class="faint">P${r.position}</td><td>${esc(r.name)}</td><td class="right">${r.points} pt</td></tr>`).join('')}</tbody></table>`
    : `<div class="muted" style="margin-top:8px">${tr({ it: 'La stagione non è ancora cominciata: nessun punto in palio finora.', en: 'The season has not started yet: no points awarded so far.' })}</div>`;
  const mie = (d.mine ?? []).length
    ? `<div class="muted" style="margin:8px 0 2px">${tr({ it: 'I tuoi risultati in questa stagione:', en: 'Your results this season:' })}</div>
      ${d.mine.map(r=>`<span class="muted" style="margin-right:12px">R${r.round+1}: <b>${r.position}</b>${r.fl?` · ${tr({ it: 'giro veloce', en: 'fastest lap' })}`:''} · ${r.points} pt · ${window.trackLinkHtml(r.track)}</span>`).join('')}`
    : '';
  const statoTxt = d.stato === 'iscritto'
    ? `<span class="tag gold">★ ${tr({ it: 'tuo campionato', en: 'your championship' })}</span>`
    : d.fattibile ? `<span class="tag blue">${tr({ it: "fattibile: puoi firmare dall'agenda", en: 'pickable: sign up from the Agenda' })}</span>`
    : `<span class="tag gold" title="${esc((d.gateReasons??[]).join(' · '))}">🔒 ${(d.gateReasons??[])[0] ?? tr({ it: 'bloccata', en: 'locked' })}</span>`;
  return `
    <div class="row" style="gap:6px;flex-wrap:wrap">${statoTxt}
      <span class="faint">L${d.level} · ${esc(d.discipline)} · ${tr({ it: 'stagione ', en: 'season ' })}${d.season}</span></div>
    <div style="margin:8px 0 2px"><b>${esc(d.roundName ?? '')}</b> — ${esc(d.track)} · ${d.laps??'—'} ${tr({ it: 'giri', en: 'laps' })} · ${tr({ it: 'ore ', en: 'at ' })}${String(d.hour).padStart(2,'0')}:00${d.weather?' · '+esc(d.weather):''}</div>
    <div class="muted">${tr({ it: 'Griglia: ', en: 'Grid: ' })}${d.gridSize??'—'} ${tr({ it: 'auto', en: 'cars' })}${d.griglia ? ` · <b>${esc(d.griglia)}</b>`:''} · ${tr({ it: 'premio ', en: 'prize ' })}${money(d.prize??0)} € · ${tr({ it: 'iscrizione ', en: 'entry fee ' })}${money(d.entryFee??0)} €${d.repRequired?` · ${tr({ it: 'reputazione richiesta ', en: 'reputation required ' })}${d.repRequired}`:''}</div>
    <div class="muted" style="margin-top:6px"><b>${tr({ it: 'Auto della serie:', en: 'Series cars:' })}</b> ${esc(auto)}</div>
    ${d.joinNote ? `<div class="tag gold" style="margin-top:6px;display:inline-block">⚠️ ${esc(d.joinNote)}</div>` : ''}
    <div class="sig-prev" style="margin-top:8px"><div class="muted" style="margin-bottom:4px">${tr({ it: 'Calendario della stagione:', en: 'Season calendar:' })}</div>${cal}</div>
    ${mie}
    ${standings}`;
}

/* -------- scheda-gara cliccabile in Agenda -------- */
async function raceCardModal(nodeId, day, hos = null){
  let d;
  try { d = await api('agenda-detail', { nodeId, day }); }
  catch(e){ toast(e.message, 'err'); return; }
  // HOVER (31/10): il dettaglio arriva in ritardo — se il mouse è già
  // uscito dalla card mentre aspettavamo la risposta, la scheda non
  // apre affatto: sarebbe una modale orfana senza chi che la tenga.
  if (hos && !hos.matches(':hover')) return;
  const r = modal(`${esc(d.display)}${d.roundName ? ' — ' + esc(d.roundName) : ''}`, raceCardBody(d),
    [[d.stato === 'iscritto' && d.isCurrent ? tr({ it: 'Vai in pista (Cruscotto)', en: 'Go racing (Dashboard)' }) : tr({ it: 'Chiudi', en: 'Close' }), 'act', () => {
      if (d.stato === 'iscritto' && d.isCurrent) { tab='dashboard'; drawNav(); render(); }
    }]]);
  // nata dal passaggio del mouse (31/10): si marchia HOVER — al mouseleave
  // della card l'handler qui sopra (nel loop delle .ag-card) la chiude;
  // ma se il mouse ENTRA nel pannello la scheda diventa stabile: l'utente
  // la sta leggendo, merita la chiusura esplicita come una scheda da click.
  if (hos) {
    const pan = $('.modal', r);
    if (pan) { pan.dataset.hover = '1'; pan.onmouseenter = () => delete pan.dataset.hover; }
  }
}

/* -------- I CINQUE MISCUGLI (28/10, richiesta Mauro: sezione dedicata in GUI) --------
   Schede dei cinque campionati a pescaggio random, ANCHE quando non hai firmato
   il sedile: pool sorteggiato con seme, regole (con tag cap), calendario. Ogni
   nome auto/pista è cliccabile (libro auto/piste), come per le serie firmate. */
function stilePannello(stili){
  if (!(stili ?? []).length) return '';
  const pct = (x) => Number(x ?? 0).toFixed(1).replace(/\.0$/, '') + '%';
  const stateTag = (s) => s.isCurrent
    ? `<span class="tag gold">${tr({ it: 'attiva', en: 'active' })}</span>`
    : s.iscritto ? `<span class="tag green">${tr({ it: 'iscritto', en: 'signed' })}</span>`
    : s.sbloccato ? `<span class="tag green">${tr({ it: 'sedile aperto', en: 'seat open' })}</span>`
    : `<span class="tag warn">${tr({ it: 'rep ', en: 'rep ' })}${s.rep}/${s.repRequired}</span>`;
  const cards = stili.map((s) => {
    const atCap = (s.regole ?? []).filter((r) => r.cap).length;
    return `<details style="margin-bottom:10px;border:1px solid var(--line,#333);border-radius:8px;padding:10px">
      <summary style="cursor:pointer"><b>${esc(s.display)}</b> ${stateTag(s)} <span class="tag blue">L${s.level}</span>
        <span class="muted" style="font-size:11px"> · ${tr({ it: 'finestra PI ', en: 'PI window ' })}${s.finestra[0] ?? '–'}–${s.finestra[1] ?? '–'}${s.seed ? ` · seed ${esc(s.seed)}` : ''} · ${s.pool.length} ${tr({ it: 'modelli', en: 'models' })}${atCap ? ` · <span class="tag warn">${atCap} ${tr({ it: 'al cap 20%', en: 'at 20% cap' })}</span>` : ''}</span></summary>
      <div style="margin-top:8px;font-size:12.5px">
        <div><b>${tr({ it: 'Pool sorteggiato:', en: 'Drawn pool:' })}</b> <span class="muted">${tr({ it: 'miscuglio completamente random: stradali, Cup, GT e epiche battuti insieme allo stesso livello, mono e multiclasse insieme.', en: 'completely random mix: road cars, Cup, GT and classics shuffled together at the same level, mono and multiclass alike.' })}</span></div>
        <div style="margin-top:4px">${(s.pool ?? []).map(window.carLinkHtml).join(' · ') || '<span class="faint">—</span>'}</div>
        <div style="margin-top:8px"><b>${tr({ it: 'Calendario:', en: 'Calendar:' })}</b> ${(s.calendario ?? []).map(window.trackLinkHtml).join(' → ') || '<span class="faint">—</span>'}</div>
        <table style="margin-top:8px"><thead><tr><th>${tr({ it: 'Auto', en: 'Car' })}</th><th class="right">${tr({ it: 'Zavorra / Penalità', en: 'Ballast / Penalty' })}</th></tr></thead>
        <tbody>${(s.regole ?? []).map((r) => `<tr><td>${window.carLinkHtml(r.auto)}</td><td class="right">${r.kg}kg / ${pct(r.pct)}${r.cap ? ` <span class="tag warn" title="${tr({ it: 'fuori formula (baseline o oltre il cap): la prima gara decide con griglia-calib', en: 'out of formula (baseline or over cap): the first race decides with grid-calib' })}">${tr({ it: 'cap', en: 'cap' })}</span>` : ''}</td></tr>`).join('')}</tbody></table>
      </div>
    </details>`;
  }).join('');
  return `<div class="panel" style="padding:14px 16px">
    <h2 style="margin:0 0 8px">${ICONS.championships} ${tr({ it: 'Cinque campionati a miscuglio', en: 'Five random-mix championships' })}</h2>
    <div class="muted" style="font-size:11.5px;margin-bottom:10px">${tr({ it: 'Pools sorteggiati a sorte dal catalogo. Il seme riproduce la tiratura; ogni ritiro del generatore cambia tutto: node tools/_genera-stili.mjs --rigenera.', en: 'Pools drawn at random from the catalog. The seed reproduces the draw; every new draw changes everything: node tools/_genera-stili.mjs --rigenera.' })}</div>
    ${cards}
  </div>`;
}

/* -------- campionati: le serie iscritte coi loro calendari e classifiche -------- */
async function drawChampionships(m){
  const [v, stiliData] = await Promise.all([api('championships'), api('stili').catch(() => ({ stili: [] }))]);
  /* PANNELLO MONDIALE a pieghevole (30/10): la partenza stagnante della barra
     (prima scheda 'standings') ora vive QUI, in fondo alla pagina dei
     campionati — stessa funzione, posto meno in barra e un posto scelto. */
  let mondo = null;
  try { mondo = await worldRankingInner(); } catch { /* che la pagina dei campionati resti anche senza mondo */ }
  if (!(v.championships ?? []).length) {
    m.innerHTML = `<div class="panel"><h2>${tr({ it: 'Campionati', en: 'Championships' })}</h2><div class="empty">${tr({ it: 'Nessun campionato iscritto: firma un sedile dal Centro gare quando la giornata ti offre una serie adatta.', en: 'No championship signed up: grab a seat from the Race Centre when the day offers a suitable series.' })}</div></div>` + stilePannello(stiliData.stili ?? []);
    return;
  }
  // BADGE cliccabili in alto: ogni campionato in corso con auto, pista e prossimo
  // round. Un click porta direttamente alla scheda del campionato, senza sfogliare
  // tutta la pagina quando i campionati sono tanti.
  /* CARTE SERIE (31/10, richiesta grafica): i badge sottili diventano carte
     vere — nome, livello, auto, barra di avanzamento della stagione, prossimo
     round, posizione tua. La scheda completa sta sotto in pieghevole (aperto
     solo per la serie attiva): la pagina resta leggibile anche con 16 serie. */
  /* SEZIONE ARRICHITA (1/11, «troppo scarna»: le card ora raccontano
     premio per gara, griglia tipica, rep richiesta e la prossima ronda
     COMPLETA di data vera, ora (override «ore spostabili» compreso) e meteo:
     gli stessi numeri della scheda gara, senza andarsela a cercare. */
  const cards = v.championships.map((c) => {
    const played = c.calendar.filter(r=>r.played).length;
    const pct = c.calendar.length ? Math.round(played / c.calendar.length * 100) : 0;
    const nr = c.nextRound;
    const nxt = nr
      ? `R${nr.index + 1} · ${esc(nr.track)} · ${String(nr.hour ?? 0).padStart(2,'0')}:00${nr.weather ? ` · ${esc(nr.weather)}` : ''}${nr.dateLabel ? `<br><span class="faint">${esc(nr.dateLabel)}</span>` : ''}`
      : tr({ it: 'calendario finito', en: 'calendar over' });
    const me = (c.standings ?? []).find(r=>r.isPlayer);
    return `<div class="champ-card ${c.isCurrent ? 'cur' : ''}" data-node="${esc(c.nodeId)}" title="${esc(c.display)} — ${tr({ it: 'clicca per la scheda completa', en: 'click for the full card' })}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
        <b style="font-size:13.5px">${esc(c.display)}</b>
        ${c.isCurrent ? `<span class="tag gold" style="font-size:9px">${tr({ it: 'attiva', en: 'active' })}</span>` : ''}
      </div>
      <div class="muted" style="font-size:11px;margin-top:2px">L${c.level} · ${esc(c.discipline)} · ${(c.cars ?? []).map(window.carLinkHtml).join(' · ')}</div>
      <div class="cc-bar" style="margin-top:8px"><i style="width:${pct}%"></i></div>
      <div class="muted" style="font-size:11.5px;margin-top:6px">${played}/${c.calendar.length} ${tr({ it: 'gare', en: 'races' })} · ${tr({ it: 'prossima', en: 'next' })}: ${nxt}${me ? ` · <b style="color:var(--text)">${tr({ it: 'tu P', en: 'you P' })}${me.position}</b> (${me.points} pt)` : ''}</div>
      <div class="muted" style="font-size:11px;margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">
        ${c.prize != null ? `<span title="${tr({ it: 'premio di gara', en: 'race prize' })}">🏁 ${money(c.prize)}</span>` : ''}
        ${c.entryFee ? `<span title="${tr({ it: 'costo d\'iscrizione', en: 'entry fee' })}">🎫 ${money(c.entryFee)}</span>` : ''}
        ${c.gridSize ? `<span title="${tr({ it: 'griglia tipica degli avversari', en: 'typical grid size' })}">🚗 ${c.gridSize} ${tr({ it: 'auto', en: 'cars' })}</span>` : ''}
        ${c.repRequired ? `<span title="${tr({ it: 'reputazione richiesta per iscriversi', en: 'reputation required to sign up' })}">⭐ ${c.repRequired}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  m.innerHTML = `<div class="panel" style="padding:14px 16px">
    <h2 style="margin:0 0 10px">${ICONS.championships} ${tr({ it: 'Campionati', en: 'Championships' })} <span class="h-act">${v.championships.length} ${tr({ it: 'serie firmate', en: 'signed series' })}</span></h2>
    <div class="champ-grid">${cards}</div>
    <div class="muted" style="font-size:11.5px;margin-top:8px">${tr({ it: 'Clicca una carta per scendere alla scheda completa.', en: 'Click a card to jump to its full card below.' })}</div>
  </div>`
    + stilePannello(stiliData.stili ?? [])
    + v.championships.map((c) => {
    const rounds = c.calendar.map((r) => {
      const mark = r.played ? '✓' : r.current ? '►' : '';
      return `<div style="display:flex;gap:8px;align-items:baseline;padding:1px 0">
        <span style="width:16px;color:${r.played?'var(--ok,#7bd88f)':'inherit'}">${mark}</span>
        <span class="faint" style="min-width:38px">R${r.index+1}/${c.calendar.length}</span>
        <span>${esc(r.track)}</span>
        <span class="faint">· ${r.laps??'—'} ${tr({ it: 'giri', en: 'laps' })} · ${String(r.hour).padStart(2,'0')}:00</span>
      </div>`;
    }).join('');
    const mine = (c.mine ?? []).length
      ? `<div class="muted" style="margin:6px 0 2px">${tr({ it: 'I tuoi risultati (', en: 'Your results (' })}${c.mine.length} ${tr({ it: 'gare):', en: 'races):' })}</div>
        ${c.mine.map(r=>`<span class="muted" style="margin-right:12px">R${r.round+1}: <b>${r.position}</b>${r.fl?' · giro veloce':''} · ${r.points} pt · ${window.trackLinkHtml(r.track)}</span>`).join('')}`
      : `<div class="muted" style="margin:6px 0">${tr({ it: 'Ancora nessuna gara corsa in questa stagione.', en: 'No race run yet this season.' })}</div>`;
    const table = c.standings
      ? `<table><thead><tr><th></th><th>${tr({ it: 'Pilota', en: 'Driver' })}</th><th class="right">${tr({ it: 'Punti', en: 'Points' })}</th></tr></thead>
        <tbody>${c.standings.map(r=>`<tr class="${r.isPlayer?'me':''}"><td class="faint">P${r.position}</td><td>${esc(r.name)}${r.isPlayer?` <span class="tag gold">${tr({ it: 'tu', en: 'you' })}</span>`:''}</td><td class="right">${r.points}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${tr({ it: 'Classifica non disponibile.', en: 'Standings not available.' })}</div>`;    return `<details class="panel champ-detail" id="champ-${esc(c.nodeId)}" ${c.isCurrent ? 'open' : ''} style="margin-top:12px">
      <summary style="cursor:pointer">
        <b>${esc(c.display)}</b> <span class="h-act">${tr({ it: 'stagione ', en: 'season ' })}${c.season}${c.isCurrent ? ` · <span class="tag gold">${tr({ it: 'serie attuale', en: 'current series' })}</span>` : ''}</span>
        <div class="muted" style="font-size:11px;margin-top:2px">L${c.level} · ${esc(c.discipline)} · ${tr({ it: 'una gara a settimana', en: 'one race a week' })}</div>
      </summary>
      <div style="margin-top:10px">
      <div class="grid2">
        <div>
          <div class="muted" style="margin-bottom:4px">${tr({ it: 'Calendario della stagione:', en: 'Season calendar:' })}</div>
          <div class="sig-prev">${rounds}</div>
          ${mine}
        </div>
        <div>
          <div class="muted" style="margin-bottom:4px">${tr({ it: 'Classifica:', en: 'Standings:' })}</div>
          ${table}
        </div>
      </div>
      </div>
    </details>`;
  }).join('')
    + (mondo ? `<details id="mondo-fold" class="panel" style="margin-top:14px"><summary style="cursor:pointer" title="${tr({ it: 'apri il quadro mondiale: piloti, skill e profili', en: 'open the world view: drivers, skill and profiles' })}"><b>${ICONS.iconic ?? '⭐'} ${tr({ it: 'Classifica Mondiale — prestigio', en: 'World Ranking — prestige' })}</b> <span class="muted">· ${mondo.w.total} ${tr({ it: 'piloti · tu sei P', en: 'drivers · you are P' })}<b>${mondo.w.myPosition}</b></span></summary>${mondo.html}</details>` : '');
  if (mondo) mondo.wire();
  /* arrivo dal tile «Classifica Mondiale» del Cruscotto: apro QUESTO pannello
     e lo porto in vista, così nientomai di nascondersi in fondo alla pagina. */
  if (window.__apriMondo) {
    window.__apriMondo = false;
    if (mondo) { const f = $('#mondo-fold'); if (f) { f.open = true; f.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
  }
  /* arrivo dal Cruscotto con la serie cliccata (31/10): apro la scheda della
     serie indicata e la porto in vista, come fa __apriMondo per il mondiale. */
  const AO = window.NAV_OPTS?.tab === 'championships' ? window.NAV_OPTS : null;
  if (AO?.apri) {
    window.NAV_OPTS = null;
    const sec = $(`#champ-${CSS.escape(AO.apri)}`);
    if (sec) { sec.open = true; sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  } else if (AO) window.NAV_OPTS = null;
  // click su una carta: apre il pieghevole della scheda e scende fluido.
  // LEZIONE 1/11 («porta a posizioni sbagliate»): prima la card RESTAVA aperta
  // su altra scheda e lo scroll atterrava sotto l'header. Ora: si chiudono gli
  // ALTRI pieghevoli (ne resta uno visibile: la scheda cliccata), si apre al
  // punto giusto e scroll-margin-top durata il header fra lo scatto e la sezione.
  $$('.champ-card').forEach(b => { b.onclick = () => {
    const sec = $(`#champ-${CSS.escape(b.dataset.node)}`);
    if (!sec) { toast(tr({ it: 'Scheda della serie non trovata: aggiornare il tab.', en: 'Series card not found: refresh the tab.' }), 'err'); return; }
    $$('.champ-detail', m).forEach(d => { if (d !== sec) d.open = false; });
    sec.open = true;
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }; });
}

/* il cuore della vista: estratto in builder per essere RICICLATO anche dal
   pannello piegato dentro Campionati (drawChampionships) — stesso HTML,
   stesso click scheda, un solo viso per il mondo */
async function worldRankingInner(){
  const w = await api('world-ranking');
  const html = `
  <h2>${ICONS.championships} ${tr({ it: 'Classifica Mondiale — prestigio', en: 'World Ranking — prestige' })} <span class="h-act">${w.total} ${tr({ it: 'piloti · tu sei P', en: 'drivers · you are P' })}${w.myPosition}</span></h2>
  <div class="muted" style="margin:-6px 0 10px">${tr({ it: "I più forti del mondo (le monoposto il vertice): skill innata di ogni pilota. La tua stima cresce passando a serie di livello più alto. <b>Clicca un pilota per la scheda completa.</b>", en: 'The strongest in the world (open-wheelers at the top): every driver\'s innate skill. Your estimate grows as you move up to higher-level series. <b>Click a driver for the full card.</b>' })}</div>
  <table><thead><tr><th class="right">#</th><th>${tr({ it: 'Pilota', en: 'Driver' })}</th><th></th><th class="right">${tr({ it: 'Skill', en: 'Skill' })}</th><th class="right">${tr({ it: 'Età', en: 'Age' })}</th><th>${tr({ it: 'Profilo', en: 'Profile' })}</th><th></th></tr></thead>
  <tbody>${w.rows.map(r=>`<tr class="${r.isPlayer?'me':''} wr-row" data-k="${esc(String(r.key))}" style="${r.isPlayer?'':'cursor:pointer'}">
    <td class="right pos"><b>P${r.position}</b></td>
    <td><span style="display:inline-flex;align-items:center;gap:8px">${rivalAvatar(r.name, 30)}<span><b>${esc(r.name)}</b>${r.isPlayer?` <span class="tag gold">${tr({ it: 'tu', en: 'you' })}</span>`:''}${r.hot?` <span title="${tr({ it: 'in forma: in griglia alza il ritmo', en: 'in form: raises the pace on the grid' })}">🔥</span>`:''}</span></span></td>
    <td class="faint">${flagOf(r.country)} ${esc(r.country)}</td><td class="right"><b>${r.skill}</b>${r.iconic?` <span title="${tr({ it: 'tra i più forti in circolazione', en: 'among the strongest around' })}">⭐</span>`:''}</td><td class="right">${r.age??'—'}</td>
    <td>${r.traits?.length?r.traits.map(t=>`<span class="chip blue" style="font-size:10px;padding:1px 6px">${esc(t)}</span>`).join(' '):''}</td>
    <td class="muted" style="font-size:11px">${esc(r.archName ?? '')}</td></tr>`).join('')}</tbody>
  </table>`;
  return { w, html, wire: () => { $$('.wr-row').forEach(t => { t.onclick = () => showWorldPilot(t.dataset.k, w.rows); }); } };
}

async function drawWorldRanking(m){
  const mo = await worldRankingInner();
  m.innerHTML = `<div class="panel">${mo.html}</div>`;
  mo.wire();
}

function showWorldPilot(name, rows){
  const r = rows.find(x => String(x.key) === String(name) || String(x.realName ?? x.name) === name);
  if (!r) return;
  modal(`${tr({ it: 'Scheda pilota — ', en: 'Driver card — ' })}${r.name}`, `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">${rivalAvatar(r.name, 46)}
        <div><b style="font-size:16px">${esc(r.name)}</b><div class="muted" style="font-size:12px">${flagOf(r.country)} ${esc(r.country ?? '')} · P${r.position} ${tr({ it: 'del mondo', en: 'in the world' })}${r.iconic?` · ⭐ ${tr({ it: 'tra i più forti', en: 'among the strongest' })}`:''}${r.hot?` · 🔥 ${tr({ it: 'in forma', en: 'in form' })}`:''}</div></div>
    </div>
    <div class="grid4" style="margin-bottom:12px">
      <div class="kpi"><div class="l">${tr({ it: 'Skill', en: 'Skill' })}</div><div class="v acc">${r.skill}</div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Età', en: 'Age' })}</div><div class="v">${r.age ?? '—'}</div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Costanza', en: 'Consistency' })}</div><div class="v">${r.cons != null ? r.cons : '—'}</div></div>
      <div class="kpi"><div class="l">${tr({ it: 'Aggressività', en: 'Aggression' })}</div><div class="v">${r.aggr != null ? r.aggr : '—'}</div></div>
    </div>
    <div style="margin-bottom:10px">${(r.traits ?? []).map(t=>`<span class="chip blue" style="font-size:11px;padding:2px 8px">${esc(t)}</span>`).join(' ')}</div>
    <div class="muted" style="margin-bottom:8px"><b>${esc(r.archName ?? 'n/d')}</b> — ${esc(r.archDesc ?? '')}</div>
    <div class="muted" style="font-size:12.5px">${r.isPlayer ? tr({ it: 'Questo sei tu: la skill cresce coi risultati reali (vittorie e podi spingono sopra la banda della serie).', en: 'This is you: skill grows with real results (wins and podiums push you above the series baseline).' }) : r.hot ? tr({ it: '🔥 È in forma: in griglia alza il ritmo, attenzione.', en: '🔥 In form: raises the pace on the grid, be careful.' }) : tr({ it: 'Statista in forma normale: dati in tempo reale aggiornati a ogni import di gara.', en: 'Steady performer in normal form: real-time data refreshed at every race import.' })}</div>
    ${r.iconic ? `<div class="banner info" style="margin-top:8px">⭐ ${tr({ it: 'Pilota <b>iconico</b> del World: il suo livello è tra il vertice in assoluto di questa carriera.', en: 'A <b>world-class</b> driver: skill at the very top level of this career.' })}</div>` : ''}`,
    [r.isPlayer ? null : [tr({ it: '✏️ Rinomina', en: '✏️ Rename' }), 'ghost', () => { window.rinominaPilota('world', r.key, r.name, r.realName).then(() => { document.querySelector('#modal-root').innerHTML = ''; render(); }); }], [tr({ it: 'Chiudi', en: 'Close' }), 'ghost',()=>{}]].filter(Boolean));
}

function serieDetail(n){
  const wxName = (w) => (({'Clear':tr({ it: 'sereno', en: 'clear' }),'Scattered clouds':tr({ it: 'nuvole sparse', en: 'scattered clouds' }),'Overcast':tr({ it: 'coperto', en: 'overcast' }),'Light rain':tr({ it: 'pioggia leggera', en: 'light rain' }),'Rain':tr({ it: 'pioggia', en: 'rain' }),'Heavy rain':tr({ it: 'pioggia forte', en: 'heavy rain' })}[w]) ?? w ?? '—');
  const repOk = n.rep>=(n.repRequired??0);
  const champ=(n.champSeasons??[]).length;
  const blocked = !n.open && (n.reasons?.length ? `<div class="banner warn" style="margin-top:12px"><b>${tr({ it: 'Reputazione insufficiente:', en: 'Reputation too low:' })}</b> ${n.reasons.map(esc).join(' · ')}</div>` : '');
  const auto = (n.carImages?.length ? n.carImages : (n.cars??[]).map(c=>({name:c,image:null}))).map(c=>`
    <div style="display:flex;align-items:center;gap:8px;background:#000;border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:0">
      ${c.image?`<img src="${c.image}" alt="" style="width:86px;height:48px;object-fit:cover;border-radius:5px">`:''}
      <span style="font-size:11.5px;line-height:1.25">${esc(c.name)}</span>
    </div>`).join('');
  const cal = (n.calendar??[]).map((r,i)=>`<tr>
    <td class="faint">R${i+1}</td><td>${window.trackLinkHtml(r.track)}</td><td class="right">${r.durationMin?`${r.durationMin}′ ${tr({ it: 'a tempo', en: 'by time' })}`:`${r.laps} ${tr({ it: 'giri', en: 'laps' })}`}</td>
    <td class="right">${String(r.hour).padStart(2,'0')}:00</td><td class="muted">${wxName(r.weather)}</td></tr>`).join('');
  const pts = n.pointsInfo ? `${tr({ it: 'Punti: ', en: 'Points: ' })}${n.pointsInfo.table.join('–')} ${n.pointsInfo.fl?`· +${n.pointsInfo.fl} ${tr({ it: 'giro veloce', en: 'fastest lap' })}`:''} ${n.pointsInfo.pole?`· +${n.pointsInfo.pole} ${tr({ it: 'pole', en: 'pole' })}`:''}` : '';
  const palmares = champ ? `<div style="margin-top:10px"><span class="tag gold">🏆 ${tr({ it: 'campione: stagioni ', en: 'champion: seasons ' })}${n.champSeasons.join(', ')}</span></div>`
    : n.bestFinish ? `<div class="muted" style="margin-top:10px">🏁 ${tr({ it: 'già corso: miglior risultato P', en: 'already raced: best result P' })}${n.bestFinish}</div>` : '';
  modal(`L${n.level} · ${esc(n.display)}`, `
    <div class="muted" style="margin-bottom:10px">${n.gridSize} ${tr({ it: 'auto in griglia · premio stagione ', en: 'cars on the grid · season prize ' })}<b>${money(n.econ.prize)} €</b>${n.access==='closed'?` · <b>${tr({ it: 'parco chiuso', en: 'spec grid' })}</b>: ${tr({ it: 'niente affitto né riscatto, solo contratto', en: 'no rent or buyout, contract only' })}`:`${n.econ.buy?` · ${tr({ it: 'riscatto sedile ', en: 'seat buyout ' })}${money(n.econ.buy)} €`:''}${n.econ.rent?` · ${tr({ it: 'affitto ', en: 'rent ' })}${money(n.econ.rent)} €`:''}`}${n.econ.entry?` · ${tr({ it: 'iscrizione ', en: 'entry fee ' })}${money(n.econ.entry)} € ${tr({ it: 'a gara', en: 'per race' })}`:''}</div>
    <div style="margin-bottom:10px">${tr({ it: 'Reputazione richiesta: ', en: 'Reputation required: ' })}<b style="color:${repOk?'var(--ok,#7bd88f)':'var(--bad,#e05d5d)'}">${n.repRequired??0}</b> <span class="muted">(${tr({ it: 'la tua: ', en: 'yours: ' })}${n.rep})</span></div>
    <h3 style="margin:10px 0 6px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim)">${tr({ it: 'Auto della serie', en: 'Series cars' })}</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${auto}</div>
    ${n.format?.length?`<div class="muted" style="margin-top:10px">${tr({ it: 'Formato weekend: ', en: 'Weekend format: ' })}${n.format.map(esc).join(' · ')}</div>`:''}
    ${n.calendar?.length?`<div class="muted" style="margin-top:4px">${tr({ it: 'Distanza gara piena: ', en: 'Full race distance: ' })}<b>${Math.max(...n.calendar.map(r=>r.laps??0))} ${tr({ it: 'giri', en: 'laps' })}</b> ${tr({ it: 'max — nel cruscotto puoi accorciare al 25/50/75% (i premi scalano con la distanza)', en: 'max — on the Dashboard you can shorten to 25/50/75% (prizes scale with distance)' })}</div>`:''}
    ${n.ai?.length?`<div class="muted" style="margin-top:4px">${tr({ it: 'Difficoltà AI consigliata: ', en: 'Recommended AI difficulty: ' })}<b>${n.ai[0]}–${n.ai[1]}%</b></div>`:''}
    ${pts?`<div class="muted" style="margin-top:4px">${esc(pts)}</div>`:''}
    ${palmares}
    ${cal?`<h3 style="margin:14px 0 6px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim)">${tr({ it: 'Calendario (', en: 'Calendar (' })}${(n.calendar??[]).length} ${tr({ it: 'gare)', en: 'races)' })}</h3><table><thead><tr><th></th><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Gara', en: 'Race' })}</th><th class="right">${tr({ it: 'Ora', en: 'Time' })}</th><th>${tr({ it: 'Meteo', en: 'Weather' })}</th></tr></thead><tbody>${cal}</tbody></table>`:''}
    ${blocked}`, [[tr({ it: 'Chiudi', en: 'Close' }), 'ghost',()=>{}]]);
}



/* -------- tab ARCHIVIO ONLINE (2/11) --------
   Solo le sessioni _MP_ (griglia dal .json completo) e il libro dei rivali
   online (identity via driver_id). Righe cliccabili come nel PC evidente:
   la stessa openResult con tutti i tempi e gap. */
async function drawOnline(m){
  const mp = await api('mp', {}).catch(() => null);
  if (!mp) {
    m.innerHTML = `<div class="panel"><h2>🌐 ${tr({ it: 'Archivio online', en: 'Online archive' })}</h2><div class="empty">${tr({ it: 'Elenco MP non disponibile: riavvia il webui.', en: 'MP list unavailable: restart the webui.' })}</div></div>`;
    return;
  }
  const P = mp.rows ?? [], R = mp.rivals ?? [];
  const riga = (x) => `<tr data-file="${esc(x.file)}" class="arc-row" style="cursor:pointer">
    <td class="muted">${esc(String(x.when).slice(0,16).replace('T',' '))}</td>
    <td class="muted">${esc(String(x.community ?? '').slice(0, 52))}</td>
    <td><span class="tag ${x.session === 'Race' ? 'gold' : 'blue'}">${esc(x.session)}</span></td>
    <td>${esc(x.track)} <span class="faint">${esc(x.layout ?? '')}</span></td>
    <td class="right">${x.drivers}</td>
    <td>${x.me ? `<span class="tag ${x.me.position === 1 ? 'gold' : x.me.position <= 3 ? 'green' : ''}">P${x.me.position}</span>${x.me.bestLap ? ` <span class="faint">${esc(x.me.bestLap)}</span>` : ''}` : '—'}</td>
  </tr>`;
  const forma = (x) => (x.form ?? []).length
    ? x.form.map((f) => f.pos != null ? `<span class="tag ${f.beat === true ? 'green' : f.beat === false ? 'red' : ''}">P${f.pos}</span>` : '<span class="faint">·</span>').join(' ')
    : '—';
  const tooltipComm = (x) => (x.communities ?? []).join(' · ') || '—';
  m.innerHTML = `
  <div class="panel">
    <h2>🌐 ${tr({ it: 'Archivio online', en: 'Online archive' })} <span class="h-act">${mp.total} ${tr({ it: 'sessioni multiplayer nei Results di EVO', en: "multiplayer sessions in EVO's Results" })}</span></h2>
    <div class="muted" style="font-size:11.5px;margin:0 0 8px">${tr({ it: 'Le gare online NON toccano la carriera: nessun punto, nessun soldo — restano qui come memoria, con la griglia cliccabile come tutte le altre sessioni.', en: "Online races NEVER touch the career: no points, no money — they stay here as memory, with a clickable grid like every other session." })}</div>
    ${P.length ? `<table><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'Community / server', en: 'Community / server' })}</th><th>${tr({ it: 'Sessione', en: 'Session' })}</th><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Piloti', en: 'Drivers' })}</th><th>${tr({ it: 'Tu', en: 'You' })}</th></tr></thead>
      <tbody>${P.map(riga).join('')}</tbody></table>`
      : `<div class="empty">${tr({ it: 'Nessuna sessione multiplayer ancora: da ogni gara col server EVO scrive i risultati _MP_ qui, e da allora niente va più perso.', en: 'No multiplayer session yet: from your first server race EVO writes _MP_ results here, and from then on nothing is lost.' })}</div>`}
    <div class="muted" style="font-size:11.5px;margin-top:10px">${tr({ it: 'Mostra anche le sessioni nate con un altro slot di carriera (scope per PC).', en: 'Also show sessions born under another career slot (PC-wide scope).' })} <button class="mini" id="b-on-all">${window.__arcAllPc ? tr({ it: 'Solo carriera', en: 'Career only' }) : tr({ it: 'Mostra tutto il PC', en: 'Show the whole PC' })}</button></div>
    ${R.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12.5px"><b>⚔️ ${tr({ it: 'Libro dei rivali online', en: 'Online rivals book' })}</b> <span class="muted" style="font-size:11px">— ${R.length} ${tr({ it: 'incrociati nelle sessioni multiplayer', en: 'met across multiplayer sessions' })}</span></summary>
      <table style="margin-top:6px"><thead><tr><th>${tr({ it: 'Rivale', en: 'Rival' })}</th><th class="right">${tr({ it: 'Incroci', en: 'Meetings' })}</th><th class="right">${tr({ it: 'Lui davanti', en: 'He finished ahead' })}</th><th class="right">${tr({ it: 'Tu davanti', en: 'You finished ahead' })}</th><th>${tr({ it: 'Ultima forma', en: 'Recent form' })}</th><th>${tr({ it: 'Pista più fitta', en: 'Favoured track' })}</th><th class="muted">${tr({ it: 'Auto abituale', en: 'Usual car' })}</th><th>${tr({ it: 'Ultima volta', en: 'Last seen' })}</th></tr></thead>
      <tbody>${R.slice(0, 20).map((x) => `<tr><td title="${esc(tooltipComm(x))}">${esc(x.name ?? '?')}</td><td class="right">${x.meetings}</td><td class="right" style="color:${x.beats > x.beaten ? '#ff9b9b' : 'var(--ok,#4ade80)'}">${x.beats}</td><td class="right">${x.beaten}</td><td>${forma(x)}</td><td>${x.favTrack ? `${esc(x.favTrack.track)} <span class="faint">×${x.favTrack.n}${x.favTrack.tu ? `, ${x.favTrack.tu} ${tr({ it: 'tue', en: 'yours' })}` : ''}</span>` : '—'}</td><td class="muted">${esc(x.favCar ?? '—')}</td><td class="muted">${esc(String(x.lastWhen ?? '').slice(0,16).replace('T',' '))}</td></tr>`).join('')}</tbody></table>
      <div class="muted" style="font-size:11px;margin-top:4px">${tr({ it: "Identità presa dal driver_id del gioco: sopravvive ai nickname diversi e ai server diversi. Solo sessioni in cui eravate entrambi in griglia.", en: "Identity taken from the game's driver_id: it survives different nicknames and different servers. Only sessions where you both started." })}</div></details>` : ''}
  </div>`;
  $$('.arc-row', m).forEach((tr) => { tr.onclick = () => openResult(tr.dataset.file); });
  $('#b-on-all').onclick = () => { window.__arcAllPc = !window.__arcAllPc; render(); };
}

/* -------- archivio risultati (SP) -------- */
async function drawArchive(m){
  // SCOPE CARRIERA (24/10): di default solo i risultati nati con QUESTA carriera
  // (Results è UNA cartella per PC, condivisa dagli slot); l'interruttore mostra
  // tutto il disco.
  // TAB ONLINE (2/11): le sessioni _MP_ e del libro dei rivali NON più qui in
  // fondo (nessuno le guardava) — hanno la loro scheda, drawOnline(). Qui è
  // rimasto SOLO l'archivio SP; un rimando piccolo ricorda dove finiscono
  // quelle gare.
  const c = await api('catalog', { all: !!window.__arcAllPc });
  m.innerHTML = `
  <div class="panel">
    <h2>${tr({ it: 'Archivio sessioni', en: 'Session archive' })} <span class="h-act">${c.archive.total} ${tr({ it: 'file nei Results di EVO', en: 'files in EVO\'s Results' })}</span></h2>
    <div class="muted" style="font-size:11.5px;margin:0 0 8px">${c.archive.scoped
      ? `${tr({ it: 'Mostrati solo i file nati con QUESTA carriera: Results è una cartella condivisa per PC.', en: 'Showing only files born with THIS career: Results is a PC-wide shared folder.' })} <button class="mini" id="b-arc-all">${tr({ it: 'Mostra tutto il PC', en: 'Show the whole PC' })}</button>`
      : `${tr({ it: 'Mostrato TUTTO il PC: Results è una cartella condivisa dagli slot.', en: 'Showing the WHOLE PC: Results is shared across slots.' })} <button class="mini" id="b-arc-all">${tr({ it: 'Solo carriera', en: 'Career only' })}</button>`}</div>
    <div class="row"><input type="text" id="arc-q" placeholder="${tr({ it: 'Cerca pista, pilota, sessione…', en: 'Search track, driver, session…' })}" style="max-width:280px"></div>
    <div class="row" style="margin-top:6px"><button class="mini" id="mp-redirect">🌐 ${tr({ it: 'Le gare multiplayer sono nel loro tab: Archivio online', en: "Online races have their own tab: Online archive" })}</button></div>
    <div id="arc-body"></div>
  </div>`;
  const all = c.archive.rows;
  const rowHtml = (r, tries) => `<tr data-file="${esc(r.file)}" class="arc-row" style="cursor:pointer">
    <td class="muted">${esc(r.when.slice(0,16).replace('T',' '))}</td>
    <td><span class="tag ${r.session==='Race'?'gold':'blue'}">${esc(r.session)}</span></td>
    <td>${esc(r.track)} <span class="faint">${esc(r.layout)}</span></td>
    <td class="muted">${esc(r.kind)}</td>
    <td class="right">${r.drivers}${tries>1?` <span class="faint" title="${tries} ${tr({ it: 'tentativi nella stessa ora: clicca per aprire ognuno', en: 'attempts in the same hour: click to open each' })}">×${tries}</span>`:''}</td>
    <td>${r.me ? `<span class="tag ${r.me.position===1?'gold':r.me.position<=3?'green':''}">P${r.me.position}</span>` : `<span class="faint" title="${tr({ it: 'non presente in questa sessione (riprove, spettatore o server)', en: 'not in this session (rejoins, spectator or server)' })}">—</span>`}</td>
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
    body.innerHTML = flat.length ? `<table><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'Sessione', en: 'Session' })}</th><th>${tr({ it: 'Pista', en: 'Track' })}</th><th>${tr({ it: 'Tipo', en: 'Type' })}</th><th class="right">${tr({ it: 'Piloti', en: 'Drivers' })}</th><th>${tr({ it: 'Tu', en: 'You' })}</th><th>${tr({ it: 'Vincitore', en: 'Winner' })}</th></tr></thead>
    <tbody>${flat.map(({r,tries})=>rowHtml(r,tries)).join('')}</tbody></table><div class="muted" style="margin-top:8px">${tr({ it: 'Clicca una riga per la classificazione completa con tempi e gap. ×N = più tentativi nella stessa ora (si aprono dal dettaglio).', en: 'Click a row for the full classification with timings and gaps. ×N = multiple attempts in the same hour (opened from the detail).' })}</div>`
    : `<div class="empty">${tr({ it: 'Nessuna sessione trovata.', en: 'No session found.' })}</div>`;
    $$('.arc-row', body).forEach(tr => { tr.onclick = () => openResult(tr.dataset.file); });
  };
  paint();

  const bAll = $('#b-arc-all');
  if (bAll) bAll.onclick = () => { window.__arcAllPc = !window.__arcAllPc; render(); };
  $('#arc-q').oninput = () => paint($('#arc-q').value);
  // rimanda al nuovo tab online, così le gare MP restano a un clic anche da qui
  $('#mp-redirect').onclick = () => vai('online');
}

/* -------- giri liberi (24/10) --------
   La modalità del simracer puro: scegli pista e auto in EVO e gira a piacere —
   il tool cattura da solo ogni sessione non-gara che EVO scrive in Results.
   Libro PB per auto+pista con il giro ideale sommato dai migliori settoriali
   di sempre. La carriera NON si tocca: qui si legge solo data/hotlaps.json. */
const MS = (ms) => (Number.isFinite(ms) && ms > 0)
  ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`
  : '—';
async function drawGironi(m){
  const q = await api('hotlaps', {});
  const log = q.log ?? q;
  const S = log.sessions ?? [], P = log.records ?? [];
  m.innerHTML = `
  <div class="panel">
        <h2>${LI.flag} ${tr({ it: '🏁 Gara personalizzata al volo', en: '🏁 Instant custom race' })}</h2>
        <!-- ▶ PARTE SUBITO (30/10, «sarebbe una noia impostare ogni volta»):
             un bottone in cima al pannello che ri-esegue l'ULTIMA RICETTA
             scritta (registro della durata) — la stessa dei campi qui
             sotto; l'anteprima con la ricetta sta a destra del bottone. -->
        <div class="row" style="align-items:center">
          <button class="mini" id="gv-subito" style="font-weight:700">▶ ${tr({ it: 'PARTE SUBITO', en: 'GO NOW' })}</button>
          <span class="muted" id="gv-subito-nota" style="font-size:12px">…</span>
        </div>
        <div class="rs-grid" style="margin-top:8px">
          <div class="field"><label>${tr({ it: 'Giri', en: 'Laps' })}</label><input type="number" id="gv-giri" min="1" max="500" placeholder="5"></div>
          <div class="field"><label>${tr({ it: 'oppure a tempo (min)', en: 'or timed (min)' })}</label><input type="number" id="gv-tempo" min="1" max="1440" placeholder="30"></div>
          <div class="field"><label>${tr({ it: 'Banda AI % (min–max)', en: 'AI band % (min–max)' })}</label>
            <div style="display:flex;gap:6px">
              <input type="number" id="gv-aimin" min="0" max="100" value="88">
              <input type="number" id="gv-aimax" min="0" max="100" value="93">
            </div>
          </div>
          <div class="field"><label>${tr({ it: 'Sedile (auto)', en: 'Seat (car)' })}</label><select id="gv-auto"><option value="">— ${tr({ it: 'nessuna', en: 'none' })} —</option></select></div>
          <div class="field"><label>${tr({ it: 'Pista', en: 'Track' })}</label><select id="gv-pista"><option value="">— ${tr({ it: 'non cambia', en: 'no change' })} —</option></select></div>
          <div class="field" style="grid-column:1/-1">
            <label>${tr({ it: 'Griglia', en: 'Grid' })}</label>
            <!-- IL PRESET DI GRIGLIA (30/10, «mono o multiclasse nel menu»):
                 la scelta riempie il POOL a fianco (editable: puoi togliere o
                 mettere un Id dal datalist); il menu resta «personalizzata»
                 se poi modificarà il pool a mano. -->
            <div style="display:flex;gap:6px;align-items:center">
              <select id="gv-griglia" style="flex:0 0 auto;min-width:230px"><option value="">— ${tr({ it: 'personalizzata (pool a mano)', en: 'custom (hand-written pool)' })} —</option></select>
              <input type="text" id="gv-pool" placeholder="ks_f40_lm, ks_ferrari_296_gt3" list="dl-gv-auto" style="flex:1;min-width:0">
            </div>
          </div>
          <div class="field" style="grid-column:1/-1">
            <label>${tr({ it: 'Preset della ricetta (con la tua auto)', en: 'Recipe presets (with your own car)' })}</label>
            <!-- I PRESET with NOME (30/10, «preset con la mia auto»): la
                 ricetta COMPLETA salvata con nome — giri O tempo, banda,
                 pista, SEDILE (la mia auto) e pool. Il «PARTE SUBITO» tiene
                 UNA ricetta sola: qui ne tieni quante vuoi. La scelta
                 riempie i campi (che restano editabili, il pool resta la
                 fonte). -->
            <div style="display:flex;gap:6px;align-items:center">
              <select id="gv-preset" style="flex:0 0 auto;min-width:230px"><option value="">— ${tr({ it: 'nessuno (usa i campi qui sotto)', en: 'none (use the fields below)' })} —</option></select>
              <button class="mini" id="gv-preset-salva" style="flex:0 0 auto">💾 ${tr({ it: 'Salva col nome', en: 'Save by name' })}</button>
              <button class="mini" id="gv-preset-canc" style="flex:0 0 auto" title="${esc(tr({ it: 'cancella il preset scelto', en: 'delete the selected preset' }))}">🗑</button>
            </div>
            <div id="gv-suggeri" class="muted" style="font-size:11.5px;margin-top:6px"></div>
          </div>
          <div class="row" style="align-items:end">
            <button class="mini" id="gv-dry">${tr({ it: 'Prova senza scrivere', en: 'Dry run' })}</button>
            <button class="mini" id="gv-go">${tr({ it: 'Imposta in EVO', en: 'Write to EVO' })}</button>
          </div>
        </div>
        <div id="gv-out" style="display:none;margin-top:8px"></div>
        <div id="gv-stato" class="muted" style="margin-top:8px;font-size:12px">…</div>
        <div class="muted" style="font-size:11.5px;margin-top:8px">${tr({ it: 'La pista è un campo qui sopra: scritta nel file, resta solo APPLICA nel menu griglia e VIA. Durata, banda e sedile li scrive il tasto.', en: 'Track is a field above: written into the file, only APPLY in the grid menu is left. Length, band and seat are written by the button.' })}</div>
      </div>
  <div class="panel">
    <h2>${tr({ it: 'Giri liberi', en: 'Free laps' })} <span class="h-act">${log.total} ${tr({ it: 'sessioni in quaderno', en: 'sessions in the book' })}</span></h2>
    <div class="muted" style="font-size:11.5px;margin:0 0 8px">${tr({ it: 'Scegli PRATICA in EVO, pista e auto e gira: ogni sessione che il gioco scrive si registra da sola qui. La carriera non si tocca: soldi, punti e rep restano a 0.', en: 'Pick PRACTICE in EVO, pick track and car and run: every session the game writes lands here by itself. Career untouched: money, points and rep stay at 0.' })}</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <select id="hl-file" style="max-width:340px"><option value="">${tr({ it: '— registra un vecchio file a mano —', en: '— register an old file by hand —' })}</option></select>
      <button class="mini act" id="hl-reg">${tr({ it: 'Registra file', en: 'Register file' })}</button>
    </div>
    <div id="hl-body"></div>
  </div>
        <div class="panel" id="p-events"><h2>${tr({ it: 'Eventi speciali', en: 'Special events' })}</h2><div class="empty">…</div></div>


  <div class="panel">
    <h2>${tr({ it: 'Libro PB — auto × pista', en: 'PB book — car × track' })}</h2>
    ${P.length ? `<table><thead><tr><th>${tr({ it: 'Auto', en: 'Car' })}</th><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'PB', en: 'PB' })}</th><th class="right">${tr({ it: 'Giro ideale', en: 'Ideal lap' })}</th><th class="muted">${tr({ it: ' Dal', en: 'Since' })}</th></tr></thead>
      <tbody>${P.map(r=>`<tr><td>${window.carLinkHtml(r.carPretty ?? r.car)}</td><td>${esc(r.trackPretty ?? r.track)}${esc(r.layout ?? '')}</td><td class="right"><b>${esc(r.lap ?? MS(r.lapMs))}</b></td><td class="right ${r.idealLapMs && r.idealLapMs < r.lapMs ? 'good' : 'muted'}">${r.idealLapMs ? MS(r.idealLapMs) : '—'}</td><td class="muted">${esc(String(r.at ?? '').slice(0, 16).replace('T', ' '))}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${tr({ it: 'Nessun PB ancora: gira in pratica e il quaderno impara.', en: 'No PB yet: run a practice session and the book will learn.' })}</div>`}
  </div>`;

  /* il dettaglio delle sessioni: le ultime 25 con pista, auto, meteo, giri e best */
  const body = $('#hl-body');
  const paint = () => {
    body.innerHTML = S.length ? `<table><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'Pista', en: 'Track' })}</th><th>${tr({ it: 'Auto', en: 'Car' })}</th><th>${tr({ it: 'Meteo', en: 'Weather' })}</th><th class="right">${tr({ it: 'Giri', en: 'Laps' })}</th><th class="right">${tr({ it: 'Miglior giro', en: 'Best lap' })}</th><th class="right">${tr({ it: 'Settori', en: 'Sectors' })}</th></tr></thead>
      <tbody>${S.slice(0, 25).map(e => `<tr class="${e.isPB ? 'hl-pb' : ''}">
        <td class="muted">${esc(String(e.at ?? '').slice(0, 16).replace('T', ' '))}</td>
        <td>${esc(e.trackPretty ?? e.track)} ${e.layout ? `<span class="faint">${esc(e.layout)}</span>` : ''}</td>
        <td>${window.carLinkHtml(e.carPretty ?? e.car)}${e.isPB ? ` <span class="tag gold" title="${tr({ it: 'il tuo giro migliore di sempre su questa pista con questa auto', en: 'your all-time best on this track in this car' })}">${tr({ it: 'PB', en: 'PB' })}</span>` : ''}</td>
        <td class="muted">${esc(e.weather ?? '—')}</td>
        <td class="right">${e.lapsCount}</td>
        <td class="right"><b>${esc(e.bestLap ?? '—')}</b></td>
        <td class="right muted">${(e.sectors ?? []).map(s => `${s.index}. ${esc(s.mineText ?? '—')}`).join(' · ') || '—'}</td>
      </tr>`).join('')}</tbody></table>
      <div class="muted" style="margin-top:8px">${tr({ it: 'PB = una riga del libro PB. Aggiorna il pannello quando il watcher registra (10 s max) o ricarica la pagina.', en: 'PB = a book-PB row. The panel follows the watcher registers (within 10 s) or reload the page.' })}</div>`
      : `<div class="empty">${tr({ it: 'Nessuna sessione di prove in quaderno: gira in PRATICA e il tool fa il resto.', en: 'No practice session in the book: run a PRACTICE session and the tool does the rest.' })}</div>`;
  };
  paint();
/* GARA AL VOLO (1/11): giri o tempo + banda AI + opzionali sedile e
     griglia dal pool — stessa funzione del CLI (garaVeloce via server). Il
     dry-run prima: vedi cosa si scriverebbe senza toccare i file. */
  const gvEsegui = async (dry) => {
    const giri = $('#gv-giri')?.value ? Number($('#gv-giri').value) : null;
    const tempo = $('#gv-tempo')?.value ? Number($('#gv-tempo').value) : null;
    if (!giri && !tempo) return toast(tr({ it: 'Scegli i giri o i minuti a tempo.', en: 'Pick laps or timed minutes.' }), 'warn');
    if (giri && tempo) return toast(tr({ it: 'O giri o minuti, non entrambi.', en: 'Either laps or minutes, not both.' }), 'warn');
    try {
      const out = await api('gara-veloce', {
        giri,
        tempo,
        aiMin: $('#gv-aimin')?.value,
        aiMax: $('#gv-aimax')?.value,
        auto: $('#gv-auto')?.value.trim() || null,
        pista: $('#gv-pista')?.value.trim() || null,
        pool: $('#gv-pool')?.value.trim() || null,
        dry,
      });
      gvMostra(out, dry ? tr({ it: 'Prova a secco fatta: guarda l\'esito qui sotto.', en: 'Dry run done: see the result below.' }) : tr({ it: 'Scritto: guarda l\'esito qui sotto.', en: 'Written: see the result below.' }));
    } catch (e) { toast(e.message, 'err'); }
  };
  /* IL RISULTATO all'esito, UNA sola approssimazione per i DUE tasti e per
     «PARTE SUBITO» (30/10): esito dei passi + stato istantaneo riletto +
     riepilogo aggiornato dai campi in fondo per la parte vera
     (gvStatoAggiorna legge anche l'anteprima del bottone). */
  const gvMostra = (out, okMsg) => {
    const zone = $('#gv-out');
    if (zone) {
      zone.style.display = '';
      zone.innerHTML =
        `<b>${esc(out.titolo)}</b><ul style="margin:6px 0 0 18px">${out.passi.map((p) => `<li>${p.ok ? '✓' : '✗'} <b>${esc(p.nome)}</b>: ${esc(p.esito)}</li>`).join('')}</ul>` +
        (out.stato ? `<div class="muted" style="margin-top:6px">${tr({ it: 'Stato istantaneo: ', en: 'Instant-race state: ' })}${out.stato.modeTxt === 'a tempo' ? `${Math.round((out.stato.durata ?? 0) / 60)} min a tempo` : `${out.stato.durata ?? '?'} giri`} · AI ${out.stato.aiMin ?? '?'}–${out.stato.aiMax ?? '?'}</div>` : '');
    }
    gvStatoAggiorna();
    /* SEGNASTATO ONESTO (31/10): il server risponde 200 anche con passi KO
       (la lista ✓/✗ resta visibile qui sotto), quindi il toast non più
       sempre verde: se un passo è fallito la chiamata è un warn col punto
       che guida all'esito, non un falso «Scritto». */
    const falliti = (out.passi ?? []).filter((p) => !p.ok).length;
    toast(falliti
      ? tr({ it: `⚠ ${falliti} passo${falliti === 1 ? '' : ' i'} KO: guarda i ✗ nell'esito qui sotto.`, en: `⚠ ${falliti} step${falliti === 1 ? '' : 's'} failed: see the ✗ in the result below.` })
      : okMsg, falliti ? 'warn' : 'ok');
  };
  $('#gv-dry')?.addEventListener('click', () => gvEsegui(true));
  $('#gv-go')?.addEventListener('click', () => gvEsegui(false));
  /* ▶ PARTE SUBITO (30/10): ri-esegue l'ULTIMA RICETTA dal registro della
     durata (endpoint parti-subito); la stessa del pannello, esausta di
     dettagli premuti ieri. Idempotente per costruzione: se tutto è torna
     a posto, non scrive un byte. */
  $('#gv-subito')?.addEventListener('click', async () => {
    try {
      const out = await api('parti-subito', {});
      gvMostra(out, tr({ it: 'Ricetta riapplicata: guarda l\'esito qui sotto, in alto è l\'anteprima della ricetta.', en: 'Recipe reapplied: result below, recipe preview above.' }));
    } catch (e) { toast(e.message, 'err'); }
  });

  /* RIEPILOGO VIVO dell'istantanea (4/11): la STESSA fonte del cruscotto in
     gioco (statoIstantanea via /api/istantanea): durata · pista · banda AI
     come sono DENTRO il file, non come le ha lasciate l'ultimo tasto. Si
     aggiorna ogni 15 s finché la vista resta a schermo, il timer muore da
     solo quando l'elemento della vista non c'è più. */
  const gvStato = $('#gv-stato');
  /* IL REGISTRO nel riepilogo (4/11): COM'È adesso + COSA ha scritto l'ultimo
     gesto (endpoint gara-veloce-registro, la fonte stessa del bottone demo
     del Cruscotto). Due righe, nessun nuovo pannello: il riepilogo resta
     piccolo e dice subito «che cosa ho premuto, che cosa è in EVO».
     Da 30/10 lo stesso endpoint porta anche l'ULTIMA RICETTA RAW
     (gv-ricetta): l'anteprima di «PARTE SUBITO» e il prefill dei campi. */
  let gvUltima = null;                                       // riga del registro (riusata a ogni tick)
  let gvRicetta = null;                                      // L'ULTIMA RICETTA (id + tempo/banda/pista/sedile/pool)
  /* LA RIGA-RICETTA (30/10): «10 min a tempo · Monza · AI 88–93 · pool: …»
     o il suggerimento a compila una volta (nessuna ricetta nel registro). */
  const gvRicettaRiga = () => (gvRicetta
    ? [gvRicetta.giri != null ? `${gvRicetta.giri} giri` : `${gvRicetta.tempo ?? '?'} min a tempo`, gvRicetta.pista ? String(gvRicetta.pista) : null, gvRicetta.aiMin != null && gvRicetta.aiMax != null ? `AI ${gvRicetta.aiMin}–${gvRicetta.aiMax}` : null, Array.isArray(gvRicetta.pool) && gvRicetta.pool.length ? `pool: ${gvRicetta.pool.join(', ')}` : null].filter(Boolean).join(' · ')
    : tr({ it: 'nessuna ricetta in canna: compila i campi e premi «Imposta in EVO» una volta', en: 'no recipe stored yet: fill the fields and press «Write to EVO» once' }));
  const gvStatoScrive = (i) => {
    if (!gvStato) return;
    gvStato.textContent = (!i ? tr({ it: "Nessuna gara custom aperta in EVO ancora: aprane una UNA volta e il riepilogo parte (durata · pista · AI).", en: "No custom race opened in EVO yet: open one ONCE and the summary starts (length · track · AI)." })
      : tr({ it: "L'istantanea in EVO adesso: ", en: "Instant race now in EVO: " }) +
        (i.durata?.giri != null ? `${i.durata.giri} giri` : `${i.durata?.min ?? '?'} min a tempo`) +
        (i.pista ? ` · ${i.pista}` : '') + (i.banda ? ` · AI ${i.banda}` : '')) +
      (gvUltima ? `\n${tr({ it: 'Ultimo gesto scritto: ', en: 'Last written change: ' })}${gvUltima}` : '');
    /* L'ANTEPRIMA del bottone ▶ (30/10): la STESSA riga-ricetta in cima al
       pannello, una sola formula (gvRicettaRiga) per il riepilogo e per la
       nota: nessun testo che può divergere. */
    const nota = $('#gv-subito-nota');
    if (nota) nota.textContent = gvRicettaRiga();
  };
  /* IL PREFILL dai campi col record (30/10): la prima lettura del registro
     riempie SOLO i campi VUOTI con l'ultima ricetta — per toccare un
     dettaglio senza ri-battere tutto. UNA sola volta: i valori che hai
     battuto a mano restano, e al tick di 15 s non tocca più niente.
     I SELECT aspettano le opzioni di gv-liste (gvListeOk): il menu si
     precompila con ciò che il menu CONOSCE, e un valore fuori menù si
     aggiunge marcato, mai rimpiazzato. */
  let gvPrefix = false;
  const gvPrefill = () => {
    if (gvPrefix || !gvListeOk || !gvRicetta) return;
    gvPrefix = true;
    for (const [sel, v] of Object.entries({ '#gv-giri': gvRicetta.giri, '#gv-tempo': gvRicetta.tempo, '#gv-aimin': gvRicetta.aiMin, '#gv-aimax': gvRicetta.aiMax, '#gv-auto': gvRicetta.auto, '#gv-pista': gvRicetta.pista })) {
      if (v == null || v === '') continue;
      const el = $(sel);
      if (!el) continue;
      if (el.tagName === 'SELECT') {
        if ([...el.options].some((o) => o.value === String(v))) el.value = String(v);
        else {                                                        // ricetta vecchia col nome battuto a mano: entra marcata
          const o = document.createElement('option');
          o.value = String(v); o.textContent = `${String(v)} (fuori menu)`;
          el.appendChild(o); el.value = String(v);
        }
      } else if (!el.value) el.value = String(v);
    }
    if (Array.isArray(gvRicetta.pool) && gvRicetta.pool.length) {
      const el = $('#gv-pool'); if (el && !el.value) el.value = gvRicetta.pool.join(', ');
    }
  };
  /* I MENU A TENDINA (30/10, dopo il datalist): AUTO del libro ladder
     (SEDILE), PISTE del libro TRACK_INFO e PRESET di griglia mono/multi-
     classe (la STESSA classificazione stile 24 Le Mans del rapporto di
     gara) — endpoint gv-liste. Il preset scelto riempie il POOL a fianco;
     il datalist resta per il pool A MANO; server fuori o libro vuoto =
     menu poveri e campi a mano, come prima. */
  let gvListeOk = false;                       // il prefill dei menu aspetta QUESTE opzioni
  (async () => {
    try {
      const d = await api('gv-liste');
      const metti = (id, voci) => {
        let dl = $(`#${id}`);
        if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
        dl.innerHTML = (voci ?? []).map((v) => `<option value="${esc(v.v)}">${esc(v.t ?? '')}</option>`).join('');
      };
      metti('dl-gv-auto', (d.cars ?? []).map((c) => ({ v: c.id, t: c.nome })));
      const gvSel = (id, tutto, v) => {
        const el = $(`#${id}`);
        if (!el) return;
        el.innerHTML = `<option value="">${esc(tutto)}</option>` + (v ?? []).map((o) => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
      };
      gvSel('gv-auto', tr({ it: '— nessuna —', en: '— none —' }), (d.cars ?? []).sort((a, b) => String(a.nome).localeCompare(String(b.nome))).map((c) => ({ v: c.id, t: c.nome })));
      gvSel('gv-pista', tr({ it: '— non cambia —', en: '— no change —' }), (d.piste ?? []).map((p) => ({ v: p, t: p })));
      gvSel('gv-griglia', tr({ it: '— personalizzata (pool a mano) —', en: '— custom (hand pool) —' }), (d.griglie ?? []).map((g) => ({ v: (g.pool ?? []).join(', '), t: g.nome })));
      gvSel('gv-preset', tr({ it: '— nessuno (usa i campi qui sotto) —', en: '— none (use the fields below) —' }), (d.preset ?? []).map((p) => ({ v: p.nome, t: p.nome + (p.riga ? ` — ${p.riga}` : '') })));
      gvListeOk = true;
      gvPrefill();      // se l'ULTIMA RICETTA è già letta: i menu si arredata DA SOLI (effetto post-liste)
    } catch { /* server fuori: i menu restano quelli scritti a mano nel markup */ }
  })();
  /* IL PRESET → POOL: la scelta scrive il pool nel campo (puoi poi togliere
     o aggiungere un id dal datalist); se il pool si toccato a mano, il menu
     torna «personalizzata» — la font della griglia è SEMPRE il campo. */
  $('#gv-griglia')?.addEventListener('change', () => {
    const v = $('#gv-griglia')?.value;
    if (v) { const el = $('#gv-pool'); if (el) el.value = v; }
  });
  $('#gv-pool')?.addEventListener('input', () => { const s = $('#gv-griglia'); if (s?.value) s.value = ''; });
  /* I PRESET with NOME (30/10): la scelta riempie I CAMPI della ricetta
     (non li esegue: la gara la lanci con «Imposta in EVO» o «PARTE SUBITO»
     dopo); salva con nome e cancella. Il server fa la maglia pesante
     (endpoint gv-preset), qui solo form + refresh del menu. */
  const gvPresetRigenera = (elenco, seleziona = null) => {
    const sel = $('#gv-preset'); if (!sel) return;
    const tenuto = seleziona ?? sel.value;
    sel.innerHTML = `<option value="">— ${esc(tr({ it: 'nessuno (usa i campi qui sotto)', en: 'none (use the fields below)' }))} —</option>` +
      (elenco ?? []).map((p) => `<option value="${esc(p.nome)}" ${p.nome === tenuto ? 'selected' : ''}>${esc(p.nome)}${p.riga ? ` — ${esc(p.riga)}` : ''}</option>`).join('');
  };
  $('#gv-preset')?.addEventListener('change', async () => {
    const nome = $('#gv-preset')?.value;
    if (!nome) return;
    try {
      const r = await api('gv-preset', { action: 'leggi', nome });
      const scrivi = (id, v) => { const el = $(id); if (el) el.value = v ?? ''; };
      scrivi('#gv-giri', r.giri ?? ''); scrivi('#gv-tempo', r.tempo ?? '');
      scrivi('#gv-aimin', r.aiMin ?? 88); scrivi('#gv-aimax', r.aiMax ?? 93);
      scrivi('#gv-auto', r.auto ?? ''); scrivi('#gv-pista', r.pista ?? '');
      scrivi('#gv-pool', r.pool?.length ? r.pool.join(', ') : ''); scrivi('#gv-griglia', '');
      toast(tr({ it: `Preset "${nome}" caricato nei campi: premi «Imposta in EVO» per scriverlo.`, en: `Preset "${nome}" loaded into the fields: press «Write to EVO» to apply it.` }), 'ok');
      if ($('#gv-pista')?.value) $('#gv-pista').dispatchEvent(new Event('change'));
    } catch (e) { toast(e.message, 'err'); }
  });
  const gvPresetForm = () => ({
    giri: $('#gv-giri')?.value || null,
    tempo: $('#gv-tempo')?.value || null,
    aiMin: $('#gv-aimin')?.value || 88,
    aiMax: $('#gv-aimax')?.value || 93,
    auto: $('#gv-auto')?.value.trim() || null,
    pista: $('#gv-pista')?.value.trim() || null,
    pool: $('#gv-pool')?.value.trim() || null,
  });
  $('#gv-preset-salva')?.addEventListener('click', async () => {
    const form = gvPresetForm();
    const durata = form.giri != null ? `${form.giri} giri` : form.tempo != null ? `${form.tempo} min` : tr({ it: 'gara', en: 'race' });
    const nome = prompt(tr({ it: "Nome del preset (la mia auto entra se scelta nel sedile):", en: 'Preset name (your car rides along if chosen in the seat):' }), form.pista ? `${durata} · ${form.pista}` : durata);
    if (!nome || !nome.trim()) return;
    try {
      const r = await api('gv-preset', { action: 'salva', nome: nome.trim(), ...gvPresetForm() });
      gvPresetRigenera(r.preset, r.nome);
      toast(tr({ it: `Preset "${r.nome}" salvato: te lo ritrovi nel menu, auto compresa.`, en: `Preset "${r.nome}" saved: back in the menu, car included.` }), 'ok');
    } catch (e) { toast(e.message, 'err'); }
  });
  $('#gv-preset-canc')?.addEventListener('click', async () => {
    const nome = $('#gv-preset')?.value;
    if (!nome) return toast(tr({ it: 'Scegli prima il preset da cancellare nel menu.', en: 'Pick the preset to delete in the menu first.' }), 'warn');
    if (!confirm(tr({ it: `Cancello il preset "${nome}"?`, en: `Delete the preset "${nome}"?` }))) return;
    try { const r = await api('gv-preset', { action: 'cancella', nome }); gvPresetRigenera(r.preset); toast(tr({ it: 'Preset cancellato.', en: 'Preset deleted.' }), 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
  /* DURATA CONSIGLIATA per pista (30/10): la pista scelta chiede al quaderno
     prove il suo giro di riferimento (PB di pista, o del SEDILE scelto) e
     le due conversioni — 30′ ≈ N giri · 10 giri ≈ M min — stanno lì per
     essere USATE coi tasti, non scritte a furtive: i campi restano in mano
     tua. Quaderno vuoto sulla pista = nessun suggerito, niente inventati. */
  const gvSuggerisci = async () => {
    const zona = $('#gv-suggeri'); if (!zona) return;
    const pista = $('#gv-pista')?.value.trim();
    const auto = $('#gv-auto')?.value.trim() || null;
    if (!pista) { zona.textContent = ''; return; }
    try {
      const r = await api('gv-suggeri', { pista, auto });
      if (!r.giro) { zona.textContent = tr({ it: `Nessun giro in quaderno su ${pista}: la durata resta in mano tua.`, en: `No lap in the notebook for ${pista}: the length stays in your hands.` }); return; }
      const sec = r.giro.lapMs / 1000;
      const giri30 = Math.max(1, Math.round((30 * 60) / sec));
      const min10 = Math.round(((10 * sec) / 60) * 10) / 10;
      zona.innerHTML =
        `${tr({ it: 'Su', en: 'On' })} <b>${esc(pista)}</b> — ${r.giro.perCar ? tr({ it: 'il tuo giro', en: 'your lap' }) : tr({ it: 'giro di', en: 'lap of' })} <b>${esc(r.giro.lapText)}</b>${r.giro.carPretty ? esc(` · ${r.giro.carPretty}`) : ''} : ` +
        `<button class="mini" data-val="giri:${giri30}">${esc(tr({ it: "30′ ≈ ", en: "30′ ≈ " }))}${giri30} ${esc(tr({ it: 'giri', en: 'laps' }))}</button> ` +
        `<button class="mini" data-val="tempo:${min10}">${esc(tr({ it: "10 giri ≈ ", en: "10 laps ≈ " }))}${min10} ${esc(tr({ it: 'min', en: 'min' }))}</button>`;
    } catch { zona.textContent = ''; }
  };
  $('#gv-suggeri')?.addEventListener('click', (e) => {
    const b = e.target?.closest?.('button'); if (!b || !b.dataset?.val) return;
    const [campo, n] = String(b.dataset.val).split(':');
    const el = $(campo === 'giri' ? '#gv-giri' : '#gv-tempo');
    if (el) el.value = n;
    const altro = $(campo === 'giri' ? '#gv-tempo' : '#gv-giri');
    if (altro) altro.value = '';   // giri e tempo si escludono (come l'eseguita)
  });
  $('#gv-pista')?.addEventListener('change', gvSuggerisci);
  $('#gv-auto')?.addEventListener('change', gvSuggerisci);
  const gvStatoAggiorna = async () => {
    try {
      const i = (await api('istantanea')).istantanea;
      try {
        const rg = await api('gara-veloce-registro');
        gvUltima = rg.ultima ?? null;
        gvRicetta = rg.ricetta ?? null;                            // null se mai scritto: la nota in alto resta col suggerimento
      } catch { gvUltima = null; gvRicetta = null; }               // registro mai scritto: solo la riga com'è
      gvPrefill();
      gvStatoScrive(i);
    } catch { /* server fuori: gli altri canali lo dicono già */ }
  };
  gvStatoAggiorna();
  const gvStatoTimer = setInterval(() => {
    if ($('#gv-stato') !== gvStato) return clearInterval(gvStatoTimer);
    gvStatoAggiorna();
  }, 15 * 1000);


  /*  file da registrare a mano: la lista la dà l'archivio (catalog): i risultati
     non-gara sono file come gli altri; filtro via le gare */
  const sel = $('#hl-file');
  if (!sel) return; /* rerender in corsa: il tab è già sostituito, niente da legare */
  try {
    const c = await (await fetch(`/api/catalog`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true, lingua: window.LINGUA ?? 'it' }) })).json();
    const rows = (c.archive?.rows ?? []).filter(r => r.session && String(r.session).toLowerCase() !== 'race');
    sel.innerHTML += rows.slice(0, 60).reverse().map(r => `<option value="${esc(r.file)}">${esc(r.file)}</option>`).join('');
  } catch { /* senza archivio il menu resta vuoto: non blocca il tab */ }
  /* RERENDER IN CORSA (29/10): se tra l'await e qui una nuova vista ha preso
     il posto di questa nel DOM, #hl-reg non c'è più e scriverci onclick rompe
     la tab. Se hai già sostituito guard, un ritorno zitto basta. */
  const hlReg = $('#hl-reg');
  if (hlReg) hlReg.onclick = async () => {
    if (!sel.value) return toast(tr({ it: 'Scegli prima un file dal menu.', en: 'Pick a file from the menu first.' }), 'err');
    try {
      const r = await api('hotlaps', { action: 'record-file', file: sel.value });
      toast(r.registered ? tr({ it: 'Sessione registrata nel quaderno.', en: 'Session registered in the book.' }) : tr({ it: 'Il file non era una prova tua o era già nel quaderno.', en: 'The file was not one of your practice sessions or was already in the book.' }), r.registered ? 'ok' : '');
      render();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function openResult(file){
  const d = await api('result-detail', { file });
  if (d.error) return toast(d.error, 'err');
  // TESTA A TESTA (solo MP): colonna ⚔️ col libro dei rivali — sul tooltip il
  // conto completo (incroci totali, tu davanti, lui davanti).
  const h2hCol = (r) => !d.is_mp ? '' : `<td class="right" title="${r.h2h ? tr({ it: `${r.h2h.meetings} incroci: tu davanti ${r.h2h.tu}, lui davanti ${r.h2h.lui}`, en: `${r.h2h.meetings} meetings: you ahead ${r.h2h.tu}, him ahead ${r.h2h.lui}` }) : tr({ it: 'primo incrociato: il libro lo impara da qui', en: 'first meeting: the book learns him here' })}">${r.h2h ? `<b style="color:${r.h2h.tu > r.h2h.lui ? 'var(--ok,#4ade80)' : r.h2h.lui > r.h2h.tu ? '#ff9b9b' : 'inherit'}">${r.h2h.tu}–${r.h2h.lui}</b>` : '<span class="faint">·</span>'}</td>`;
  /* RAPPORTO DI GARA (27/10, richiesta Mauro: «il post-race report è il regalo»):
     il dossier COMPLETO pronto da incollare su Discord — podio, classifica con
     penalità, gap, giro veloce e (MP) testa a testa — composto per l'intero
     resultDetail del server + settori dal file nativo. Il MD finisce anche
     in report/gare/ come allegato. */
  const apriRapporto = async () => {
    try {
      const rr = await api('rapporto-gara', { file });
      if (rr.error) return toast(rr.error, 'err');
      // copie fai-solo: il browser moderno dà il clipboard, il fallback resta
      // textarea+execCommand per il vecchio EVO webview
      const copia = () => {
        try { navigator.clipboard?.writeText(rr.md).then(() => toast(tr({ it: 'Rapporto copiato: incollalo su Discord.', en: 'Report copied: paste it on Discord.' }), 'ok')).catch(() => copiaFallback()); }
        catch { copiaFallback(); }
      };
      const copiaFallback = () => {
        const ta = document.createElement('textarea');
        ta.value = rr.md; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
        toast(ok ? tr({ it: 'Rapporto copiato: incollalo su Discord.', en: 'Report copied: paste it on Discord.' }) : tr({ it: 'Copia a mano dalla casella.', en: 'Copy it by hand from the box.' }), ok ? 'ok' : '');
      };
      modal(tr({ it: 'Rapporto gara · pronto per Discord', en: 'Race report · ready for Discord' }), `
        <div class="muted" style="margin-bottom:8px">${rr.md.split('\n').slice(0, 2).map(esc).join('<br>')}</div>
        <textarea id="rp-md" class="rp-md" readonly style="width:100%;height:340px;font-family:var(--mono,monospace);font-size:12px;white-space:pre;background:var(--bg2,#1b2030);color:var(--fg,#e8eaf0);border:1px solid var(--line,#2b3345);border-radius:6px;padding:10px">${esc(rr.md)}</textarea>
        ${rr.salvatoMd ? `<div class="muted" style="margin-top:8px;font-size:12px">📄 ${tr({ it: 'salvato anche in', en: 'also saved to' })} <code>${esc(rr.salvatoMd)}</code></div>` : ''}`,
        [[tr({ it: '⧉ Copia per Discord', en: '⧉ Copy for Discord' }), 'primary', () => { copia(); return false; }],
         [tr({ it: 'Chiudi', en: 'Close' }), 'ghost', ()=>{}]]);
    } catch (e) { toast(e.message, 'err'); }
  };
  modal(`${tr({ it: 'Classificazione · ', en: 'Classification · ' })}${d.track} ${d.layout}`, `
    <div class="muted" style="margin-bottom:10px">${esc(d.session)} · ${esc(d.event)} · ${tr({ it: 'ore ', en: 'at ' })}${d.hour ?? '?'}:${String(d.min ?? 0).padStart(2,'0')} · ${tr({ it: 'meteo ', en: 'weather ' })}${esc(d.weather ?? 'n/d')} · ${d.rows.length} ${tr({ it: 'piloti', en: 'drivers' })}</div>
    <table><thead><tr><th></th><th>${tr({ it: 'Pilota', en: 'Driver' })}</th><th>${tr({ it: 'Auto', en: 'Car' })}</th><th class="right">${tr({ it: 'Giri', en: 'Laps' })}</th><th class="right">${tr({ it: 'Miglior giro', en: 'Best lap' })}</th><th class="right">${tr({ it: 'Tempo', en: 'Time' })}</th><th class="right">${tr({ it: 'Gap', en: 'Gap' })}</th>${d.is_mp ? `<th class="right" title="${tr({ it: 'Testa a testa su tutte le volte che vi siete incrociati online (tu–lui)', en: 'Head-to-head across all your online meetings (you–him)' })}">⚔️</th>` : ''}</tr></thead>
    <tbody>${d.rows.map(r=>`<tr class="${r.me?'me':''}">
      <td class="muted">P${r.position}</td>
      <td>${esc(r.name)}${(r.me ?? !r.isAI) ? ` <span class="tag gold">${tr({ it: 'tu', en: 'you' })}</span>` : ''}</td>
      <td>${window.carLinkHtml(r.car)}</td>
      <td class="right">${r.laps}</td>
      <td class="right">${r.hasBest?'<b>'+esc(r.bestLap)+'</b>':esc(r.bestLap||'—')}</td>
      <td class="right">${esc(r.totalTime||'—')}</td>
      <td class="right">${r.gap!=null?fmtGap(r.gap):'—'}</td>
      ${h2hCol(r)}
    </tr>`).join('')}</tbody></table>`,
    [[tr({ it: '⚡ Rapporto Discord', en: '⚡ Discord report' }), 'primary', () => { apriRapporto(); return false; }],
     [tr({ it: 'Chiudi', en: 'Close' }), 'ghost',()=>{}]]);
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
    <h2><span class="st-ico">${STI.cup}</span> ${tr({ it: 'SALA TROFEI', en: 'TROPHY HALL' })} <span class="h-act">${tr({ it: 'tutto quello che la carriera ha vinto', en: 'everything the career has won' })}</span></h2>
    ${s.trophies?.length ? `<div class="st-trophies">${s.trophies.map(t=>`<div class="st-trophy">${rivalAvatarText(t.icon, 40)}<div><b>${esc(t.label)}</b><div class="muted" style="font-size:12px">${esc(t.detail)}</div></div></div>`).join('')}</div>` : ''}
    ${s.sigils?.length ? `<details style="margin-top:10px" open><summary style="cursor:pointer;font-size:12.5px"><b>${tr({ it: 'Sigilli del pilota', en: 'Driver sigils' })}</b> <span class="muted" style="font-size:11.5px">— ${s.sigils.length} ${tr({ it: 'sbloccati', en: 'unlocked' })}</span></summary>
      <div class="st-kpis" style="margin-top:8px">${s.sigils.map(x=>`<div class="kpi st-kpi" title="${tr({ it: 'dal ', en: 'since ' })}${esc(String(x.at||'').slice(0,10))}"><div class="l">${esc(x.label ?? x.id)}</div><div class="v" style="font-size:13.5px;font-weight:500">${esc(x.detailEn ?? x.detail ?? '')}</div></div>`).join('')}</div></details>` : ''}
    ${s.milestones?.length ? `<details style="margin-top:10px" ${s.milestones.some(m=>m.value>0)?'open':''}><summary style="cursor:pointer;font-size:12.5px"><b>${tr({ it: 'Traguardi di carriera', en: 'Career milestones' })}</b> <span class="muted" style="font-size:11.5px">— ${s.milestones.filter(m=>m.target).length}/${s.milestones.length} ${tr({ it: 'sbloccati', en: 'unlocked' })}</span></summary>
      <div class="st-kpis" style="margin-top:8px">${s.milestones.map(m=>{
        const cur=m.target??m.next??m.steps[0];
        const done=!!m.target;
        const pct=Math.min(100,Math.round(m.value/cur*100));
        return `<div class="kpi st-kpi" style="${done?'border-color:var(--ok,#4ade80)':''}" title="${tr({ it: 'prossimo scaglione', en: 'next tier' })}: ${m.next??'—'}"><div class="l">${m.icon||''} ${esc(m.label)} ${done?`<span style="color:var(--ok,#4ade80)">✓</span>`:''}</div><div class="v" style="font-size:13.5px;font-weight:500">${m.value}/${cur}</div><div style="height:3px;background:var(--line,#2a3341);border-radius:2px;margin-top:4px"><div style="height:100%;width:${pct}%;background:${done?'var(--ok,#4ade80)':'var(--acc,#6b8afd)'};border-radius:2px"></div></div></div>`;
      }).join('')}</div></details>` : ''}
  </div>` : '';
  /* 2) grafici andamento */
  const grafici = s.history.length >= 2 ? `
  <div class="grid2">
    ${stPan(tr({ it: 'Punti gara per gara', en: 'Points race by race' }), STI.bolt, `${svgLine(s.history.slice().reverse().map(r=>r.points))}<div class="muted" style="font-size:11px;margin-top:6px">${tr({ it: 'dal più vecchio (sinistra) al più recente (destra)', en: 'from oldest (left) to newest (right)' })}</div>`)}
    ${stPan(tr({ it: 'Posizioni in gara', en: 'Race positions' }), STI.gauge, `${svgLine(s.history.slice().reverse().map(r=>r.dnf?(r.gridSize??10):r.position),{lowerBetter:true,color:'var(--acc)'})}<div class="muted" style="font-size:11px;margin-top:6px">${tr({ it: 'P1 in alto · i ritiri valgono ultima posizione', en: 'P1 at top · retirements score last position' })}</div>`)}
  </div>` : '';
  /* 3) carriera in numeri: i quadri grandi */
  const numeri = stPan(tr({ it: 'Carriera in numeri', en: 'Career in numbers' }), STI.flag, stKpis([
    [tr({ it: 'Gare', en: 'Races' }), t.races, '', tr({ it: 'gare importate dai file risultato di EVO', en: 'races imported from EVO result files' })],
    [tr({ it: 'Vittorie', en: 'Wins' }), t.wins, t.wins ? 'acc' : '', tr({ it: 'P1 nelle gare della carriera', en: 'P1 in career races' })],
    [tr({ it: 'Podi', en: 'Podiums' }), t.podiums, t.podiums ? 'acc2' : '', tr({ it: 'arrivi nei primi 3', en: 'top-3 finishes' })],
    [tr({ it: 'Titoli', en: 'Titles' }), t.titles, t.titles ? 'good' : '', tr({ it: 'campionati vinti', en: 'championships won' })],
    [tr({ it: '% vittorie', en: '% wins' }), t.winRate + '%', '', tr({ it: 'vittorie / gare', en: 'wins / races' })],
    [tr({ it: '% podi', en: '% podiums' }), t.podiumRate + '%', '', tr({ it: 'podi / gare', en: 'podiums / races' })],
    [tr({ it: 'Pole', en: 'Poles' }), t.poles, t.poles ? 'good' : '', tr({ it: 'partenze davanti a tutti', en: 'starts ahead of everyone' })],
    [tr({ it: 'Giri veloci', en: 'Fastest laps' }), t.fastestLaps, '', tr({ it: 'miglior giro in gara', en: 'best lap in a race' })],
    [tr({ it: 'Giri percorsi', en: 'Laps driven' }), t.laps, '', tr({ it: 'giri completati in totale', en: 'total laps completed' })],
    [tr({ it: '€ per gara', en: '€ per race' }), t.avgPrize == null ? '—' : money(t.avgPrize), t.avgPrize ? 'acc2' : '', tr({ it: `premio medio per gara (totale ${money(t.totPrize ?? 0)}) — la bussola del bilanciamento`, en: `average prize per race (total ${money(t.totPrize ?? 0)}) — the economy compass` })],
    [tr({ it: 'rep per gara', en: 'rep per race' }), t.avgRep == null ? '—' : t.avgRep.toFixed(1), t.avgRep ? 'acc' : '', tr({ it: `reputazione media per gara (totale ${t.totRep ?? 0}) — cresce salendo di serie`, en: `average reputation per race (total ${t.totRep ?? 0}) — grows in higher series` })],
    [tr({ it: 'Rimonte', en: 'Comebacks' }), t.comebacks, '', tr({ it: 'piazzamenti migliori della griglia di partenza', en: 'finishes better than grid slot' })],
    [tr({ it: 'Gare in testa', en: 'Led wire-to-wire' }), t.ledAll, '', tr({ it: 'gare intere sempre al comando', en: 'races led from start to finish' })],
    [tr({ it: 'Posiz. guadagnate/gara', en: 'Positions gained/race' }), t.avgGain==null ? '—' : (t.avgGain>0?'+':'') + t.avgGain, '', tr({ it: 'media posizioni guadagnate rispetto alla partenza', en: 'average positions gained versus the start' })],
  ]));
  /* 4) tabelle: giri personali, piste, stagioni, saga e ultime gare */
  const bestLaps = stPan(tr({ it: 'Migliori giri personali', en: 'Personal best laps' }), STI.clock, s.bestLaps.length
    ? `<table><thead><tr><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Giro', en: 'Lap' })}</th><th>${tr({ it: 'Auto', en: 'Car' })}</th><th>${tr({ it: 'Quando', en: 'When' })}</th></tr></thead><tbody>${s.bestLaps.map(b=>`<tr><td><b><span style="cursor:pointer;text-decoration:underline dotted" title="${tr({ it: 'apri la scheda della pista', en: 'open the track card' })}" class="st-tracklink" data-track="${esc(b.display)}">${esc(b.display)}</span></b></td><td class="right"><b style="color:var(--acc2)">${esc(b.time)}</b></td><td>${b.car?`<span class="st-carlink" data-car="${esc(b.car)}" style="cursor:pointer;text-decoration:underline dotted" title="${tr({ it: 'apri la scheda tecnica dell\'auto', en: 'open the car spec sheet' })}">${esc(b.car)}</span>`:'<span class="muted">—</span>'}</td><td class="muted">${esc((b.at||'').slice(0,10))}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${tr({ it: 'Importa la tua prima gara: il miglior giro viene registrato dal file risultati.', en: 'Import your first race: the best lap is recorded from the result file.' })}</div>`, { note: tr({ it: 'dai file risultato di EVO', en: 'from EVO result files' }) });
  const tracksTab = stPan(tr({ it: 'Piste corse', en: 'Tracks raced' }), STI.book, s.tracks.length
    ? `<table><thead><tr><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Gare', en: 'Races' })}</th><th class="right">${tr({ it: 'Vittorie', en: 'Wins' })}</th><th class="right">${tr({ it: 'Best', en: 'Best' })}</th></tr></thead><tbody>${s.tracks.map(x=>`<tr><td><b><span style="cursor:pointer;text-decoration:underline dotted" title="${tr({ it: 'apri la scheda della pista', en: 'open the track card' })}" class="st-tracklink" data-track="${esc(x.display)}">${esc(x.display)}</span></b></td><td class="right">${x.races}</td><td class="right">${x.wins?'<span style="color:var(--good);font-weight:700">'+x.wins+'</span>':'0'}</td><td class="right">${x.bestLap?`<b>${esc(x.bestLap.time)}</b>`:'—'}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${tr({ it: 'Ancora nessuna pista.', en: 'No tracks yet.' })}</div>`);
  const seasonsTab = stPan(tr({ it: 'Stagioni', en: 'Seasons' }), STI.scroll, s.seasons.length
    ? `<table><thead><tr><th>${tr({ it: 'Stagione', en: 'Season' })}</th><th>${tr({ it: 'Serie', en: 'Series' })}</th><th class="right">${tr({ it: 'Pos', en: 'Pos' })}</th><th class="right">${tr({ it: 'Punti', en: 'Points' })}</th><th class="right">${tr({ it: 'Gare', en: 'Races' })}</th><th class="right">${tr({ it: 'Premi', en: 'Prizes' })}</th><th class="right">${tr({ it: '€/gara', en: '€/race' })}</th><th class="right">${tr({ it: 'rep/gara', en: 'rep/race' })}</th><th>${tr({ it: 'Contratto', en: 'Contract' })}</th></tr></thead><tbody>${s.seasons.map(x=>`<tr><td><b>S${x.season}</b></td><td><span class="st-serlink" data-ser="${esc(x.display)}" style="cursor:pointer;text-decoration:underline dotted" title="${tr({ it: 'vai al tab Campionati', en: 'go to the Championships tab' })}">${esc(x.display)}</span></td><td class="right"><b>P${x.position}</b></td><td class="right">${x.points}</td><td class="right">${x.races ?? '—'}</td><td class="right">${x.prize ? money(x.prize) : '—'}</td><td class="right">${x.avgPrize != null ? `<b style="color:var(--acc2)">${money(x.avgPrize)}</b>` : '—'}</td><td class="right">${x.avgRep != null ? `<b style="color:var(--acc)">${x.avgRep.toFixed(1)}</b>` : '—'}</td><td>${x.champion?`<span class="tag gold">${tr({ it: 'titolo', en: 'title' })}</span> `:''}${x.contract==='kept'?`<span class="tag good">${tr({ it: 'clausole ✓', en: 'clauses ✓' })}</span>`:x.contract==='failed'?`<span class="tag bad">${tr({ it: 'clausole ✗', en: 'clauses ✗' })}</span>`:''}</td></tr>`).join('')}</tbody></table>`
      + `<div class="muted" style="margin-top:8px;font-size:12px">${tr({ it: 'Premi e reputazione sommati dai risultati reali di ogni stagione: chi la €/gara o la rep/gara sale o scende di brutta da un anno all’altro, l’economia (o la difficoltà) della serie è cambiata.', en: 'Prizes and reputation summed from the real results of each season: if €/race or rep/race jumps up or down between years, the series economy (or difficulty) changed.' })}</div>`
    : `<div class="empty">${tr({ it: 'La prima stagione è in corso.', en: 'The first season is in progress.' })}</div>`);
  const sagaTab = s.saga?.length ? stPan(tr({ it: 'La saga', en: 'The saga' }), STI.book, `<table><thead><tr><th>#</th><th>${tr({ it: 'Gara', en: 'Race' })}</th><th class="right">${tr({ it: 'Pos', en: 'Pos' })}</th><th class="right">${tr({ it: 'Punti', en: 'Points' })}</th></tr></thead><tbody>${s.saga.slice().reverse().map((x,i)=>`<tr${x.dnf?' style="color:var(--bad)"':''}><td class="faint">${s.saga.length-i}</td><td><span style="cursor:pointer;text-decoration:underline dotted" class="st-tracklink" data-track="${esc(x.track)}" title="${tr({ it: 'la pista in scheda', en: 'the track card' })}">${esc(x.track)}</span> <span class="faint">S${x.season} · ${esc(x.series)}</span></td><td class="right"><b>${x.dnf?tr({ it: 'rit.', en: 'DNF' }):x.position?'P'+x.position:'—'}</b></td><td class="right">${x.points}</td></tr>`).join('')}</tbody></table>`, { note: tr({ it: 'ultime gare in ordine cronologico', en: 'latest races in chronological order' }) }) : '';
  const ultimeTab = stPan(tr({ it: 'Ultime gare', en: 'Latest races' }), STI.flag, s.history.length
    ? `<table><thead><tr><th>${tr({ it: 'Gara', en: 'Race' })}</th><th class="right">${tr({ it: 'Pos', en: 'Pos' })}</th><th class="right">${tr({ it: 'Giri', en: 'Laps' })}</th><th class="right">${tr({ it: 'Giro', en: 'Lap' })}</th><th class="right">${tr({ it: 'Gap', en: 'Gap' })}</th><th class="right">${tr({ it: 'Punti', en: 'Points' })}</th></tr></thead><tbody>${s.history.map(r=>`<tr${r.dnf?' style="color:var(--bad)"':''}><td><span style="cursor:pointer;text-decoration:underline dotted" class="st-tracklink" data-track="${esc(r.track)}" title="${tr({ it: 'la pista in scheda', en: 'the track card' })}">${esc(r.track)}</span> <span class="faint">S${r.season} R${r.round}</span>${r.fl?` <span class="tag gold">${tr({ it: 'gv', en: 'FL' })}</span>`:''}</td><td class="right"><b>${r.dnf?tr({ it: 'rit.', en: 'DNF' }):r.position?'P'+r.position:'—'}</b></td><td class="right">${r.laps ?? '—'}</td><td class="right">${r.bestLap?esc(r.bestLap):'—'}</td><td class="right">${fmtGap(r.gapMs)}</td><td class="right"><b>${r.points}</b></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${tr({ it: 'Nessuna gara in archivio.', en: 'No races in the archive.' })}</div>`, { note: tr({ it: 'telemetria dal file di EVO', en: 'telemetry from the EVO file' }) });
  m.innerHTML = `<div id="stats-vetrina">${vetrina}</div>${grafici}${numeri}
  <div class="grid2">${bestLaps}${tracksTab}</div>
  <div class="grid2">${seasonsTab}${sagaTab || ''}${ultimeTab}</div>`;
  /* cross-link stile FM (28/10): auto → scheda auto, serie → tab Campionati */
  $$('.st-tracklink', m).forEach((e) => { e.onclick = () => vai('tracks', { search: e.dataset.track }); });
  $$('.st-carlink', m).forEach((e) => { e.onclick = () => vai('cars', { search: e.dataset.car }); });
  $$('.st-serlink', m).forEach((e) => { e.onclick = () => vai('championships'); });
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
    prize:{icon:'🏆',label:tr({ it: 'premio gara', en: 'race prize' }),side:'in'}, sponsor:{icon:'🤝',label:tr({ it: 'sponsor', en: 'sponsor' }),side:'in'},
    bonus:{icon:'⭐',label:tr({ it: 'bonus', en: 'bonus' }),side:'in'}, contract:{icon:'📜',label:tr({ it: 'contratto', en: 'contract' }),side:'in'},
    income:{icon:'💰',label:tr({ it: 'vendita', en: 'sale' }),side:'in'}, seed:{icon:'🌱',label:tr({ it: 'ripartenza', en: 'starting balance' }),side:'in'},
    entry:{icon:'🎟️',label:tr({ it: 'iscrizione', en: 'entry fee' }),side:'out'}, rent:{icon:'🏠',label:tr({ it: 'affitto', en: 'rent' }),side:'out'},
    buy:{icon:'🛒',label:tr({ it: 'acquisto', en: 'purchase' }),side:'out'}, penalty:{icon:'⚠️',label:tr({ it: 'penalità', en: 'penalty' }),side:'out'},
    rep:{icon:'📊',label:tr({ it: 'reputazione', en: 'reputation' }),side:null},
  };
  const tot = rows.reduce((a,r)=>{ const v=Number(r.money??0); if(!r.money) return a; (v>0?a.in:a.out)[0]+=0; if(v>0)a.in[0]+=v; else a.out[0]-=v; return a; }, {in:[0],out:[0]});
  const filtri=[['tutte', tr({ it: 'Tutte', en: 'All' })],['entrate',tr({ it: 'entrate', en: 'in' })],['uscite',tr({ it: 'uscite', en: 'out' })]];
  const rowsHtml = rows
    .filter(r=>bancaView.filter==='in' ? Number(r.money??0)>0 : bancaView.filter==='out' ? Number(r.money??0)<0 : true)
    .map((r)=>{ const k=KIND[r.kind]||{icon:'•',label:r.kind,side:null}; const m=Number(r.money??0);
      return `<tr><td class="faint" style="white-space:nowrap">${esc(String(r.at||'').slice(5,16).replace('T',' '))}</td><td>${k.icon} <span class="muted">${esc(k.label)}</span></td><td>${esc(legacyIt(r.reason??''))}</td><td class="right" style="white-space:nowrap">${m?`<span style="color:${m>0?'var(--good)':'var(--bad)'};font-weight:600">${m>0?'+':''}${money(m)} €</span>`:(r.rep?`<span class="faint">rep ${r.rep>0?'+':''}${r.rep}</span>`:'')}</td></tr>`;
    }).join('');
  m.innerHTML = `
  <div class="panel">
    <h2>${STI.euro} ${tr({ it: 'FINANZE', en: 'FINANCES' })} <span class="h-act">${tr({ it: 'saldo attuale ', en: 'current balance ' })}${money(boot.header.money)} € · ${tot.in[0]>0?'+'+money(tot.in[0]):'0'} € ${tr({ it: 'entrate', en: 'in' })} · ${money(tot.out[0])} € ${tr({ it: 'uscite', en: 'out' })} (${tr({ it: 'ultimi ', en: 'last ' })}${rows.length} ${tr({ it: 'movimenti', en: 'entries' })})</span></h2>
    <div style="display:flex;gap:6px;margin:8px 0 10px">${filtri.map(([id,lab])=>`<button class="mini ${bancaView.filter===id?'acc':''}" data-bf="${id}">${lab??id}</button>`).join('')}</div>
    ${rowsHtml
      ? `<table><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'Tipo', en: 'Type' })}</th><th>${tr({ it: 'Motivo', en: 'Reason' })}</th><th class="right">${tr({ it: 'Importo', en: 'Amount' })}</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
      : `<div class="empty">${tr({ it: 'Nessun movimento del tipo scelto.', en: 'No entries of the chosen type.' })}</div>`}
    <div class="muted" style="margin-top:10px;font-size:12px">${tr({ it: 'Il registro parte dalla nascita del registro flussi: i tempi passati della carriera risultano come un unico movimento "ripartenza", calcolato a posteriori.', en: 'The ledger starts when the flow ledger was born: earlier career times show up as a single "starting balance" entry, computed after the fact.' })}</div>
  </div>`;
  $$('button[data-bf]').forEach(b=>{ b.onclick=()=>{ bancaView.filter=b.dataset.bf; drawBanca(m); }; });
}
const bancaView = { filter:'tutte' };

