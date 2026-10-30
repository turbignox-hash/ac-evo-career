
/* -------- difficoltà -------- */
async function drawDifficulty(m){
  const v = await api('difficulty');
  const rng = v.trimRange ?? {min:-20, max:20};
  const sr = v.sliderRange ?? {min:0, max:120};
  // MODO ADATTIVO = l'app regola le bande da sola (suggerimento in attesa, accetta/rifiuta):
  // i comandi a MANO della pagina (trim ± e cursori di banda) sono FERMI fino a che si
  // torna su «fissa» — chiesto Mauro 27/10: niente doppie leve che si pestano i piedi.
  const adattivo = v.mode === 'adaptive';
  m.innerHTML = `
  <div class="panel">
    <h2>${tr({ it: 'Difficoltà AI', en: 'AI difficulty' })} <span class="h-act">${tr({ it: 'modalità ', en: 'mode ' })}${v.mode === 'adaptive' ? tr({ it: 'adattiva', en: 'adaptive' }) : tr({ it: 'fissa', en: 'fixed' })}</span></h2>
  <div class="banner info" style="margin:0 0 12px">${tr({ it: 'Lo slider AI di Assetto Corsa EVO va da {MIN} a {MAX}. La banda che scegli qui viene scritta DAVVERO nei cursori del gioco e cambia la gara: vale alla PROSSIMA apertura del weekend — se il weekend era già avviato, resta la vecchia banda fino alla riapertura, e lo screen di caricamento mostra quella del weekend avviato. Banda consigliata STRETTA: min–max entro 1 punto (avvicina anche gli ultimi).', en: 'The AI slider of Assetto Corsa EVO goes from {MIN} to {MAX}. The band you pick here is really written to the game sliders and changes the race: it takes effect at the NEXT weekend open — a weekend already running keeps the old band until reopened, and the loading screen shows that one. Suggested band is NARROW: min–max within 1 point (brings the backmarkers closer).' }).replace('{MIN}', `<b>${sr.min}</b>`).replace('{MAX}', `<b>${sr.max}%</b>`)}</div>
    <div class="row" style="margin-bottom:12px">
      <button class="mini ${v.mode==='adaptive'?'on':''}" data-mode="adaptive">${tr({ it: 'adattiva', en: 'adaptive' })}</button>
      <button class="mini ${v.mode==='fixed'?'on':''}" data-mode="fixed">${tr({ it: 'fissa', en: 'fixed' })}</button>
      <input type="number" id="i-diffval" min="70" max="120" value="95" style="width:90px" title="${tr({ it: 'valore fisso (70–120)', en: 'fixed value (70–120)' })}">
      ${adattivo ? `<span class="muted" style="margin-left:10px" title="${tr({ it: 'il modo adattivo regola il trim ed è lui che propone (accetta/rifiuta qui sotto): trim ± e cursori a mano sono fermi — premi «fissa» per riprendere il controllo manuale', en: 'adaptive mode tunes the trim by itself and makes the suggestions (accept/reject below): manual trim ± and drag handles are locked — press fixed to regain manual control' })}">🔒 ${tr({ it: 'adattivo attivo: trim e cursori a mano fermi (passa su «fissa» per regolarli a mano)', en: 'adaptive on: manual trim and handles locked (switch to fixed for manual control)' })}</span>` : ''}
      ${(v.global ?? 0) !== 0 ? `<span class="muted" style="margin-left:10px" title="${tr({ it: 'somma dei ± che hai premuto sui bottoni «aumenta/diminuisci difficoltà» del cruscotto: vale per le PROSSIME gare in ogni serie', en: 'the sum of the ± you pressed on the dashboard "raise/lower difficulty" buttons: it counts for UPCOMING races in every series' })}">⚡ ${tr({ it: 'adattivo generale ', en: 'general adaptive ' })}<b>${v.global>0?'+':''}${v.global}</b> ${tr({ it: '(registrato dai nudge del cruscotto)', en: '(recorded from the dashboard nudges)' })}</span>` : ''}
    </div>
    ${v.pending ? `<div class="banner ${v.pending.to>=(v.trimRange?.max??20)?'warn':''}">${tr({ it: 'Suggerimento in attesa —', en: 'Pending suggestion —' })} ${esc(v.pendingDisplay)}: ${esc(v.pending.reason)} → trim ${v.pending.to >= 0 ? '+' : ''}${v.pending.to}${v.pending.to>=(v.trimRange?.max??20)?` (${tr({ it: 'massimo raggiunto', en: 'max reached' })})`:''}
      <button class="mini" id="b-acc">${tr({ it: 'accetta', en: 'accept' })}</button> <button class="mini" id="b-rej">${tr({ it: 'rifiuta', en: 'reject' })}</button></div>` : ''}
    <div style="margin-top:10px">
    ${v.rows.map(r=>{
      const atMax = r.trim >= (v.trimRange?.max ?? 20);
      return `<div class="diff-row" data-id="${esc(r.id)}" data-trim="${r.trim??0}"${r.id?.startsWith('evento_')?' data-evento="1"':''}>
      <span>${r.current?'◄':''}</span><span class="nm">${esc(r.display)}${r.locked?' 🔒':''}</span>
      <span class="num" title="${tr({ it: 'base della serie + trim', en: 'series base + trim' })}">${tr({ it: 'base', en: 'base' })} ${r.base}</span><span class="num" title="${tr({ it: 'trim adattivo', en: 'adaptive trim' })} (±${rng.max})">${tr({ it: 'trim', en: 'trim' })} ${r.trim>=0?'+':''}${r.trim}${atMax?' ⚠️':''}</span>
      ${r.id?.startsWith('evento_') ? '' : `<span class="tripunto" style="display:inline-flex;gap:2px" title="${tr({ it: 'trim a mano da +3 a −3 (Mauro 27/10): un punto di trim = un punto di banda AI della serie', en: 'manual trim from +3 to −3 (Mauro 27/10): one trim point = one AI band point of the series' })}${adattivo ? tr({ it: ' · modo adattivo attivo: comandi fermi, l\'app regola da sola — passa su «fissa» per il controllo manuale', en: ' · adaptive mode on: locked, the app tunes by itself — switch to fixed for manual control' }) : ''}">
        ${[1,2,3].map(d=>`<button class="mini dy" data-d="-${d}" ${r.locked||adattivo?'disabled':''} title="${tr({ it: 'trim −', en: 'trim −' })}${d}">−${d}</button>`).join('')}
        ${[1,2,3].map(d=>`<button class="mini dy" data-d="+${d}" ${r.locked||adattivo?'disabled':''} title="${tr({ it: 'trim +', en: 'trim +' })}${d}">+${d}</button>`).join('')}
      </span>`}
      <span class="num" title="${tr({ it: 'correzione classe / pista', en: 'class / track correction' })}">${r.offClass>=0?'+':''}${r.offClass}/${r.offTrack>=0?'+':''}${r.offTrack}</span>
      <span class="sl" title="${tr({ it: 'centro consigliato convertito in slider EVO', en: 'suggested centre converted into the EVO slider' })}">${r.slider}%</span>
      <span class="rangebox">
        <span class="duo" title="${tr({ it: ' due cursori sulla STESSA barra, come nel gioco: trascina il minimo e il massimo (consiglio: banda di 1 punto). Si scrivono anche sui cursori di EVO, alla prossima apertura del weekend', en: 'two handles on the SAME bar, like in the game: drag the minimum and maximum (suggest: 1-point band). Written to the EVO sliders too, at the next weekend open' })}${adattivo ? tr({ it: ' — modo adattivo: fermi, la banda la decide l\'app', en: ' — adaptive mode: locked, the band is decided by the app' }) : ''}">
          <span class="sel" style="left:${Math.min(r.rangeMin,r.rangeMax)}%;right:${100-Math.max(r.rangeMin,r.rangeMax)}%"></span>
          <input type="range" class="smin" min="0" max="100" step="1" value="${r.rangeMin}" ${r.locked||adattivo?'disabled':''}>
          <input type="range" class="smax" min="0" max="100" step="1" value="${r.rangeMax}" ${r.locked||adattivo?'disabled':''}>
        </span>
        <b class="pair">${Math.min(r.rangeMin,r.rangeMax)}–${Math.max(r.rangeMin,r.rangeMax)}%</b>
        <button class="mini rc" title="${tr({ it: 'torna al consiglio: centro ±5', en: 'back to the suggestion: centre ±5' })}" ${r.overridden?'':'style="visibility:hidden"'}>↺</button>
      </span>
    </div>`;}).join('')}
    </div>
    <div class="muted" style="margin-top:10px">⚠️ = ${tr({ it: 'trim al massimo (', en: 'trim at the max (' })}${rng.max}): ${tr({ it: 'oltre si va solo cambiando serie. Coi due cursori fai la banda min–max da impostare in EVO', en: 'beyond you only move by changing series. With the two handles you make the min–max band to set in EVO' })} (${sr.min}–${sr.max}), ${tr({ it: 'come nel gioco: si salvano al rilascio (e si scrivono anche nei cursori di EVO); ↺ torna al consiglio (centro e centro+1). Il consiglio si ferma a 100: se una serie resta facile anche a fondo scala, si cambia serie.', en: 'as in the game: saved on release (and written to the EVO sliders); ↺ goes back to the suggestion (centre and centre+1). The suggestion stops at 100: if a series stays easy even at full scale, change series.' })}</div>
  </div>`;
  $$('button[data-mode]').forEach(b => { b.onclick = async () => {
    try { await api('difficulty-action', {op:'mode', mode:b.dataset.mode, value:Number($('#i-diffval').value)}); render(); } catch(e){ toast(e.message,'err'); }
  }; });
  $('#b-acc')?.addEventListener('click', async () => { await api('difficulty-action', {op:'accept'}); render(); });
  $('#b-rej')?.addEventListener('click', async () => { await api('difficulty-action', {op:'reject'}); render(); });
  // trim a mano ±1/±2/±3 per riga (Mauro 27/10, «fino a +3 −3, 1,2,3»): il segno
  // SUL TRIM della serie (non sulla banda), e la banda slitta insieme: 1 punto
  // di trim = 1 punto slider. Eventi (righe evento_*) restano a banda fissa.
  $$('.dy', m).forEach(b => { b.onclick = async () => {
    try {
      const row = b.closest('.diff-row');
      const cur = Number(row?.dataset.trim ?? 0);
      const next = Math.max(-20, Math.min(20, cur + Number(b.dataset.d)));
      await api('difficulty-action', { op: 'trim', nodeId: b.closest('.diff-row').dataset.id, value: next });
      render();
    } catch(e){ toast(e.message, 'err'); }
  }; });
  // intervallo min-max di ogni serie, come nel gioco: DUE cursori sulla stessa
  // barra. Al trascinamento si ricollocano a vicenda (il minimo non passa sopra
  // il massimo e viceversa); si salvano solo al rilascio, e il server riscrive
  // i cursori del gioco (gamemodesave 30/31).
  const clampDuo = (duo, who, {z = false} = {}) => {
    const smin = $('.smin', duo), smax = $('.smax', duo), sel = $('.sel', duo);
    let lo = Math.max(0, Math.min(100, Number(smin.value)));
    let hi = Math.max(0, Math.min(100, Number(smax.value)));
    if (lo > hi) { if (who === 'smin') { hi = lo; smax.value = hi; } else { lo = hi; smin.value = lo; } }
    smin.value = String(lo); smax.value = String(hi);
    sel.style.left = lo + '%'; sel.style.right = (100 - hi) + '%';
    const pair = duo.parentElement.querySelector('.pair');
    if (pair) pair.textContent = `${lo}\u2013${hi}%`;
    // a banda chiusa i due cursori si coprono: sta sopra quello MOSSO PER ULTIMO
    if (z) { smax.style.zIndex = lo >= hi ? 3 : 1; smin.style.zIndex = lo >= hi ? 2 : 3; }
    return [lo, hi];
  };
  const saveRange = async (row) => {
    const duo = $('.duo', row);
    const [min, max] = clampDuo(duo, null);
    try {
      await api('difficulty-action', {op:'range', nodeId: row.dataset.id, min, max});
      toast(tr({ it: 'Intervallo di {S}: {R}%', en: 'Range of {S}: {R}%' }).replace('{S}', row.querySelector('.nm').textContent.trim()).replace('{R}', `${min}\u2013${max}`), 'ok');
    } catch(e){ toast(e.message, 'err'); }
  };
  $$('.diff-row', m).forEach(row => {
    const duo = $('.duo', row);
    if (!duo) return;
    clampDuo(duo, null);
    [$('.smin', duo), $('.smax', duo)].forEach(inp => { inp.addEventListener('input', (e) => clampDuo(duo, e.target.classList.contains('smin') ? 'smin' : 'smax', {z:true})); });
    [$('.smin', duo), $('.smax', duo)].forEach(inp => { inp.addEventListener('change', () => saveRange(row)); });
    $('.rc', row)?.addEventListener('click', async () => {
      try { await api('difficulty-action', {op:'range', nodeId: row.dataset.id, clear:true}); toast(row.dataset.id.startsWith('evento_')
        ? tr({ it: 'Banda dell\'evento tornata al fisso 88–93 (quella della scheda evento).', en: 'Event band back to the fixed 88–93 (the event card one).' })
        : tr({ it: 'Tornato il consiglio automatico (cursori del gioco tornati a centro ±5).', en: 'Back to the automatic suggestion (game sliders back to centre ±5).' }), 'ok'); }
      catch(e){ toast(e.message, 'err'); }
    });
  });
}

