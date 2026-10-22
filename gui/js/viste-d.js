
/* -------- difficoltà -------- */
async function drawDifficulty(m){
  const v = await api('difficulty');
  const rng = v.trimRange ?? {min:-20, max:20};
  const sr = v.sliderRange ?? {min:0, max:120};
  m.innerHTML = `
  <div class="panel">
    <h2>Difficoltà AI <span class="h-act">modalità ${esc(v.mode)}</span></h2>
    <div class="banner info" style="margin:0 0 12px">Lo slider AI di Assetto Corsa EVO va da <b>${sr.min}</b> a <b>${sr.max}%</b> e si imposta direttamente nel gioco. La difficoltà interna del tool (scala 70–120) viene convertita in quel range; la modalità adattiva aggiunge un <b>trim da ${rng.min} a ${rng.max > 0 ? '+' : ''}${rng.max}</b> in base ai risultati. Con i cursori qui sotto regoli il trim di ogni serie a mano.</div>
    <div class="row" style="margin-bottom:12px">
      <button class="mini ${v.mode==='adaptive'?'on':''}" data-mode="adaptive">adattiva</button>
      <button class="mini ${v.mode==='fixed'?'on':''}" data-mode="fixed">fissa</button>
      <input type="number" id="i-diffval" min="70" max="120" value="95" style="width:90px" title="valore fisso (70–120)">
    </div>
    ${v.pending ? `<div class="banner ${v.pending.to>=(v.trimRange?.max??20)?'warn':''}">Suggerimento in attesa — ${esc(v.pendingDisplay)}: ${esc(v.pending.reason)} → trim ${v.pending.to >= 0 ? '+' : ''}${v.pending.to}${v.pending.to>=(v.trimRange?.max??20)?' (massimo raggiunto)':''}
      <button class="mini" id="b-acc">accetta</button> <button class="mini" id="b-rej">rifiuta</button></div>` : ''}
    <div style="margin-top:10px">
    ${v.rows.map(r=>{
      const atMax = r.trim >= (v.trimRange?.max ?? 20);
      return `<div class="diff-row" data-id="${esc(r.id)}">
      <span>${r.current?'◄':''}</span><span class="nm">${esc(r.display)}${r.locked?' 🔒':''}</span>
      <span class="num" title="base della serie + trim">base ${r.base}</span><span class="num" title="trim adattivo (±${rng.max})">trim ${r.trim>=0?'+':''}${r.trim}${atMax?' ⚠️':''}</span>
      <span class="num" title="correzione classe / pista">${r.offClass>=0?'+':''}${r.offClass}/${r.offTrack>=0?'+':''}${r.offTrack}</span>
      <span class="sl" title="centro consigliato convertito in slider EVO">${r.slider}%</span>
      <span class="rangebox">
        <input type="number" class="rmin" min="0" max="100" step="1" value="${r.rangeMin}" title="minimo da impostare in EVO (consiglio: ${Math.max(0,r.slider-5)})" ${r.locked?'disabled':''}>
        <span class="dash">–</span>
        <input type="number" class="rmax" min="0" max="100" step="1" value="${r.rangeMax}" title="massimo da impostare in EVO (consiglio: ${Math.min(100,r.slider+5)})" ${r.locked?'disabled':''}>
        <b class="pct">%</b>
        <button class="mini rc" title="torna al default della serie: 88–93%" ${r.overridden?'':'style="visibility:hidden"'}>↺</button>
      </span>
    </div>`;}).join('')}
    </div>
    <div class="muted" style="margin-top:10px">⚠️ = trim al massimo (${rng.max}): oltre si va solo cambiando serie. Nelle caselle scrivi l'intervallo <b>min–max esatto da impostare in EVO</b> (${sr.min}–${sr.max}), come nel gioco: si salva da solo; ↺ torna al consiglio (centro ±5). Il consiglio si ferma a 100: se una serie resta facile anche a fondo scala, si cambia serie.</div>
  </div>`;
  $$('button[data-mode]').forEach(b => b.onclick = async () => {
    try { await api('difficulty-action', {op:'mode', mode:b.dataset.mode, value:Number($('#i-diffval').value)}); render(); } catch(e){ toast(e.message,'err'); }
  });
  $('#b-acc')?.addEventListener('click', async () => { await api('difficulty-action', {op:'accept'}); render(); });
  $('#b-rej')?.addEventListener('click', async () => { await api('difficulty-action', {op:'reject'}); render(); });
  // intervallo min-max di ogni serie, come nel gioco: si salva appena cambi una delle due caselle
  const saveRange = async (row) => {
    const min = Number($('.rmin', row).value), max = Number($('.rmax', row).value);
    try {
      await api('difficulty-action', {op:'range', nodeId: row.dataset.id, min, max});
      toast(`Intervallo di ${row.querySelector('.nm').textContent.trim()}: ${Math.min(min,max)}–${Math.max(min,max)}%`, 'ok');
    } catch(e){ toast(e.message, 'err'); }
  };
  $$('.diff-row', m).forEach(row => {
    $('.rmin', row)?.addEventListener('change', () => saveRange(row));
    $('.rmax', row)?.addEventListener('change', () => saveRange(row));
    $('.rc', row)?.addEventListener('click', async () => {
      try { await api('difficulty-action', {op:'range', nodeId: row.dataset.id, clear:true}); toast('Tornato il consiglio automatico.', 'ok'); }
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
    'Racing':   ['btn-racing',   '🏁', 'Direttore di corsa e gara di oggi: la mail che decide la giornata'],
    'Sponsor':  ['btn-sponsor',  '💼', 'Sponsor: quote, missioni e proposte'],
    'Contratti':['btn-contratti','✍️', 'Il tuo manager: contratti, impegni e conflitti di calendario'],
    'Carriera': ['btn-carriera', '🧭', 'Carriera: reputazione, trim, guida alla scala'],
  };
  const kinds = ['tutte', ...Object.keys(KIND_META)];
  const chips = kinds.map((k)=>`<button class="mini ${mailFilter===k?'acc':''}" data-mf="${k}">${k==='tutte'?'tutte':(KIND_META[k]?KIND_META[k][1]+' '+k:k)}</button>`).join('');
  const mails = mb.mails.filter((x) => mailFilter==='tutte' || x.kind===mailFilter);
  const mailCard = (mm) => {
    const [cls, ico, desc] = KIND_META[mm.kind] ?? ['', '✉️', ''];
    // AZIONI DIRETTE in posta: guidate dai metadati `action` della mailbox
    // (una email = una decisione, e la decisione ha il suo bottone qui).
    let actions = '';
    if (mm.action?.kind === 'vai-gara') {
      actions = `<button class="mini acc" data-maction="vai-gara">🏁 vai alla gara</button>`;
    } else if (mm.action?.kind === 'vai-agenda') {
      actions = `<button class="mini acc" data-maction="vai-agenda">apri il Centro gare</button>`;
    } else if (mm.action?.kind === 'vai-classifica') {
      actions = `<button class="mini acc" data-maction="vai-classifica">🏅 apri la Classifica</button>`;
    } else if (mm.action?.kind === 'sponsor-sign') {
      actions = `<button class="mini acc" data-maction="sponsor-sign" data-tier="${mm.action.tier ?? ''}" data-name="${esc(mm.action.name ?? '')}">✍️ firma con ${esc(mm.action.name ?? 'sponsor')} (tier ${mm.action.tier ?? '?'})</button>`;
    } else if (mm.action?.kind === 'vai-rivale') {
      actions = `<button class="mini acc" data-maction="vai-rivale" data-rival="${esc(mm.action.rivalKey ?? '')}">🔙 apri la scheda di ${esc(mm.action.name ?? 'rivale')}</button>`;
    } else if (mm.kind === 'Carriera' && /trim/i.test(mm.corpo)) {
      actions = `<button class="mini acc" data-maction="trim-check">⚖️ vedi il trim (Difficoltà)</button>`;
    }
    return `<div class="mail ${cls}">
      <div class="mh2"><span class="mi">${ico}</span>
        <b class="oggetto">${esc(mm.oggetto)}</b>
        ${mm.priorita==='urgente' ? '<span class="tag gold" style="margin-left:8px">⚠️ urgente</span>' : ''}
      </div>
      <div class="mfrom muted">${esc(mm.from)} · ${esc(mm.date)}</div>
      <pre class="mcorpo">${esc(mm.corpo)}</pre>
      ${actions ? `<div class="row" style="gap:6px;margin-top:8px">${actions}</div>` : ''}
      ${mm.action?.rivals?.length ? `<div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap">${mm.action.rivals.map(r=>`<span class="chip gold" data-rival="${esc(r.key??'')}" style="cursor:pointer" title="apri la scheda pilota">${esc(r.name)}</span>`).join('')}</div>` : ''}
      ${mm.action?.rows?.length ? `<div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap">${mm.action.rows.map((rr,i)=>`<span class="chip" data-row-node="${esc(rr.nodeId??'')}" data-row-track="${esc(rr.trackKey??'')}" style="cursor:pointer" title="serie → scheda gara · pista → scheda pista">${esc(rr.label)}</span> <span class="chip gold" data-track-open="${esc(rr.trackKey??'')}" data-track-name="${esc(rr.track)}" style="cursor:pointer;font-size:10px;padding:1px 6px" title="apri la scheda pista">📍</span>`).join('')}</div>` : ''}
    </div>`;
  };
  m.innerHTML = `
  <div class="panel">
    <h2>Posta del pilota <span class="h-act">${mb.mails.length} email · ${esc(mb.oggi ?? '')}</span></h2>
    <div class="row" style="margin-bottom:10px">${chips}</div>
    ${mails.filter(x=>x.priorita==='urgente').length ? `<div class="muted" style="margin-bottom:8px">⚠️ ${mails.filter(x=>x.priorita==='urgente').length} email urgenti (gare da disputare, conflitti da risolvere)</div>` : ''}
    ${mails.length ? mails.map(mailCard).join('') : '<div class="empty">Niente in questa casella: torna più tardi o cambia filtro.</div>'}
  </div>
  <div class="grid2">
    <div class="panel"><h2>Diario di bordo</h2>${v.messages.length ? v.messages.map(msgRow).join('') : '<div class="empty">Nessun messaggio nel diario.</div>'}</div>
    <div class="panel"><h2>Offerte sul tavolo</h2>
      ${v.offers.length ? v.offers.map(o=>`<div class="offer"><span class="n">${esc(o.display)}</span>
        <span class="muted">L${o.level} · ${esc(o.discipline)} · ${esc(o.note)} · affitto ${money(o.rent)} €</span>
        <span class="m"><button class="mini" data-detail="${o.index}" data-name="${esc(o.display)}" ${o.detail?'':'disabled'}>dettagli</button>
        <button class="mini" data-acc="${o.index}" data-name="${esc(o.display)}">firma</button></span></div>`).join('')
      : '<div class="empty">Nessuna offerta al momento: arrivano a fine stagione. ATTENZIONE: firma solo quando hai gare libere nella giornata (mail del manager).</div>'}
    </div>
  </div>
  <div class="panel" style="margin-top:14px"><h2>⚡ Azioni rapide</h2>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="mini acc" data-quick="sponsor-check" title="firma o rifiuta la proposta di sponsor nel cruscotto">🤝 Sponsor: apri le decisioni</button>
      <button class="mini acc" data-quick="challenge-check" title="sfida della ronda: accetta o lascia">🎯 Sfida della ronda</button>
      <button class="mini" data-quick="mail-all">📨 tutte le email</button>
    </div>
    <div class="muted" style="margin-top:6px;font-size:12px">Le decisioni più importanti (sponsor, sfida) si firmano nel Cruscotto: il bottone ti porta lì con il pannello pronto.</div>
  </div>`;
  $$('button[data-mf]').forEach(b => b.onclick = () => { mailFilter = b.dataset.mf; drawMessages(m); });
  // azioni dalle email: la posta diventa OPERATIVA (gare, agenda, trim)
  $$('button[data-maction]').forEach(b => b.onclick = async () => {
    const a = b.dataset.maction;
    if (a === 'vai-gara') { tab = 'dashboard'; drawNav(); render(); }
    else if (a === 'vai-agenda') { tab = 'agenda'; drawNav(); render(); }
    else if (a === 'trim-check') { tab = 'difficulty'; drawNav(); render(); }
    else if (a === 'vai-classifica') { tab = 'standings'; drawNav(); render(); }
    else if (a === 'vai-rivale') {
      const k = b.dataset.rival;
      if (k && typeof showRival === 'function') showRival(k);
      else toast('Scheda rivale non disponibile.', 'err');
    }
    else if (a === 'sponsor-sign') {
      const tier = b.dataset.tier ? Number(b.dataset.tier) : null;
      const name = b.dataset.name || 'sponsor';
      modal('Firma dello sponsor', `
        <p>Stai per firmare con <b>${esc(name)}</b>${tier ? ' (tier ' + tier + ')' : ''}.</p>
        <p class="muted">Il contratto entra subito in campo: quota a gara + missione a tema.</p>`,
        [['Annulla','ghost',()=>{}], ['Firma','act', async () => {
          try { await api('sponsor-accept', { tier }); toast('Contratto sponsor firmato: ' + name, 'ok'); render(); }
          catch(e){ toast(e.message,'err'); return false; }
        }]]);
    }
  });
  // CHIP RIVALI nel bollettino: scheda pilota a un clic
  $$('.chip[data-rival]', m).forEach(c => c.onclick = () => {
    const k = c.dataset.rival;
    if (k && typeof showRival === 'function') showRival(k);
    else toast('Rivale non in registro.', 'info');
  });
  // RIGHE SETTIMANALE/ATARDO: chip serie (card gara) + 📍 pista (scheda pista)
  $$('.chip[data-row-node]', m).forEach(c => c.onclick = () => { tab = 'dashboard'; drawNav(); render(); toast('Scheda gara nel Cruscotto.', 'info'); });
  $$('.chip[data-track-open]', m).forEach(c => c.onclick = () => {
    const nome = c.dataset.trackName;
    tab = 'tracks'; drawNav(); render().then?.(() => {});
    setTimeout(() => {
      const row = $('#main table tr')?.parentElement; // best-effort: la vista è pronta
      $$('.b-hist').forEach(btn => { if (btn.dataset.hist && esc(nome).toLowerCase().includes(btn.dataset.hist.replace(/_/g,' ')) ) btn.click(); });
      toast('Libro piste: storia della pista in fondo pagina (se presente).', 'info');
    }, 350);
  });
  // azioni rapide: sessioni decisionali veloci senza cercare i pannelli
  $$('button[data-quick]').forEach(b => b.onclick = () => {
    const a = b.dataset.quick;
    if (a === 'sponsor-check' || a === 'challenge-check') { tab = 'dashboard'; drawNav(); render(); toast('Pannello "Vita fuori pista" nel Cruscotto: firma o rifiuta da lì.', 'info'); }
    else if (a === 'mail-all') { mailFilter = 'tutte'; drawMessages(m); }
  });
  $$('button[data-acc]').forEach(b => b.onclick = () => signOffer(Number(b.dataset.acc), b.dataset.name));
  $$('button[data-detail]').forEach(b => b.onclick = () => {
    const o = v.offers.find(x => x.index === Number(b.dataset.detail));
    if (o?.detail) serieDetail(o.detail);
  });
}

function signOffer(index, name){
  modal('Firma dell\'offerta', `
    <p>Stai per firmare con <b>${esc(name)}</b>. Il contratto ha effetto immediato e sostituisce la serie attuale.</p>`,
    [['Annulla','ghost',()=>{}], ['Firma','act', async () => {
      try { const r = await api('accept', {index}); toast('Contratto firmato: ' + r.signed, 'ok'); await refreshBoot(); render(); }
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
  modal(wantFile ? `🔍 Cerca su disco — ${fileWanted}` : '🔍 Cerca su disco — scegli la cartella', `
    <div id="pk-crumbs" class="muted" style="font-size:12px;word-break:break-all;margin-bottom:8px"></div>
    <div id="pk-list" style="max-height:44vh;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px"></div>
    ${wantFile ? '<div class="muted" style="margin-top:8px;font-size:12px">Entra nella cartella di installazione di EVO (es. E:\\SteamLibrary\\steamapps\\common\\Assetto Corsa EVO) e seleziona il file in fondo.</div>' : ''}
  `,
  [
    ['Annulla', 'ghost', () => {}],
    ['Scelgo questa cartella', 'act', () => { if (!wantFile) onOk(cur.replace('drive:', '')); }],
  ]);
  const list = $('#pk-list');
  const crumbs = $('#pk-crumbs');
  const load = async (p) => {
    list.innerHTML = '<div class="muted" style="padding:10px">…</div>';
    let d;
    try { d = await api('browse', { path: p }); }
    catch(e){ list.innerHTML = `<div class="banner bad" style="margin:6px">${esc(e.message)}</div>`; return; }
    cur = d.kind === 'root' ? 'root:' : d.path;
    crumbs.innerHTML = d.kind === 'root' ? '💻 Il tuo PC — scegli l\'unità' : esc(d.path);
    if (!wantFile) $('.mf button.act').textContent = 'Scelgo «' + (d.kind === 'root' ? 'home' : d.path) + '»';
    let html = '';
    if (d.parent) html += `<button class="pk-row" data-go="${esc(d.parent)}" style="width:100%;text-align:left;padding:5px 10px;background:none;border:none;border-bottom:1px solid var(--line);cursor:pointer;color:var(--dim)">⬆️ .. (su di uno)</button>`;
    for (const e of (d.drives ?? [])) html += `<button class="pk-row" data-go="drive:${esc(e)}" style="width:100%;text-align:left;padding:5px 10px;background:none;border:none;border-bottom:1px solid var(--line);cursor:pointer">💽 <b>${esc(e)}</b></button>`;
    for (const e of (d.entries ?? [])) html += `<button class="pk-row" data-go="${esc(e.path)}" style="width:100%;text-align:left;padding:5px 10px;background:none;border:none;border-bottom:1px solid var(--line);cursor:pointer">📁 ${esc(e.name)}</button>`;
    if (d.kind === 'root' && wantFile) html += '<div class="muted" style="padding:8px">Scegli il disco dove hai installato il gioco, poi entra in steamapps → common → Assetto Corsa EVO.</div>';
    if (wantFile) {
      // dentro a una cartella: se l'exe cercato è qui, offri la selezione del file
      if (d.kind === 'dir' && !d.path.endsWith('\\')) {
        const guess = d.path + '\\' + fileWanted;
        // il server valuta l'esistenza in setup-save: proviamo il check con una fetch leggera su browse? No: tentiamo directamente il submit
        html += `<button class="act" id="pk-file" style="margin:8px;width:calc(100% - 16px)">📄 Usa ${esc(basename(fileWanted))} da questa cartella</button>`;
      }
      if (!html) html = '<div class="muted" style="padding:10px">Cartella vuota.</div>';
    }
    list.innerHTML = html;
    $$('.pk-row', list).forEach(b => b.onclick = () => load(b.dataset.go));
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
  <div class="panel"><h2>${tr({ it: 'Lingua', en: 'Language' })} <span class="h-act">${tr({ it: 'la pagina si ricarica al cambio', en: 'the page reloads when you switch' })}</span></h2>
    <div class="row" style="align-items:center">
      <label class="muted" for="i-lingua">${tr({ it: 'Lingua interfaccia', en: 'Interface language' })}</label>
      <select id="i-lingua" style="min-width:180px">
        <option value="it">Italiano</option>
        <option value="en">English</option>
      </select>
    </div>
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
      <h2 style="margin-top:22px">${tr({ it: 'Verifica integrità', en: 'Integrity check' })}</h2>
      <div class="row"><button class="ghost" id="b-integrity">${tr({ it: 'Controlla la carriera', en: 'Check the career' })}</button></div>
      <div class="muted" style="margin-top:6px;font-size:12px">${tr({ it: 'Ricalcola statistiche, cassa e reputazione dalle gare e dalla bacheca: se qualcosa non torna (per esempio una gara fantasma) te lo dice e può correggere.', en: 'Recomputes stats, money and reputation from races and the board: if something is off (say a ghost race) it tells you and can fix it.' })}</div>
      <div id="integrity-out" style="margin-top:8px;font-size:13px"></div>
    </div>
  </div>`;
  // slot cliccabili: il bottone nella riga lancia pilota-N.cmd via slot-launch
  $$('button[data-slot-go], button[data-slot-open]').forEach(b => b.onclick = () => {
    const n = b.dataset.slotGo ?? b.dataset.slotOpen;
    if (!n) return;
    b.disabled = true;
    api('slot-launch', { method:'POST', body:{ slot: Number(n) } })
      .then(r => { toast(r.note ?? tr({ it: 'Lanciatore avviato.', en: 'Launcher started.' }), 'ok'); b.disabled = false; })
      .catch(err => { toast(err.message, 'err'); b.disabled = false; });
  });
  // lingua: selettore collegato a gui/js/lang.js (tr + impostaLingua)
  const selLingua = $('#i-lingua');
  if (selLingua) { selLingua.value = window.LINGUA; selLingua.onchange = (e) => impostaLingua(e.target.value); }
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
      ${r.memoryAssigned ? `<div class="banner warn" style="margin-top:12px">📜 <b>${tr({ it: 'Eredità di famiglia:', en: 'Family heritage:' })}</b> ${esc(r.memoryAssigned.ancestor)}, ${tr({ it: 'tuo', en: 'yours' })} ${esc(r.memoryAssigned.relation)} (${esc(r.memoryAssigned.era)}), ${tr({ it: 'ti affida l\'impresa', en: 'entrusts you with the feat' })} «${esc(r.memoryAssigned.objective)}» ${tr({ it: 'in', en: 'in' })} ${esc(r.memoryAssigned.series)}${r.memoryAssigned.carName ? ` ${tr({ it: 'con la sua', en: 'with their' })} ${esc(r.memoryAssigned.carName)}` : ''}. ${tr({ it: 'Eredità in palio:', en: 'Inheritance at stake:' })} <b>${money(r.memoryAssigned.inherit)} €</b>.</div>` : ''}
      <h2 style="margin:18px 0 8px;font-size:11.5px;text-transform:uppercase;letter-spacing:1.4px;color:var(--dim)">${tr({ it: 'Offerte per la prossima stagione', en: 'Offers for next season' })}</h2>
      ${offersHtml}`,
      [[tr({ it: 'Deciderò dopo', en: 'I will decide later' }), 'ghost', () => { render(); }]]);
    $$('button[data-acc]').forEach(b => b.onclick = async () => {
      try { const rr = await api('accept', {index:Number(b.dataset.acc)}); $('#modal-root').innerHTML=''; toast(`${tr({ it: 'Contratto firmato: ', en: 'Contract signed: ' })}${rr.signed}`, 'ok'); await refreshBoot(); render(); }
      catch(e){ toast(e.message,'err'); }
    });
  } catch(e){
    if (e.data?.code === 'SEASON_INCOMPLETE') {
      modal('Stagione incompleta', `<p>${esc(e.message)}</p><p class="muted" style="margin-top:8px">Puoi chiuderla comunque: le gare mancanti restano senza punti.</p>`,
        [['Annulla','ghost',()=>{}], ['Chiudi comunque','ghost danger', () => { seasonEndFlow(true); }]]);
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
    <h2>Registro rivali <span class="h-act">${d.totals.rivals} avversari con nome, da ${d.totals.races} gare importate</span></h2>
    ${!rows.length ? '<div class="empty">Nessun rivale ancora: i nomi arrivano dai file risultato a ogni import di gara.</div>' : `
    <div class="grid2">
      <div><div class="muted" style="margin-bottom:6px">😨 Nemesi — ti battono più spesso di quanto li batti</div>
        ${d.nemesi.length ? d.nemesi.slice(0,4).map(r=>`<div class="rivalrow">${rivalAvatar(r.name)}<b>${esc(r.name)}</b>${r.nemesis?'<span class="tag red">nemesi</span>':''}<span class="muted">${esc(r.team ?? '')}</span>${h2hBadge(r.h2h.beats, r.h2h.losses)}</div>`).join('') : '<div class="muted">Nessuno ancora: continua così.</div>'}
      </div>
      <div><div class="muted" style="margin-bottom:6px">😎 Vittime preferite — non ti battono mai</div>
        ${d.vittime.length ? d.vittime.slice(0,4).map(r=>`<div class="rivalrow">${rivalAvatar(r.name)}<b>${esc(r.name)}</b><span class="muted">${esc(r.team ?? '')}</span>${h2hBadge(r.h2h.beats, r.h2h.losses)}</div>`).join('') : '<div class="muted">Le costruirai strada facendo.</div>'}
      </div>
    </div>`}
  </div>
  ${rows.length ? `<div class="panel"><h2>Tutti i rivali <span class="h-act">clicca una riga per la scheda completa</span></h2>
    <table><thead><tr><th>Rivale</th><th>Squadra</th><th class="right">Gare insieme</th><th class="right">Tu–Lui</th><th>Momentum</th><th>Forma (ultime 5)</th><th class="right">Vittorie</th><th class="right">Podi</th></tr></thead>
    <tbody>${rows.map(r=>`<tr class="rival-link" data-key="${esc(r.key)}" style="cursor:pointer">
      <td><span style="display:inline-flex;align-items:center;gap:8px">${rivalAvatar(r.name, 30)}<span><b>${esc(r.name)}</b>${r.nemesis?' <span class="tag red">nemesi</span>':''}${r.lastSeen?`<div class="faint" style="font-size:11px">visto: ${esc(r.lastSeen.node)} R${r.lastSeen.round}</div>`:''}</span></span></td>
      <td class="muted">${esc(r.team ?? '—')}</td>
      <td class="right">${r.sharedRaces}</td>
      <td class="right">${h2hBadge(r.h2h.beats, r.h2h.losses)}</td>
      <td>${r.trend==null?'—':r.trend>0?`<span class="tag green">▲ +${r.trend}</span>`:r.trend<0?`<span class="tag bad">▼ ${r.trend}</span>`:'<span class="faint">stabile</span>'}</td>
      <td>${r.form.map(f=>`<span class="chip ${f==='DNF'?'':Number(f)<=3?'gold':''}" style="font-size:10px;padding:1px 6px">${f}</span>`).join(' ')}</td>
      <td class="right">${r.wins}</td>
      <td class="right">${r.podiums}</td>
    </tr>`).join('')}</tbody></table>
  </div>` : ''}`;
  $$('.rival-link', m).forEach((tr)=>tr.onclick=()=>showRival(tr.dataset.key));
}

async function showRival(key){
  try {
    const d = await api('rival-detail', {key});
    if (d.error) return toast(d.error, 'err');
    const net = d.h2h.losses - d.h2h.beats;
    modal(`Scheda rivale — ${d.name}`, `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        ${rivalAvatar(d.name, 48)}
        <div><b style="font-size:16px">${esc(d.name)}</b><div class="muted" style="font-size:12px">${esc(d.team ?? 'senza squadra')}${d.nation?' · '+esc(d.nation):''}${d.car?' · '+esc(d.car):''}</div></div>
      </div>
      <div class="grid4" style="margin-bottom:14px">
        <div class="kpi"><div class="l">Scontri</div><div class="v">${d.totals.races}</div></div>
        <div class="kpi"><div class="l">Tu-Lui</div><div class="v ${net>0?'good':net<0?'bad':''}">${d.h2h.losses}–${d.h2h.beats}</div></div>
        <div class="kpi"><div class="l">Vittorie</div><div class="v">${d.totals.wins}</div></div>
        <div class="kpi"><div class="l">Suo best</div><div class="v">${d.bestPos!=null?'P'+d.bestPos:'—'}</div></div>
      </div>
      <div class="muted" style="margin-bottom:10px">${esc(d.team ?? 'senza squadra')}${d.nation?' · '+esc(d.nation):''}${d.car?' · auto: '+esc(d.car):''}${d.since?' · in registro dal '+esc(d.since):''}</div>
      ${d.winsDetail.length ? `<div style="margin-bottom:10px"><b>Ha vinto a:</b> ${d.winsDetail.map(w=>`${esc(w.track)} <span class="muted">S${w.season} R${w.round+1}</span>`).join(' · ')}</div>` : ''}
      ${d.beatsMeAt.length ? `<div class="banner warn" style="margin-bottom:10px">Ti ha battuto a: <b>${d.beatsMeAt.map(esc).join(', ')}</b></div>` : ''}
      ${d.beatsMeAt.length ? `<button class="mini acc" id="r-telem" style="margin-bottom:10px">📈 confronta la tua telemetria</button>` : ''}
      <div style="max-height:260px;overflow:auto"><table><thead><tr><th>Gara</th><th class="right">Lui</th><th class="right">Tu</th><th>Suo giro</th><th>Esito</th></tr></thead><tbody>
        ${d.meetings.map(m=>`<tr><td>${esc(m.track)} <span class="faint">S${m.season} R${m.round+1}</span></td><td class="right">${m.dnf?'rit.':m.pos!=null?'P'+m.pos:'—'}</td><td class="right">${m.mePos!=null?'P'+m.mePos:'—'}</td><td class="muted">${esc(m.bestLap??'—')}</td><td>${m.beatMe?'<span class="tag bad">battuto</span>':'<span class="tag good">vinto</span>'}</td></tr>`).join('')}
      </tbody></table></div>`,
      [['Chiudi','ghost',()=>{}]]);
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
      toast(`Grafico del giro sul Setup${track ? ': cerca la sessione su ' + track + ' (la pista dove ti prende)' : ''}. Guarda le bande gas/freno: lì capisci dove perdi il tempo.`, 'info');
    };
  } catch(e){ toast(e.message, 'err'); }
}

/* ============================== avvio ============================== */
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
        host.innerHTML = '<span class="dot"></span> Live spento · <b data-live-on style="cursor:pointer;text-decoration:underline">attiva</b>';
        host.title = 'Telemetria live disattivata a mano: niente strip in pista, verifica di gara LIVE e import automatico dei risultati (importa a mano da Centro gare). «attiva» la rimette in AUTO: riparte da sola quando apri EVO. Sopra restano valide: il chip GIOCO segue il processo del gioco.';
        return;
      }
      const age = Date.now() - (h?.telem?.lastLd?.mtimeMs ?? 0);
      const ultima = h?.telem?.lastLd ? new Date(h.telem.lastLd.mtimeMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null;
      const label = r.stale ? 'EVO · segnale live perso'
        : (h?.telem?.lastLd?.valid && age < 10000 ? 'EVO · sessione chiusa — scrittura telemetria'
        : (ultima ? `EVO chiuso · telem. ore ${ultima}` : 'EVO chiuso'));
      host.innerHTML = `<span class="dot"></span> ${label}`; host.className = 'chip';
      host.title = r.stale ? 'I dati live non si aggiornano da oltre 20s: se EVO è aperto, il lettore si ricicla da solo entro 30s.' : (ultima ? `Ultima telemetria scritta da EVO alle ${ultima}: quando riapri il gioco la scritta torna a seguire la sessione in diretta.` : '');
      return;
    }
    const p = r.player;
    if (!p || !r.live){ host.className = 'chip'; host.innerHTML = `<span class="dot on"></span> EVO aperto · ${esc(r.session?.type ?? '')}`; return; }
    host.className = 'chip gold';
    const rec = w?.armed ? ' · ⏺ registrazione' : '';
    host.innerHTML = `<span class="dot on"></span> ${p.position ? 'P'+p.position+'/'+p.drivers : 'in pista'}${p.lapsTotal?` · giro ${p.lapNo ?? p.lapsDone+1}/${p.lapsTotal}`:''}${p.gapAhead?` · +${p.gapAhead.toFixed(1)}s`:''}${p.bestLap?` · best ${p.bestLap}`:''}${rec}`;
  } catch { host.className = 'chip'; }
}
setInterval(drawLiveStrip, 2000);

