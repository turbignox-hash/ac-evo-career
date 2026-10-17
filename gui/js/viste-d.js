
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
    return `<div class="mail ${cls}">
      <div class="mh2"><span class="mi">${ico}</span>
        <b class="oggetto">${esc(mm.oggetto)}</b>
        ${mm.priorita==='urgente' ? '<span class="tag gold" style="margin-left:8px">⚠️ urgente</span>' : ''}
      </div>
      <div class="mfrom muted">${esc(mm.from)} · ${esc(mm.date)}</div>
      <pre class="mcorpo">${esc(mm.corpo)}</pre>
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
  </div>`;
  $$('button[data-mf]').forEach(b => b.onclick = () => { mailFilter = b.dataset.mf; drawMessages(m); });
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

/* -------- impostazioni -------- */
function drawSettings(m){
  const s = boot.setup, h = boot.header;
  const slotsHtml = (s.slots ?? []).map((sl) => `
    <tr class="${sl.active?'cur':''}" style="cursor:pointer" title="clicca: avvia questo slot (o apri il suo browser se è già attivo)">
      <td><b>Slot ${sl.slot}</b>${sl.active?' <span class="tag gold">attivo</span>':''}</td>
      <td>${sl.exists ? `<span>${esc(sl.pilota ?? '(carriera senza nome?)')}</span> <span class="faint">· ${sl.gare} gare · ${esc(sl.file)}</span>` : '<span class="faint">vuoto — nuova carriera quando lo scegli</span>'}</td>
      <td class="right">${sl.active
        ? `<button class="mini" data-slot-open="${sl.slot}">apri questa finestra</button>`
        : `<button class="mini acc" data-slot-go="${sl.slot}">apri slot ${sl.slot}</button>`}</td>
    </tr>`).join('');
  m.innerHTML = `
  <div class="panel"><h2>Slot carriera <span class="h-act">fino a 3 piloti sullo stesso PC</span></h2>
    <table><thead><tr><th></th><th>Carriera</th><th class="right">Come si usa</th></tr></thead><tbody>${slotsHtml}</tbody></table>
    <div class="faint" style="margin-top:8px" id="slot-instructions">Clicca una riga (o il bottone a destra) per avviare quello slot: parte <b>pilota-N.cmd</b> da solo, senza variabili da scrivere. I lanciatori sono anche avviabili a mano dalla cartella del programma, e gli slot si aprono anche insieme (slot 1 → porta 8642, slot 2 → 8643, slot 3 → 8644). Ogni slot ha il SUO salvataggio e i SUOI backup: mai mischiati. Lo slot 1 contiene le carriere fatte fino ad oggi. Il watcher segue lo slot del lanciatore che l'ha aperto. Lo slot attivo di questa sessione NON cambia a caldo: qui si apre la sua finestra, per cambiarlo davvero chiudi questa e apri l'altro.</div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>Installazione</h2>
      <div class="muted">Cartelle dati</div><div style="font-size:13px;word-break:break-all">${s.dataDirs.map(esc).join('<br>') || '—'}</div>
      <div class="muted" style="margin-top:8px">Risultati</div><div style="font-size:13px;word-break:break-all">${s.resultsDirs.map(esc).join('<br>') || '—'}</div>
      <div class="muted" style="margin-top:8px">Eseguibile</div><div style="font-size:13px;word-break:break-all">${esc(s.gameExe ?? 'non trovato (verrà usato Steam)')}</div>
      <form id="f-paths" style="margin-top:14px">
        <div class="field"><label>Cartella ACE (override)</label><input type="text" id="i-data" placeholder="C:\\Users\\...\\Saved Games\\ACE" value="${esc(s.saved.dataDir ?? '')}"></div>
        <div class="field"><label>Eseguibile (override)</label><input type="text" id="i-game" placeholder="...\\AssettoCorsaEVO.exe" value="${esc(s.saved.gameExe ?? '')}"></div>
        <button class="ghost" type="submit">Salva percorsi</button>
      </form>
    </div>
    <div class="panel"><h2>Pilota</h2>
      <div class="muted">Nome attuale in carriera</div><div style="font-size:18px;font-weight:600">${esc(h.driver.name)}</div>
      <div class="muted" style="margin-top:4px">Deve essere uguale al nome con cui corri in EVO: serve a riconoscerti all'import dei risultati.</div>
      <form id="f-rename" class="row" style="margin-top:12px">
        <input type="text" id="i-rename" placeholder="Nuovo nome" style="flex:1;min-width:200px">
        <button class="ghost" type="submit">Rinomina</button>
      </form>
      <h2 style="margin-top:22px">Registro import</h2>
      <div class="muted" style="font-size:12px">Ogni import fa un backup automatico del salvataggio, viene scritto in un log e ogni file risultato è ricordato per contenuto: lo stesso file non può essere incassato due volte.</div>
      <div id="import-log" style="margin-top:8px;font-size:12px;max-height:220px;overflow:auto">…</div>
      <h2 style="margin-top:22px">Carriera</h2>
      <div class="row">
        <button class="ghost" id="b-backup">Backup carriera</button>
        <button class="ghost danger" id="b-reset">Ricomincia da zero</button>
      </div>
      <div class="muted" id="backup-list" style="margin-top:6px;font-size:12px">Crea una copia di sicurezza del salvataggio: soldi, risultati, rivali e statistiche restano intatti anche se qualcosa va storto.</div>
      ${s.issues.length ? `<div class="banner warn" style="margin-top:16px">${s.issues.length} riferimenti della scala non trovati nell'installazione: ${esc(s.issues.slice(0,4).map(i=>i.id).join(', '))}${s.issues.length>4?'…':''}</div>` : '<div class="banner good" style="margin-top:16px">La scala carriera combacia con il contenuto installato.</div>'}
      <h2 style="margin-top:22px">Verifica integrità</h2>
      <div class="row"><button class="ghost" id="b-integrity">Controlla la carriera</button></div>
      <div class="muted" style="margin-top:6px;font-size:12px">Ricalcola statistiche, cassa e reputazione dalle gare e dalla bacheca: se qualcosa non torna (per esempio una gara fantasma) te lo dice e può correggere.</div>
      <div id="integrity-out" style="margin-top:8px;font-size:13px"></div>
    </div>
  </div>`;
  // slot cliccabili: il bottone nella riga lancia pilota-N.cmd via slot-launch
  $$('button[data-slot-go], button[data-slot-open]').forEach(b => b.onclick = () => {
    const n = b.dataset.slotGo ?? b.dataset.slotOpen;
    if (!n) return;
    b.disabled = true;
    api('slot-launch', { method:'POST', body:{ slot: Number(n) } })
      .then(r => { toast(r.note ?? 'Lanciatore avviato.', 'ok'); b.disabled = false; })
      .catch(err => { toast(err.message, 'err'); b.disabled = false; });
  });
  $('#f-paths').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('setup-save', {dataDir:$('#i-data').value, gameExe:$('#i-game').value}); await refreshBoot(); toast('Percorsi salvati.','ok'); render(); }
    catch(err){ toast(err.message,'err'); }
  };
  $('#f-rename').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('rename', {name:$('#i-rename').value}); await refreshBoot(); toast('Nome aggiornato.','ok'); render(); }
    catch(err){ toast(err.message,'err'); }
  };
  $('#b-backup').onclick = async () => {
    try {
      const r = await api('backup');
      $('#backup-list').innerHTML = 'Ultimi backup: ' + r.backups.map(b=>esc(b.at)).join(' · ');
      toast('Backup creato: ' + r.backups[0]?.at, 'ok');
    } catch(err){ toast(err.message,'err'); }
  };
  $('#b-integrity').onclick = async () => {
    const out = $('#integrity-out');
    try {
      const r = await api('integrity');
      if (!r.issues.length) { out.innerHTML = '<div class="banner good">Tutto torna: gare, statistiche, cassa e bacheca sono coerenti.</div>'; return; }
      out.innerHTML = `<div class="banner warn"><b>${r.issues.length} anomalie:</b><ul style="margin:6px 0 0 18px">${r.issues.map(i=>`<li>${esc(i.text)}</li>`).join('')}</ul></div>
        <button class="ghost" id="b-integrity-fix" style="margin-top:8px">Correggi quello che si può correggere</button>`;
      $('#b-integrity-fix').onclick = async () => {
        try {
          const f = await api('integrity-fix');
          await refreshBoot(); render();
          toast(f.fixed.length ? 'Corretto: ' + f.fixed.join(', ') : 'Le anomalie restanti vanno verificate a mano (vedi import --ledger).', f.fixed.length?'ok':'warn');
        } catch(err){ toast(err.message,'err'); }
      };
    } catch(err){ toast(err.message,'err'); }
  };
  api('imports').then((r)=>{
    const el = $('#import-log');
    if (!el) return;
    if (!r.log.length) { el.innerHTML = '<span class="muted">Nessun import ancora registrato.</span>'; return; }
    el.innerHTML = r.log.map((l)=>`<div style="padding:2px 0;border-bottom:1px solid var(--line,#222)">${esc(String(l.at??'').slice(0,16).replace('T',' '))} · <b>${l.outcome==='ignored'?'ignorato':l.outcome==='manual'?'a mano':'importato'}</b> · ${esc(l.file??'—')}${l.node?` · ${esc(l.node)} R${(l.round??0)+1}`:''}${typeof l.position==='number'?` · P${l.position}`:''}${l.outcome==='ignored'?` · <span class="muted">${esc(l.reason??'')}</span>`:''}</div>`).join('');
  }).catch(()=>{});
  $('#b-reset').onclick = () => modal('Ricominciare da zero?', `
      <p>La carriera attuale verrà <b>cancellata</b> al momento della creazione della nuova: soldi, punti, contratti e messaggi tornano a zero.</p>
      <p class="muted" style="margin-top:8px">L'operazione si completa solo se poi confermi il modulo con «ricomincia da zero» spuntato.</p>`,
    [['Annulla','ghost',()=>{}], ['Vai alla creazione','ghost danger', () => { tab='dashboard'; boot.hasCareer=false; drawNav(); render(); }]]);
}