/* -------- messaggi / offerte -------- */
let mailFilter = 'tutte';
async function drawMessages(m){
  const v = await api('messages');
  const mb = v.mailbox ?? { mails: [] };
  const KIND_META = {
    'Racing':   ['btn-racing',   '🏁', tr({ it: 'Direttore di corsa e gara di oggi: la mail che decide la giornata', en: "Race director and today's race: the email that decides the day" })],
    'Sponsor':  ['btn-sponsor',  '💼', tr({ it: 'Sponsor: quote, missioni e proposte', en: 'Sponsors: fees, missions and proposals' })],
    'Contratti':['btn-contratti','✍️', tr({ it: 'Il tuo manager: contratti, impegni e conflitti di calendario', en: 'Your manager: contracts, commitments and calendar conflicts' })],
    'Carriera': ['btn-carriera', '🧭', tr({ it: 'Carriera: reputazione, trim, guida alla scala', en: 'Career: reputation, trim, ladder guidance' })],
  };
  const kinds = ['tutte', ...Object.keys(KIND_META)];
  const chips = kinds.map((k)=>`<button class="mini ${mailFilter===k?'acc':''}" data-mf="${k}">${k==='tutte'?tr({ it: 'tutte', en: 'all' }):(KIND_META[k]?KIND_META[k][1]+' '+(window.LINGUA==='en'?{Racing:'Racing',Sponsor:'Sponsor',Contratti:'Contracts',Carriera:'Career'}[k]??k:k):k)}</button>`).join('');
  const mails = mb.mails.filter((x) => mailFilter==='tutte' || x.kind===mailFilter);
  const mailCard = (mm) => {
    const [cls, ico] = KIND_META[mm.kind] ?? ['', '✉️'];
    // AZIONI DIRETTE in posta: guidate dai metadati `action` della mailbox
    // (una email = una decisione, e la decisione ha il suo bottone qui).
    let actions = '';
    if (mm.action?.kind === 'vai-gara') {
      actions = `<button class="mini acc" data-maction="vai-gara">🏁 ${tr({ it: 'vai alla gara', en: 'go to the race' })}</button>`;
    } else if (mm.action?.kind === 'vai-agenda') {
      actions = `<button class="mini acc" data-maction="vai-agenda">${tr({ it: 'apri il Centro gare', en: 'open the Race centre' })}</button>`;
    } else if (mm.action?.kind === 'vai-classifica') {
      actions = `<button class="mini acc" data-maction="vai-classifica">🏅 ${tr({ it: 'apri la Classifica', en: 'open Standings' })}</button>`;
    } else if (mm.action?.kind === 'sponsor-sign') {
      { const nm = String(mm.action.name ?? ''); const tierTxt = nm.includes('tier') ? '' : ` (${tr({ it: 'tier', en: 'tier' })} ${mm.action.tier ?? '?'})`;
      actions = `<button class="mini acc" data-maction="sponsor-sign" data-tier="${mm.action.tier ?? ''}" data-name="${esc(nm)}">✍️ ${tr({ it: 'firma con', en: 'sign with' })} ${esc(nm || 'sponsor')}${tierTxt}</button>`; }
    } else if (mm.action?.kind === 'vai-rivale') {
      actions = `<button class="mini acc" data-maction="vai-rivale" data-rival="${esc(mm.action.rivalKey ?? '')}">🔙 ${tr({ it: 'apri la scheda di', en: 'open the card of' })} ${esc(mm.action.name ?? 'rivale')}</button>`;
    } else if (mm.kind === 'Carriera' && /trim/i.test(mm.corpo)) {
      actions = `<button class="mini acc" data-maction="trim-check">⚖️ ${tr({ it: 'vedi il trim (Difficoltà)', en: 'see the trim (Difficulty)' })}</button>`;
    }
    return `<div class="mail ${cls}">
      <div class="mh2"><span class="mi">${ico}</span>
        <b class="oggetto">${esc(mm.oggetto)}</b>
        ${mm.priorita==='urgente' ? `<span class="tag gold" style="margin-left:8px">⚠️ ${tr({ it: 'urgente', en: 'urgent' })}</span>` : ''}
      </div>
      <div class="mfrom muted">${esc(mm.from)} · ${esc(mm.date)}</div>
      <pre class="mcorpo">${esc(mm.corpo)}</pre>
      ${actions ? `<div class="row" style="gap:6px;margin-top:8px">${actions}</div>` : ''}
      ${mm.action?.rivals?.length ? `<div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap">${mm.action.rivals.map(r=>`<span class="chip gold" data-rival="${esc(r.key??'')}" style="cursor:pointer" title="${tr({ it: 'apri la scheda pilota', en: 'open the driver card' })}">${esc(r.name)}</span>`).join('')}</div>` : ''}
      ${mm.action?.rows?.length ? `<div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap">${mm.action.rows.map((rr)=>`<span class="chip" data-row-node="${esc(rr.nodeId??'')}" data-row-track="${esc(rr.trackKey??'')}" style="cursor:pointer" title="${tr({ it: 'serie → scheda gara · pista → scheda pista', en: 'series → race card · track → track card' })}">${esc(rr.label)}</span> <span class="chip gold" data-track-open="${esc(rr.trackKey??'')}" data-track-name="${esc(rr.track)}" style="cursor:pointer;font-size:10px;padding:1px 6px" title="${tr({ it: 'apri la scheda pista', en: 'open the track card' })}">📍</span>`).join('')}</div>` : ''}
    </div>`;
  };
  m.innerHTML = `
  <div class="panel">
    <h2>${tr({ it: 'Posta del pilota', en: 'Driver mailbox' })} <span class="h-act">${mb.mails.length} ${tr({ it: 'email', en: 'emails' })} · ${esc(mb.oggi ?? '')}</span></h2>
    <div class="row" style="margin-bottom:10px">${chips}</div>
    ${(()=>{ const nUrg = mails.filter(x=>x.priorita==='urgente').length; return nUrg ? `<div class="muted" style="margin-bottom:8px">⚠️ ${nUrg} ${tr({ it: nUrg===1 ? 'email urgente (gare da disputare, conflitti da risolvere)' : 'email urgenti (gare da disputare, conflitti da risolvere)', en: nUrg===1 ? 'urgent email (races to run, conflicts to resolve)' : 'urgent emails (races to run, conflicts to resolve)' })}</div>` : ''; })()}
    ${mails.length ? mails.map(mailCard).join('') : `<div class="empty">${tr({ it: 'Niente in questa casella: torna più tardi o cambia filtro.', en: 'Nothing in this box: come back later or change the filter.' })}</div>`}
  </div>
  <div class="grid2">
    <div class="panel"><h2>${tr({ it: 'Diario di bordo', en: "Driver's logbook" })}</h2>${v.messages.length ? v.messages.map(msgRow).join('') : `<div class="empty">${tr({ it: 'Nessun messaggio nel diario.', en: 'No logbook messages.' })}</div>`}</div>
    <div class="panel"><h2>${tr({ it: 'Offerte sul tavolo', en: 'Offers on the table' })}</h2>
      ${v.offers.length ? v.offers.map(o=>`<div class="offer"><span class="n">${esc(o.display)}</span>
        <span class="muted">L${o.level} · ${esc(o.discipline)} · ${esc(o.note)} · ${tr({ it: 'affitto', en: 'rent' })} ${money(o.rent)} €</span>
        <span class="m"><button class="mini" data-detail="${o.index}" data-name="${esc(o.display)}" ${o.detail?'':'disabled'}>${tr({ it: 'dettagli', en: 'details' })}</button>
        <button class="mini" data-acc="${o.index}" data-name="${esc(o.display)}">${tr({ it: 'firma', en: 'sign' })}</button></span></div>`).join('')
      : `<div class="empty">${tr({ it: 'Nessuna offerta al momento: arrivano a fine stagione. ATTENZIONE: firma solo quando hai gare libere nella giornata (mail del manager).', en: 'No offers right now: they arrive at season end. CAREFUL: sign only when you have free races in the day (the manager email).' })}</div>`}
    </div>
  </div>
  <div class="panel" style="margin-top:14px"><h2>⚡ ${tr({ it: 'Azioni rapide', en: 'Quick actions' })}</h2>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="mini acc" data-quick="sponsor-check" title="${tr({ it: 'firma o rifiuta la proposta di sponsor nel cruscotto', en: 'sign or decline the sponsor proposal on the dashboard' })}">🤝 ${tr({ it: 'Sponsor: apri le decisioni', en: 'Sponsor: open the decisions' })}</button>
      <button class="mini acc" data-quick="challenge-check" title="${tr({ it: 'sfida della ronda: accetta o lascia', en: 'round challenge: accept or leave' })}">🎯 ${tr({ it: 'Sfida della ronda', en: 'Round challenge' })}</button>
      <button class="mini" data-quick="mail-all">📨 ${tr({ it: 'tutte le email', en: 'all emails' })}</button>
    </div>
    <div class="muted" style="margin-top:6px;font-size:12px">${tr({ it: 'Le decisioni più importanti (sponsor, sfida) si firmano nel Cruscotto: il bottone ti porta lì con il pannello pronto.', en: 'The most important decisions (sponsor, challenge) are signed on the Dashboard: the button takes you there with the panel ready.' })}</div>
  </div>`;
  $$('button[data-mf]').forEach(b => { b.onclick = () => { mailFilter = b.dataset.mf; drawMessages(m); }; });
  // azioni dalle email: la posta diventa OPERATIVA (gare, agenda, trim)
  $$('button[data-maction]').forEach(b => { b.onclick = async () => {
    const a = b.dataset.maction;
    if (a === 'vai-gara') { tab = 'dashboard'; drawNav(); render(); }
    else if (a === 'vai-agenda') { tab = 'agenda'; drawNav(); render(); }
    else if (a === 'trim-check') { tab = 'difficulty'; drawNav(); render(); }
    else if (a === 'vai-classifica') { tab = 'standings'; drawNav(); render(); }
    else if (a === 'vai-rivale') {
      const k = b.dataset.rival;
      if (k && typeof showRival === 'function') showRival(k);
      else toast(tr({ it: 'Scheda rivale non disponibile.', en: 'Rival card not available.' }), 'err');
    }
    else if (a === 'sponsor-sign') {
      const tier = b.dataset.tier ? Number(b.dataset.tier) : null;
      const name = b.dataset.name || 'sponsor';
      modal(tr({ it: 'Firma dello sponsor', en: 'Sponsor signing' }), `
        <p>${tr({ it: 'Stai per firmare con', en: 'You are about to sign with' })} <b>${esc(name)}</b>${tier ? ` (${tr({ it: 'tier', en: 'tier' })} ${tier})` : ''}.</p>
        <p class="muted">${tr({ it: 'Il contratto entra subito in campo: quota a gara + missione a tema.', en: 'The contract enters the field right away: per-race fee + themed mission.' })}</p>`,
        [[tr({ it: 'Annulla', en: 'Cancel' }), 'ghost', () => {}], [tr({ it: 'Firma', en: 'Sign' }), 'act', async () => {
          try { await api('sponsor-accept', { tier }); toast(tr({ it: 'Contratto sponsor firmato: ', en: 'Sponsor contract signed: ' }) + name, 'ok'); render(); }
          catch(e){ toast(e.message,'err'); return false; }
        }]]);
    }
  }; });
  // CHIP RIVALI nel bollettino: scheda pilota a un clic
  $$('.chip[data-rival]', m).forEach(c => { c.onclick = () => {
    const k = c.dataset.rival;
    if (k && typeof showRival === 'function') showRival(k);
    else toast(tr({ it: 'Rivale non in registro.', en: 'Rival not in the registry.' }), 'info');
  }; });
  // RIGHE SETTIMANALE/ATARDO: chip serie (card gara) + 📍 pista (scheda pista)
  $$('.chip[data-row-node]', m).forEach(c => { c.onclick = () => { tab = 'dashboard'; drawNav(); render(); toast(tr({ it: 'Scheda gara nel Cruscotto.', en: 'Race card on the Dashboard.' }), 'info'); }; });
  $$('.chip[data-track-open]', m).forEach(c => { c.onclick = () => {
    const nome = c.dataset.trackName;
    tab = 'tracks'; drawNav(); render().then?.(() => {});
    setTimeout(() => {
      $$('.b-hist').forEach(btn => { if (btn.dataset.hist && esc(nome).toLowerCase().includes(btn.dataset.hist.replace(/_/g,' ')) ) btn.click(); });
    }, 350);
  }; });
  // azioni rapide: sessioni decisionali veloci senza cercare i pannelli
  $$('button[data-quick]').forEach(b => { b.onclick = () => {
    const a = b.dataset.quick;
    if (a === 'sponsor-check' || a === 'challenge-check') { tab = 'dashboard'; drawNav(); render(); toast(tr({ it: 'Pannello "Vita fuori pista" nel Cruscotto: firma o rifiuta da lì.', en: 'The "Life off track" panel on the Dashboard: sign or decline from there.' }), 'info'); }
    else if (a === 'mail-all') { mailFilter = 'tutte'; drawMessages(m); }
  }; });
  $$('button[data-acc]').forEach(b => { b.onclick = () => signOffer(Number(b.dataset.acc), b.dataset.name); });
  $$('button[data-detail]').forEach(b => { b.onclick = () => {
    const o = v.offers.find(x => x.index === Number(b.dataset.detail));
    if (o?.detail) serieDetail(o.detail);
  }; });
}

function signOffer(index, name){
  modal(tr({ it: 'Firma dell\'offerta', en: 'Sign the offer' }), `
    <p>${tr({ it: 'Stai per firmare con', en: 'You are about to sign with' })} <b>${esc(name)}</b>. ${tr({ it: 'Il contratto ha effetto immediato e sostituisce la serie attuale.', en: 'The contract takes effect immediately and replaces the current series.' })}</p>`,
    [[tr({ it: 'Annulla', en: 'Cancel' }), 'ghost', () => {}], [tr({ it: 'Firma', en: 'Sign' }), 'act', async () => {
      try { const r = await api('accept', {index}); toast(tr({ it: 'Contratto firmato: ', en: 'Contract signed: ' }) + r.signed, 'ok'); await refreshBoot(); render(); }
      catch(e){ toast(e.message,'err'); return false; }
    }]]);
}

/* -------- cercatore su disco: finestra per scegliere cartella o file --------
   Un dialog del browser non restituisce il percorso scelto (è una scelta di
   privacy), quindi lo costruiamo noi: sfoglia le unità e le cartelle del PC.
   pick: 'dir' (cartella ACE) | 'file:AssettoCorsaEVO.exe' (eseguibile di gioco) */
async function pathPicker(pick, onOk){
  const wantFile = String(pick).startsWith('file:');
  const fileWanted = wantFile ? pick.slice(5).toLowerCase() : null;
  let cur = 'root:';
  modal(wantFile ? `${tr({it:'🔍 Cerca su disco',en:'🔍 Browse the disk'})} — ${fileWanted}` : `${tr({it:'🔍 Cerca su disco — scegli la cartella',en:'🔍 Browse the disk — choose a folder'})}`, `
    <div id="pk-crumbs" class="muted" style="font-size:12px;word-break:break-all;margin-bottom:8px"></div>
    <div id="pk-list" style="max-height:44vh;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px"></div>
    ${wantFile ? '<div class="muted" style="margin-top:8px;font-size:12px">Entra nella cartella di installazione di EVO (es. E:\\SteamLibrary\\steamapps\\common\\Assetto Corsa EVO) e seleziona il file in fondo.</div>' : ''}
  `,
  [
    [''+tr({it:'Annulla',en:'Cancel'}), 'ghost', () => {}],
    [tr({it:'Scelgo questa cartella',en:'Choose this folder'}), 'act', () => { if (!wantFile) onOk(cur.replace('drive:', '')); }],
  ]);
  const list = $('#pk-list');
  const crumbs = $('#pk-crumbs');
  const load = async (p) => {
    list.innerHTML = '<div class="muted" style="padding:10px">…</div>';
    let d;
    try { d = await api('browse', { path: p }); }
    catch(e){ list.innerHTML = `<div class="banner bad" style="margin:6px">${esc(e.message)}</div>`; return; }
    cur = d.kind === 'root' ? 'root:' : d.path;
    crumbs.innerHTML = d.kind === 'root' ? (tr({it:'💻 Il tuo PC — scegli l\'unità',en:'💻 Your PC — pick a drive'})) : esc(d.path);
    if (!wantFile) $('.mf button.act').textContent = tr({ it: 'Scelgo «' + (d.kind === 'root' ? 'home' : d.path) + '»', en: 'Choose «' + (d.kind === 'root' ? 'home' : d.path) + '»' });
    let html = '';
    if (d.parent) html += `<button class="pk-row" data-go="${esc(d.parent)}" style="width:100%;text-align:left;padding:5px 10px;background:none;border:none;border-bottom:1px solid var(--line);cursor:pointer;color:var(--dim)">⬆️ .. (${tr({it:'su di uno',en:'up one level'})})</button>`;
    for (const e of (d.drives ?? [])) html += `<button class="pk-row" data-go="drive:${esc(e)}" style="width:100%;text-align:left;padding:5px 10px;background:none;border:none;border-bottom:1px solid var(--line);cursor:pointer">💽 <b>${esc(e)}</b></button>`;
    for (const e of (d.entries ?? [])) html += `<button class="pk-row" data-go="${esc(e.path)}" style="width:100%;text-align:left;padding:5px 10px;background:none;border:none;border-bottom:1px solid var(--line);cursor:pointer">📁 ${esc(e.name)}</button>`;
    if (d.kind === 'root' && wantFile) html += '<div class="muted" style="padding:8px">Scegli il disco dove hai installato il gioco, poi entra in steamapps → common → Assetto Corsa EVO.</div>';
    if (wantFile) {
      // dentro a una cartella: se l'exe cercato è qui, offri la selezione del file
      if (d.kind === 'dir' && !d.path.endsWith('\\')) {
        // il server valuta l'esistenza in setup-save: proviamo il check con una fetch leggera su browse? No: tentiamo directamente il submit
        html += `<button class="act" id="pk-file" style="margin:8px;width:calc(100% - 16px)">📄 Usa ${esc(basename(fileWanted))} da questa cartella</button>`;
      }
      if (!html) html = '<div class="muted" style="padding:10px">Cartella vuota.</div>';
    }
    list.innerHTML = html;
    $$('.pk-row', list).forEach(b => { b.onclick = () => load(b.dataset.go); });
    $('#pk-file')?.addEventListener('click', async () => {
      const exe = d.path + '\\' + fileWanted;
      try { await api('setup-save', { gameExe: exe }); $('#modal-root').innerHTML = ''; toast('Eseguibile salvato: ' + exe, 'ok'); onOk(exe); }
      catch(e){ toast(e.message, 'err'); }
    });
  };
  load('root:');
}

/* -------- impostazioni -------- */
function drawSettings(m){
  const s = boot.setup;
  /* slot senza carriera (es. provato con ACE_SLOT libero): boot.header è null —
     senza questa guardia la scheda non si rendeva affatto */
  const h = boot.header ?? { driver: { name: tr({ it: '(nessuna carriera in questo slot)', en: '(no career in this slot)' }) }, money: 0 };
  const slotsHtml = (s.slots ?? []).map((sl) => `
    <tr class="${sl.active?'cur':''}" style="cursor:pointer" title="${tr({ it: 'clicca: avvia questo slot (o apri il suo browser se è già attivo)', en: 'click: launch this slot (or open its browser if it is already active)' })}">
      <td><b>Slot ${sl.slot}</b>${sl.active?` <span class="tag gold">${tr({ it: 'attivo', en: 'active' })}</span>`:''}</td>
      <td>${sl.exists ? `<span>${esc(sl.pilota ?? tr({ it: '(carriera senza nome?)', en: '(unnamed career?)' }))}</span> <span class="faint">· ${sl.gare} ${tr({ it: 'gare', en: 'races' })} · ${esc(sl.file)}</span>` : `<span class="faint">${tr({ it: 'vuoto — nuova carriera quando lo scegli', en: 'empty — a new career starts when you pick it' })}</span>`}</td>
      <td class="right">${sl.active
        ? `<button class="mini" data-slot-open="${sl.slot}">${tr({ it: 'apri questa finestra', en: 'open this window' })}</button>`
        : `<button class="mini acc" data-slot-go="${sl.slot}">${tr({ it: 'apri slot', en: 'open slot' })} ${sl.slot}</button>`}</td>
    </tr>`).join('');
  m.innerHTML = `
  <div class="panel"><h2>${tr({ it: 'Slot carriera', en: 'Career slots' })} <span class="h-act">${tr({ it: 'fino a 3 piloti sullo stesso PC', en: 'up to 3 drivers on the same PC' })}</span></h2>
    <table><thead><tr><th></th><th>${tr({ it: 'Carriera', en: 'Career' })}</th><th class="right">${tr({ it: 'Come si usa', en: 'How to use' })}</th></tr></thead><tbody>${slotsHtml}</tbody></table>
    <div class="faint" style="margin-top:8px" id="slot-instructions">${tr({ it:`Clicca una riga (o il bottone a destra) per avviare quello slot: parte <b>pilota-N.cmd</b> da solo, senza variabili da scrivere. I lanciatori sono anche avviabili a mano dalla cartella del programma, e gli slot si aprono anche insieme (slot 1 → porta 8642, slot 2 → 8643, slot 3 → 8644). Ogni slot ha il SUO salvataggio e i SUOI backup: mai mischiati. Lo slot 1 contiene le carriere fatte fino ad oggi. Il watcher segue lo slot del lanciatore che l'ha aperto. Lo slot attivo di questa sessione NON cambia a caldo: qui si apre la sua finestra, per cambiarlo davvero chiudi questa e apri l'altro.`, en:`Click a row (or the button on the right) to launch that slot: <b>pilota-N.cmd</b> starts on its own, with no variables to type. The launchers can also be started manually from the program folder, and slots can open together (slot 1 → port 8642, slot 2 → 8643, slot 3 → 8644). Each slot has its OWN save file and its OWN backups: never mixed. Slot 1 holds the careers made up to now. The watcher follows the slot of the launcher that opened it. This session's active slot does NOT switch live: from here you open its window; to really change slot, close this one and open the other.` })}</div>
  </div>
  <div class="panel"><h2>${tr({ it: 'Aggiornamenti', en: 'Updates' })} <span class="h-act">${tr({ it: 'controllo automatico: all\'avvio e poi ogni 10 minuti', en: 'automatic: at launch, then every 10 minutes' })}</span></h2>
    <div id="agg-status" class="muted" style="font-size:13px">…</div>
    <div class="muted" style="margin-top:6px;font-size:12px">${tr({ it: 'Quando un aggiornamento è pronto, la barra compare in ALTO: "Aggiorna ora" porta giù il codice e fa i test — il save non si tocca.', en: 'When an update is ready, the bar appears at the TOP: "Update now" pulls the code and runs the tests — the save is never touched.' })}</div>
  </div>
  <div class="panel"><h2>${tr({ it: 'Lingua', en: 'Language' })} <span class="h-act">${tr({ it: 'la pagina si ricarica al cambio', en: 'the page reloads when you switch' })}</span></h2>
    <div class="row" style="align-items:center">
      <label class="muted" for="i-lingua">${tr({ it: 'Lingua interfaccia', en: 'Interface language' })}</label>
      <select id="i-lingua" style="min-width:180px">
        <option value="it">Italiano</option>
        <option value="en">English</option>
      </select>
    </div>
    <div class="row" style="margin-top:8px;align-items:center">
      <button class="mini" id="b-prova-voce" type="button">🔊 ${tr({ it: 'Prova la voce', en: 'Test the voice' })}</button>
      <span id="voce-esito" class="muted" style="font-size:12px"></span>
    </div>
    <div class="row" style="margin-top:10px;align-items:center">
      <label class="muted" for="i-voce-livello">${tr({ it: 'Quanto parla il copilota', en: 'How much the copilot speaks' })}</label>
      <select id="i-voce-livello" style="min-width:180px">
        <option value="essenziale">${tr({ it: 'Essenziale — box, benzina, bandiere, penalità', en: 'Essential — pits, fuel, flags, penalties' })}</option>
        <option value="normale">${tr({ it: 'Normale — e anche giro, posizione, gomme', en: 'Normal — plus lap, position, tyres' })}</option>
        <option value="full">${tr({ it: 'Tutto — anche delta di ritmo e distanza', en: 'Everything — also pace delta and gap' })}</option>
        <option value="off">${tr({ it: 'Spenta — la copilota tace', en: 'Off — the copilot is silent' })}</option>
      </select>
        <button class="mini" id="b-prova-radio" type="button" title="${esc(tr({ it: 'Parla la voce vera in gara: lo speaker Windows del Pitwall', en: 'The real race voice: the Pitwall Windows speaker' }))}">📻 ${tr({ it: 'Prova la radio', en: 'Test the radio' })}</button>
      <span id="voce-livello-esito" class="muted" style="font-size:12px"></span>
    </div>
    <div class="muted" style="margin-top:8px;font-size:12px">${tr({ it: 'Il livello vale SEPREM (anche fuori gara) e vale per la voce del Pitwall — quella che parla col gioco aperto e la GUI chiusa. Il selettore in Ingegnere LIVE (in pista) e questo qui cambiano la stessa impostazione.', en: 'The level always applies (even outside a race) and it drives the Pitwall voice — the one that speaks with the game open and the GUI closed. The selector in Engineer LIVE (on track) and this one change the same setting.' })}</div>
    <div class="muted" style="margin-top:8px;font-size:12px">${tr({ it: 'La scelta vale per questo browser. Menu e banner aggiornamenti sono già bilingui; le viste si traducono al giro in cui si toccano (regola "pigra", vedi README).', en: 'The choice applies to this browser. Menu and updates banner are already bilingual; views get translated as they are touched (the "lazy" rule, see README).' })}</div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>${tr({ it: 'Installazione', en: 'Installation' })} <span class="h-act">${tr({ it: 'stessa checklist del primo avvio — si modifica a caldo, senza riavvio', en: 'same checklist as the first launch — edited live, no restart' })}</span></h2>
      <div id="wz-re" class="wiz" style="text-align:left;margin-bottom:10px"></div>
      <div class="muted" style="font-size:12px">${tr({ it: 'Cartelle Risultati viste dal watcher', en: 'Results folders watched by the watcher' })}</div><div style="font-size:13px;word-break:break-all">${s.resultsDirs.map(esc).join('<br>') || '—'}</div>
      <form id="f-paths" style="margin-top:14px">
        <div class="field"><label>${tr({ it: 'Cartella ACE (override)', en: 'ACE folder (override)' })}</label>
          <div class="row"><input type="text" id="i-data" placeholder="C:\\Users\\...\\Saved Games\\ACE" value="${esc(s.saved.dataDir ?? '')}" style="flex:1"><button type="button" class="mini" id="b-pick-data" title="${tr({ it: 'sfoglia il disco', en: 'browse the disk' })}">🔍 ${tr({ it: 'cerca…', en: 'browse…' })}</button></div>
        </div>
        <div class="field"><label>${tr({ it: 'Eseguibile (override)', en: 'Executable (override)' })}</label>
          <div class="row"><input type="text" id="i-game" placeholder="...\\AssettoCorsaEVO.exe" value="${esc(s.saved.gameExe ?? '')}" style="flex:1"><button type="button" class="mini" id="b-pick-game" title="${tr({ it: 'sfoglia il disco', en: 'browse the disk' })}">🔍 ${tr({ it: 'cerca…', en: 'browse…' })}</button></div>
        </div>
        <div class="field"><label>${tr({ it: 'cartella Risultati di EVO (override, opzionale)', en: 'EVO Results folder (override, optional)' })}</label>
          <div class="row"><input type="text" id="i-results" placeholder="...\\Saved Games\\ACE\\Results" value="${esc(s.saved.resultsDir ?? '')}" style="flex:1"><button type="button" class="mini" id="b-pick-res">🔍 ${tr({ it: 'cerca…', en: 'browse…' })}</button></div>
        </div>
        <button class="ghost" type="submit">${tr({ it: 'Salva percorsi', en: 'Save paths' })}</button>
      </form>
    </div>
    <div class="panel"><h2>${tr({ it: 'Pilota', en: 'Driver' })}</h2>
      <div class="muted">${tr({ it: 'Nome attuale in carriera', en: 'Current career name' })}</div><div style="font-size:18px;font-weight:600">${esc(h.driver.name)}</div>
      <div class="muted" style="margin-top:4px">${tr({ it: "Deve essere uguale al nome con cui corri in EVO: serve a riconoscerti all'import dei risultati.", en: 'It must match the name you race with in EVO: it is how the result import recognizes you.' })}</div>
      <form id="f-rename" class="row" style="margin-top:12px">
        <input type="text" id="i-rename" placeholder="${tr({ it: 'Nuovo nome', en: 'New name' })}" style="flex:1;min-width:200px">
        <button class="ghost" type="submit">${tr({ it: 'Rinomina', en: 'Rename' })}</button>
      </form>
      <h2 style="margin-top:22px">${tr({ it: 'Registro import', en: 'Import log' })}</h2>
      <div class="muted" style="font-size:12px">${tr({ it: 'Ogni import fa un backup automatico del salvataggio, viene scritto in un log e ogni file risultato è ricordato per contenuto: lo stesso file non può essere incassato due volte.', en: 'Each import backs up the save automatically, is written to a log, and every result file is remembered by content: the same file cannot be banked twice.' })}</div>
      <div id="import-log" style="margin-top:8px;font-size:12px;max-height:220px;overflow:auto">…</div>
      <h2 style="margin-top:22px">${tr({ it: 'Carriera', en: 'Career' })}</h2>
      <div class="row">
        <button class="ghost" id="b-backup">${tr({ it: 'Backup carriera', en: 'Career backup' })}</button>
        <button class="ghost danger" id="b-reset">${tr({ it: 'Ricomincia da zero', en: 'Start over' })}</button>
      </div>
      <div class="muted" id="backup-list" style="margin-top:6px;font-size:12px">${tr({ it: 'Crea una copia di sicurezza del salvataggio: soldi, risultati, rivali e statistiche restano intatti anche se qualcosa va storto.', en: 'Makes a safety copy of the save: money, results, rivals and stats stay intact even if something goes wrong.' })}</div>
      ${s.issues.length ? `<div class="banner warn" style="margin-top:16px">${tr({ it: `${s.issues.length} riferimenti della scala non trovati nell'installazione`, en: `${s.issues.length} ladder references not found in the installation` })}: ${esc(s.issues.slice(0,4).map(i=>i.id).join(', '))}${s.issues.length>4?'…':''}</div>` : `<div class="banner good" style="margin-top:16px">${tr({ it: 'La scala carriera combacia con il contenuto installato.', en: 'The career ladder matches the installed content.' })}</div>`}
      <h2 style="margin-top:22px">${tr({ it: 'Backup del save di EVO', en: 'EVO save backup' })}</h2>
      <div class="muted" style="font-size:12px">${tr({ it: "All'avvio del launcher il save del GIOCO (Saved Games\\ACE) viene zippato da solo, ma solo se l'ultimo backup ha più di 36 ore: due slot in rotazione, sempre i 2 zip più recenti. Qui vedi com'è messo e puoi forzarlo a mano in qualunque momento (anche con EVO aperto: non si spezza niente).", en: "At launcher start the GAME save (Saved Games\\ACE) is zipped automatically, but only if the last backup is older than 36 hours: two rotating slots, always the 4 newest zips. Here you can see where it stands and force it by hand at any time (even with EVO open: nothing breaks)." })}</div>
      <div id="savebk-out" style="margin-top:8px;font-size:13px">…</div>
      <div class="row" style="margin-top:10px"><button class="ghost" id="b-savebk">${tr({ it: 'Forza il backup del save ora', en: 'Force the save backup now' })}</button></div>
      <h2 style="margin-top:22px">${tr({ it: 'Verifica integrità', en: 'Integrity check' })}</h2>
      <div class="row"><button class="ghost" id="b-integrity">${tr({ it: 'Controlla la carriera', en: 'Check the career' })}</button></div>
      <div class="muted" style="margin-top:6px;font-size:12px">${tr({ it: 'Ricalcola statistiche, cassa e reputazione dalle gare e dalla bacheca: se qualcosa non torna (per esempio una gara fantasma) te lo dice e può correggere.', en: 'Recomputes stats, money and reputation from races and the board: if something is off (say a ghost race) it tells you and can fix it.' })}</div>
      <div id="integrity-out" style="margin-top:8px;font-size:13px"></div>
      <h2 style="margin-top:22px">${tr({ it: 'Manutenzione', en: 'Maintenance' })}</h2>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="ghost" id="b-maint-scan">${tr({ it: 'Scansiona ora', en: 'Scan now' })}</button>
        <button class="ghost" id="b-maint-fix">${tr({ it: 'Scansiona e ripara', en: 'Scan and repair' })}</button>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:12px;cursor:pointer">
        <input type="checkbox" id="i-maint-auto">
        <span>${tr({ it: 'Auto-riparazione: il tool scansiona da solo all\'avvio e ogni 10 minuti, e corregge senza chiedere ciò che si corregge in sicurezza.', en: 'Auto-repair: the tool scans by itself at startup and every 10 minutes, safely fixing whatever can be fixed without asking.' })}</span>
      </label>
      <div class="row" style="margin-top:12px;flex-wrap:wrap;gap:8px">
        <button class="mini ghost" id="b-maint-board">${tr({ it: 'Svuota bacheca', en: 'Clear the board' })}</button>
        <button class="mini ghost" id="b-maint-ledger">${tr({ it: 'Azzera registro import', en: 'Reset import ledger' })}</button>
        <button class="mini ghost" id="b-maint-flows">${tr({ it: 'Ricalcola flussi dal salvataggio', en: 'Re-seed flows from the save' })}</button>
        <button class="mini ghost" id="b-maint-dedup">${tr({ it: 'Elimina doppioni dei flussi', en: 'Remove duplicate flows' })}</button>
      </div>
      <div class="muted" style="margin-top:6px;font-size:12px">${tr({ it: 'Le pulizie chiedono conferma: tocchano liste di memoria (annunci, registro anti-doppioni, registro flussi) e niente torna indietro. Flussi ricalcolati e doppioni tolti non toccano il salvataggio: solo il registro, che si ricostruisce dai valori attuali.', en: 'Cleanups ask for confirmation first: they touch memory lists (posts, anti-duplicate ledger, flow ledger) and there is no way back. Re-seeding and dedup leave the save untouched: only the ledgers change, rebuilt from current values.' })}</div>
      <div id="maint-out" style="margin-top:8px;font-size:13px"></div>
    </div>
  </div>`;
  // slot cliccabili: il bottone nella riga lancia pilota-N.cmd via slot-launch
  if (typeof drawAggStatus === 'function') drawAggStatus($('#agg-status', m));
  $$('button[data-slot-go], button[data-slot-open]').forEach(b => { b.onclick = () => {
    const n = b.dataset.slotGo ?? b.dataset.slotOpen;
    if (!n) return;
    b.disabled = true;
    api('slot-launch', { method:'POST', body:{ slot: Number(n) } })
      .then(r => { toast(r.note ?? tr({ it: 'Lanciatore avviato.', en: 'Launcher started.' }), 'ok'); b.disabled = false; })
      .catch(err => { toast(err.message, 'err'); b.disabled = false; });
  }; });
  // lingua: selettore collegato a gui/js/lang.js (tr + impostaLingua)
  const selLingua = $('#i-lingua');
  if (selLingua) { selLingua.value = window.LINGUA; selLingua.onchange = (e) => impostaLingua(e.target.value); }
  /* LIVELLO VOCE del copilota (30/10, Mauro: «minimo indispensabile, normale o
     full»): il SELETTORE nelle Impostazioni — legato alla STESSA impostazione
     del selettore in Ingegnere LIVE (voceCopilota in evo.config.json, via
     /api/voce-server). Il tick del Pitwall passa il livello su ogni giro:
     il cambio vale a caldo, senza riavviare niente. */
  const selLiv = $('#i-voce-livello');
  if (selLiv) {
    api('voce-server')?.then?.((r) => { if (r?.livello) selLiv.value = r.livello; })
      .catch(() => { /* resta la selezione: il server risponde comunque */ });
    selLiv.onchange = async (ev) => {
      const lv = String(ev.target.value ?? '');
      const esito = $('#voce-livello-esito');
      try {
        await api('voce-server', { method: 'POST', body: { livello: lv } });
        if (esito) esito.textContent = lv === 'off'
          ? tr({ it: 'Copilota spenta.', en: 'Copilot muted.' })
          : tr({ it: 'Livello salvato: ', en: 'Level saved: ' }) + lv;
        drawCopilotStrip?.();   // il chip in testa si riuniforma (off = grigio)
      } catch (err) { if (esito) esito.textContent = err.message; }
    };
  }
  /* PROVA LA RADIO (31/10, «fai quello che vuoi»): il bottone accanto al
     selettore chiede al server di far parlare la voce VERA in gara (lo
     speaker Windows del Pitwall) con un briciolo di repertorio DEL LIVELLO
     SCELTO: così si sente se la radio è viva e cosa dice il livello senza
     lanciare una gara. Copilota spenta: il server risponde 400 con il
     motivo e l'esito appare in rosso-grigio qui accanto. */
  $('#b-prova-radio')?.addEventListener?.('click', async () => {
    const esito = $('#voce-livello-esito');
    try {
      const r = await api('voce-prova', {});
      if (esito) esito.textContent = tr({ it: 'In coda alla voce del Pitwall — livello: ', en: 'Queued on the Pitwall voice — level: ' }) + r.livello;
    } catch (err) { if (esito) esito.textContent = err.message; }
  });
  /* PROVA LA VOCE (27/10, Mauro: «copilota sempre inglese»): parla una frase
     di collaudo con la STESSA scelta che fa in gara la copilota del cruscotto
     (Italiano SEMPRE) e scrive QUALE voce del sistema è stata usata: se esce
     «Voce usata: … [it-IT]» il timbro è giusto; se esce una voce [en-US] il
     sistema è andato in fallback perché la lista voci non era ancora caricata
     — il bottone riprovato dopo un secondo la prende. */
  $('#b-prova-voce').onclick = () => {
    if (!('speechSynthesis' in window)) { $('#voce-esito').textContent = tr({ it: 'Il browser non supporta la voce.', en: 'This browser has no speech support.' }); return; }
    const esito = $('#voce-esito');
    const pick = (vs) => {
      const norm = (s) => String(s ?? '').toLowerCase().replace('_', '-');
      // 29/10, Mauro: «rimetti la voce dell'uomo» — prima la it-it MASCHILE
      // (Cosimo/Roberto/Marco), Elsa resta solo come ripiego.
      const eMaschile = (vv) => /cosimo|roberto|marco/i.test(String(vv.name ?? '') + ' ' + String(vv.voiceURI ?? ''));
      return vs.find((vv) => norm(vv.lang) === 'it-it' && eMaschile(vv))
        ?? vs.find((vv) => norm(vv.lang) === 'it-it')
        ?? vs.find((vv) => norm(vv.lang).startsWith('it') && eMaschile(vv))
        ?? vs.find((vv) => norm(vv.lang).startsWith('it'))
        ?? vs.find((vv) => /ital/i.test(String(vv.name ?? '') + String(vv.voiceURI ?? '')));
    };
    const parla = (tentativo = 0) => {
      speechSynthesis.cancel();
      const vs = speechSynthesis.getVoices?.() ?? [];
      const v = pick(vs);
      const u = new SpeechSynthesisUtterance('Prova della voce copilota: selezione automatica in italiano, un, due, tre.');
      u.lang = 'it-IT'; u.rate = 1.1; u.volume = 0.9;
      if (v) u.voice = v;
      u.onend = () => { try { esito.textContent = tr({ it: 'Voce usata: ', en: 'Voice used: ' }) + (v ? `${v.name} [${v.lang}]` : tr({ it: 'quella predefinita del sistema', en: 'the system default' })) + ` · ${speechSynthesis.getVoices?.().length ?? 0} ${tr({ it: 'voci totali', en: 'voices total' })}`; } catch {} };
      speechSynthesis.speak(u);
      // la lista voci si carica ASINCRONA: se al primo colpo è vuota riprova;
      // su fallback (voce non italiana) un secondo tentativo la trova.
      if (!v && tentativo < 2) setTimeout(() => parla(tentativo + 1), 700);
    };
    parla();
  };
  wizardChecklist($('#wz-re'), { sketch: false, onChanged: refreshBoot });
  $('#f-paths').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('setup-save', {dataDir:$('#i-data').value, gameExe:$('#i-game').value, resultsDir:$('#i-results')?.value ?? ''}); await refreshBoot(); toast(tr({ it: 'Percorsi salvati.', en: 'Paths saved.' }),'ok'); render(); }
    catch(err){ toast(err.message,'err'); }
  };
  $('#b-pick-data').onclick = () => pathPicker('dir', (p) => { $('#i-data').value = p; });
  $('#b-pick-game').onclick = () => pathPicker('file:' + (s.gameExe ? s.gameExe.split('\\').pop().toLowerCase() : 'assettocorsaevo.exe'), () => { render(); });
  $('#b-pick-res').addEventListener('click', () => pathPicker('dir', (p) => { $('#i-results').value = p; }));
  $('#f-rename').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('rename', {name:$('#i-rename').value}); await refreshBoot(); toast(tr({ it: 'Nome aggiornato.', en: 'Name updated.' }),'ok'); render(); }
    catch(err){ toast(err.message,'err'); }
  };
  $('#b-backup').onclick = async () => {
    try {
      const r = await api('backup');
      $('#backup-list').innerHTML = tr({ it: 'Ultimi backup: ', en: 'Latest backups: ' }) + r.backups.map(b=>esc(b.at)).join(' · ');
      toast(tr({ it: 'Backup creato: ', en: 'Backup created: ' }) + r.backups[0]?.at, 'ok');
    } catch(err){ toast(err.message,'err'); }
  };
  // ---- BACKUP DEL SAVE DI EVO (27/10): stato live + bottone forza ----
  // Due nodi in pagina: #savebk-out (riquadro) e #b-savebk (forza). Il
  // riquadro si rimpainta al volo: placca verde se fresco (< 36 h), gialla
  // se stantio, avviso se il gioco non è mai stato avviato o non c'è ancora
  // nessun zip.
  const paintSaveBk = (b) => {
    const out = $('#savebk-out');
    if (!out) return;
    const forza = $('#b-savebk');
    if (!b.saveDirFound) {
      out.innerHTML = `<div class="banner warn">${tr({ it: "Cartella del save di EVO non trovata: avvia il gioco una volta (o impostala in «Installazione»).", en: "The EVO save folder was not found: run the game once (or set it under «Installation»)." })}</div>`;
      if (forza) forza.disabled = true;
      return;
    }
    if (forza) forza.disabled = false;
    if (!b.zips || !b.zips.length) {
      out.innerHTML = `<div class="banner warn">${tr({ it: 'Nessun backup del save: il launcher ne crea uno al primo avvio, oppure forzalo ora.', en: 'No save backup yet: the launcher creates one at its next start, or force it now.' })}</div>`;
      return;
    }
    const eta = b.ageHours < 1
      ? tr({ it: `${Math.max(1, Math.round(b.ageHours * 60))} minuti fa`, en: `${Math.max(1, Math.round(b.ageHours * 60))} minutes ago` })
      : tr({ it: `${Math.round(b.ageHours)} ore fa`, en: `${Math.round(b.ageHours)} hours ago` });
    const conf = tr(b.zips.length === 1
      ? { it: '1 zip su slot-1/2 · i 4 più recenti restano', en: '1 zip across slot-1/slot-2 · the 4 newest are kept' }
      : { it: `${b.zips.length} zip su slot-1/2 · i 4 più recenti restano`, en: `${b.zips.length} zips across slot-1/slot-2 · the 4 newest are kept` });
    out.innerHTML = `<div class="banner ${b.fresh ? 'good' : 'warn'}">
      ${b.fresh
        ? tr({ it: 'Backup fresco — ', en: 'Backup fresh — ' })
        : tr({ it: 'Backup stantio (il launcher ne farà uno al prossimo avvio) — ', en: 'Backup stale (the launcher will make one at its next start) — ' })}
      <b>${esc(b.ultimo.file)}</b> · ${eta}
      <div class="faint" style="margin-top:4px">${esc(b.ultimo.slot)} · ${(b.ultimo.size / 1024).toFixed(0)} KB · ${conf}</div>
    </div>`;
  };
  api('save-backup').then(paintSaveBk).catch(() => {});
  $('#b-savebk').onclick = async () => {
    const b = $('#b-savebk');
    b.disabled = true; b.textContent = tr({ it: 'Zippo…', en: 'Zipping…' });
    try {
      const r = await api('save-backup', { op: 'force' });
      paintSaveBk(r);
      if (r.lastRun?.ok) toast(tr({ it: 'Backup del save creato: ', en: 'Save backup created: ' }) + r.lastRun.zip, 'ok');
      else toast(tr({ it: 'Niente da fare: il backup era già fresco.', en: 'Nothing to do: the backup was already fresh.' }), 'ok');
    } catch (err) { toast(err.message, 'err'); }
    b.disabled = false; b.textContent = tr({ it: 'Forza il backup del save ora', en: 'Force the save backup now' });
  };
  // ---- MANUTENZIONE: scansione, auto-riparazione e pulizie ----
  const maintOut = $('#maint-out');
  api('maintenance', { op: 'auto-status' }).then((r) => { $('#i-maint-auto').checked = !!r.autoRepair; }).catch(() => {});
  $('#i-maint-auto').onchange = async (e) => {
    try { await api('maintenance', { op: 'auto-toggle', on: e.target.checked }); toast(e.target.checked ? tr({ it: "Auto-riparazione attivata.", en: 'Auto-repair enabled.' }) : tr({ it: 'Auto-riparazione disattivata.', en: 'Auto-repair off.' }), 'ok'); }
    catch (err) { toast(err.message, 'err'); e.target.checked = !e.target.checked; }
  };
  const showScan = ({ issues, fixed = [] } = {}) => {
    if (!issues.length) { maintOut.innerHTML = `<div class="banner good">${tr({ it: `Tutto torna (scansione di ${new Date().toLocaleTimeString()}).`, en: `All clear (scanned at ${new Date().toLocaleTimeString()}).` })}</div>` + (fixed.length ? `<div class="muted" style="margin-top:6px">${tr({ it: 'Corretti: ', en: 'Fixed: ' }) + esc(fixed.join(', '))}</div>` : ''); return; }
    maintOut.innerHTML = `<div class="banner warn"><b>${issues.length} ${tr({ it: 'anomalie:', en: 'issues:' })}</b><ul style="margin:6px 0 0 18px">${issues.map(i=>`<li>${esc(i.text)}</li>`).join('')}</ul></div>`;
  };
  $('#b-maint-scan').onclick = async () => {
    try { showScan(await api('maintenance', { op: 'scan' })); }
    catch (err) { toast(err.message, 'err'); }
  };
  $('#b-maint-fix').onclick = async () => {
    try { const r = await api('maintenance', { op: 'fix' }); showScan(r); if (r.fixed.length) { await refreshBoot(); toast(tr({ it: 'Riparato: ', en: 'Repaired: ' }) + r.fixed.join(', '), 'ok'); } }
    catch (err) { toast(err.message, 'err'); }
  };
  const manutenzione = (btnId, op, domTitle, domText) => {
    $('#'+btnId).onclick = () => {
      modal(domTitle, domText,
        [[tr({ it: 'Annulla', en: 'Cancel' }), 'ghost', () => {}],
         [tr({ it: 'Confermo', en: 'Confirm' }), 'danger', async () => {
           try { await api('maintenance', { op, confirm: true });
             toast(tr({ it: 'Fatto. La traccia resta in bacheca.', en: 'Done. A trace is left on the board.' }), 'ok');
             await refreshBoot(); render();
           } catch (err) { toast(err.message, 'err'); }
         }]]);
    };
  };
  manutenzione('b-maint-board', 'clear-messages', tr({ it: 'Svuotare la bacheca?', en: 'Clear the board?' }),
    `<p>${tr({ it: 'Tutti gli annunci in bacheca (anello a 60, quello che gira) vengono cancellati: premi, integrità e avvisi spariscono. Restano gare, soldi, statistiche e registro flussi.', en: 'All board posts (the 60-slot ring) are deleted: prizes, integrity and warnings disappear. Races, money, stats and the flow ledger stay.' })}</p>`);
  manutenzione('b-maint-ledger', 'reset-ledger', tr({ it: 'Azzerare il registro import?', en: 'Reset the import ledger?' }),
    `<p>${tr({ it: 'Il registro anti-doppioni va a vuoto: un file risultato già incassato potrebbe essere rincassato se lo re-importi da Centro gare. Usa solo se il registro è corrotto.', en: 'The anti-duplicate ledger is emptied: a result file already banked could be banked again if you re-import it by hand. Only use this if the ledger is corrupted.' })}</p>`);
  manutenzione('b-maint-flows', 'reseed-flows', tr({ it: 'Ricalcolare i flussi?', en: 'Re-seed the flow ledger?' }),
    `<p>${tr({ it: 'Il registro flussi viene azzerato e riparte da UNA riga di seme allineata a cassa e reputazione attuali del salvataggio. Il salvataggio non cambia.', en: 'The flow ledger is emptied and restarts from ONE seed row aligned with the save\'s current money and reputation. The save is not changed.' })}</p>`);
  $('#b-maint-dedup').onclick = async () => {
    try { const r = await api('maintenance', { op: 'dedup-flows', confirm: true });
      toast(r.removed ? tr({ it: `Tolti ${r.removed} doppioni (restano ${r.kept}).`, en: `Removed ${r.removed} duplicates (${r.kept} left).` }) : tr({ it: 'Nessun doppione: il registro era già pulito.', en: 'No duplicates: the ledger was already clean.' }), r.removed ? 'ok' : 'info');
    } catch (err) { toast(err.message, 'err'); }
  };

  $('#b-integrity').onclick = async () => {
    const out = $('#integrity-out');
    try {
      const r = await api('integrity');
      if (!r.issues.length) { out.innerHTML = `<div class="banner good">${tr({ it: 'Tutto torna: gare, statistiche, cassa e bacheca sono coerenti.', en: 'All checks out: races, stats, money and board are consistent.' })}</div>`; return; }
      out.innerHTML = `<div class="banner warn"><b>${r.issues.length} ${tr({ it: 'anomalie:', en: 'issues:' })}</b><ul style="margin:6px 0 0 18px">${r.issues.map(i=>`<li>${esc(i.text)}</li>`).join('')}</ul></div>
        <button class="ghost" id="b-integrity-fix" style="margin-top:8px">${tr({ it: 'Correggi quello che si può correggere', en: 'Fix what can be fixed' })}</button>`;
      $('#b-integrity-fix').onclick = async () => {
        try {
          const f = await api('integrity-fix');
          await refreshBoot(); render();
          toast(f.fixed.length ? tr({ it: 'Corretto: ', en: 'Fixed: ' }) + f.fixed.join(', ') : tr({ it: 'Le anomalie restanti vanno verificate a mano (vedi import --ledger).', en: 'The remaining issues need a manual check (see import --ledger).' }), f.fixed.length?'ok':'warn');
        } catch(err){ toast(err.message,'err'); }
      };
    } catch(err){ toast(err.message,'err'); }
  };
  api('imports').then((r)=>{
    const el = $('#import-log');
    if (!el) return;
    if (!r.log.length) { el.innerHTML = `<span class="muted">${tr({ it: 'Nessun import ancora registrato.', en: 'No imports registered yet.' })}</span>`; return; }
    el.innerHTML = r.log.map((l)=>`<div style="padding:2px 0;border-bottom:1px solid var(--line,#222)">${esc(String(l.at??'').slice(0,16).replace('T',' '))} · <b>${l.outcome==='ignored'?tr({ it: 'ignorato', en: 'ignored' }):l.outcome==='manual'?tr({ it: 'a mano', en: 'manual' }):tr({ it: 'importato', en: 'imported' })}</b> · ${esc(l.file??'—')}${l.node?` · ${esc(l.node)} R${(l.round??0)+1}`:''}${typeof l.position==='number'?` · P${l.position}`:''}${l.outcome==='ignored'?` · <span class="muted">${esc(l.reason??'')}</span>`:''}</div>`).join('');
  }).catch(()=>{});
  $('#b-reset').onclick = () => modal(tr({ it: 'Ricominciare da zero?', en: 'Start from scratch?' }), `
      <p>${tr({ it: 'La carriera attuale verrà <b>cancellata</b> al momento della creazione della nuova: soldi, punti, contratti e messaggi tornano a zero.', en: 'The current career will be <b>deleted</b> when the new one is created: money, points, contracts and messages go back to zero.' })}</p>
      <p class="muted" style="margin-top:8px">${tr({ it: "L'operazione si completa solo se poi confermi il modulo con «ricomincia da zero» spuntato.", en: 'The operation only completes if you then confirm the form with the “start from scratch” box ticked.' })}</p>`,
    [[tr({ it: 'Annulla', en: 'Cancel' }),'ghost',()=>{}], [tr({ it: 'Vai alla creazione', en: 'Go to creation' }),'ghost danger', () => { tab='dashboard'; boot.hasCareer=false; drawNav(); render(); }]]);
}

/* -------- fine stagione (da cruscotto) -------- */
async function seasonEndFlow(force){
  try {
    const r = await api('season-end', {force});
    await refreshBoot();
    const offersHtml = r.offers.length ? r.offers.map(o=>`<div class="offer"><span class="n">${o.index}) ${esc(o.display)}</span>
      <span class="muted">L${o.level} · ${esc(o.discipline)} · ${esc(o.note)} · ${o.access==='closed'? tr({ it: 'parco chiuso (solo contratto)', en: 'closed park (contract only)' }) : `${tr({ it: 'affitto', en: 'rent' })} ${money(o.rent)} €`}</span>
      <span class="m"><button class="mini" data-acc="${o.index}" data-name="${esc(o.display)}">${tr({ it: 'firma', en: 'sign' })}</button></span></div>`).join('')
      : `<div class="empty">${tr({ it: 'Nessuna offerta disponibile.', en: 'No offers available.' })}</div>`;
    modal(tr({ it: 'Stagione {S} chiusa', en: 'Season {S} closed' }).replace('{S}', r.me.season ?? ''), `
      <div class="winline ${r.champion?'gold':''}">${r.champion ? tr({ it: '🏆 CAMPIONE!', en: '🏆 CHAMPION!' }) : tr({ it: 'Posizione finale:', en: 'Final position:' }) + ' P' + r.me.position}</div>
      <div style="text-align:center" class="muted">${r.me.points} ${tr({ it: 'punti', en: 'points' })}${r.bonus ? ` · ${tr({ it: 'bonus titolo', en: 'title bonus' })} ${money(r.bonus)} €` : ''}</div>
      ${r.memoryAssigned ? `<div class="banner warn" style="margin-top:12px">📜 <b>${tr({ it: 'Eredità di famiglia:', en: 'Family heritage:' })}</b> ${esc(r.memoryAssigned.ancestor)}, ${tr({ it: 'tuo', en: 'yours' })} ${esc(tr({ it: r.memoryAssigned.relation, en: r.memoryAssigned.relationEn ?? r.memoryAssigned.relation }))} (${esc(r.memoryAssigned.era)}), ${tr({ it: 'ti affida l\'impresa', en: 'entrusts you with the feat' })} «${esc(tr({ it: r.memoryAssigned.objective, en: r.memoryAssigned.objectiveEn ?? r.memoryAssigned.objective }))}» ${tr({ it: 'in', en: 'in' })} ${esc(r.memoryAssigned.series)}${r.memoryAssigned.carName ? ` ${tr({ it: 'con la sua', en: 'with their' })} <b>${window.carLinkHtml(r.memoryAssigned.carName)}</b>` : ''}. ${tr({ it: 'Eredità in palio:', en: 'Inheritance at stake:' })} <b>${money(r.memoryAssigned.inherit)} €</b>.</div>` : ''}
      <h2 style="margin:18px 0 8px;font-size:11.5px;text-transform:uppercase;letter-spacing:1.4px;color:var(--dim)">${tr({ it: 'Offerte per la prossima stagione', en: 'Offers for next season' })}</h2>
      ${offersHtml}`,
      [[tr({ it: 'Deciderò dopo', en: 'I will decide later' }), 'ghost', () => { render(); }]]);
    $$('button[data-acc]').forEach(b => { b.onclick = async () => {
      try { const rr = await api('accept', {index:Number(b.dataset.acc)}); $('#modal-root').innerHTML=''; toast(`${tr({ it: 'Contratto firmato: ', en: 'Contract signed: ' })}${rr.signed}`, 'ok'); await refreshBoot(); render(); }
      catch(e){ toast(e.message,'err'); }
    }; });
  } catch(e){
    // STAGIONE GIÀ CHIUSA (30/10, MacOS di massa): il primo click è riuscito,
    // il secondo ricadeva sulla stagione nova con 0 gare. Qui il server dà
    // 409 con codice suo: niente «chiudi comunque», un solo tasto e la card
    // dietro si ridisegna (render) così smette di dire «calendario completato».
    if (e.data?.code === 'SEASON_ALREADY_CLOSED') {
      modal(tr({ it: 'Stagione già chiusa', en: 'Season already closed' }),
        `<p>${esc(e.message)}</p>`,
        [[tr({ it: 'Ho capito', en: 'Got it' }), 'ghost', () => { render(); }]]);
      return;
    }
    if (e.data?.code === 'SEASON_INCOMPLETE') {
      modal(tr({ it: 'Stagione incompleta', en: 'Incomplete season' }), `<p>${esc(e.message)}</p><p class="muted" style="margin-top:8px">${tr({ it: 'Puoi chiuderla comunque: le gare mancanti restano senza punti.', en: 'You can close it anyway: missing races stay scoreless.' })}</p>`,
        [[tr({ it: 'Annulla', en: 'Cancel' }), 'ghost', () => {}], [tr({ it: 'Chiudi comunque', en: 'Close anyway' }), 'ghost danger', () => { seasonEndFlow(true); }]]);
      return;
    }
    toast(e.message, 'err');
  }
}

/* -------- rivali -------- */
/* identikit SVG determinista: dal nome nasce colore + iniziali. Niente foto
   vere (i nomi sono generati dal gioco), ma l'avatar in stile racing dà viso
   a ogni rivale — stesso colore sempre, a ogni sessione. */
function rivalAvatar(name, size = 34){
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const initials = String(name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return `<span class="rava" style="width:${size}px;height:${size}px;background:hsl(${hue} 55% 42%)">${esc(initials)}</span>`;
}
function h2hBadge(b, l){
  const net = l - b; // positivo = dominato da te
  const cls = net > 0 ? 'good' : net < 0 ? 'bad' : '';
  return `<span class="tag ${cls}">${b}–${l}</span>`;
}
async function drawRivals(m){
  const d = await api('rivals');
  const rows = d.rivals;
  m.innerHTML = `
  <div class="panel">
    <h2>${tr({ it: 'Registro rivali', en: 'Rivals log' })} <span class="h-act">${d.totals.rivals} ${tr({ it: 'avversari con nome, da', en: 'named opponents, from' })} ${d.totals.races} ${tr({ it: 'gare importate', en: 'imported races' })}</span></h2>
    ${!rows.length ? `<div class="empty">${tr({ it: 'Nessun rivale ancora: i nomi arrivano dai file risultato a ogni import di gara.', en: 'No rivals yet: names come from the result files at every race import.' })}</div>` : `
    <div class="grid2">
      <div><div class="muted" style="margin-bottom:6px">${tr({ it: '😨 Nemesi — ti battono più spesso di quanto li batti', en: '😨 Nemeses — they beat you more often than you beat them' })}</div>
        ${d.nemesi.length ? d.nemesi.slice(0,4).map(r=>`<div class="rivalrow">${rivalAvatar(r.name)}<b>${esc(r.name)}</b>${r.nemesis?`<span class="tag red">${tr({ it: 'nemesi', en: 'nemesis' })}</span>`:''}<span class="muted">${esc(r.team ?? '')}</span>${h2hBadge(r.h2h.beats, r.h2h.losses)}</div>`).join('') : `<div class="muted">${tr({ it: 'Nessuno ancora: continua così.', en: 'None yet: keep it up.' })}</div>`}
      </div>
      <div><div class="muted" style="margin-bottom:6px">${tr({ it: '😎 Vittime preferite — non ti battono mai', en: '😎 Favourite victims — they never beat you' })}</div>
        ${d.vittime.length ? d.vittime.slice(0,4).map(r=>`<div class="rivalrow">${rivalAvatar(r.name)}<b>${esc(r.name)}</b><span class="muted">${esc(r.team ?? '')}</span>${h2hBadge(r.h2h.beats, r.h2h.losses)}</div>`).join('') : `<div class="muted">${tr({ it: 'Le costruirai strada facendo.', en: 'You will build them along the way.' })}</div>`}
      </div>
    </div>`}
  </div>
  ${rows.length ? `<div class="panel"><h2>${tr({ it: 'Tutti i rivali', en: 'All rivals' })} <button class="mini acc" id="b-bulk-rn" style="margin-left:6px" title="${tr({ it: 'dà un soprannome a più piloti di fila, in una sola schermata', en: 'nickname many drivers in one go, on a single screen' })}">📝 ${tr({ it: 'Soprannomi in blocco', en: 'Nicknames in bulk' })}</button> <span class="h-act">${tr({ it: 'clicca una riga per la scheda completa', en: 'click a row for the full sheet' })}</span></h2>
    <table><thead><tr><th>${tr({ it: 'Rivale', en: 'Rival' })}</th><th>${tr({ it: 'Squadra', en: 'Team' })}</th><th class="right">${tr({ it: 'Gare insieme', en: 'Races together' })}</th><th class="right">${tr({ it: 'Tu–Lui', en: 'You–Him' })}</th><th>${tr({ it: 'Momentum', en: 'Momentum' })}</th><th>${tr({ it: 'Forma (ultime 5)', en: 'Form (last 5)' })}</th><th class="right">${tr({ it: 'Vittorie', en: 'Wins' })}</th><th class="right">${tr({ it: 'Podi', en: 'Podiums' })}</th></tr></thead>
    <tbody>${rows.map(r=>`<tr class="rival-link" data-key="${esc(r.key)}" style="cursor:pointer">
      <td><span style="display:inline-flex;align-items:center;gap:8px">${rivalAvatar(r.name, 30)}<span><b>${esc(r.name)}</b>${r.nemesis?` <span class="tag red">${tr({ it: 'nemesi', en: 'nemesis' })}</span>`:''}${r.lastSeen?`<div class="faint" style="font-size:11px">${tr({ it: 'visto: ', en: 'seen: ' })}${esc(r.lastSeen.node)} R${r.lastSeen.round}</div>`:''}</span><button class="btn ghost" style="padding:2px 7px;font-size:11px" data-rn="${esc(r.key)}" data-n="${esc(r.name)}" data-v="${esc(r.realName ?? '')}" title="${tr({ it: 'cambia il soprannome del pilota', en: 'change the driver nickname' })}">✏️</button></span></td>
      <td class="muted">${esc(r.team ?? '—')}</td>
      <td class="right">${r.sharedRaces}</td>
      <td class="right">${h2hBadge(r.h2h.beats, r.h2h.losses)}</td>
      <td>${r.trend==null?'—':r.trend>0?`<span class="tag green">▲ +${r.trend}</span>`:r.trend<0?`<span class="tag bad">▼ ${r.trend}</span>`:`<span class="faint">${tr({ it: 'stabile', en: 'stable' })}</span>`}</td>
      <td>${r.form.map(f=>`<span class="chip ${f==='DNF'?'':Number(f)<=3?'gold':''}" style="font-size:10px;padding:1px 6px">${f}</span>`).join(' ')}</td>
      <td class="right">${r.wins}</td>
      <td class="right">${r.podiums}</td>
    </tr>`).join('')}</tbody></table>
  </div>` : ''}`;
  $$('.rival-link', m).forEach((trr)=>{ trr.onclick=()=>showRival(trr.dataset.key); });
  $$('[data-rn]', m).forEach((b)=>{ b.onclick=(e)=>{ e.stopPropagation(); window.rinominaPilota('rival', b.dataset.rn, b.dataset.n, b.dataset.v).then(()=>render()); }; });
  /* NAVIGZIONE incrociata (28/10, stile Football Manager): arrivo qui con un
     nome pilota cliccato altrove (griglia, archivio) → trovo la riga il cui
     nome combacia (soprannome o nome vero) e spalanco la scheda come un clic. */
  const opts = window.NAV_OPTS?.tab === 'rivals' ? window.NAV_OPTS : null;
  window.NAV_OPTS = null;
  if (opts?.openName) {
    const q = opts.openName.toLowerCase();
    const riga = rows.find(r => (r.name ?? '').toLowerCase().includes(q) || (r.realName ?? '').toLowerCase().includes(q));
    if (riga) showRival(riga.key);
    else toast(tr({ it: `Pilota "${opts.openName}" non ancora nel registro rivali.`, en: `Driver "${opts.openName}" is not in the rivals registry yet.` }), 'info');
  }
}

/* Soprannomi in blocco (27/10, richiesta Mauro: «più piloti di fila»):
   un solo modal con ricerca e casella per ognuno; «Salva tutti» applica in fila
   gli alias cambiati con le stesse chiamate alias-set della rinomina singola. */
async function bulkRinomina(rows){
  const D = rows.map((r) => ({ key: r.key, vero: r.realName ?? r.name ?? '', alias: (r.realName && r.name !== r.realName) ? r.name : '' }));
  if (!D.length) return;
  modal(tr({ it: 'Soprannomi in blocco', en: 'Nicknames in bulk' }), `
    <div class="muted" style="margin-bottom:8px;font-size:12px">${tr({ it: 'Svuota una casella (o torna al nome vero) per ripristinare il nome originale. «Salva tutti» applica insieme i soprannomi cambiati.', en: 'Empty a box (or set it back to the real name) to restore the original name. "Save all" applies the changed nicknames together.' })}</div>
    <input id="br-q" type="text" placeholder="${tr({ it: 'cerca un pilota…', en: 'search a driver…' })}" style="width:100%;margin-bottom:8px">
    <div id="br-list" style="max-height:45vh;overflow:auto;border:1px solid var(--line);border-radius:8px"></div>
    <div id="br-out" class="muted" style="margin-top:8px;font-size:12px"></div>`,
    [[tr({ it: 'Salva tutti', en: 'Save all' }), 'act', () => { salva(); return false; }],
     [tr({ it: 'Annulla', en: 'Cancel' }), 'ghost', () => {}]]);
  const out = document.querySelector('#br-out');
  const disegna = (q = '') => {
    const list = document.querySelector('#br-list');
    q = q.toLowerCase();
    list.innerHTML = D
      .filter((d) => !q || d.vero.toLowerCase().includes(q))
      .map((d) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--line)">
          ${rivalAvatar(d.vero, 26)}
          <span style="flex:1;min-width:0"><b style="font-size:12.5px">${esc(d.vero)}</b></span>
          <input data-key="${esc(d.key)}" data-vero="${esc(d.vero)}" value="${esc(d.alias)}" placeholder="${tr({ it: 'nome vero', en: 'real name' })}" style="width:200px;font-size:12.5px">
        </div>`).join('')
      || `<div class="empty" style="padding:10px">${tr({ it: 'Nessun pilota con quel nome.', en: 'No driver with that name.' })}</div>`;
  };
  const salva = async () => {
    let n = 0, err = null;
    for (const inp of document.querySelectorAll('#br-list input[data-key]')) {
      const nv = String(inp.value).trim();
      const d = D.find((x) => x.key === inp.dataset.key);
      if (!d || (nv === d.alias && nv !== d.vero)) continue;   // non cambiato
      if (!nv || nv === d.vero) { if (d.alias) { /* ripristino */ } else continue; }
      try { await api('alias-set', { scope: 'rival', key: d.key, alias: (!nv || nv === d.vero) ? '' : nv }); d.alias = nv; n += 1; }
      catch (e) { err = e; break; }
    }
    if (err) out.innerHTML = `<span style="color:var(--bad)">${esc(err.message ?? String(err))}</span>`;
    else out.textContent = tr({ it: `Soprannomi salvati: ${n}.`, en: `Nicknames saved: ${n}.` });
    if (!err) {
      document.querySelector('#modal-root').innerHTML = '';
      toast(n ? tr({ it: `${n} soprannomi aggiornati.`, en: `${n} nicknames updated.` }) : tr({ it: 'Nessun cambiamento da salvare.', en: 'Nothing to save.' }), n ? 'ok' : 'info');
      render();
    }
  };
  disegna();
  document.querySelector('#br-q').oninput = (e) => disegna(e.target.value);
}