/* il chip «attiva» dello strip: riporta la telemetria live in AUTO una volta sola
   (delegato sul document: il chip viene riscritto a ogni poll e i listener muoiono) */
if (!window.__liveToggleDeleg){
  window.__liveToggleDeleg = true;
  document.addEventListener('click', async (ev) => {
    const t = ev.target && ev.target.closest && ev.target.closest('[data-live-on]');
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
    host.innerHTML = '<span class="dot"></span> attesa EVO';
    host.title = 'Nessun file .ld ancora: appena termini una sessione, EVO scrive la telemetria e l\'indicatore si accende. Ricorda: in EVO attiva la registrazione telemetria in Setup → Elettronica (e imposta i giri per la sessione) PRIMA di avviare la sessione.';
    if (!anyDir) host.className = 'chip hidden';
    return;
  }
  const age = Date.now() - (ld.mtimeMs ?? 0);
  if (ld.valid && age < 10000){
    host.className = 'chip gold';
    host.innerHTML = '<span class="dot rec"></span> ⏺ registra';
    host.title = 'MoTeC sta registrando: ' + ld.car + (ld.track ? ' · ' + ld.track : '') + ' · aggiornato ' + ld.when + '. Ricorda: in EVO la registrazione va attivata in Setup → Elettronica e i giri impostati PRIMA di avviare la sessione.';
  } else if (ld.valid){
    host.className = 'chip green';
    host.innerHTML = '<span class="dot on"></span> dati ok';
    host.title = 'Ultimo file MoTeC con dati: ' + ld.car + (ld.track ? ' · ' + ld.track : '') + ' · ' + ld.when + '. Ricorda: in EVO attiva la registrazione telemetria in Setup → Elettronica (e imposta i giri) PRIMA di avviare la sessione.';
  } else if (age < 10000){
    host.className = 'chip red';
    host.innerHTML = '<span class="dot rec"></span> scrive vuoto!';
    host.title = 'EVO sta scrivendo il file ma è vuoto: la telemetria non era attiva in EVO (' + ld.car + (ld.track ? ' · ' + ld.track : '') + '). Attivala in Setup → Elettronica (con i giri impostati) PRIMA di avviare la sessione; finché non ci sono dati veri, i consigli del BOX useranno la stima.';
  } else {
    host.className = 'chip red';
    host.innerHTML = '<span class="dot"></span> file vuoto';
    host.title = 'L\'ultimo file .ld di EVO non ha dati (' + ld.when + '): la telemetria non era attiva in EVO. Si attiva in Setup → Elettronica, PRIMA di avviare la sessione; finché non ci sono dati veri, i consigli del BOX usano la stima.';
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