/* -------- fine stagione (da cruscotto) -------- */
async function seasonEndFlow(force){
  try {
    const r = await api('season-end', {force});
    await refreshBoot();
    const offersHtml = r.offers.length ? r.offers.map(o=>`<div class="offer"><span class="n">${o.index}) ${esc(o.display)}</span>
      <span class="muted">L${o.level} · ${esc(o.discipline)} · ${esc(o.note)} · ${o.access==='closed'?'parco chiuso (solo contratto)':`affitto ${money(o.rent)} €`}</span>
      <span class="m"><button class="mini" data-acc="${o.index}" data-name="${esc(o.display)}">firma</button></span></div>`).join('')
      : '<div class="empty">Nessuna offerta disponibile.</div>';
    modal(`Stagione ${r.me.season ?? ''} chiusa`, `
      <div class="winline ${r.champion?'gold':''}">${r.champion ? '🏆 CAMPIONE!' : 'Posizione finale: P'+r.me.position}</div>
      <div style="text-align:center" class="muted">${r.me.points} punti${r.bonus ? ' · bonus titolo '+money(r.bonus)+' €' : ''}</div>
      ${r.memoryAssigned ? `<div class="banner warn" style="margin-top:12px">📜 <b>Eredità di famiglia:</b> ${esc(r.memoryAssigned.ancestor)}, tuo ${esc(r.memoryAssigned.relation)} (${esc(r.memoryAssigned.era)}), ti affida l'impresa «${esc(r.memoryAssigned.objective)}» in ${esc(r.memoryAssigned.series)}${r.memoryAssigned.carName ? ` con la sua ${esc(r.memoryAssigned.carName)}` : ''}. Eredità in palio: <b>${money(r.memoryAssigned.inherit)} €</b>.</div>` : ''}
      <h2 style="margin:18px 0 8px;font-size:11.5px;text-transform:uppercase;letter-spacing:1.4px;color:var(--dim)">Offerte per la prossima stagione</h2>
      ${offersHtml}`,
      [['Deciderò dopo','ghost',()=>{ render(); }]]);
    $$('button[data-acc]').forEach(b => b.onclick = async () => {
      try { const rr = await api('accept', {index:Number(b.dataset.acc)}); $('#modal-root').innerHTML=''; toast('Contratto firmato: '+rr.signed, 'ok'); await refreshBoot(); render(); }
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
        ${d.nemesi.length ? d.nemesi.slice(0,4).map(r=>`<div class="rivalrow"><b>${esc(r.name)}</b>${r.nemesis?'<span class="tag red">nemesi</span>':''}<span class="muted">${esc(r.team ?? '')}</span>${h2hBadge(r.h2h.beats, r.h2h.losses)}</div>`).join('') : '<div class="muted">Nessuno ancora: continua così.</div>'}
      </div>
      <div><div class="muted" style="margin-bottom:6px">😎 Vittime preferite — non ti battono mai</div>
        ${d.vittime.length ? d.vittime.slice(0,4).map(r=>`<div class="rivalrow"><b>${esc(r.name)}</b><span class="muted">${esc(r.team ?? '')}</span>${h2hBadge(r.h2h.beats, r.h2h.losses)}</div>`).join('') : '<div class="muted">Le costruirai strada facendo.</div>'}
      </div>
    </div>`}
  </div>
  ${rows.length ? `<div class="panel"><h2>Tutti i rivali <span class="h-act">clicca una riga per la scheda completa</span></h2>
    <table><thead><tr><th>Rivale</th><th>Squadra</th><th class="right">Gare insieme</th><th class="right">Tu–Lui</th><th>Momentum</th><th>Forma (ultime 5)</th><th class="right">Vittorie</th><th class="right">Podi</th></tr></thead>
    <tbody>${rows.map(r=>`<tr class="rival-link" data-key="${esc(r.key)}" style="cursor:pointer">
      <td><b>${esc(r.name)}</b>${r.nemesis?' <span class="tag red">nemesi</span>':''}${r.lastSeen?`<div class="faint" style="font-size:11px">visto: ${esc(r.lastSeen.node)} R${r.lastSeen.round}</div>`:''}</td>
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
      <div class="grid4" style="margin-bottom:14px">
        <div class="kpi"><div class="l">Scontri</div><div class="v">${d.totals.races}</div></div>
        <div class="kpi"><div class="l">Tu-Lui</div><div class="v ${net>0?'good':net<0?'bad':''}">${d.h2h.losses}–${d.h2h.beats}</div></div>
        <div class="kpi"><div class="l">Vittorie</div><div class="v">${d.totals.wins}</div></div>
        <div class="kpi"><div class="l">Suo best</div><div class="v">${d.bestPos!=null?'P'+d.bestPos:'—'}</div></div>
      </div>
      <div class="muted" style="margin-bottom:10px">${esc(d.team ?? 'senza squadra')}${d.nation?' · '+esc(d.nation):''}${d.car?' · auto: '+esc(d.car):''}${d.since?' · in registro dal '+esc(d.since):''}</div>
      ${d.winsDetail.length ? `<div style="margin-bottom:10px"><b>Ha vinto a:</b> ${d.winsDetail.map(w=>`${esc(w.track)} <span class="muted">S${w.season} R${w.round+1}</span>`).join(' · ')}</div>` : ''}
      ${d.beatsMeAt.length ? `<div class="banner warn" style="margin-bottom:10px">Ti ha battuto a: <b>${d.beatsMeAt.map(esc).join(', ')}</b></div>` : ''}
      <div style="max-height:260px;overflow:auto"><table><thead><tr><th>Gara</th><th class="right">Lui</th><th class="right">Tu</th><th>Suo giro</th><th>Esito</th></tr></thead><tbody>
        ${d.meetings.map(m=>`<tr><td>${esc(m.track)} <span class="faint">S${m.season} R${m.round+1}</span></td><td class="right">${m.dnf?'rit.':m.pos!=null?'P'+m.pos:'—'}</td><td class="right">${m.mePos!=null?'P'+m.mePos:'—'}</td><td class="muted">${esc(m.bestLap??'—')}</td><td>${m.beatMe?'<span class="tag bad">battuto</span>':'<span class="tag good">vinto</span>'}</td></tr>`).join('')}
      </tbody></table></div>`,
      [['Chiudi','ghost',()=>{}]]);
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
    if (w?.lastMsg?.msg){ host.title = w.lastMsg.msg; }
    if (!r.game){ host.innerHTML = '<span class="dot"></span> EVO chiuso'; host.className = 'chip'; return; }
    const p = r.player;
    if (!p || !r.live){ host.className = 'chip'; host.innerHTML = `<span class="dot on"></span> EVO aperto · ${esc(r.session?.type ?? '')}`; return; }
    host.className = 'chip gold';
    const rec = w?.armed ? ' · ⏺ registrazione' : '';
    host.innerHTML = `<span class="dot on"></span> ${p.position ? 'P'+p.position+'/'+p.drivers : 'in pista'}${p.lapsTotal?` · giro ${p.lapNo ?? p.lapsDone+1}/${p.lapsTotal}`:''}${p.gapAhead?` · +${p.gapAhead.toFixed(1)}s`:''}${p.bestLap?` · best ${p.bestLap}`:''}${rec}`;
  } catch { host.className = 'chip'; }
}
setInterval(drawLiveStrip, 2000);

/* icona MoTeC nell'header: dice se EVO sta scrivendo telemetria adesso.
   ⏺ rosso lampeggiante = registrazione in corso (file .ld aggiornato da <10s);
   verde = l'ultimo file ha dati; rosso fisso = file vuoto (bug EVO);
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
    host.title = 'EVO sta scrivendo telemetria ADESSO ma il file non ha dati (bug del gioco, non del tool): ' + ld.car + (ld.track ? ' · ' + ld.track : '') + '. I consigli del BOX useranno la stima. Ricorda: in EVO la registrazione va attivata in Setup → Elettronica e i giri impostati PRIMA di avviare la sessione.';
  } else {
    host.className = 'chip red';
    host.innerHTML = '<span class="dot"></span> file vuoto';
    host.title = 'L\'ultimo file .ld di EVO non ha dati (bug del gioco, non del tool): ' + ld.when + '. I consigli del BOX usano la stima. Ricorda: in EVO la registrazione va attivata in Setup → Elettronica e i giri impostati PRIMA di avviare la sessione.';
  }
}

refreshBoot().then(render).catch(e => {
  $('#main').innerHTML = `<div class="panel"><div class="banner bad">Il server non risponde: ${esc(e.message)}<br><span class="muted">Rilancia apri-gui.cmd</span></div></div>`;
});
setInterval(async () => {
  try {
    const b = await api('boot');
    $('#dot-evo').classList.toggle('on', !!b.gameRunning);
    $('#t-evo').textContent = b.gameRunning ? 'EVO aperto' : 'chiuso';
  } catch {}
}, 30000);