async function showRival(key){
  try {
    const d = await api('rival-detail', {key});
    if (d.error) return toast(d.error, 'err');
    const net = d.h2h.losses - d.h2h.beats;
    modal(`${tr({ it: 'Scheda rivale — ', en: 'Rival sheet — ' })}${d.name}`, `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        ${rivalAvatar(d.name, 48)}
        <div><b style="font-size:16px">${esc(d.name)}</b><div class="muted" style="font-size:12px">${esc(d.team ?? tr({ it: 'senza squadra', en: 'no team' }))}${d.nation?' · '+esc(d.nation):''}${d.car?' · '+window.carLinkHtml(d.car):''}</div></div>
      </div>
      <div class="grid4" style="margin-bottom:14px">
        <div class="kpi"><div class="l">${tr({ it: 'Scontri', en: 'Meetings' })}</div><div class="v">${d.totals.races}</div></div>
        <div class="kpi"><div class="l">${tr({ it: 'Tu-Lui', en: 'You-Him' })}</div><div class="v ${net>0?'good':net<0?'bad':''}">${d.h2h.losses}–${d.h2h.beats}</div></div>
        <div class="kpi"><div class="l">${tr({ it: 'Vittorie', en: 'Wins' })}</div><div class="v">${d.totals.wins}</div></div>
        <div class="kpi"><div class="l">${tr({ it: 'Suo best', en: 'His best' })}</div><div class="v">${d.bestPos!=null?'P'+d.bestPos:'—'}</div></div>
      </div>
      <div class="muted" style="margin-bottom:10px">${esc(d.team ?? tr({ it: 'senza squadra', en: 'no team' }))}${d.nation?' · '+esc(d.nation):''}${d.car?` · ${tr({ it: 'auto: ', en: 'car: ' })}${window.carLinkHtml(d.car)}`:''}${d.since?` · ${tr({ it: 'in registro dal ', en: 'in the log since ' })}${esc(d.since)}`:''}</div>
      ${d.winsDetail.length ? `<div style="margin-bottom:10px"><b>${tr({ it: 'Ha vinto a:', en: 'Has won at:' })}</b> ${d.winsDetail.map(w=>`${window.trackLinkHtml(w.track)} <span class="muted">S${w.season} R${w.round+1}</span>`).join(' · ')}</div>` : ''}
      ${d.beatsMeAt.length ? `<div class="banner warn" style="margin-bottom:10px">${tr({ it: 'Ti ha battuto a: ', en: 'Beat you at: ' })}<b>${d.beatsMeAt.map(esc).join(', ')}</b></div>` : ''}
      ${d.beatsMeAt.length ? `<button class="mini acc" id="r-telem" style="margin-bottom:10px">📈 ${tr({ it: 'confronta la tua telemetria', en: 'compare your telemetry' })}</button>` : ''}
      <div style="max-height:260px;overflow:auto"><table><thead><tr><th>${tr({ it: 'Gara', en: 'Race' })}</th><th class="right">${tr({ it: 'Lui', en: 'Him' })}</th><th class="right">${tr({ it: 'Tu', en: 'You' })}</th><th>${tr({ it: 'Suo giro', en: 'His lap' })}</th><th>${tr({ it: 'Esito', en: 'Outcome' })}</th></tr></thead><tbody>
        ${d.meetings.map(m=>`<tr><td>${window.trackLinkHtml(m.track)} <span class="faint">S${m.season} R${m.round+1}</span></td><td class="right">${m.dnf?'DNF':m.pos!=null?'P'+m.pos:'—'}</td><td class="right">${m.mePos!=null?'P'+m.mePos:'—'}</td><td class="muted">${esc(m.bestLap??'—')}</td><td>${m.beatMe?`<span class="tag bad">${tr({ it: 'battuto', en: 'beaten' })}</span>`:`<span class="tag good">${tr({ it: 'vinto', en: 'won' })}</span>`}</td></tr>`).join('')}
      </tbody></table></div>`,
      [[tr({ it: '📄 Dossier completo', en: '📄 Full dossier' }), 'acc', () => { openDossier(key); }],
       [tr({ it: '✏️ Rinomina', en: '✏️ Rename' }), 'ghost', () => { window.rinominaPilota('rival', key, d.name, d.realName).then(() => { document.querySelector('#modal-root').innerHTML = ''; showRival(key); render(); }); }],
       [tr({ it: 'Chiudi', en: 'Close' }), 'ghost', () => {}]]);
    /* DOSSIER COMPLETE del rivale (src/analisi.mjs, module 5): ritmo/delta giro,
   piste dove è più forte, costanza e mappa degli scontri — un pannello insieme
   per capire COME batterlo, non solo contro chi sei. */
async function openDossier(key){
  try {
    const d = await api('rival-dossier', {key});
    if (d.error) return toast(d.error, 'err');
    if (!d) return toast(tr({ it: 'Rivale non trovato.', en: 'Rival not found.' }), 'err');
    const ds = (ms, sign = false) => (Number.isFinite(ms) && ms != null
      ? `${ms > 0 && sign ? '+' : ms < 0 ? '−' : ''}${(Math.abs(ms) / 1000).toFixed(2)}s` : '—');
    /* RIASSUNTO «come batterlo» (richiesta Mauro 23/10): tre righe a colpo d'occhio,
       senza numeri inutili — i valori son già nelle tabelle qui sotto. Deriva TUTTO
       dai dati del dossier: niente opinioni. */
    const batt = [];
    const slow = d.pace?.himVsMeSec != null ? d.pace.himVsMeSec > 0 : null;
    if (slow === true) batt.push(tr({ it: '🥪 Lui gira più lento di te sul giro: tieni il TUO ritmo e la faida si risolve da sola.', en: '🥪 He runs slower than you per lap: keep YOUR pace and the feud settles itself.' }));
    else if (slow === false) batt.push(tr({ it: '🥩 Lui gira più veloce di te: non inseguirlo a occhio — attacca dove crolla (piste qui sotto), difenditi dove è più forte.', en: '🥩 He runs faster than you: do not chase him blindly — strike where he crumbles (tracks below), defend where he is stronger.' }));
    if (d.weakTracks?.length) batt.push(tr({ it: `🎯 ATTACCA a ${d.weakTracks.map(t => t.track).join(', ')} — lì perde di più dal tuo ritmo.`, en: `🎯 STRIKE at ${d.weakTracks.map(t => t.track).join(', ')} — that is where he loses the most from your pace.` }));
    if (d.hisTracks?.length) batt.push(tr({ it: `🛡️ DIFENDITI a ${d.hisTracks.map(t => t.track).join(', ')} — lì gira a parità tua.`, en: `🛡️ DEFEND at ${d.hisTracks.map(t => t.track).join(', ')} — he runs at your level there.` }));
    if (d.consistency?.verdict) batt.push(d.consistency.verdict);
    else if (d.pace?.closeTrendText) batt.push(d.pace.closeTrendText);
    const riass = batt.slice(0, 3);
    modal(`${tr({ it: 'Dossier del rivale — ', en: 'Rival dossier — ' })}${d.name}`, `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        ${rivalAvatar(d.name, 48)}
        <div><b style="font-size:16px">${esc(d.name)}</b><div class="muted" style="font-size:12px">${esc(d.team ?? tr({ it: 'senza squadra', en: 'no team' }))}${d.nation ? ' · ' + esc(d.nation) : ''}${d.car ? ' · ' + window.carLinkHtml(d.car) : ''}</div></div>
      </div>
      <div class="grid4" style="margin-bottom:12px">
        <div class="kpi"><div class="l">${tr({ it: 'Scontri', en: 'Meetings' })}</div><div class="v">${d.meetingsCount}</div></div>
        <div class="kpi"><div class="l">${tr({ it: 'Δ giro medio', en: 'Avg lap Δ' })}</div><div class="v ${d.pace?.himVsMeSec > 0 ? 'good' : d.pace?.himVsMeSec != null ? 'bad' : ''}">${d.pace?.himVsMeSec != null ? (d.pace.himVsMeSec > 0 ? '+' : '−') + Math.abs(d.pace.himVsMeSec).toFixed(2) : '—'}s</div></div>
        <div class="kpi"><div class="l">${tr({ it: 'Vittorie', en: 'Wins' })}</div><div class="v">${d.totals.wins}</div></div>
        <div class="kpi"><div class="l">${tr({ it: 'DNF suoi', en: 'His DNFs' })}</div><div class="v">${d.consistency?.dnfRate ?? '—'}%</div></div>
      </div>
      ${riass.length ? `<div class="panel" style="margin-bottom:12px;padding:10px 14px;background:var(--panel2,rgba(0,0,0,.15))">
        <div style="font-size:11.5px;letter-spacing:1.2px;text-transform:uppercase;color:var(--dim,#8a8a8a);font-weight:700;margin-bottom:6px">${tr({ it: 'Come batterlo — in tre righe', en: 'How to beat him — three lines' })}</div>
        ${riass.map(s => `<div style="margin:4px 0;font-size:13px;line-height:1.45">${esc(s)}</div>`).join('')}
      </div>` : ''}
      ${d.pace?.verdict ? `<div class="banner ${d.pace.himVsMeSec > 0 ? 'good' : 'warn'}" style="margin-bottom:8px">⏱️ ${esc(d.pace.verdict)}</div>` : ''}
      ${d.pace?.closeTrendText ? `<div class="muted" style="margin-bottom:12px;font-size:12.5px">↗️ ${esc(d.pace.closeTrendText)}</div>` : ''}
      ${d.consistency?.verdict ? `<div class="muted" style="margin-bottom:12px;font-size:12.5px">📐 ${esc(d.consistency.verdict)}</div>` : ''}
      ${d.perTrack?.length ? `<div style="margin-bottom:12px"><b>${tr({ it: 'Per pista (Δ suo giro − il tuo, mediana):', en: 'Per track (Δ his lap − yours, median):' })}</b>
        <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">${d.perTrack.slice(0,12).map(t=>`<span class="chip ${t.deltaMs > 0 ? '' : 'gold'}" style="font-size:11px">${esc(t.track)} ${ds(t.deltaMs, true)}</span>`).join('')}</div></div>` : ''}
      ${d.hisTracks?.length ? `<div class="banner warn" style="margin-bottom:8px">🚩 ${tr({ it: 'Dove è più forte di te: ', en: 'Where he is stronger than you: ' })}<b>${d.hisTracks.map(t=>esc(t.track)).join(', ')}</b>${d.weakTracks?.length ? `<span class="muted"> · ${tr({ it: 'dove invece crolla: ', en: 'where he crumbles: ' })}<b>${d.weakTracks.map(t=>esc(t.track)).join(', ')}</b></span>` : ''}</div>` : ''}
      ${(d.stagione?.length) ? `<details style="margin-bottom:8px"><summary class="muted" style="cursor:pointer">${tr({ it: `forma per pista (${d.stagione.length}) — settori fort/debole`, en: `season form per track (${d.stagione.length}) — strong/weak sectors` })}</summary>
        <div style="margin-top:8px;max-height:240px;overflow:auto"><table><thead><tr><th>${tr({ it: 'Pista', en: 'Track' })}</th><th class="right">${tr({ it: 'Scontri', en: 'Meetings' })}</th><th class="right">${tr({ it: 'Vittorie', en: 'Wins' })}</th><th class="right">${tr({ it: 'Δ best giro', en: 'Δ best lap' })}</th><th>${tr({ it: 'Settori (suo − tuo)', en: 'Sectors (his − yours)' })}</th></tr></thead>
        <tbody>${d.stagione.map(t=>`<tr><td>${esc(t.track)}</td><td class="right">${t.scontri}</td><td class="right">${t.vittorie || '—'}</td><td class="muted">${ds(t.deltaGiroMs, true)}</td><td class="muted" style="font-size:11.5px">${t.settori.length ? t.settori.map(s=>`<span class="chip ${s.deltaMs < 0 ? 'bad' : 'good'}" style="margin-right:4px" title="${tr({ it: 'media', en: 'average' })} ${ds(s.mediaSuaMs)} vs ${ds(s.mediaMiaMs)}">S${s.settore} ${ds(s.deltaMs, true)}</span>`).join('') : '<span class="faint">' + tr({ it: 'splits dai prossimi round', en: 'splits from next rounds' }) + '</span>'}${t.settoreForte ? `<div style="font-size:11px" class="faint">${tr({ it: 'forte: S', en: 'strong: S' })}${t.settoreForte.settore} · ${tr({ it: 'debole: S', en: 'weak: S' })}${t.settoreDebole.settore}</div>` : ''}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      <details><summary class="muted" style="cursor:pointer">${tr({ it: `mappa degli scontri (${d.meetings?.length ?? 0})`, en: `map of the meetings (${d.meetings?.length ?? 0})` })}</summary>
        <div style="margin-top:8px;max-height:240px;overflow:auto"><table><thead><tr><th>${tr({ it: 'Gara', en: 'Race' })}</th><th class="right">${tr({ it: 'Lui', en: 'Him' })}</th><th class="right">${tr({ it: 'Tu', en: 'You' })}</th><th class="right">Δ giro</th><th>${tr({ it: 'Esito', en: 'Outcome' })}</th></tr></thead>
        <tbody>${(d.meetings ?? []).map(m=>`<tr><td>${esc(m.track)} <span class="faint">S${m.season} R${m.round+1}</span></td><td class="right">${m.dnf ? 'DNF' : m.pos != null ? 'P'+m.pos : '—'}</td><td class="right">${m.myPos != null ? 'P'+m.myPos : '—'}</td><td class="muted">${ds(m.himVsMeMs, true)}</td><td>${m.beatMe ? `<span class="tag bad">${tr({ it: 'battuto', en: 'beaten' })}</span>` : `<span class="tag good">${tr({ it: 'vinto', en: 'won' })}</span>`}</td></tr>`).join('')}</tbody></table></div></details>`,
      [[tr({ it: '✏️ Rinomina', en: '✏️ Rename' }), 'ghost', () => { window.rinominaPilota('rival', key, d.name, d.realName).then(() => { document.querySelector('#modal-root').innerHTML = ''; openDossier(key); render(); }); }],
       [tr({ it: 'Chiudi', en: 'Close' }), 'ghost', () => {}]]);
  } catch(e){ toast(e.message, 'err'); }
}

// TELEMETRIA RIVALE: il grafico del giro della TU'A auto (i suoi giri non
    // esistono nei file MoTeC: lì registra solo la sessione tua). Il valore è
    // guardare dove perdi tempo sulla pista DOVE ti ha battuto — la pista la
    // rileviamo dalla prima beatMeAt e arrivi sul Setup con lo schermo pronto.
    const btnT = document.querySelector('#r-telem');
    if (btnT) btnT.onclick = async () => {
      const track = d.beatsMeAt?.[0] ?? null;
      window.__rivalTelemTrack = track;
      document.querySelector('#modal-root').innerHTML = '';   // chiude la scheda
      tab = 'setup'; drawNav();
      try { await render(); } catch { /* la vista vale comunque */ }
      toast(tr({ it: 'Grafico del giro sul Setup', en: 'Lap chart on Setup' }) + (track ? `${tr({ it: ': cerca la sessione su ', en: ': look for the session at ' })}${track}${tr({ it: ' (la pista dove ti prende)', en: ' (the track where he takes you)' })}` : '') + `. ${tr({ it: 'Guarda le bande gas/freno: lì capisci dove perdi il tempo.', en: "Look at the throttle/brake bands: that's where you lose the time." })}`, 'info');
    };
  } catch(e){ toast(e.message, 'err'); }
}

/* ============================== avvio ============================== */
/* CHIP VOCE del copilota SEMPRE visibile in testa al cruscotto (27/10, Mauro:
   «sto cercando lo speech per attivarlo ma non lo vedo»): il bottone 🔊 di
   dentro il pannello «Ingegnere LIVE» nasce e muore con la sessione diretta —
   fuori diretta l'interruttore non esisteva da nessuna parte. Questo chip vive
   in testata e quando lo ACCENDI la radio prova SUBITO la voce, senza aspettare
   la sessione.
   UNIFICAZIONE DEI CHIP (31/10 tardissimo): fin qui questo chip viveva di
   SOLO localStorage 'evo-copilot' mentre il chip dentro «Ingegnere LIVE»
   (#cp-toggle) e il selettore di Impostazioni comandano la RADIO DEL SERVER
   via POST voce-server (decisione 31/10: la radio la comanda il SOLO config).
   Era un terzo canale sfasato: poteva dire «copilota ON» in oro con la radio
   reale (Cosimo) spenta, e lo spegni non comandava la voce che in gara si
   sente. Da oggi legge e comanda la STESSA sorgente: stato via GET
   (voce-server), click via POST { on } come il chip del pannello; l'accensione
   prova la radio vera (/api voce-prova, lo stesso repertorio del ♪ prova e
   del bottone delle Impostazioni). Con il server irraggiungibile resta il
   canale locale (localStorage + speechSynthesis «Copilota attivo.»): il chip
   lavora comunque. La ALLINEAMENTO porta lo stato reale a risposta ricevuta
   (una GET alla volta, guardia _voceSrvChiedo) e RIDISEGNA solo se cambia
   davvero. Per progetto la voce è ITALIANA comunque vada l'interfaccia. */
function drawCopilotStrip(){
  const host = document.querySelector('#copilot-strip');
  if (!host) return;
  const on = _voceSrvOn != null ? _voceSrvOn : (localStorage.getItem('evo-copilot') !== 'off');
  host.textContent = on ? (window.tr ? window.tr({ it: '🔊 copilota ON', en: '🔊 copilot ON' }) : '🔊 copilota ON') : (window.tr ? window.tr({ it: '🔈 copilota', en: '🔈 copilot' }) : '🔈 copilota');
  host.className = on ? 'chip gold' : 'chip';
  host.title = tr({
    it: on
      ? 'Copilota ATTIVO: la radio la fa il PITWALL (Cosimo parla anche con la GUI chiusa). Stesso comando del chip «🔊 copilota» dentro Ingegnere LIVE e del selettore di Impostazioni. Click: lo spegni.'
      : 'Copilota SPENTO. Click: lo accendi e la radio del Pitwall prova subito la voce (lo stesso repertorio delle Impostazioni). Se il server non risponde resta la voce locale del browser con la frase di collaudo.',
    en: on
      ? 'Voice copilot ACTIVE: the voice is the server PITWALL (Cosimo speaks even with the GUI closed). Same command as the chip in Engineer LIVE and the Settings selector. Click to mute it.'
      : 'Voice copilot OFF. Click to enable it — the Pitwall radio speaks a test line right away (the same repertoire as Settings). If the server is unreachable the browser local test voice remains.',
  });
  // ALLINEAMENTO col vero stato del server: il testo esce già con lo stato
  // ottimista/localStorage, la GET rettifica a risposta ricevuta (e NON
  // ridisegna se non cambia davvero — niente loop di GET).
  if (!_voceSrvChiedo) {
    _voceSrvChiedo = true;
    try {
      Promise.resolve(api('voce-server')).then((r) => {
        _voceSrvChiedo = false;
        if (r && typeof r.on === 'boolean') {
          const cambiato = r.on !== _voceSrvOn;
          _voceSrvOn = r.on;
          if (cambiato && r.on !== on) drawCopilotStrip();
        }
      }).catch(() => { _voceSrvChiedo = false; });
    } catch { _voceSrvChiedo = false; }
  }
}
/* l'ultimo stato VERO della radio visto dal server (null = non ancora
   letto): al primo render il chip parte da localStorage, la prima GET di
   drawCopilotStrip lo porta al valore reale (come #cp-toggle lo mostra). */
let _voceSrvOn = null;
let _voceSrvChiedo = false;   // guardia: una GET alla volta
document.addEventListener('click', async (ev) => {
  const t = ev.target?.closest?.('#copilot-strip');
  if (!t) return;
  const wasOn = _voceSrvOn != null ? _voceSrvOn : (localStorage.getItem('evo-copilot') !== 'off');
  const onNuovo = !wasOn;
  localStorage.setItem('evo-copilot', onNuovo ? 'on' : 'off');   // canale locale coerente (residuo: da questa sera il comando vero è il POST sotto)
  if (window.__copilot) window.__copilot.on = onNuovo;   // la barra diretta si allinea al giro dopo
  try { if (wasOn) speechSynthesis.cancel(); } catch { /* niente voce: ok così */ }
  _voceSrvOn = onNuovo;   // ottimista: il POST qui sotto o la GET conferma/rettifica
  drawCopilotStrip();
  // STESSO COMANDO del chip di Ingegnere LIVE: la radio la comanda il config
  try { await api('voce-server', { on: onNuovo }); } catch { /* senza server resta la locale */ }
  drawCopilotStrip();   // il POST ha già messo lo stato vero: la GET vive nella draw
  if (onNuovo) {
    // PARLA SUBITO (come da nascita del chip, 27/10): prova la radio VERA
    // del Pitwall — stesso timbro e stessa coda della gara. Se il server
    // la rifiuta o non c'è, torna la frase della voce del browser.
    try { await api('voce-prova', {}); }
    catch { try { const u = new SpeechSynthesisUtterance('Copilota attivo.'); speechSynthesis.speak(u); } catch { /* la voce non deve mai rompere la pagina */ } }
  }
});
/* PROVA VOCE DAL CRUSCOTTO (27/10, richiesta Mauro): il chip «♪ prova» accanto
   al copilota parla la stessa frase di collaudo del bottone nelle Impostazioni
   con la STESSA scelta della copilota di gara (esatta it-it → prefisso it →
   nome «Italian») e dice in coco QUALE voce ha usato: se è una [it-IT] il
   lattigguio a coco è giusto; se esce [en-US] il sistema è in fallback (voce
   italiana assente: Windows → Voce → Aggiungi voci, come dicono le Impostazioni). */
  /* (30/10) COLLAUDO ONESTO delle due voci: il chip prova PRIMA la radio VERA
     della gara (voceSrv/Cosimo, endpoint /api/voce-prova: lo stesso del bottone
     «prova la radio» delle Impostazioni) — così ascolti il timbro del Pitwall
     che parla davvero in gara, non un altro. Se la radio non è viva (copilota
     spenta -> 400, o server offline) torna la prova classica del browser,
     identica a prima. */
document.addEventListener('click', (ev) => {
  const p = ev.target?.closest?.('#copilot-prova');
  if (!p) return;
  const provaBrowser = () => {
  if (!('speechSynthesis' in window)) { toast(tr({ it: 'Il browser non supporta la voce.', en: 'This browser has no speech support.' }), 'err'); return; }
  const norm = (s) => String(s ?? '').toLowerCase().replace('_', '-');
  const pick = (vs) => vs.find((vv) => norm(vv.lang) === 'it-it')
    ?? vs.find((vv) => norm(vv.lang).startsWith('it'))
    ?? vs.find((vv) => /ital/i.test(String(vv.name ?? '') + String(vv.voiceURI ?? '')));
  const parla = (tentativo = 0) => {
    try { speechSynthesis.cancel(); } catch { /* silente */ }
    const vs = speechSynthesis.getVoices?.() ?? [];
    const v = pick(vs);
    const u = new SpeechSynthesisUtterance('Prova della voce copilota: selezione automatica in italiano, un, due, tre.');
    u.lang = 'it-IT'; u.rate = 1.1; u.volume = 0.9;
    if (v) u.voice = v;
    u.onend = () => { try { toast(tr({ it: 'Voce usata: ', en: 'Voice used: ' }) + (v ? `${v.name} [${v.lang}]` : tr({ it: 'quella predefinita del sistema', en: 'the system default' })), v && norm(v.lang).startsWith('it') ? 'ok' : 'warn'); } catch {} };
    try { speechSynthesis.speak(u); } catch (e) { toast(String(e?.message ?? 'voce non partita'), 'err'); }
    // la lista voci arriva ASINCRONA: voce assente al primo colpo = riprova
    if (!v && tentativo < 2) setTimeout(() => parla(tentativo + 1), 700);
  };
  parla();
  };
  try {
    api('voce-prova', {}).then((r) => {
      toast(tr({ it: 'In coda alla voce del Pitwall — livello: ', en: 'Queued on the Pitwall voice — level: ' }) + r.livello, 'ok');
    }).catch(() => provaBrowser());
  } catch { provaBrowser(); }
});
drawCopilotStrip();

/* auto-aggiornamento: quando il watcher importa un risultato (o la pagina resta
   in background e i dati cambiano), il cruscotto si ricarica da solo */
let _watchSeq = null;
setInterval(async () => {
  try {
    const w = await api('watcher');
    const seq = w.seq ?? 0;
    if (_watchSeq === null) { _watchSeq = seq; return; }
    if (seq !== _watchSeq) {
      _watchSeq = seq;
      if (w.lastMsg?.msg) toast(w.lastMsg.msg, w.lastMsg.kind === 'good' ? 'ok' : '');
      await refreshBoot();
      render();
    }
  } catch {}
}, 5000);

/* widget live nel cruscotto (dati di gara in tempo reale) */
async function drawLiveStrip(){
  const host = document.querySelector('#live-strip');
  if (!host) return;
  try {
    const [r, w, h] = await Promise.all([api('live'), api('watcher'), api('system-health').catch(() => null)]);
    drawMotecStrip(h);
    // EVO scrive il file .ld SOLO alla chiusura della sessione: se compare (o cambia)
    // un file NUOVO mentre sei sul cruscotto, i dati d'ingegnere sono cambiati —
    // ridisegna la pagina senza che tu la ricarichi a mano.
    const key = h?.telem?.lastLd ? `${h.telem.lastLd.file}@${h.telem.lastLd.mtimeMs}` : '';
    if (key && key !== window.__motecKey){
      const had = window.__motecKey != null;   // al primo poll non ridisegnare
      window.__motecKey = key;
      if (had && tab === 'dashboard') render();
    }
    if (w?.lastMsg?.msg){ host.title = w.lastMsg.msg; }
    if (!r.game){
      /* «EVO chiuso» da solo confondeva (Mauro 21/10): ora dice che COSA c'è —
         ultima telemetria (con orario), chiusura con scrittura .ld o segnale perso.
         Con liveMode 'off' (disattivato a mano) il chip diventa il COMANDO. */
      if (r.liveMode === 'off'){
        host.className = 'chip';
        host.innerHTML = `<span class="dot"></span> ${tr({ it: 'Live spento · ', en: 'Live off · ' })}<b data-live-on style="cursor:pointer;text-decoration:underline">${tr({ it: 'attiva', en: 'enable' })}</b>`;
        host.title = tr({ it: 'Telemetria live disattivata a mano: niente strip in pista, verifica di gara LIVE e import automatico dei risultati (importa a mano da Centro gare). «attiva» la rimette in AUTO: riparte da sola quando apri EVO. Sopra restano valide: il chip GIOCO segue il processo del gioco.', en: 'Live telemetry switched off by hand: no on-track strip, no LIVE race check and no automatic result import (import by hand from Race centre). "enable" puts it back to AUTO: it starts by itself when you open EVO. Above still true: the GAME chip follows the game process.' });
        return;
      }
      const age = Date.now() - (h?.telem?.lastLd?.mtimeMs ?? 0);
      const ultima = h?.telem?.lastLd ? new Date(h.telem.lastLd.mtimeMs).toLocaleTimeString(window.LOCALE, { hour: '2-digit', minute: '2-digit' }) : null;
      const label = r.stale ? tr({ it: 'EVO · segnale live perso', en: 'EVO · live signal lost' })
        : (h?.telem?.lastLd?.valid && age < 10000 ? tr({ it: 'EVO · sessione chiusa — scrittura telemetria', en: 'EVO · session closed — writing telemetry' })
        : (ultima ? tr({ it: `EVO chiuso · telem. ore ${ultima}`, en: `EVO closed · telemetry ${ultima}` }) : tr({ it: 'EVO chiuso', en: 'EVO closed' })));
      host.innerHTML = `<span class="dot"></span> ${label}`; host.className = 'chip';
      host.title = r.stale ? tr({ it: 'I dati live non si aggiornano da oltre 20s: se EVO è aperto, il lettore si ricicla da solo entro 30s.', en: 'Live data has not updated for over 20s: if EVO is open, the reader recycles itself within 30s.' }) : (ultima ? tr({ it: `Ultima telemetria scritta da EVO alle ${ultima}: quando riapri il gioco la scritta torna a seguire la sessione in diretta.`, en: `Last telemetry written by EVO at ${ultima}: when you reopen the game the strip follows the live session again.` }) : '');
      return;
    }
    const p = r.player;
    if (!p || !r.live){ host.className = 'chip'; host.innerHTML = `<span class="dot on"></span> ${tr({ it: 'EVO aperto', en: 'EVO open' })} · ${esc(legacyIt(r.session?.type ?? ''))}`; return; }
    host.className = 'chip gold';
    const rec = w?.armed ? tr({ it: ' · ⏺ registrazione', en: ' · ⏺ recording' }) : '';
    host.innerHTML = `<span class="dot on"></span> ${p.position ? 'P'+p.position+'/'+p.drivers : 'in pista'}${p.lapsTotal?` · giro ${p.lapNo ?? p.lapsDone+1}/${p.lapsTotal}`:''}${p.gapAhead?` · +${p.gapAhead.toFixed(1)}s`:''}${p.bestLap?` · best ${p.bestLap}`:''}${rec}`;
  } catch { host.className = 'chip'; }
}
setInterval(drawLiveStrip, 2000);

/* il chip «attiva» dello strip: riporta la telemetria live in AUTO una volta sola
   (delegato sul document: il chip viene riscritto a ogni poll e i listener muoiono) */
if (!window.__liveToggleDeleg){
  window.__liveToggleDeleg = true;
  document.addEventListener('click', async (ev) => {
    const t = ev.target?.closest?.('[data-live-on]');
    if (!t) return;
    try {
      await api('live-toggle', { mode: 'auto' });
      toast('Live in AUTO: la telemetria riparte da sola quando apri EVO.', 'ok');
    } catch (e) { toast('Non riesco ad attivare il live: ' + (e.message ?? e)); }
    await refreshBoot();
    render();
  });
}

/* icona MoTeC nell'header: dice se EVO sta scrivendo telemetria adesso.
   ⏺ rosso lampeggiante = registrazione in corso (file .ld aggiornato da <10s);
   verde = l'ultimo file ha dati; rosso fisso = file vuoto (telemetria disattiva in EVO);
   nascosto = nessun file .ld ancora scritto. */
function drawMotecStrip(h){
  const host = document.querySelector('#motec-strip');
  if (!host) return;
  const ld = h?.telem?.lastLd;
  if (!ld){
    const anyDir = (h?.telem?.dirsState ?? []).some((d) => d.exists);
    host.className = 'chip';
    host.innerHTML = `<span class="dot"></span> ${tr({ it: 'attesa EVO', en: 'waiting for EVO' })}`;
    host.title = tr({ it: 'Nessun file .ld ancora: appena termini una sessione, EVO scrive la telemetria e l\'indicatore si accende. Ricorda: in EVO attiva la registrazione telemetria in Setup → Elettronica (e imposta i giri per la sessione) PRIMA di avviare la sessione.', en: "No .ld file yet: as soon as you finish a session, EVO writes the telemetry and the indicator lights up. Remember: in EVO enable telemetry recording in Setup → Electronics (and set the laps for the session) BEFORE starting the session." });
    if (!anyDir) host.className = 'chip hidden';
    return;
  }
  const age = Date.now() - (ld.mtimeMs ?? 0);
  if (ld.valid && age < 10000){
    host.className = 'chip gold';
    host.innerHTML = `<span class="dot rec"></span> ${tr({ it: '⏺ registra', en: '⏺ recording' })}`;
    host.title = tr({ it: 'MoTeC sta registrando: ' + ld.car + (ld.track ? ' · ' + ld.track : '') + ' · aggiornato ' + ld.when + '. Ricorda: in EVO la registrazione va attivata in Setup → Elettronica e i giri impostati PRIMA di avviare la sessione.', en: "MoTeC is recording: " + ld.car + (ld.track ? ' · ' + ld.track : '') + ' · updated ' + ld.when + '. Remember: in EVO recording is enabled in Setup → Electronics and the laps are set BEFORE starting the session.' });
  } else if (ld.valid){
    host.className = 'chip green';
    host.innerHTML = `<span class="dot on"></span> ${tr({ it: 'dati ok', en: 'data ok' })}`;
    host.title = tr({ it: 'Ultimo file MoTeC con dati: ' + ld.car + (ld.track ? ' · ' + ld.track : '') + ' · ' + ld.when + '. Ricorda: in EVO attiva la registrazione telemetria in Setup → Elettronica (e imposta i giri) PRIMA di avviare la sessione.', en: "Last MoTeC file with data: " + ld.car + (ld.track ? ' · ' + ld.track : '') + ' · ' + ld.when + '. Remember: in EVO enable telemetry recording in Setup → Electronics (and set the laps) BEFORE starting the session.' });
  } else if (age < 10000){
    host.className = 'chip red';
    host.innerHTML = `<span class="dot rec"></span> ${tr({ it: 'scrive vuoto!', en: 'writing empty!' })}`;
    host.title = tr({ it: 'EVO sta scrivendo il file ma è vuoto: la telemetria non era attiva in EVO (' + ld.car + (ld.track ? ' · ' + ld.track : '') + '). Attivala in Setup → Elettronica (con i giri impostati) PRIMA di avviare la sessione; finché non ci sono dati veri, i consigli del BOX useranno la stima.', en: "EVO is writing the file but it is empty: telemetry was not active in EVO (" + ld.car + (ld.track ? ' · ' + ld.track : '') + "). Enable it in Setup → Electronics (with the laps set) BEFORE starting the session; until there is real data, the BOX tips will use the estimate." });
  } else {
    host.className = 'chip red';
    host.innerHTML = `<span class="dot"></span> ${tr({ it: 'file vuoto', en: 'empty file' })}`;
    host.title = tr({ it: 'L\'ultimo file .ld di EVO non ha dati (' + ld.when + '): la telemetria non era attiva in EVO. Si attiva in Setup → Elettronica, PRIMA di avviare la sessione; finché non ci sono dati veri, i consigli del BOX usano la stima.', en: "EVO's last .ld file has no data (" + ld.when + "): telemetry was not active in EVO. It is enabled in Setup → Electronics, BEFORE starting the session; until there is real data, the BOX tips will use the estimate." });
  }
}

refreshBoot().then(render).catch(e => {
  window.__bootErr = e.stack ?? String(e);  // lo stack per la diagnosi nel terminale di assistenza
  $('#main').innerHTML = `<div class="panel"><div class="banner bad">Il server non risponde: ${esc(e.message)}<br><span class="muted">Rilancia apri-gui.cmd</span></div></div>`;
});
setInterval(async () => {
  try {
    const b = await api('boot');
    $('#dot-evo').classList.toggle('on', !!b.gameRunning);
    $('#t-evo').textContent = b.gameRunning ? tr({ it: 'EVO aperto', en: 'EVO open' }) : tr({ it: 'chiuso', en: 'closed' });
  } catch {}
}, 30000);
