/* -------- wizard del primo avvio E PANNELLO IMPOSTAZIONI: componenti riusati --------
   Stile installazione Windows: lista di controllo con spunte verdi per la
   cartella dati EVO e l'exe, percorso manuale persistito in evo.config.json
   (il server lo riscopre SUBITO, senza riavvio), preparazione = scansione dei
   contenuti del gioco, poi si apre il form dell'identità del pilota.
   La checklist è UNA SOLA (wizardChecklist, qui sotto): la usa l'onboarding
   (drawOnboarding) e la scheda Impostazioni (viste-d), così le due schermate
   non camminano mai disallineate.
   NIENTE download: le foto auto (carmaps/) sono opzionali e restano asset locali. */

/* bozzetti a china dei quattro passi: schermate disegnate a manina (SVG a
   tratto spezzato), così si CAPISCE dove si è nel flusso senza leggere la
   fila di parole. Il passo «giusto» ha la cornice tratteggiata dorata. */
const WZ_SKETCHES = [
  [tr({ it: 'Percorsi', en: 'Paths' }),`<svg viewBox="0 0 96 40" width="96" height="40" fill="none" stroke="var(--dim,#8fa3bd)" stroke-width="1.4" aria-hidden="true"><rect x="4" y="4" width="88" height="32" rx="4" stroke-dasharray="4 3"/><path d="M12 11h12l3-3h7v6H12z"/><path d="M14 22l2.4 2.4L21 19.6" stroke="#6f6"/><path d="M26 22h44" stroke-dasharray="6 4"/><path d="M14 28l2.4 2.4L21 25.6" stroke="#6f6"/><path d="M26 28h44" stroke-dasharray="6 4"/></svg>`],
  [tr({ it: 'Preparazione', en: 'Preparation' }),`<svg viewBox="0 0 96 40" width="96" height="40" fill="none" stroke="var(--dim,#8fa3bd)" stroke-width="1.4" aria-hidden="true"><rect x="4" y="4" width="88" height="32" rx="4" stroke-dasharray="4 3"/><circle cx="30" cy="17" r="7" stroke-dasharray="3 2"/><path d="M35 22l5 3" stroke-linecap="round"/><path d="M54 22c3-4 12-4 18-1m-18 1-1 3h19l-1-3M56 25a2 2 0 1 0 .1 0M70 25a2 2 0 1 0 .1 0" stroke-dasharray="2 2"/></svg>`],
  [tr({ it: 'Pilota', en: 'Driver' }),`<svg viewBox="0 0 96 40" width="96" height="40" fill="none" stroke="var(--dim,#8fa3bd)" stroke-width="1.4" aria-hidden="true"><rect x="4" y="4" width="88" height="32" rx="4" stroke-dasharray="4 3"/><path d="M16 12h6M13 18h8" stroke-linecap="round"/><rect x="26" y="10" width="44" height="7" rx="2" stroke="#f66" stroke-dasharray="3 2"/><path d="M29 14h8" stroke-linecap="round" stroke-dasharray="2 2"/><rect x="26" y="21" width="22" height="7" rx="2" stroke-dasharray="3 2"/><circle cx="18" cy="31" r="2.5"/><path d="M15 36c.6-2.6 1.7-3.5 3-3.5S20.4 33.4 21 36"/></svg>`],
  [tr({ it: 'Cruscotto', en: 'Dashboard' }),`<svg viewBox="0 0 96 40" width="96" height="40" fill="none" stroke="var(--dim,#8fa3bd)" stroke-width="1.4" aria-hidden="true"><rect x="4" y="4" width="88" height="32" rx="4"/><path d="M12 13a14 14 0 0 1 22 0" stroke="#ffcc66"/><path d="M23 13l4-5" stroke-linecap="round"/><rect x="46" y="10" width="10" height="20" stroke-dasharray="3 2"/><path d="M58 14h26M58 20h26M58 26h18" stroke-dasharray="5 3"/><path d="M12 28v9m0-9 6-1v7l-6 1"/></svg>`],
];
const WZ_ARROW = `<svg class="wz-arrow" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none"><path d="M2 8h9m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.5"/></svg>`;
function wizardSketchSteps(w){
  const done = !!w.dataDir;
  const prep = done && (w.content?.cars > 0);
  const career = !!w.career;
  const cur = career ? 3 : (!done ? 0 : !prep ? 1 : 2);
  const states = ['done', 'done', 'done', career ? 'done' : ''];
  states[cur] = 'cur';
  return `<div class="wzsteps">` + WZ_SKETCHES.map((s, i) =>
    (i ? WZ_ARROW : '') +
    `<div class="wzstep ${states[i]}"><span class="sk">${s[1]}</span><span class="lbl">${i + 1}. ${s[0]}</span></div>`
  ).join('') + `</div>`;
}

/* la checklist completa: LA STESSA per onboarding e Impostazioni. Torna la
   risposta corrente del server (o null se morto), così chi chiama decide
   cosa sbloccare a valle (es. il form pilota dell'onboarding). Ogni modifica
   (set) la ricarica da sola: il server rilegge la config a ogni request. */
async function wizardChecklist(box, opts = {}){
  box.innerHTML = `<div class="muted" style="padding:8px 0">${tr({ it: 'Verifico l\'installazione di EVO…', en: 'Checking your EVO installation…' })}</div>`;
  let w;
  try { w = await api('wizard', { action: 'check' }); } catch (e) {
    box.innerHTML = `<div class="banner bad">${tr({ it: 'Il server non risponde: ', en: 'The server is not responding: ' })}${esc(e.message)}</div>`;
    return null;
  }
  const OKI = '<span style="color:var(--ok,#7f7);font-size:15px;margin-right:2px">✔</span>';
  const MIS = '<span style="color:#f66;font-size:14px;margin-right:2px">✗</span>';
  const WRN = '<span style="color:var(--warn,#ffb454);font-size:15px;margin-right:2px">⚠</span>';
  const boxRow = (ico, tol, title, sub, warn) =>
    `<div style="padding:9px 12px;border:1px solid ${warn ? '#4a3a2a' : 'var(--line,#283046)'};border-radius:9px;margin-bottom:8px;display:flex;gap:10px;align-items:center;background:${warn ? '#171310' : '#0f1420'}">${ico}
     <div><b style="font-size:13.5px">${title}</b>${sub ? `<div class="muted" style="font-size:12px;margin-top:1px">${sub}</div>` : ''}</div>${tol ? `<span class="muted" style="margin-left:auto;font-size:11px">${tol}</span>` : ''}</div>`;
  const rows = [];
  /* 0 — azioni rapide:  📂 apre la cartella dati in Esplora risorse (selezionata
     dentro la sua cartella madre),  ▶ avvia EVO tramite l'URI ufficiale Steam
     (funziona anche senza exe ricavato dal disco). Tutto via server locale. */
  rows.push(`<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
    <button class="ghost" id="wz-open-exp" type="button">${tr({ it: '📂 Apri la cartella in Esplora risorse', en: '📂 Open the folder in File Explorer' })}</button>
    <button class="ghost" id="wz-launch" type="button">${tr({ it: '▶ Avvia EVO (Steam)', en: '▶ Launch EVO (Steam)' })}</button>
    <span class="muted" style="font-size:11px">${tr({ it: 'azioni locali, affidate al server: nessun download', en: 'local actions, handled by the server: no downloads' })}</span>
  </div>`);
  /* 1 — cartella dati EVO: la spunta verde che serve */
  if (w.dataDir) {
    rows.push(boxRow(OKI, 'ok', tr({ it: 'Cartella dati EVO', en: 'EVO data folder' }), esc(w.dataDir)));
  } else {
    const cercati = (w.candidates ?? []).map((c) => `${c.ok ? OKI : MIS} <code style="font-size:11px">${esc(c.dir)}</code>`).join(' · ');
    rows.push(`<div style="padding:10px 12px;border:1px solid #4a3a2a;border-radius:9px;margin-bottom:8px;background:#171310">${MIS}
      <b style="font-size:13.5px">${tr({ it: 'Cartella dati EVO non trovata', en: 'EVO data folder not found' })}</b>
      <div class="muted" style="font-size:12px;margin-top:3px">${tr({ it: 'ho guardato: ', en: 'I checked: ' })}${cercati || tr({ it: 'nessun percorso standard', en: 'no standard path' })}</div>
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
        <input type="text" id="wz-dir" placeholder="${tr({ it: 'incolla qui il percorso (es. C:/Users/Tu/Saved Games/ACE)', en: 'paste the path here (e.g. C:/Users/You/Saved Games/ACE)' })}" style="flex:1;min-width:300px">
        <button class="act" id="wz-dir-save" type="button">${tr({ it: '💾 Registra percorso', en: '💾 Save path' })}</button>
      </div>
      <div class="muted" style="font-size:11px;margin-top:6px">${tr({ it: "Copia l'indirizzo dalla barra di Esplora risorse. Se l'EVO non è mai partito, avvialo una volta: crea la cartella da solo.", en: "Copy the address from the File Explorer bar. If EVO has never started, launch it once: it creates the folder by itself." })}</div>
    </div>`);
  }
  /* 2 — exe del gioco: spunta, NON blocca (senza exe si parte via Steam URI) */
  if (w.gameExe) {
    rows.push(boxRow(OKI, 'ok', 'AssettoCorsaEVO.exe', esc(w.gameExe)));
  } else {
    rows.push(boxRow(WRN, tr({ it: 'si sistema da solo', en: 'self-fixes' }), tr({ it: 'Gioco non trovato nelle Steam library', en: 'Game not found in any Steam library' }),
      tr({ it: 'non blocca nulla: il cruscotto parte uguale, e l\'avvio va via Steam. Se vuoi il lancio diretto, incolla il percorso:', en: 'non-blocking: the dashboard starts anyway and launching goes through Steam. For direct launch, paste the path:' }), true) +
      `<div class="row" style="margin:-2px 0 8px;gap:8px;flex-wrap:wrap;padding-left:12px">
        <input type="text" id="wz-exe" placeholder="${tr({ it: 'es. D:/SteamLibrary/steamapps/common/Assetto Corsa EVO/AssettoCorsaEVO.exe', en: 'e.g. D:/SteamLibrary/steamapps/common/Assetto Corsa EVO/AssettoCorsaEVO.exe' })}" style="flex:1;min-width:300px">
        <button class="act" id="wz-exe-save" type="button">${tr({ it: '💾 Registra exe', en: '💾 Save exe' })}</button>
      </div>`);
  }
  /* 3 — preparazione: scansione dei contenuti del gioco (niente download!) */
  let content = w.content;
  if (w.dataDir) {
    if (w.content.cars) {
      rows.push(boxRow(OKI, 'ok', tr({ it: 'Contenuti EVO letti', en: 'EVO content loaded' }), `${w.content.cars} ${tr({ it: 'auto', en: 'cars' })} · ${w.content.tracks} ${tr({ it: 'piste nel content del gioco', en: 'tracks in the game content' })}${w.carmaps ? ` · ${w.carmaps} ${tr({ it: 'foto auto installate', en: 'car photos installed' })}` : ` · ${tr({ it: 'foto auto non installate (opzionali: il garage resta funzionante, senza render)', en: 'car photos not installed (optional: the garage still works, without renders)' })}`}`));
    } else {
      try {
        const p = await api('wizard', { action: 'prepare' });
        content = p.content ?? content;
        if (p.content?.cars) rows.push(boxRow(OKI, 'ok', tr({ it: 'Contenuti EVO letti', en: 'EVO content loaded' }), `${p.content.cars} ${tr({ it: 'auto', en: 'cars' })} · ${p.content.tracks} ${tr({ it: 'piste nel content del gioco', en: 'tracks in the game content' })}${p.carmaps ? ` · ${p.carmaps} ${tr({ it: 'foto auto installate', en: 'car photos installed' })}` : ` · ${tr({ it: 'foto auto non installate (opzionali)', en: 'car photos not installed (optional)' })}`}`));
        else rows.push(boxRow(WRN, '', tr({ it: 'Contenuti EVO', en: 'EVO content' }), tr({ it: 'il content del gioco è vuoto: lancia EVO una volta e riprova (Setup → tutti i contenuti si scaricano lì)', en: 'the game content is empty: launch EVO once and retry (all content downloads there, in EVO Setup)' }), true));
      } catch { /* la preparazione non blocca: si può anche rifare */ }
    }
  }
  /* 4 — il weekend del round di carriera (27/10): su un save vergine il
     GameModeType_RACE_WEEKEND.gamemodesave nasce SOLO alla prima apertura del
     round in EVO; senza quel file «Prepara tutto» non può scrivere ora e giri
     (aveva già l'avviso al tasto, ma chi lo leggeva lo vendeva come guasto).
     Nel wizard, invece, lui lo SA PRIMA: spunta verde o passaggio guidato. */
  if (w.career) {
    if (w.weekendFile) {
      rows.push(boxRow(OKI, 'ok', tr({ it: 'Weekend di carriera pronto', en: 'Career weekend ready' }),
        tr({ it: 'il file del round c’è: ora, giri e meteo si scrivono da soli col tasto «Prepara tutto».', en: 'the round file exists: hour, laps and weather set themselves with Get ready.' })));
    } else {
      rows.push(boxRow(WRN, tr({ it: '1 apertura in EVO', en: '1 open in EVO' }),
        tr({ it: 'Weekend mai aperto in EVO', en: 'Weekend not opened in EVO yet' }),
        tr({ it: 'non trovo il file GameModeType_RACE_WEEKEND.gamemodesave: lo crea EVO alla prima apertura del round corrente. Apri Carriera → round in corso → la schermata del weekend una volta (giocare non serve), poi torna e premi «Prepara tutto» — ora, giri e meteo finiscono da soli nel round.', en: 'the game has never written GameModeType_RACE_WEEKEND.gamemodesave: EVO creates it the first time you open the current round. Open Career → current round → the weekend screen once (no need to play), then come back and press Get ready — hour, laps and weather land in the round by themselves.' }), true));
    }
  }
  box.innerHTML = (opts.sketch === false ? '' : wizardSketchSteps({ ...w, content })) +
    rows.filter((r) => typeof r !== 'function').join('');
  $('#wz-open-exp')?.addEventListener('click', async () => {
    try {
      const r = await api('wizard', { action: 'explore', path: w.dataDir ?? '' });
      toast(r.via === 'already-running' ? tr({ it: 'Il gioco è già aperto.', en: 'The game is already running.' }) : tr({ it: 'Esplora risorse aperto.', en: 'File Explorer opened.' }), 'ok');
    } catch (e) { toast(e.message, 'err'); }
  });
  $('#wz-launch')?.addEventListener('click', async () => {
    try {
      const r = await api('wizard', { action: 'launch' });
      toast(r.via === 'already-running' ? tr({ it: 'Il gioco è già in esecuzione: usalo da lì.', en: 'The game is already running: use that window.' }) : tr({ it: 'Comando di avvio inviato a Steam.', en: 'Launch command sent to Steam.' }), 'ok');
    } catch (e) { toast(e.message, 'err'); }
  });
  $('#wz-dir-save')?.addEventListener('click', async () => {
    const dir = $('#wz-dir')?.value.trim();
    if (!dir) return;
    try { await api('wizard', { action: 'set', dataDir: dir }); toast(tr({ it: 'Cartella dati registrata, la rileggo…', en: 'Data folder saved, rechecking…' }), 'ok'); await opts.onChanged?.(); await wizardChecklist(box, opts); }
    catch (e) { toast(e.message, 'err'); }
  });
  $('#wz-exe-save')?.addEventListener('click', async () => {
    const exe = $('#wz-exe')?.value.trim();
    if (!exe) return;
    try { await api('wizard', { action: 'set', gameExe: exe }); toast(tr({ it: 'Percorso del gioco registrato.', en: 'Game path saved.' }), 'ok'); await opts.onChanged?.(); await wizardChecklist(box, opts); }
    catch (e) { toast(e.message, 'err'); }
  });
  /* chi ci dà un form da sbloccare (l'onboarding): lo sblocchiamo qui quando
     la cartella dati è riconosciuta, perché solo allora arrivano i dati veri */
  if (opts.unlockForm) {
    const form = $(opts.unlockForm);
    if (form) form.style.display = w.dataDir ? '' : 'none';
  }
  return w;
}

/* -------- onboarding -------- */
function drawOnboarding(m){
  $('#idblock').classList.add('hidden');
  $('#hstats').classList.add('hidden');
  const s = boot.setup;
  const okDetected = s.dataDirs?.length || (s.content.cars + s.content.tracks > 0);
  m.innerHTML = `
  <div class="hero">
    <div class="kicker">${tr({ it: 'Assetto Corsa EVO · gestionale carriera', en: 'Assetto Corsa EVO · career manager' })}</div>
    <div class="big">${tr({ it: 'Costruisci la tua carriera<br>dalla prima coppa fino alle serie di punta', en: 'Build your career<br>from the first cup up to the top series' })}</div>
    <div class="lead">${tr({ it: '29 serie · 6 discipline · contratti, rivali e difficoltà adattiva.', en: '29 series · 6 disciplines · contracts, rivals and adaptive difficulty.' })}</div>
    <div id="wz" class="wiz" style="margin:16px 0 4px;text-align:left"></div>
    <div class="setup-facts" style="${okDetected ? '' : 'display:none'}">
      <span class="chip">${s.content.cars} ${tr({ it: 'auto viste', en: 'cars seen' })}</span>
      <span class="chip">${s.content.tracks} ${tr({ it: 'piste viste', en: 'tracks seen' })}</span>
      <span class="chip">${s.ladder.nodes} ${tr({ it: 'serie', en: 'series' })}</span>
      ${s.gameExe ? `<span class="chip green">${tr({ it: 'gioco trovato', en: 'game found' })}</span>` : `<span class="chip red">${tr({ it: 'gioco non trovato', en: 'game not found' })}</span>`}
    </div>
    <form id="f-new" class="career" style="${okDetected ? '' : 'display:none'}">
      <div class="field"><label>${tr({ it: 'Nome pilota — uguale a come corri in EVO', en: 'Driver name — the same name you race with in EVO' })}</label><input type="text" id="i-name" placeholder="${tr({ it: 'es. il tuo nome di pit lane', en: 'e.g. your pit-lane name' })}" required></div>
      <div class="grid2">
        <div class="field"><label>${tr({ it: 'Nazione', en: 'Country' })}</label><input type="text" id="i-nation" value="ITA" maxlength="3"></div>
        <div class="field"><label>${tr({ it: 'Disciplina iniziale', en: 'Starting discipline' })}</label>
          <select id="i-disc">
            <option value="">${tr({ it: 'consigliata (touring)', en: 'recommended (touring)' })}</option>
            ${['gt','touring','formula','endurance','historic','drift'].map(d=>`<option value="${d}">${d}</option>`).join('')}
          </select></div>
      </div>
      <label class="muted" style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" id="i-force"> ${tr({ it: 'ricomincia da zero (sovrascrive la carriera esistente)', en: 'start over (overwrites the existing career)' })}</label>
      <button class="act" type="submit" style="width:100%">${tr({ it: 'Inizia la carriera', en: 'Start the career' })}</button>
    </form>
  </div>`;
  // SELETTORE LINGUA AL PRIMO AVVIO (richiesta Mauro 26/10 sera): il primo
  // schermo che l'amico vede dev'essere comprensibile SENZA passare da
  // Impostazioni. Usa lo stesso legame di lang.js (impostaLingua: salva nel
  // localStorage + notifica il server + ricarica), quindi il comportamento è
  // identico al selettore di Impostazioni — solo raggiungibile subito.
  const linguaSel = `<div class="field" style="max-width:220px;margin:-6px 0 14px"><label>${tr({ it: 'Lingua · Language', en: 'Language · Lingua' })}</label>
    <select id="i-lingua"><option value="it">Italiano</option><option value="en">English</option></select></div>`;
  $$('.lead', m)[0].insertAdjacentHTML('afterend', linguaSel);
  const selBootLingua = $('#i-lingua', m);
  if (selBootLingua) { selBootLingua.value = window.LINGUA; selBootLingua.onchange = (e) => impostaLingua(e.target.value); }
  $('#f-new').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('new-career', { name: $('#i-name').value.trim(), nation: $('#i-nation').value.trim().toUpperCase() || 'ITA', discipline: $('#i-disc').value || null, force: $('#i-force').checked });
      await refreshBoot(); tab='dashboard'; drawNav(); render();
      toast(tr({ it: 'Carriera creata: benvenuto nel paddock.', en: 'Career created: welcome to the paddock.' }), 'ok');
    } catch(err){ toast(err.message, 'err'); }
  };
  /* il wizard: lista di controllo tirata dal server (stato vero, non indovinato) */
  wizardChecklist($('#wz'), { onChanged: refreshBoot, unlockForm: '#f-new' });
}

/* -------- cruscotto -------- */
/* La CARDC PADDACK del cruscotto: la prossima gara scritta dall'app Paddock,
 * con il meteo/orário già deciso a monte (gara bagnataistra gialla), la
 * classifica Paddock, il messaggio dell'ingegnere (a fondo % gas) e tutte le
 * ronde con esito. Nascosta se Paddock non gira o non ha dati. */
async function drawPaddockPanel(){
  const el = $('#p-paddock'); if (!el) return;
  const pd = await api('paddock').catch(() => null);
  if (!pd || !pd.ok || !pd.next)
    { el.style.display = 'none'; return; }
  const n = pd.next;
  const rounds = (pd.calendar?.rounds ?? []).filter(r => r?.track);
  const stand = (pd.home?.standings ?? pd.calendar?.standings ?? []).slice(0, 5);
  const wetIcon = n.wet ? '🌧️ ' : '';
  el.innerHTML = `
  <h2>${LI.gauge} ${tr({ it: 'Paddock', en: 'Paddock' })} <span class="h-act">${esc(pd.next.series ?? '')} · ${tr({ it: 'gara', en: 'race' })} ${n.round}/${n.total}</span></h2>
  <div class="banner ${n.wet?'warn':'info'}" style="margin-bottom:10px">
    ${wetIcon}<b>${window.trackLinkHtml(n.track)}${n.layout ? ` — ${esc(n.layout)}` : ''}</b> · ${n.laps ? `${n.laps} ${tr({ it: 'giri', en: 'laps' })}` : ''}
    ${n.time ? ` · 🕑 ${esc(n.time)}` : ''}${n.weather ? ` · ${esc(n.weather)}` : ''}
    ${n.car ? `<br>🚘 ${window.carLinkHtml(n.car)}` : ''}
    ${n.rank != null ? `<br>${tr({ it: 'Sei in classifica: ', en: 'You are standing: ' })}<b>${n.rank ?? '–'}</b> con <b>${n.points ?? '–'}</b> pt (${n.done ?? '–'}/${n.total} gare)` : ''}
  </div>
  ${n.wet ? `<div class="banner warn" style="margin-bottom:10px">🌧️ ${tr({ it: '<b>Gara bagnata in agenda:</b> monta l\'assetto pioggia PRIMA di partire. Pressioni sotto il target a caldo e staccate più lunghe: le condizioni asciutte non fungono.', en: '<b>Wet race scheduled:</b> fit the wet setup BEFORE you start. Pressures under hot target, longer braking: dry conditions settings will not work.' })}</div>` : ''}
  ${(n.tips ?? []).length ? `<div class="panel-inset" style="margin-bottom:10px">
    ${(n.tips ?? []).map((t) => `<div style="font-size:12.5px;color:var(--dim,#8fa3bd)">💡 ${esc(String(t))}</div>`).join('')}
  </div>` : ''}
  ${stand.length ? `<table style="margin-top:2px"><thead><tr><th>##</th><th>${tr({ it: 'Classifica Paddock', en: 'Paddock standings' })}</th><th class="right">${tr({ it: 'Punti', en: 'Points' })}</th><th class="right">${tr({ it: 'Vittorie', en: 'Wins' })}</th></tr></thead><tbody>
    ${stand.map((s) => `<tr class="${s.me ? 'cur' : ''}"><td>${s.rank}</td><td>${s.me ? `<b>${esc(s.name)}</b> (tu)` : esc(s.name)}</td><td class="right">${s.points}</td><td class="right">${s.wins}</td></tr>`).join('')}
  </tbody></table>` : ''}
  ${rounds.length ? `<div class="formchips" style="margin-top:8px">${rounds.map((r) => `<span class="chip ${r.state === 'next' ? 'blue' : ''}" title="${esc(r.track ?? '')}${r.laps ? ' · ' + r.laps + ' giri' : ''}">${r.state === 'done' ? '✓' : r.state === 'next' ? '▶' : '·'} R${r.n}</span>`).join('')}</div>` : ''}
  ${(pd.home?.messages ?? []).length ? `<div style="margin-top:10px"><div class="muted" style="font-size:12px">📻 ${tr({ it: 'Dal team (Paddock)', en: 'From the team (Paddock)' })}</div>
    ${(pd.home?.messages ?? []).slice(0, 3).map((m) => `<div style="font-size:12.5px;color:var(--dim,#8fa3bd);margin-top:2px"><b>${esc(m.who ?? '')}</b> — ${esc(String(m.text ?? '').slice(0, 160))}</div>`).join('')}</div>` : ''}`;
}

async function drawDashboard(m){
  const [st, card, sb] = await Promise.all([api('status'), api('card'), api('save-backup').catch(() => null)]);
  const h = st.header, node = h.node;
  const res = st.results;
  // AVVISO IN PAGINA PRINCIPALE (27/10, richiesta Mauro: «quando il backup
  // del save fallisce, fai comparire un avviso anche in pagina principale»):
  // parla SOLO quando c'è un problema vero — stay zitto col PC vergine senza
  // EVO (saveDirFound=false lo gestisce il wizard dell'installazione).
  const sbBanner = sb?.saveDirFound && !sb.zips?.length
    ? `<div class="banner warn" style="margin-bottom:10px">🛟 ${tr({ it: '<b>Il backup del save di EVO non è mai partito:</b> il launcher lo crea al suo primo avvio, oppure forzalo in Sistema → Backup del save di EVO. Senza backup, un save corrotto cancellerebbe tutta la carriera.', en: '<b>The EVO save backup never ran:</b> the launcher creates it at its first start, or force it in System → EVO save backup. Without a backup, a corrupted save would erase the whole career.' })}</div>`
    : sb?.saveDirFound && sb.zips?.length && !sb.fresh
    ? `<div class="banner warn" style="margin-bottom:10px">🛟 ${tr({ it: '<b>Il backup del save di EVO è stantio</b> (ultimo ', en: '<b>The EVO save backup is stale</b> (last ' })}${sb.ageHours < 24 ? `${Math.round(sb.ageHours)} ${tr({ it: 'ore', en: 'hours' })}` : `${Math.round(sb.ageHours / 24)} ${tr({ it: 'giorni', en: 'days' })}`}${tr({ it: ' fa): riavvia il launcher per rifarlo, o forza subito in Sistema → Backup del save di EVO.', en: ' ago): restart the launcher to redo it, or force it now in System → EVO save backup.' })}</div>`
    : '';
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
      ${sbBanner}
      <div class="panel hero">
        <svg class="flagart" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 2h1.6v20H4z"/><path d="M5.6 3h12.8l-3 4.5 3 4.5H5.6z"/></svg>
        <h2>${LI.flag} ${esc(node.display)} · ${tr({ it: 'stagione', en: 'season' })} ${h.season}</h2>
        <div class="seasonprog">
          <div class="sp-bar"><i style="width:${total ? Math.min(100, Math.round(played/total*100)) : 0}%"></i></div>
          <div class="sp-meta"><span>${card.seasonDone ? tr({ it: 'calendario completato', en: 'calendar completed' }) : `${tr({ it: 'prossima gara: ', en: 'next race: ' })}<b style="color:var(--text)">${esc(card.roundName)}</b>`}</span><span>${played}/${total} ${tr({ it: 'gare disputate', en: 'races run' })}</span></div>
        </div>
        <div class="grid3">
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.gauge}</span><div class="l">${tr({ it: 'Classifica', en: 'Standing' })}</div></div><div class="v acc">P${h.position ?? '–'}<small>/${h.gridSize}</small></div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.bolt}</span><div class="l">${tr({ it: 'Punti', en: 'Points' })}</div></div><div class="v acc2">${pts}</div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.trophy}</span><div class="l">${tr({ it: 'Vittorie', en: 'Wins' })}</div></div><div class="v">${wins}</div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.medal}</span><div class="l">${tr({ it: 'Podi', en: 'Podiums' })}</div></div><div class="v">${podiums}</div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.euro}</span><div class="l">${tr({ it: 'Premi stagione', en: 'Season prizes' })}</div></div><div class="v good">${money(prize)}<small> €</small></div></div>
          <div class="kpi"><div class="kpi-top"><span class="kico">${LI.stopwatch}</span><div class="l">${tr({ it: 'Giri veloci', en: 'Fastest laps' })}</div></div><div class="v">${fls}</div></div>
        </div>
        ${races ? `<div class="formchips"><span class="muted">${tr({ it: 'forma:', en: 'form:' })}</span>${res.slice(-5).reverse().map(r=>`<span class="chip ${r.dnf?'red':r.position===1?'gold':r.position<=3?'green':''}">${r.dnf?tr({ it: 'rit.', en: 'DNF' }):`P${r.position}`}</span>`).join('')}</div>` : ''}
        ${races ? `<div class="barchart">${res.map(r=>`<div class="bar ${r.points?'':'zero'}" style="height:${Math.max(6, r.points/maxPts*100)}%" data-tip="R${r.round} · ${r.dnf?tr({ it: 'ritiro', en: 'DNF' }):'P'+r.position} · ${r.points} pt" title="R${r.round} · ${esc(r.track ?? '')} — ${r.dnf?tr({ it: 'ritiro', en: 'DNF' }):'P'+r.position} · ${r.points} pt"></div>`).join('')}</div>` : ''}
        <div class="muted" style="margin-top:12px">${esc(node.discipline)} · ${tr({ it: 'livello', en: 'level' })} ${node.level} (${node.tier}) · ${esc(node.access==='closed'?tr({ it: 'parco chiuso', en: 'closed grid' }):tr({ it: 'serie aperta', en: 'open series' }))} · ${tr({ it: 'iscrizione', en: 'entry fee' })} ${money(st.econ.entry)} € · ${tr({ it: 'premio', en: 'prize' })} ${money(st.econ.prize)} € · ${fls} ${tr({ it: 'giro veloce', en: 'fastest lap' })}</div>
        ${races ? `<table style="margin-top:12px"><thead><tr><th>${tr({ it: 'Gare della stagione', en: 'Races of the season' })}</th><th class="right">${tr({ it: 'Pos', en: 'Pos' })}</th><th class="right">${tr({ it: 'Punti', en: 'Points' })}</th><th class="right">${tr({ it: 'Premio', en: 'Prize' })}</th></tr></thead>
          <tbody>${res.map(r=>`<tr${r.dnf?' style="color:var(--bad)"':''}><td>R${r.round} · ${window.trackLinkHtml(r.track)}${r.fl?` <span class="tag gold">${tr({ it: 'giro veloce', en: 'fastest lap' })}</span>`:''}</td><td class="right">${r.dnf?tr({ it: 'ritiro', en: 'DNF' }):'P'+r.position}</td><td class="right">${r.points}</td><td class="right">${money(r.prize)} €</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty" style="margin-top:10px">${tr({ it: 'Nessuna gara disputata in questa serie.', en: 'No races run in this series yet.' })}</div>`}
      </div>
      <div class="panel">
        <h2>${LI.chat} ${tr({ it: 'Messaggi recenti', en: 'Recent messages' })}</h2>
        ${st.messages.length ? st.messages.slice(0,6).map(msgRow).join('') : `<div class="empty">${tr({ it: 'Tutto quieto nel paddock.', en: 'All quiet in the paddock.' })}</div>`}
        ${h.offers.length ? `<div class="banner info" style="margin-top:10px">${tr({ it: 'Ci sono ', en: 'There are ' })}<b>${h.offers.length} ${tr({ it: 'offerte', en: 'offers' })}</b>${tr({ it: ' sul tavolo: sezione Messaggi per firmare.', en: ' on the table: sign them in the Messages section.' })}</div>` : ''}
      </div>
      <div class="panel" id="p-paddock" style="display:none"><h2>${LI.gauge} Paddock</h2><div class="empty">…</div></div>
      <div class="panel" id="p-life"><h2>${tr({ it: 'Vita fuori pista', en: 'Life off track' })}</h2><div class="empty">…</div></div>
      <div class="panel" id="p-heritage"><h2>${tr({ it: '📜 Eredità di famiglia', en: '📜 Family heritage' })}</h2><div class="empty">…</div></div>
      <div class="panel" id="p-events"><h2>${tr({ it: 'Eventi speciali', en: 'Special events' })}</h2><div class="empty">…</div></div>
      <div class="panel">
        <h2>${LI.gauge} ${tr({ it: 'Strumenti rapidi', en: 'Quick tools' })}</h2>
        <div class="grid2">
          <button class="qtile" id="b-review">${LI.book}<span><b>${tr({ it: 'Rassegna di fine stagione', en: 'End-of-season review' })}</b><small>${tr({ it: "il bilancio completo dell'anno", en: 'the full year in review' })}</small></span></button>
          <button class="qtile" id="b-gazzetta">${LI.news}<span><b>${tr({ it: 'Gazzetta di stagione', en: 'Season gazette' })}</b><small>${tr({ it: "i titoli dell'anno, in un foglio solo", en: "the year's headlines, one sheet" })}</small></span></button>
          <button class="qtile" id="b-integrity-quick">${LI.shield}<span><b>${tr({ it: 'Verifica integrità', en: 'Integrity check' })}</b><small>${tr({ it: 'controllo di coerenza della carriera', en: 'career consistency check' })}</small></span></button>
          <button class="qtile" id="b-mondo">${ICONS.iconic ?? '⭐'}<span><b>${tr({ it: 'Classifica Mondiale', en: 'World Ranking' })}</b><small>${tr({ it: 'skill e profili di tutti i piloti del mondo, nel quadro di Campionati', en: 'skill and profiles of every driver, in the Championships panel' })}</small></span></button>
        </div>
      </div>
    </div>
    <div class="racecard panel" id="card-panel"></div>
  </div>`;
  drawCardInto($('#card-panel'), card);
  drawPaddockPanel();
  drawLifePanel();
  drawHeritagePanel();
  drawEventsPanel();
  $('#b-review').onclick = () => showReview();
  $('#b-gazzetta').onclick = () => showGazzetta();
  /* Mondiale più visibile (27/10, Mauro: «resta un poco nascosto»): il tile
     porta DENTRO Campionati con il pieghevole del quadro mondiale già aperto
     (viste-b.js consuma il segnaposto __apriMondo). */
  $('#b-mondo').onclick = () => { window.__apriMondo = true; tab = 'championships'; drawNav(); render(); };
  $('#b-integrity-quick').onclick = async () => {
    try {
      const r = await api('integrity');
      if (!r.issues.length) return toast(tr({ it: 'Carriera sotto controllo: tutto torna.', en: 'Career in order: everything checks out.' }), 'ok');
      modal(tr({ it: 'Verifica integrità', en: 'Integrity check' }), `<div class="banner warn"><b>${r.issues.length} ${tr({ it: 'anomalie:', en: 'issues:' })}</b><ul style="margin:6px 0 0 18px">${r.issues.map(i=>`<li>${esc(i.text)}</li>`).join('')}</ul></div>`, [['Chiudi','ghost',()=>{}]]);
    } catch(e){ toast(e.message,'err'); }
  };
}

async function showReview(){
  try {
    const integ = await api('integrity');
    const seasons = integ.seasons ?? [];
    if (!seasons.length) return toast(tr({ it: 'Ancora nessuna gara disputata.', en: 'No races run yet.' }), 'warn');
    const r = await api('season-review', { season: seasons[0] });
    const draw = (rev) => {
      modal(`${tr({ it: 'Stagione', en: 'Season' })} ${rev.season} — ${rev.node}`, `
        <div style="max-height:60vh;overflow:auto">
          ${rev.champion?`<div class="banner good" style="margin-bottom:10px">${tr({ it: '🏆 CAMPIONE!', en: '🏆 CHAMPION!' })}</div>`:''}
          <div class="muted" style="margin-bottom:10px">${rev.stats.races} ${tr({ it: 'gare', en: 'races' })} · ${rev.stats.wins} ${tr({ it: 'vittorie', en: 'wins' })} · ${rev.stats.podiums} ${tr({ it: 'podi', en: 'podiums' })} · ${rev.stats.poles} ${tr({ it: 'pole', en: 'poles' })} · ${rev.stats.fls} ${tr({ it: 'giri veloci', en: 'fastest laps' })} · ${rev.stats.points} ${tr({ it: 'punti', en: 'points' })} · ${money(rev.stats.prize)} € ${tr({ it: 'di premi', en: 'in prizes' })}</div>
          <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.55">${esc(rev.text)}</pre>
        </div>`,
        [ ...seasons.filter(s=>s!==rev.season).slice(0,2).map(s=>[`${tr({ it: 'Stagione', en: 'Season' })} ${s}`,'ghost',()=>{ api('season-review',{season:s}).then(draw).catch(e=>toast(e.message,'err')); }]),
          [tr({ it: 'Salva su file', en: 'Save to file' }),'ghost',async()=>{ try{ const r=await api('review-export',{season:rev.season}); toast(tr({ it: 'Rassegna salvata in ', en: 'Review saved to ' })+r.file,'ok'); }catch(e){ toast(e.message,'err'); } }],
          [tr({ it: 'Copia testo', en: 'Copy text' }),'ghost',async()=>{ try{ await navigator.clipboard.writeText(rev.text); toast(tr({ it: 'Rassegna copiata.', en: 'Review copied.' }),'ok'); }catch{ toast(tr({ it: 'Appunti negati.', en: 'Clipboard denied.' }),'err'); } }],
          [tr({ it: 'Chiudi', en: 'Close' }),'ghost',()=>{}]]);
    };
    draw(r);
  } catch(e){ toast(e.message, 'err'); }
}

/* la gazzetta di stagione (28/10): i titoli scritti gara per gara riletti in
   pagina unica. Tira dal server il foglio composto (seasonPress) e lo mostra
   con gli stessi bottoni di stagione della rassegna. */
async function showGazzetta(){
  try {
    const integ = await api('integrity');
    const seasons = integ.seasons ?? [];
    if (!seasons.length) return toast(tr({ it: 'Ancora nessuna gara disputata.', en: 'No races run yet.' }), 'warn');
    const draw = (g) => {
      const testo = g.heads.map((h) => `${h.title}\n${h.body ?? ''}`).join('\n\n');
      modal(tr({ it: 'Gazzetta di stagione', en: 'Season gazette' }), `
        <div style="max-height:60vh;overflow:auto">
          <div class="muted" style="margin-bottom:10px">${tr({ it: `stagione ${g.season}`, en: `season ${g.season}` })} · ${g.races} ${tr({ it: 'gare', en: 'races' })} · ${g.wins} ${tr({ it: 'vittorie', en: 'wins' })} · ${g.podiums} ${tr({ it: 'podi', en: 'podiums' })}${g.dnf ? ` · ${g.dnf} ${tr({ it: 'ritiri', en: 'DNFs' })}` : ''}</div>
          ${!g.races ? `<div class="empty">${tr({ it: 'Il registro della stampa per quest\'anno è vuoto: i titoli arrivano con le gare importate.', en: "The season's press registry is empty: headlines arrive with imported races." })}</div>`
          : g.heads.map((h) => `
            <div style="border-left:2px solid var(--line,#283046);padding:6px 10px;margin-bottom:8px">
              <span class="chip ${h.outcome === 'P1' ? 'gold' : h.outcome === 'dnf' ? 'red' : ''}" style="font-size:10px;padding:1px 6px">R${h.round} · ${esc(h.track ?? '')}</span>
              <b style="font-size:12.5px;display:block;margin-top:3px">${esc(h.title)}</b>
              <div class="muted" style="font-size:12px;white-space:pre-wrap">${esc(h.body ?? '')}</div>
            </div>`).join('')}
        </div>`,
        [ ...seasons.filter((s) => s !== g.season).slice(0, 2).map((s) => [`${tr({ it: 'Stagione', en: 'Season' })} ${s}`, 'ghost', () => { api('gazzetta-season', { season: s }).then(draw).catch((e) => toast(e.message, 'err')); }]),
          [tr({ it: 'Copia il foglio', en: 'Copy sheet' }), 'ghost', async () => { try { await navigator.clipboard.writeText(testo); toast(tr({ it: 'Gazzetta copiata.', en: 'Gazette copied.' }), 'ok'); } catch { toast(tr({ it: 'Appunti negati.', en: 'Clipboard denied.' }), 'err'); } }],
          [tr({ it: 'Chiudi', en: 'Close' }), 'ghost', () => {}]]);
    };
    draw(await api('gazzetta-season', { season: seasons[0] }));
  } catch (e) { toast(e.message, 'err'); }
}

/* -------- vita fuori pista: contratto, sponsor, sfida, voci -------- */
async function drawLifePanel(){
  const el = $('#p-life'); if (!el) return;
  try {
    const v = await api('life');
    const rows = [];
    if (v.contract) rows.push(`<div class="liferow"><span class="lico">${LI.scroll}</span><div class="lt"><b>${tr({ it: 'Contratto', en: 'Contract' })} ${esc(v.contract.display)}</b> <span class="muted">· ${tr({ it: 'premio ', en: 'payout ' })}${money(v.contract.payout)} € ${tr({ it: 'a fine stagione', en: 'at season end' })}</span>
      ${v.contract.rows.map(c=>`<div style="font-size:12.5px;margin-top:3px">${c.decided===false?'<span style="color:var(--bad)">✗</span>':c.ok?'<span style="color:var(--good)">✓</span>':'•'} ${esc(c.text)} — <span class="muted">${esc(c.progress)}</span></div>`).join('')}</div></div>`);
    if (v.duel) rows.push(`<div class="liferow"><span class="lico red">${LI.swords}</span><div class="lt"><b>${tr({ it: 'Duello della stagione', en: 'Duel of the season' })}</b><div style="font-size:12.5px">${tr({ it: 'tu', en: 'you' })} <b>${v.duel.myPoints} pt</b> vs ${esc(v.duel.name)} <b>${v.duel.hisPoints} pt</b></div></div></div>`);
    if (v.sponsorActive) rows.push(`<div class="liferow"><span class="lico green">${LI.handshake}</span><div class="lt"><b>${esc(v.sponsorActive.name)}</b><div style="font-size:12.5px">${money(v.sponsorActive.perRace)} € ${tr({ it: 'a gara', en: 'per race' })}${v.sponsorActive.missionDone?` · ${tr({ it: 'missione completata ✓', en: 'mission completed ✓' })}`:` · ${tr({ it: 'missione: podio entro R', en: 'mission: podium by R' })}${v.sponsorActive.deadlineRound+1} (+${money(v.sponsorActive.bonus)} €)`}</div></div></div>`);
    else if (v.sponsor?.length) rows.push(`<div class="liferow"><span class="lico green">${LI.handshake}</span><div class="lt"><b>${tr({ it: 'Proposta: ', en: 'Offer: ' })}${esc(v.sponsor[v.sponsor.length-1].name)}</b><div style="font-size:12.5px">${esc(tr({ it: v.sponsor[v.sponsor.length-1].note, en: v.sponsor[v.sponsor.length-1].noteEn ?? v.sponsor[v.sponsor.length-1].note }))} <button class="mini" id="b-sponsor-sign">${tr({ it: 'firma', en: 'sign' })}</button> <button class="mini" id="b-sponsor-no">${tr({ it: 'rifiuta', en: 'decline' })}</button></div></div></div>`);
    const voci = [
      ...(v.pulse?.hot ?? []).map(n=>`<b>${esc(n)}</b> ${tr({ it: 'è in forma', en: 'is in form' })}`),
      ...(v.pulse?.cold ?? []).map(n=>`${esc(n)} ${tr({ it: 'è in declino', en: 'is on the decline' })}`),
      v.pulse?.rookie ? tr({ it: `l'esordiente <b>${esc(v.pulse.rookie)}</b> ha debuttato nel campionato`, en: `rookie <b>${esc(v.pulse.rookie)}</b> debuted in the championship` }) : '',
    ].filter(Boolean);
    if (voci.length) rows.push(`<div class="liferow"><span class="lico blue">${LI.chat}</span><div class="lt"><b>${tr({ it: 'Voci dal paddock', en: 'Paddock whispers' })}</b><div style="font-size:12.5px">${voci.join(' · ')}</div></div></div>`);
    el.innerHTML = `<h2>${LI.compass} ${tr({ it: 'Vita fuori pista', en: 'Life off track' })}</h2>
      ${rows.join('') || `<div class="empty">${tr({ it: 'Il contratto arriva quando firmi il sedile.', en: 'The contract comes when you sign the seat.' })}</div>`}
      ${v.challenge && !v.challenge.verdict ? `<div class="banner ${v.challenge.accepted?'info':'warn'}" style="margin-top:6px">${LI.target} <b>${tr({ it: 'Sfida della ronda', en: 'Round challenge' })}</b> — ${esc(legacyIt(v.challenge.text))}<br><span class="muted">${tr({ it: 'premio ', en: 'reward ' })}${money(v.challenge.reward)} € · ${tr({ it: 'penale −', en: 'penalty −' })}${v.challenge.penalty} rep${v.challenge.accepted?` · ${tr({ it: 'accettata', en: 'accepted' })}`:''}</span>${v.challenge.accepted?'':` <button class="mini" id="b-chal-acc" style="margin-top:6px">${tr({ it: 'accetta', en: 'accept' })}</button>`}</div>` : ''}`;
    $('#b-sponsor-sign')?.addEventListener('click', async ()=>{ try{ await api('sponsor-accept',{tier:999}); toast(tr({ it: 'Sponsor firmato.', en: 'Sponsor signed.' }),'ok'); drawLifePanel(); }catch(e){toast(e.message,'err')} });
    $('#b-sponsor-no')?.addEventListener('click', async ()=>{ try{ await api('sponsor-decline',{}); toast(tr({ it: 'Proposta rifiutata.', en: 'Offer declined.' }),'ok'); drawLifePanel(); }catch(e){toast(e.message,'err')} });
    $('#b-chal-acc')?.addEventListener('click', async ()=>{ try{ await api('challenge-accept',{}); toast(tr({ it: 'Sfida accettata: in bocca al lupo.', en: 'Challenge accepted: good luck.' }),'ok'); drawLifePanel(); }catch(e){toast(e.message,'err')} });
  } catch { el.innerHTML = `<h2>${tr({ it: 'Vita fuori pista', en: 'Life off track' })}</h2><div class="empty">${tr({ it: 'Non disponibile', en: 'Not available' })}.</div>`; }
}

/* -------- eredità di famiglia (memorie stile del modello originario) -------- */
async function drawHeritagePanel(){
  const el = $('#p-heritage'); if (!el) return;
  try {
    const v = await api('heritage');
    if (!v.active && !v.completedCount){
      el.innerHTML = `<h2>${tr({ it: '📜 Eredità di famiglia', en: '📜 Family heritage' })}</h2><div class="empty">${tr({ it: "Vinci il tuo primo titolo: la famiglia ti affiderà un'impresa d'altri tempi da rifare, con la sua auto e la sua eredità.", en: "Win your first title: the family will entrust you with an old-days feat to re-run, with its car and its inheritance." })}</div>`;
      return;
    }
    let html = `<h2>${tr({ it: '📜 Eredità di famiglia', en: '📜 Family heritage' })} <span class="h-act">${tr({ it: v.rank, en: v.rankEn ?? v.rank })} · ${v.completedCount}/${v.totalChapters} ${tr({ it: 'capitoli', en: 'chapters' })}</span></h2>`;
    if (v.active){
      const a = v.active;
      html += `<div class="liferow"><span class="lico">📜</span><div class="lt"><b>${esc(tr({ it: a.title, en: a.titleEn ?? a.title }))}</b> — ${esc(a.ancestor)}, ${tr({ it: 'tuo ', en: 'your ' })}${esc(tr({ it: a.relation, en: a.relationEn ?? a.relation }))} (${esc(a.era)})              <div style="font-size:12.5px;margin-top:3px">${window.serLinkHtml(a.series)} · ${tr({ it: 'auto: ', en: 'car: ' })}<b>${a.carName ? window.carLinkHtml(a.carName) : esc(tr({ it: 'n/d', en: 'n/a' }))}</b>${a.seat?` #${a.seat}`:''} · ${tr({ it: 'obiettivo: ', en: 'goal: ' })}<b>${esc(tr({ it: a.objective.text, en: a.objective.en ?? a.objective.text }))}</b></div>
        <div style="font-size:12.5px">${tr({ it: 'Prove: ', en: 'Rounds: ' })}${a.rounds.map((t)=>{const pr=(a.progress??[]).find(p=>p.track===t); return `<span class="tag ${pr?.ok ? 'green':''}" style="font-size:10px;padding:1px 6px" title="${esc(pr?.detail ?? tr({ it: 'da correre', en: 'to run' }))}">${esc(t)}</span>`;}).join(' ')}</div>
        <div style="font-size:12px;margin-top:4px" class="muted">${tr({ it: 'Leggende in griglia: ', en: 'Legends on the grid: ' })}${esc(a.legends.join(' · '))}</div>
        ${a.done ? `<div class="banner good" style="margin-top:8px">${tr({ it: "🏁 Impresa rifatta! L'eredità di ", en: '🏁 Feat re-run! The inheritance of ' })}<b>${money(a.inherit)} €</b>${tr({ it: ' è pronta. ', en: ' is ready. ' })}<button class="mini" id="b-her-claim" style="margin-top:4px">${tr({ it: "Incassa l'eredità", en: 'Claim the inheritance' })}</button></div>` : `<div class="muted" style="font-size:12px;margin-top:5px">${tr({ it: 'Vali in palio: ', en: 'Prize at stake: ' })}${money(a.inherit)} € (${tr({ it: 'dopo: ', en: 'after: ' })}${money(a.repeat)} € ${tr({ it: 'a ripetizione', en: 'per repeat' })}) · ${tr({ it: 'relic: ', en: 'relic: ' })}${esc(tr({ it: a.relic, en: a.relicEn ?? a.relic }))}</div>` }
      </div></div>`;
    }
    if (v.completed.length){
      html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${v.completed.map(c=>`<span class="tag gold" style="font-size:11px;padding:3px 9px" title="${esc(c.ancestor)} · ${esc(c.era)} · ${esc(c.series)} · +${money(c.inherit)} €">${esc(tr({ it: c.crest, en: c.crestEn ?? c.crest }))} ${esc(tr({ it: c.title, en: c.titleEn ?? c.title }))}</span>`).join('')}</div>`;
    }
    if (v.allDone) html += `<div class="banner good" style="margin-top:8px">${tr({ it: 'Saga completa: la famiglia è entrata nella leggenda. 🏛️', en: 'Saga complete: the family made it into legend. 🏛️' })}</div>`;
    el.innerHTML = html;
    $('#b-her-claim')?.addEventListener('click', async ()=>{
      try { const r = await api('heritage-claim',{}); toast(`${tr({ it: 'Eredità incassata: ', en: 'Inheritance claimed: ' })}+${money(r.claimed)} € — ${r.completed}`,'ok'); refreshBoot().then(render); }
      catch(e){ toast(e.message,'err'); }
    });
  } catch { el.innerHTML = `<h2>${tr({ it: '📜 Eredità di famiglia', en: '📜 Family heritage' })}</h2><div class="empty">${tr({ it: 'Non disponibile', en: 'Not available' })}.</div>`; }
}

/* -------- eventi speciali: inviti, scheda gara, vetrina -------- */
async function drawEventsPanel(){
  const el = $('#p-events'); if (!el) return;
  try {
    const v = await api('events');
    if (!v.active && !(v.showCase ?? []).length && !(v.history ?? []).length){
      el.innerHTML = `<h2>${tr({ it: 'Eventi speciali', en: 'Special events' })}</h2><div class="empty">${tr({ it: 'Nessun invito per ora: gli organizzatori ti cercano quando il paddock comincia a conoscerti.', en: 'No invites yet: organizers come looking when the paddock starts to know you.' })}</div>`;
      return;
    }
    let html = `<h2>${tr({ it: 'Eventi speciali', en: 'Special events' })}</h2>`;
    if (v.active){
      const a = v.active, c = v.card;
      const pending = !a.acceptedAt;
      html += `<div class="banner ${pending ? 'info' : 'good'}" style="margin-bottom:8px">
        <b>${tr({ it: '⭐ ', en: '⭐ ' })}${esc(a.theme.name)}</b> <span class="tag" style="font-size:10px;padding:1px 6px">${a.tier === 'finale' ? tr({ it: 'FINALE DI STAGIONE', en: 'SEASON FINALE' }) : tr({ it: 'invito speciale', en: 'special invite' })}</span><br>
        <span class="muted" style="font-size:12.5px">${esc(a.theme.intro)}</span><br>
        <span style="font-size:12.5px;margin-top:4px;display:inline-block">🏁 ${window.trackLinkHtml(v.card?.trackName ?? a.trackDisplay)} · ${a.laps} ${tr({ it: 'giri', en: 'laps' })}${((c.guests ?? a.guests ?? []).length ? ` · ${esc((c.guests ?? a.guests).join(' · '))}` : '')} · ${tr({ it: 'premio: ', en: 'prize: ' })}<b>${a.prize.duplicateCash ? money(a.prize.money) + ' €' : window.carLinkHtml(a.prize.carName) + ' + ' + money(a.prize.money) + ' €'}</b>${a.prize.rep ? ` · +${a.prize.rep} rep` : ''}${a.tier !== 'finale' && !a.acceptedAt ? ` · <span class="muted">${tr({ it: 'scade dopo ', en: 'expires after ' })}${a.deadlineRounds} ${tr({ it: 'gare di campionato', en: 'championship races' })}</span>` : ''}</span>
      </div>`;
      if (pending){
        html += `<div class="row"><button class="act" id="b-ev-acc">${tr({ it: "Accetto l'invito", en: 'I accept the invite' })}</button><button class="ghost" id="b-ev-dec">${tr({ it: 'Rifiuta', en: 'Decline' })}</button></div>`;
      } else {
        html += `<details open style="margin:6px 0"><summary style="cursor:pointer;font-size:12.5px"><b>${tr({ it: '📋 Scheda da impostare in EVO', en: '📋 Sheet to set up in EVO' })}</b> <span class="muted" style="font-size:11px">— ${tr({ it: 'spuntala come la gara di campionato', en: 'check it off like the championship race' })}</span></summary>
          <table style="margin-top:6px"><tbody>${c.settings.map((s)=>`<tr><td style="width:130px" class="muted">${esc(s[0])}</td><td>${esc(s[1])}</td></tr>`).join('')}</tbody></table>
          <div class="muted" style="margin-top:6px;font-size:12px">${tr({ it: "Difficoltà AI consigliata per la tua serie: → usa gli slider della scheda gara normale. Se ti serve, guarda il pannello Prossima gara.", en: "Recommended AI difficulty for your series: → use the sliders of the normal race sheet. If needed, see the Next race panel." })}</div>
        </details>
        ${v.grigliaRonda?.avviso ? `<div class="banner info" style="margin-top:6px">🗂️ <b>${tr({ it: 'Griglia sul disco', en: 'Grid on disk' })}</b> — ${esc(v.grigliaRonda.avviso)}</div>` : ''}
        <button class="act" id="b-ev-prep" style="width:100%;margin-top:8px">${tr({ it: '🏁 Prepara tutto e divertiti', en: '🏁 Get everything ready and have fun' })}</button>
        <div class="muted" style="margin-top:6px;font-size:11.5px">${(c.guests ?? a.guests ?? []).length ? tr({ it: "Ora, giri e gli avversari ospiti (2-3) partono da fuori col tasto Prepara, come la gara di campionato: su pista (gamemodesave) e griglia (customgrid) — se un ospite non è in nessuna griglia sul disco, resta a scelta mano in EVO e il tool lo segnala. La barra verifica l'impegno live.", en: 'Hour, laps and the guest rivals (2-3) are set from outside with the Prepare button, like the championship race — onto the track files (gamemodesave) and the grid (customgrid). If a guest car is in no grid on disk, you still pick them by hand in EVO and the tool says so. The bar verifies the setup live.' }) : tr({ it: "Ora, giri e la griglia monomarca partono da fuori col tasto Prepara, come la gara di campionato: su pista (gamemodesave) e griglia (customgrid), scritta dal tool col builder. La barra verifica l'impegno live.", en: 'Hour, laps and the one-make grid are set from outside with the Prepare button, like the championship race — onto the track files (gamemodesave) and the grid (customgrid), built by the tool with its grid builder. The bar verifies the setup live.' })}</div>
        <div class="livebar live-off" id="ev-livebar" style="margin-top:8px"><span class="dot"></span><span class="st">${tr({ it: 'Live evento', en: 'Live event' })}</span><span class="muted">${tr({ it: 'in attesa del gioco…', en: 'waiting for the game…' })}</span></div>
        <details style="margin-top:8px">
          <summary class="muted" style="cursor:pointer;font-size:12px">🏁 ${tr({ it: "A fine gara il risultato si incassa da solo, come le gare di campionato: apri il game, corre e chiudi. Non serve compilare nulla. — Registra a mano (solo se serve)", en: "At the end of the race the result is collected automatically, like championship races: open the game, race and close it. No need to fill anything in. — Record by hand (only if needed)" })}</summary>
          <div class="row" style="margin-top:8px;flex-wrap:wrap;align-items:end">
            <label class="muted">${tr({ it: "Posizione d'arrivo", en: 'Finishing position' })}<br><input type="number" id="i-ev-pos" min="1" max="30" value="1" style="width:80px"></label>
            <label class="muted">${tr({ it: 'Miglior giro (secondi, opzionale)', en: 'Best lap (seconds, optional)' })}<br><input type="number" id="i-ev-lap" step="0.1" min="20" max="1200" style="width:100px" placeholder="${tr({ it: 'es. 102.4', en: 'e.g. 102.4' })}"></label>
            <button class="act" id="b-ev-fin">${tr({ it: 'Registra a mano', en: 'Record by hand' })}</button>
            <button class="ghost" id="b-ev-aban">${tr({ it: 'Ripensamento', en: 'Changed my mind' })}</button>
          </div>
        </details>`;
      }
    }
    /* SALA TROFEI (31/10): prima era una fila di tag attaccata in fondo al
       pannello eventi — poco rispetto per i premi più rari della carriera.
       Ora è un muro DEDICATO in testa al pannello: ogni auto-premio è una
       targa con data della vittoria (e miglior giro, se ce l'abbiamo nel
       registro dell'evento), sul gradsso oro della pagina statistiche. */
    if ((v.showCase ?? []).length){
      const dataVittoria = (iso) => String(iso ?? '').slice(0, 10);
      /* giro in m:ss.t (i secondi grezzi dell'evento non parlano da soli) */
      const fmtLap = (s) => { if (!Number.isFinite(s)) return '—'; const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
      const targhe = v.showCase.map((c) => `
        <div style="border:1px solid #d9a83e40;border-radius:10px;padding:14px 16px;background:linear-gradient(150deg,#171a12 0%,#12151d 60%,#1a1509 100%);flex:1 1 240px;min-width:230px">
          <div style="font-size:20px" aria-hidden="true">🏆</div>
          <div style="font-size:15px;font-weight:700;margin-top:6px;line-height:1.25">${window.carLinkHtml(c.carName)}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${esc(window.LINGUA === 'en' ? (c.themeEn ?? c.theme) : c.theme)}</div>
          <div style="font-size:11.5px;color:#9a8654;margin-top:6px">${tr({ it: 'stagione', en: 'season' })} S${c.season}${c.bestLapSec ? ` · ${tr({ it: 'giro ', en: 'lap ' })}${fmtLap(c.bestLapSec)}` : ''} · ${tr({ it: 'vinto il', en: 'won on ' })} ${dataVittoria(c.at)}</div>
        </div>`).join('');
      html += `<div style="margin-top:14px;border:1px solid #d9a83e25;border-radius:12px;padding:16px;background:rgba(217,168,62,0.05)">
        <h3 style="margin:0 0 10px;font-size:15px;letter-spacing:.06em">🏆 ${tr({ it: 'SALA TROFEI', en: 'TROPHY ROOM' })} <span class="muted" style="font-size:11.5px;font-weight:400;letter-spacing:0">— ${v.showCase.length} ${v.showCase.length === 1 ? tr({ it: 'premio in carriera', en: 'career prize' }) : tr({ it: 'premi in carriera', en: 'career prizes' })}</span></h3>
        <div style="display:flex;flex-wrap:wrap;gap:10px">${targhe}</div>
      </div>`;
    }
    if ((v.history ?? []).length){
      html += `<details style="margin-top:10px"><summary class="muted" style="cursor:pointer;font-size:12px">${tr({ it: 'Storia eventi ', en: 'Event history ' })}(${v.history.length})</summary><table style="margin-top:6px"><thead><tr><th>${tr({ it: 'Quando', en: 'When' })}</th><th>${tr({ it: 'Evento', en: 'Event' })}</th><th>${tr({ it: 'Esito', en: 'Outcome' })}</th></tr></thead><tbody>${v.history.map(h2=>`<tr><td class="muted">${esc(String(h2.finishedAt ?? h2.declinedAt ?? h2.createdAt ?? '').slice(0,10))}</td><td>${esc(h2.theme?.name ?? '')}</td><td>${h2.outcome==='won'?`<span class="tag good">${tr({ it: 'vinto', en: 'won' })}</span>`:h2.outcome==='declined'?`<span class="muted">${tr({ it: 'rifiutato', en: 'declined' })}</span>`:h2.outcome==='expired'?`<span class="muted">${tr({ it: 'scaduto', en: 'expired' })}</span>`:`P${h2.position ?? '—'}`}</td></tr>`).join('')}</tbody></table></details>`;
    }
    el.innerHTML = html;
    $('#b-ev-acc')?.addEventListener('click', async ()=>{ try{ await api('event-accept',{eventId:v.active.id}); toast(tr({ it: 'Invito accettato: la scheda è pronta.', en: 'Invite accepted: the sheet is ready.' }),'ok'); refreshBoot().then(render); }catch(e){toast(e.message,'err')} });
    $('#b-ev-dec')?.addEventListener('click', async ()=>{ try{ await api('event-decline',{eventId:v.active.id}); toast(tr({ it: 'Invito rifiutato.', en: 'Invite declined.' }),'ok'); refreshBoot().then(render); }catch(e){toast(e.message,'err')} });
    $('#b-ev-fin')?.addEventListener('click', async ()=>{
      try{
        const pos = Number($('#i-ev-pos').value);
        if (!Number.isFinite(pos) || pos < 1) return toast(tr({ it: "Inserisci la posizione d'arrivo.", en: 'Enter the finishing position.' }),'err');
        const lapRaw = $('#i-ev-lap')?.value;
        const lap = lapRaw ? Number(lapRaw) : null;
        const r = await api('event-finish',{position:pos, bestLapSec:lap});
        const res = r.result;
        if (res.won && res.showcaseEntry) toast(tr({ it: '🏆 ', en: '🏆 ' }) + res.showcaseEntry.carName + tr({ it: ' è tua! Entra in vetrina.', en: ' is yours! Check the trophy room.' }),'ok');
        else if (res.money > 0) toast(tr({ it: 'Evento chiuso P', en: 'Event closed P' }) + res.position + ': +' + money(res.money) + ' €','ok');
        else toast(tr({ it: 'Evento chiuso P', en: 'Event closed P' }) + res.position + '.','warn');
        refreshBoot().then(render);
      }catch(e){toast(e.message,'err')}
    });
    $('#b-ev-aban')?.addEventListener('click', async ()=>{ try{ await api('event-abandon',{}); toast(tr({ it: 'Invito liberato: puoi decidere ancora.', en: 'Invite released: you can decide later.' }),'ok'); refreshBoot().then(render); }catch(e){toast(e.message,'err')} });
    $('#b-ev-prep')?.addEventListener('click', async () => {
      const btn = $('#b-ev-prep');
      if (btn) { btn.disabled = true; btn.textContent = '…'; }
      try {
        const r = await api('event-prep', {});
        const p = r.prep ?? {};
        const segs = [];
        if (p.trackError) segs.push(tr({ it: 'pista NON scritta', en: 'track NOT written' }) + ` (${p.trackError})`);
        else if (p.trackNote) segs.push(tr({ it: `pista ${p.track} da impostare a mano in EVO (gara personalizzata)`, en: `track ${p.track} to set by hand in EVO (custom race)` }));
        else if (p.track != null) segs.push(tr({ it: `pista ${p.track}${p.trackWritten ? ' scritta' : ' già a posto'}`, en: `track ${p.track}${p.trackWritten ? ' written' : ' already set'}` }));
        if (p.carError) segs.push(tr({ it: 'auto da selezionare a mano (non nel registro del tool)', en: 'pick the car by hand (not in the tool registry)' }));
        else if (p.carNote) segs.push(`${tr({ it: 'auto', en: 'car' })} ${p.car} ${tr({ it: 'da selezionare a mano in EVO', en: 'to pick by hand in EVO' })}`);
        else if (p.car != null) segs.push(tr({ it: `auto ${p.car}${p.carWritten ? ' scritta' : ' già a posto'}`, en: `car ${p.car}${p.carWritten ? ' written' : ' already set'}` }));
        if (p.weatherError) segs.push(tr({ it: 'meteo da sistemare a mano', en: 'set the weather by hand' }));
        else if (p.weather != null) segs.push(tr({ it: `meteo ${p.weather}`, en: `weather ${p.weather}` }));
        if (p.aiError) segs.push(tr({ it: 'difficoltà da impostare a mano agli slider di EVO', en: 'set the AI difficulty by hand on the EVO sliders' }));
        else if (p.ai != null) segs.push(tr({ it: `difficoltà ${p.ai}`, en: `AI ${p.ai}` }));
        if (p.hourError) segs.push(tr({ it: 'ora da impostare a mano in EVO', en: 'set the hour by hand in EVO' }));
        else if (p.hour != null) segs.push(tr({ it: `ora ${p.hour}`, en: `hour ${p.hour}` }));
        if (p.lapsError) segs.push(tr({ it: 'giri da impostare a mano in EVO', en: 'set the laps by hand in EVO' }));
        else if (p.laps != null) segs.push(tr({ it: `giri ${p.laps}`, en: `laps ${p.laps}` }));
        if (p.crashAdvice) segs.push(p.crashAdvice);
        if (p.guestsError) segs.push(tr({ it: `griglia non riscritta (${p.guestsError})`, en: `grid NOT rewritten (${p.guestsError})` }));
        else if (p.guests != null) segs.push(tr({ it: `griglia evento: ${p.guests}`, en: `event grid: ${p.guests}` }));
        // il motivo REALE del mancato avvio appare nel toast (24/10: «simply not launched»
// non diceva nulla — era l'unico indizio di gioco/Steam non raggiungibili)
const launchErr = r.launched?.error ? ` (${String(r.launched.error).split('\n')[0]})` : '';
const note = r.gameRunning ? tr({ it: 'EVO è già aperto', en: 'EVO is already open' }) : (r.launched && !r.launched.error ? tr({ it: 'EVO avviato', en: 'EVO launched' }) : tr({ it: `EVO non avviato: aprilo tu${launchErr}`, en: `EVO not launched: open it yourself${launchErr}` }));
        const righe = [`${tr({ it: 'Gara speciale pronta', en: 'Special race ready' })}:`, ...segs.map(s => s.startsWith('⚠') ? s : `· ${s}`), note];
        prepConsole(righe);
      } catch(e){ prepConsole([`✖ ${e.message}`]); }
      if (btn) { btn.disabled = false; btn.textContent = tr({ it: '🏁 Prepara tutto e divertiti', en: '🏁 Get everything ready and have fun' }); }
    });
    // Verifica LIVE della scheda evento: stesso meccanismo della barra della card
    // gara (pollLive più sotto), ma il server riceve event:true e costruisce le
    // attese dalla scheda del pannello Eventi. La barra muore se il pannello si ridisegna.
    const bar = $('#ev-livebar', el);
    const pollEv = async () => {
      if (!document.body.contains(bar)) return;
      try {
        const r = await api('live', { event: true });
        if (!document.body.contains(bar)) return;
        if (!r.game) {
          bar.className = 'livebar live-off';
          bar.innerHTML = `<span class="dot"></span><span class="st">${tr({ it: 'Live evento', en: 'Live event' })}</span><span class="muted">${tr({ it: 'EVO chiuso — la verifica parte quando lo apri', en: 'EVO closed — the check starts when you open it' })}</span>`;
        } else if (r.waiting || !r.check?.rows?.length) {
          bar.className = 'livebar live-off';
          bar.innerHTML = `<span class="dot on"></span><span class="st">${tr({ it: 'EVO aperto', en: 'EVO open' })}</span><span class="muted">— ${tr({ it: 'carica la sessione e la verifica parte da sola', en: 'load the session and the check starts by itself' })}</span>`;
        } else {
          const okN = r.check.rows.filter(x=>x.ok).length;
          bar.className = r.check.ready ? 'livebar live-ok' : 'livebar live-bad';
          const det = r.check.rows.map(x=>`<div class="ckrow"><span class="mark">${x.ok?'✅':'❌'}</span><span class="k">${esc(x.key)}</span>${x.ok?`<span class="lv">${esc(x.live)}</span>`:`<span class="exp">${esc(x.expected ?? '?')}</span> <span class="lv" style="color:var(--warn)">${esc(x.live ?? '—')}</span>`}</div>`).join('');
          bar.innerHTML = `<span class="dot ${r.check.ready?'on':''}"></span><span class="st">${tr({ it: 'Evento: ', en: 'Event: ' })}${esc(v.active.theme.name)}</span><span class="muted">${okN}/${r.check.rows.length} ${tr({ it: 'ok', en: 'ok' })}</span><div style="width:100%">${det}</div>`;
        }
      } catch { /* server occupato: si riprova al prossimo giro */ }
      setTimeout(pollEv, 2000);
    };
    pollEv();
  } catch { el.innerHTML = `<h2>${tr({ it: 'Eventi speciali', en: 'Special events' })}</h2><div class="empty">${tr({ it: 'Non disponibile', en: 'Not available' })}.</div>`; }
}

function msgRow(m){
  return `<div class="msg ${esc(m.kind||'')}"><span class="d">${esc((m.at||'').slice(0,10))}</span><span class="t">${esc(legacyIt(m.text||''))}</span></div>`;
}

function drawCardInto(el, card){
  // CHIP RIVALI CLICCABILI: il nome nella scheda gara apre la scheda completa
  // del rivale (showRival in viste-d.js, subito dopo nel load). Se la chiave
  // non è in registro (rivale mai incassato), toast chiaro invece di errore.
  requestAnimationFrame(() => {
    $$('.chip[data-rival]', el).forEach(c => { c.onclick = () => {
      const k = c.dataset.rival;
      if (!k) { toast(tr({ it: 'Rivale non ancora in registro: arriva all\u2019import della gara.', en: 'Rival not in the registry yet: it comes with the race import.' }), 'info'); return; }
      if (typeof showRival === 'function') showRival(k);
      else toast(tr({ it: 'Scheda rivali non disponibile in questa vista.', en: 'Rival sheet not available in this view.' }), 'err');
    }; });
  });
  if (card.seasonDone){
    el.innerHTML = `<h2>${LI.medal} ${tr({ it: 'Stagione completata', en: 'Season completed' })}</h2>
      <div class="muted">${tr({ it: 'Hai chiuso il calendario di ', en: 'You closed the calendar of ' })}${esc(card.nodeDisplay)}${tr({ it: ': arriva il momento del bilancio e delle offerte.', en: ': time for the review and the offers.' })}</div>
      <div class="row" style="margin-top:16px"><button class="act" id="b-season-end">${tr({ it: 'Chiudi la stagione', en: 'Close the season' })}</button></div>`;
    $('#b-season-end', el).onclick = () => seasonEndFlow(false);
    return;
  }
  el.innerHTML = `<h2>${LI.flag} ${tr({ it: 'Prossima gara', en: 'Next race' })} <span class="h-act">R${card.roundIndex+1} ${tr({ it: 'di', en: 'of' })} ${card.totalRounds}${card.agendaDayLabel ? ` · ${esc(card.agendaDayLabel)}` : ''}</span></h2>

    <div class="title">${CFLAG} ${esc(card.roundName)}</div>
    <div class="sub">${window.serLinkHtml(card.nodeDisplay, { node: card.nodeId })} · ${tr({ it: 'iscrizione ', en: 'entry fee ' })}${money(card.entryFee)} € · ${tr({ it: 'si paga una volta per round', en: 'paid once per round' })}${card.agendaDay ? (card.agendaDay <= (boot.header?.day ?? 0) ? '' : ' · ' + tr({ it: 'in calendario per il ', en: 'scheduled for ' }) + esc(card.agendaDayLabel ?? (tr({ it: 'giorno ', en: 'day ' }) + card.agendaDay))) : ''}</div>
    ${card.weekendSeen === false ? `<div class="banner warn" style="margin-top:10px">🚩 <b>${tr({ it: 'Prima volta in EVO: apri una volta il Race Weekend', en: 'First time in EVO: open the Race Weekend once' })}</b> — ${tr({ it: 'entra nel menu del gioco e fai comparire la schermata «Race Weekend» del round UNA volta (basta vederla, non serve correre): senza quel passaggio «Prepara tutto» non trova niente. Già che ci sei, muovi il selettore <b>Grid Type su CUSTOM</b> e non toccarlo più: risolto una volta per tutte — e per le gare multiclasse serve comunque.', en: 'enter the game menu and show the round\'s «Race Weekend» screen ONCE (seeing it is enough — no need to run anything): without that step «Get everything ready» finds nothing. While you are there, move the <b>Grid Type selector to CUSTOM</b> and never touch it again: that solves it once and for all — and multiclass races need it anyway.' })}</div>` : ''}
    ${card.carImage ? `<div style="display:flex;align-items:center;gap:12px;margin:8px 0 4px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel2,#121822)">
      <img src="${card.carImage}" alt="${esc(card.carName ?? '')}" style="width:150px;aspect-ratio:16/9;object-fit:cover;border-radius:8px;background:#0d1118">
      <div style="font-size:12.5px;flex:none;min-width:180px;max-width:250px"><b>${tr({ it: 'Auto della giornata', en: "Today's car" })}</b><br>${window.carLinkHtml(card.carName)}
        ${card.carChoices?.length>1 ? `<select id="sel-car" title="${tr({ it: 'cambia la sezionale di oggi fra quelle ammesse dal weekend', en: "switch today's car among the ones the weekend allows" })}" style="width:100%;margin-top:5px;font-size:11.5px">${card.carChoices.map(c=>`<option value="${esc(c.id)}"${c.id===card.car?' selected':''}>${esc(c.display)}</option>`).join('')}</select>` : `<select id="sel-car" style="width:100%;margin-top:5px;font-size:11.5px" title="${tr({ it: 'unica auto ammessa dal weekend', en: 'the only car the weekend allows' })}"><option value="${esc(card.car ?? '')}" selected>${esc(card.carName ?? '')}</option></select>`}
      </div>
    </div>` : ''}
    ${card.gridRitual ? `<div class="banner info" style="margin-top:8px">🏁 <b>${tr({ it: 'Nuova serie, griglia da sbloccare (una volta sola)', en: 'New series, grid to unlock (once only)' })}</b> — <span style="font-size:11.5px">${esc(card.gridRitual)}</span></div>` : ''}

    ${card.boxRadio?.tips?.length ? `<details style="margin-top:8px" open><summary style="cursor:pointer;font-size:12px"><b>${window.mechIcon ? window.mechIcon(13) : '📻'} ${tr({ it: 'Consigli dal BOX', en: 'BOX tips' })}</b> <span class="muted" style="font-size:11px">— ${tr({ it: "la scheda dell'ingegnere di gara, personale del meccanico", en: "the race engineer's sheet, the mechanic's staff" })}</span></summary>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${card.boxRadio.tips.map(t=>`<div style="display:flex;gap:10px;align-items:flex-start;background:var(--panel2,#121822);border:1px solid var(--line);border-radius:8px;padding:7px 10px"><span style="flex:none;font-size:15px">${t.icon}</span><div style="font-size:12px;line-height:1.45"><b>${esc(t.title)}</b> — <span class="muted">${esc(t.text)}</span></div></div>`).join('')}</div></details>` : ''}
    <div id="ingegnere-live" style="margin-top:10px"></div>
    ${card.outlook ? `<div style="margin-top:10px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel2,#151a24)">
      <div style="font-size:12px;margin-bottom:4px"><b>${tr({ it: 'Obiettivo giro', en: 'Lap target' })}</b> · ${card.outlook.lapTarget ? `${tr({ it: 'il tuo best qui: ', en: 'your best here: ' })}<b style="color:var(--acc)">${esc(card.outlook.lapTarget.time)}</b> <span class="muted">(${window.carLinkHtml(card.outlook.lapTarget.car ?? '')}, ${esc((card.outlook.lapTarget.at||'').slice(0,10))})</span>` : `<span class="muted">${tr({ it: 'prima volta su questo tracciato: tutto da scrivere', en: 'first time on this track: everything to write down' })}</span>`}${card.outlook.mastery ? ` · <span class="tag ${card.outlook.mastery.level>=3?'gold':'blue'}" style="font-size:10px;padding:1px 6px">${tr({ it: 'maestria: ', en: 'mastery: ' })}${esc(card.outlook.mastery.name)}</span>` : ''}</div>
      <div style="font-size:12px;margin-bottom:4px"><b>${tr({ it: 'Stagione', en: 'Season' })}</b> · ${card.outlook.standingPosition?`P${card.outlook.standingPosition} ${tr({ it: 'in classifica · ', en: 'in the standings · ' })}`:''}${card.outlook.racesRun}/${card.outlook.totalRounds} ${tr({ it: 'gare corse', en: 'races run' })} · ${card.outlook.seasonPoints} ${tr({ it: 'punti', en: 'points' })}${card.outlook.duel?` · ⚔️ ${tr({ it: 'duello con <b>', en: 'duel with <b>' })}${esc(card.outlook.duel.name)}</b> ${tr({ it: 'a ', en: 'at ' })}${card.outlook.duel.gap} pt`:''}${card.outlook.crowd?` · <span title="${tr({ it: 'stima spettatori dalla pista', en: 'crowd estimate from the track' })}">🧑‍🤝‍🧑 ${(card.outlook.crowd/1000).toFixed(0)}k ${tr({ it: 'attesi', en: 'expected' })}</span>`:''}</div>
      ${card.outlook.contract?.length ? `<div style="font-size:12px;margin-bottom:4px"><b>${tr({ it: 'Contratto', en: 'Contract' })}</b> · ${card.outlook.contract.map(c=>`<span title="${esc(c.progress)}" style="white-space:nowrap">${c.decided===false?'<span style="color:var(--bad)">✗</span>':c.ok?'<span style="color:var(--good)">✓</span>':'•'} ${esc(c.text.split(' ').slice(0,4).join(' '))}…</span>`).join(' ')}</div>` : ''}
    ${(card.timeMultiplier ?? 1) !== 1 ? `<div style="font-size:12px;margin-bottom:4px"><b>${tr({ it: 'Tempo', en: 'Time' })}</b> · ${tr({ it: 'moltiplicatore consigliato: ', en: 'suggested multiplier: ' })}<b>${card.timeMultiplier}x</b> <span class="muted">(${tr({ it: 'col gioco che corre più in fretta il pomeriggio si comprime: le ore di sessione restano quelle del calendario', en: 'with the game running faster the afternoon compresses: the session hours stay the ones of the calendar' })})</span></div>` : ''}
      ${(card.outlook.rivals ?? []).length > 0 ? `<div style="font-size:12px;margin-top:6px"><b>${tr({ it: 'Rivali già visti', en: 'Rivals already faced' })}</b> <span class="muted" style="font-size:10.5px">${tr({ it: '· clicca un nome per la scheda completa', en: '· click a name for the full sheet' })}</span>
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${(card.outlook.rivals || []).map(r=>`<span class="chip ${r.h2h.beats>r.h2h.losses?'':'gold'}" data-rival="${esc(r.key??'')}" data-name="${esc(r.name)}" style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;flex-wrap:wrap;font-size:11px">
              ${typeof rivalAvatar==='function'?rivalAvatar(r.name, 22):''}
              <b>${esc(r.name)}</b>${r.team?`<span class="muted" style="font-size:10.5px">${esc(r.team)}</span>`:''}
              ${(r.form ?? []).length ? `<span style="display:inline-flex;gap:3px;align-items:center">${tr({ it: 'forma:', en: 'form:' })} ${(r.form||[]).map(f=>`<span class="chip ${f==='DNF'?'':Number(f)<=3?'gold':''}" style="font-size:10px;padding:1px 6px">${f}</span>`).join(' ')}</span>` : ''}
              ${r.trend==null?'':r.trend>0?`<span class="tag green" style="font-size:10px;padding:1px 6px">▲ +${r.trend} ${tr({ it: 'in salita', en: 'rising' })}</span>`:r.trend<0?`<span class="tag bad" style="font-size:10px;padding:1px 6px">▼ ${r.trend} ${tr({ it: 'in declino', en: 'declining' })}</span>`:''}
              <span class="tag ${r.h2h.beats>r.h2h.losses?'red':'green'}" style="font-size:10px;padding:1px 6px">${r.h2h.losses}–${r.h2h.beats}</span>
              <span class="muted" style="font-size:10px;margin-left:auto">${tr({ it: 'scontri in serie', en: 'series meetings' })} ${r.inSeries ?? ''}</span>
            </span>`).join('')}</div>
        </div>` : ''}
    </div>` : ''}
    ${card.outlook?.trackInfo ? `<div style="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2,#121822);display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      ${card.outlook.trackInfo.map ? `<img src="${card.outlook.trackInfo.map}" alt="${tr({ it: 'tracciato di ', en: 'track layout of ' })}${esc(card.trackName)}" style="width:180px;height:118px;flex:none;object-fit:contain;background:#000;border-radius:8px;padding:8px${card.outlook.trackInfo.map.endsWith('.svg')?';filter:invert(1);opacity:.92':''}">` : (card.outlook.trackInfo.outline ? `<svg viewBox="0 0 100 64" style="width:170px;height:110px;flex:none;background:#0d1118;border-radius:8px;padding:6px" aria-label="${tr({ it: 'tracciato di ', en: 'track layout of ' })}${esc(card.trackName)}"><path d="${card.outlook.trackInfo.outline}" fill="none" stroke="var(--acc)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>` : '')}
      <div style="flex:1;min-width:230px">
        <div style="font-size:13px;margin-bottom:5px"><b>${flagOf(card.outlook.trackInfo.country)} ${window.trackLinkHtml(card.trackName)}</b> <span class="muted">· ${esc(tr({ it: card.outlook.trackInfo.nick, en: card.outlook.trackInfo.nickEn }))} · ${esc(tr({ it: card.outlook.trackInfo.country, en: card.outlook.trackInfo.countryEn }))} · ${card.outlook.trackInfo.lengthKm} km, ${card.outlook.trackInfo.corners} ${tr({ it: 'curve', en: 'corners' })}, ${tr({ it: 'dal ', en: 'opened in ' })}${card.outlook.trackInfo.opened}</span></div>
        ${card.outlook.trackRec ? `<div style="font-size:12.5px"><b>${tr({ it: '🏁 Giro più veloce in pista', en: '🏁 Fastest lap of the track' })}</b> · <b style="color:var(--acc);font-size:15px">${esc(card.outlook.trackRec.time)}</b> — ${esc(card.outlook.trackRec.driver)}${card.outlook.trackRec.mine?` <span class="tag green" style="font-size:10px;padding:1px 6px">${tr({ it: 'tu', en: 'you' })}</span>`:''}<br><span class="muted">${window.carLinkHtml(card.outlook.trackRec.car ?? '')}${card.outlook.trackRec.sameCar?'':' · ' + tr({ it: 'altra auto', en: 'another car' })} · ${esc((card.outlook.trackRec.at ?? '').slice(0, 10))}${card.outlook.lapTarget&&card.outlook.lapTarget.time!==card.outlook.trackRec.time?` · ${tr({ it: 'il tuo migliore: ', en: 'your best: ' })}${esc(card.outlook.lapTarget.time)}`:''}</span></div>` : ''}
        <details style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:12px">📖 ${tr({ it: 'la storia di ', en: 'the history of ' })}${esc(card.trackName)}</summary>
        <div class="muted" style="margin-top:5px;font-size:12px;line-height:1.55">${esc(tr({ it: card.outlook.trackInfo.history, en: card.outlook.trackInfo.historyEn }))}</div>
        <button class="mini" style="margin-top:6px" onclick="document.querySelector('#nav button[data-tab=tracks]').click()">${tr({ it: 'Apri il libro delle piste', en: 'Open the book of tracks' })}</button></details>
      </div>
    </div>` : ''}
    ${card.heritageActive ? `<div class="banner warn" style="margin-top:10px">📜 <b>${tr({ it: 'Impresa di famiglia: ', en: 'Family feat: ' })}${esc(tr({ it: card.heritageActive.title, en: card.heritageActive.titleEn ?? card.heritageActive.title }))}</b> — ${esc(card.heritageActive.ancestor)}, ${tr({ it: 'tuo ', en: 'your ' })}${esc(tr({ it: card.heritageActive.relation, en: card.heritageActive.relationEn ?? card.heritageActive.relation }))} (${esc(card.heritageActive.era)}). ${tr({ it: 'Questa gara vale per l\'obiettivo «', en: 'This race counts for the goal «' })}${esc(tr({ it: card.heritageActive.objective, en: card.heritageActive.objectiveEn ?? card.heritageActive.objective }))}» (${card.heritageActive.done}/${card.heritageActive.total} ${tr({ it: 'superate · eredità ', en: 'done · inheritance ' })}${money(card.heritageActive.inherit)} €).</div>` : ''}
    ${!card.heritageActive && card.heritageHint ? `<div class="banner info" style="margin-top:10px">📜 ${tr({ it: "L'impresa di famiglia ", en: 'The family feat ' })}${card.heritageHint ? tr({ it: 'prosegue a <b>', en: 'continues at <b>' })+esc(card.heritageHint)+'</b>' : ''}${tr({ it: ': corri la ronda indicata per farla contare (vedi pannello Eredità).', en: ': run the listed round to make it count (see the Heritage panel).' })}</div>` : ''}
    ${card.challenge && !card.challenge.verdict ? `<div class="banner ${card.challenge.accepted?'info':'warn'}" style="margin-top:10px">${LI.target} <b>${tr({ it: 'Sfida della ronda', en: 'Round challenge' })}</b> — ${esc(legacyIt(card.challenge.text))}<br><span class="muted">${tr({ it: 'facoltativa · premio ', en: 'optional · reward ' })}${money(card.challenge.reward)} € ${tr({ it: 'se ci riesci · −', en: 'if you make it · −' })}${card.challenge.penalty} rep ${tr({ it: 'se fallisci', en: 'if you fail' })}${card.challenge.accepted?` · <b>${tr({ it: 'accettata', en: 'accepted' })}</b>`:''}</span>${card.challenge.accepted?'':` <button class="mini" id="b-accept-chal" style="margin-top:6px">${tr({ it: 'Accetta la sfida', en: 'Accept the challenge' })}</button>`}</div>` : ''}
    ${card.pendingProposal ? `<div class="banner warn" style="margin-top:10px"><b>${tr({ it: '🎯 Il tool suggerisce il trim', en: '🎯 The tool suggests the trim' })}</b> ${esc(card.pendingProposal.reason)}: ${tr({ it: 'trim ', en: 'trim ' })}${card.pendingProposal.from >= 0 ? '+' : ''}${card.pendingProposal.from} → <b>${card.pendingProposal.to >= 0 ? '+' : ''}${card.pendingProposal.to}</b>. ${tr({ it: 'Accettare sposta anche la banda EVO della serie di ', en: 'Accepting also moves the series EVO band by ' })}${Math.abs((card.pendingProposal.to - card.pendingProposal.from) * 5)} ${tr({ it: 'punti (', en: 'points (' })}${card.pendingProposal.to > card.pendingProposal.from ? tr({ it: 'in salita', en: 'upward' }) : tr({ it: 'in discesa', en: 'downward' })}).<br>
      <button class="mini" id="b-prop-accept" style="margin-top:6px">${tr({ it: 'Accetta (trim ', en: 'Accept (trim ' })}${card.pendingProposal.to >= 0 ? '+' : ''}${card.pendingProposal.to})</button>
      <button class="mini" id="b-prop-reject" style="margin-top:6px;margin-left:6px">${tr({ it: 'Rifiuta', en: 'Reject' })}</button></div>` : ''}
    ${card.difficulty?.trim >= (20) ? `<div class="banner warn" style="margin-top:10px"><b>${tr({ it: 'Difficoltà al massimo', en: 'Difficulty at the max' })}</b> — ${tr({ it: 'il trim adattivo è arrivato a +20 e la serie resta troppo facile: il passo successivo è passare a una serie più alta (bottone 🎯 nel cruscotto).', en: 'the adaptive trim reached +20 and the series still feels too easy: the next step is moving up to a higher series (the 🎯 button in the dashboard).' })}</div>` : ''}
    <div class="panel" style="margin-top:12px; padding:14px 16px" id="rs-panel">
      <h2 style="margin-bottom:10px">${LI.gauge} ${tr({ it: 'Regole di questo weekend', en: 'Rules of this weekend' })} <span class="h-act">${tr({ it: 'banda AI a 84–85%: poi comanda il trim (pannello Difficoltà)', en: 'AI band at 84–85%: the trim takes it from there (Difficulty panel)' })}</span></h2>
      <div class="rs-grid">
        <div class="field" style="grid-column:1/-1;border:1px solid var(--line,#2a3341);border-radius:8px;padding:8px 10px">
          <b>${tr({ it: `Difficoltà AI ${card.difficulty.rangeMin}–${card.difficulty.rangeMax}%`, en: `AI difficulty ${card.difficulty.rangeMin}–${card.difficulty.rangeMax}%` })}</b> — <span class="muted" style="font-size:12px">${tr({ it: 'è quella di serie: parte da 84–85% e si muove col trim adattivo (e coi tasti ±1/±2/±3 del cruscotto se serve). Per regolarla a mano: pannello Difficoltà — la variante a mano non vive più qui.', en: 'of the series: it starts at 84–85% and moves with the adaptive trim (and with the dashboard ±1/±2/±3 arrows if needed). To set it by hand: the Difficulty panel — the manual control no longer lives here.' })}</span>
        </div>
        <div class="field"><label>${tr({ it: 'Inizio prove libere (ora del gioco)', en: 'Practice start (game time)' })}</label><input type="number" id="rs-pstart" min="0" max="23" value="${card.practiceStart}"></div>
        <div class="field"><label>${tr({ it: 'Inizio qualifiche (ora del gioco)', en: 'Qualifying start (game time)' })}</label><input type="number" id="rs-qstart" min="0" max="23" value="${card.qualifyStart}"></div>
        <div class="field"><label>${tr({ it: 'Inizio warm-up (ora del gioco)', en: 'Warm-up start (game time)' })}</label><input type="number" id="rs-wstart" min="0" max="23" value="${card.warmupStart ?? ''}"></div>
        <div class="field"><label>${tr({ it: 'Partenza gara (ora del gioco)', en: 'Race start (game time)' })}</label><input type="number" id="rs-rstart" min="0" max="23" value="${card.raceHour ?? ''}"></div>
        <div class="field"><label>${tr({ it: 'Moltiplicatore tempo', en: 'Time multiplier' })}</label>
          <select id="rs-time">${[1,2,3,4,5,6,8,10,12,24,48].map(t=>`<option value="${t}" ${t===(card.timeMultiplier??1)?'selected':''}>${t}x</option>`).join('')}</select>
        </div>
        <div class="field"><label>${tr({ it: 'Piano orario della serie', en: 'Series time plan' })} <span class="faint">(${tr({ it: 'notte, tramonto→alba, orari variabili', en: 'night, sunset→dawn, variable times' })})</span></label>
          <select id="rs-piano">
            <option value="">— ${tr({ it: 'nessun piano (orari del calendario)', en: 'no plan (calendar times)' })} —</option>
            ${Object.entries(card.piani||{}).map(([id,p])=>`<option value="${id}" ${card.pianoCurrent===id?'selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>${tr({ it: 'Distanza gara', en: 'Race distance' })} <span class="faint">(${tr({ it: 'piena: ', en: 'full: ' })}${card.baseLaps ?? card.round.laps} ${tr({ it: 'giri · premio ', en: 'laps · prize ' })}${money(card.prizeFull ?? card.round.econ?.prize)} €)</span></label>
          <select id="rs-dist">${[100,75,50,25].map(p=>`<option value="${p}" ${p===(card.distPct??100)?'selected':''}>${p}% — ${Math.max(2,Math.round((card.baseLaps ?? card.round.laps)*p/100))} ${tr({ it: 'giri · premio fino a ', en: 'laps · prize up to ' })}${money(Math.round((card.prizeFull ?? 0)*p/100))} €</option>`).join('')}</select>
        </div>
        <div class="row" style="align-items:end"><button class="mini" id="rs-save">${tr({ it: 'Salva regole', en: 'Save rules' })}</button><button class="mini" id="rs-reset">${tr({ it: 'Torna ai consigli', en: 'Back to suggestions' })}</button></div>
      </div>
      <div class="muted" style="font-size:11.5px;margin-top:8px">${tr({ it: 'Aggressività AI ' + card.aggression + '% (bloccata in EVO) · «Torna ai consigli» azzera le tue scelte.', en: 'AI aggression ' + card.aggression + '% (locked in EVO) · “Back to suggestions” clears your choices.' })}</div>
    </div>
    <div style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(152px,1fr));gap:8px" id="prep-data">
      ${(() => {
        const setRow = (pref) => (card.settings.find(([k]) => k.startsWith(pref)) ?? [])[1] ?? '—';
        return [
        [tr({ it: 'Auto', en: 'Car' }), setRow('Auto')],
        [tr({ it: 'Avversari', en: 'Opponents' }), setRow('Avversari')],
        [tr({ it: 'Gara', en: 'Race' }), setRow('Gara')],
        [tr({ it: 'Ora del giorno', en: 'Time of day' }), setRow('Ora')],
        [tr({ it: 'Meteo', en: 'Weather' }), setRow('Meteo')],
        [tr({ it: 'Partenza', en: 'Start' }), setRow('Partenza')],
        [tr({ it: 'Difficoltà AI', en: 'AI difficulty' }), `${card.difficulty.rangeMin}–${card.difficulty.rangeMax}%`],
        ];
      })().map(([k, v]) => `<div style="border:1px solid var(--line,#2a3341);border-radius:8px;padding:8px 10px;background:var(--panel2,#121822)">
        <div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:1px">${esc(k)}</div>
        <div style="font-size:13px;font-weight:600;margin-top:2px">${k === 'Auto' && v && v !== '—' ? `<span style="cursor:pointer;text-decoration:underline dotted" title="${tr({ it: 'apri la scheda tecnica dell\'auto', en: 'open the car spec sheet' })}" onclick="vai('cars',{search:'${String(v).replace(/'/g, "\\'")}'})">${esc(v)}</span>` : esc(v)}</div>
      </div>`).join('')}
    </div>
    <details style="margin-top:8px"><summary class="muted" style="cursor:pointer;font-size:12px">${tr({ it: 'ⓘ Tutte le impostazioni del round', en: 'ⓘ All round settings' })}</summary>
      <table style="margin-top:6px"><tbody>${card.settings.map(([k,v])=>`<tr><td style="width:150px" class="muted">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    </details>
    ${card.warnings.length ? `<ul class="warnlist">${card.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    <div class="row" style="margin-top:16px">
      <button class="ghost" id="b-copy">${tr({ it: 'Copia scheda', en: 'Copy sheet' })}</button>
    </div>    <button class="act" id="b-race" style="width:100%;margin-top:10px">${tr({ it: '🏁 Prepara tutto e divertiti', en: '🏁 Get everything ready and have fun' })}</button>
    <div class="muted" style="margin-top:10px">${tr({ it: 'Tutto qui sopra lo scrive in EVO «Prepara tutto e divertiti»: pista, griglia, auto e regole. Se una riga non torna, ripremi il bottone.', en: 'Everything above gets written into EVO by “Get everything ready and have fun”: track, grid, car and rules. If a row looks off, press the button again.' })}</div>`;
  // RADIO LIVE DELL'INGEGNERE: benzina residua, usura gomme, gap — dati veri
  // della shared memory mentre il gioco gira. Se non c'è gara in corso il
  // pannello resta buio (nessun rumore, il cruscotto non si sporca).
  // DAL 23/10 dentro la radio anche: il DELTA DI RITMO (giro corrente vs best
  // della sessione), la MAPPA «dove perdo tempo» e la FINESTRA PIT, più il
  // COPILOTA VOCALE (speechSynthesis, tutto locale): le stesse info dette con
  // la voce, perché in gara il monitor non lo si guarda.
  window.__ingLiveStop?.();
  const ingOut = $('#ingegnere-live', el);
  // richiesti 25/10: copilota ATTIVO DI DEFAULT (spegnibile col bottone: la
  // scelta resta nel localStorage e esplicitamente 'off' vince sempre)
  // 24/10 (pomeriggio): last/at sono LE FRECCE dei narratori — se sopravvivono
  // alla sessione precedente il copilota parlava di giri che non c'entravano
  // («sto finendo il giro 1» mentre si parte): FIX, appena la live torna viva
  // si azzera il tutto e resta muta 15 s (le shared memory dell'EVO nascono
  // con i valori della sessione prima: i primi tick sono dati bruciati).
  window.__copilot ??= { on: localStorage.getItem('evo-copilot') !== 'off', last: {}, at: 0, seenLive: false, grace: 0 };
  const cp = window.__copilot;
  // LINGUA DEL COPILOTA (27/10, Mauro): SEMPRE ITALIANO, anche con UI inglese
  // («in inglese non capisco bene», e cambiare lingua al gioco rompe Paddock).
  // cpT() è tr() che prende sempre il testo «it»: la UI resta inglese, la VOCE
  // no. Tutto ciò che la copilota dice passa da cpT — comodo da tornare indietro.
  const cpT = (p) => (p ? (p.it ?? '') : '');
  /* la voce: speechSynthesis del browser, locale al 100%. DAL 27/10 LA VOCE NON
     SEGUE PIÙ l'interfaccia: parla sempre it-IT, comunque sia impostata la UI
     (prima seguiva window.LINGUA e con UI inglese Mauro non capiva). Nessuna
     voce italiana installata = voce di sistema (il testo resta corretto). */
  /* La lista delle voci del browser si carica ASINCRONA (Chrome/Edge): al
     primo discorso getVoices() è VUOTA e resta la voce di sistema — sulla
     UI inglese parlava italiano (24/10, Mauro: «ora parla solo italiano»).
     Cache + onvoiceschanged + scandenza: la voce scelta È quella della
     lingua dell'interfaccia, identica esatta → prefisso → default. Se la
     lingua attiva non ha NESSUNA voce installata lo dICO una volta sola. */
  cp.voci = cp.voci ?? { lista: null, avvisata: {} };
  /* LIMITE DI TEMPO, STESSA FRASE (28/10, pomeriggio, Mauro): con last a zero
     dopo la firma (o un buco live=false) la voce può ripartire a borda:
     «Meta gara» già parlata nel turno prima e REANNUnciata 10 volte di fila
     mentre lapsOnFuel slitta di centesimi a ogni tick (2:42 vs 2:30Mehr).
     cpSay ha già il suo slock, ma questo qui vale per TUTTI i discorsi
     (metaBenzina usa cpSpeak diretto): niente ripetizioni IDENTICHE prima
     di 70 secondi — duello in pista, un giro di respirazione e lo dico
     di nuovo se serve davvero. */
  cp.detti ??= {};
  const cpDettoRecente = (text) => {
    const last = cp.detti[text];
    if (last && Date.now() - last < 70000) return true;
    cp.detti[text] = Date.now();
    return false;
  };
  const voiceRelod = () => { cp.voci.lista = null; };
  const vociDi = () => {
    const vs = speechSynthesis.getVoices?.() ?? [];
    if (vs.length) { cp.voci.lista = vs; return vs; }
    if (cp.voci.lista) return cp.voci.lista;
    return [];
  };
  try {
    speechSynthesis.onvoiceschanged = voiceRelod;
    // alcuni browser non sparano l'evento: un giro di getVoices() accende la lista
    setTimeout(() => { cp.voci.lista = speechSynthesis.getVoices?.() ?? cp.voci.lista; }, 600);
  } catch { /* compatibilità */ }
  const cpSpeak = (text) => {
    if (!text) return;
    try {
      // 27/10: SEMPRE it-IT — la lingua dell'interfaccia non la cambia più
      // (Mauro guida con UI inglese per Paddock, ma vuole la voce italiana).
      const lv = 'it';
      const norm = (s) => String(s ?? '').toLowerCase().replace('_', '-');
      const vs = vociDi();
      // SELEZIONE voce italiana (27/10 FIX «la copilota non parla più»):
      // era arrivata solo la riga `if (v) u.voice = v;` SENZA la selezione —
      // `v` inesistente → ReferenceError dentro il try → catch tace →
      // speechSynthesis.speak() MAI chiamato: la copilota muta senza errori.
      // Sceglie come la prova voce: esatta it-it → prefisso it → nome «Italian».
      // (29/10, Mauro: «rimetti la voce dell'uomo»): prima la it-it MASCHILE
      // (Cosimo/Roberto/Marco, quelle che c'entrano con la copilota di sempre),
      // Elsa resta solo come ripiego.
      const eMaschile = (vv) => /cosimo|roberto|marco/i.test(String(vv.name ?? '') + ' ' + String(vv.voiceURI ?? ''));
      const v = vs.find((vv) => norm(vv.lang) === 'it-it' && eMaschile(vv))
        ?? vs.find((vv) => norm(vv.lang) === 'it-it')
        ?? vs.find((vv) => norm(vv.lang).startsWith('it') && eMaschile(vv))
        ?? vs.find((vv) => norm(vv.lang).startsWith('it'))
        ?? vs.find((vv) => /ital/i.test(String(vv.name ?? '') + String(vv.voiceURI ?? '')));
      /* 27/10 SERA (la voce continuava a uscire in inglese): la lista delle
         voci del browser arriva ASINCRONA e al PRIMO messaggio (banalmente
         «Copilota attivo», tre secondi dall'avvio) era ancora Vuota: senza
         voce specificata Chrome segnava il testo a quella PREDEFINITA del
         sistema — David/Zira [en-US] anche se Elsa [it-IT] c'è. Ora il primo
         messaggio ATTESA la lista (600 ms) e con la lista dentro riparte
         stesso testo, stessa voce: non si perde niente, non parte un'ora
         col timbro sbagliato. — dopo tre attese s'A parla comunque, con la
         voce di default: meglio un discorso ammiccato che un buco. */
      if (!vs.length) {
        cp.voci.attesa = (cp.voci.attesa ?? 0) + 1;
        if (cp.voci.attesa <= 4) { setTimeout(() => cpSpeak(text), 420); return; }
      } else cp.voci.attesa = 0;
      /* la GUARDIA sul testo sta QUI, non in testa (28/10 sera): i retry
         dell'attesa voci (setTimeout 420 ms) ripasavano dalla stessa
         funzione e la guardia — che registra l'istante ANCHE quando ritorna
         falso — li inghiottiva: la voce di sistema parlava SOLO al primo
         tentativo (lista ancora vuota) e tutti i successivi tacevano per
         «stessa frase di 70 s». Ora la frase è registrata solo quando la
         voce esce davvero. */
      if (cpDettoRecente(text)) return;   // stessa frase già detta da poco: tace
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'it-IT'; u.rate = 1.1; u.volume = 0.9;
      if (v) u.voice = v;
      if (!v && !cp.voci.avvisata[lv] && vs.length) {
        cp.voci.avvisata[lv] = true;
        toast(tr({
          it: `Voce copilota: nel sistema NON c'è una voce italiana (le voci viste: ${vs.slice(0, 6).map((x) => `${x.name} [${x.lang}]`).join(' · ')}). Il testo è comunque in italiano, ma il timbro può sembrare inglese. Pannello Windows → Voce → Aggiungi voci: «Français»/«Italiano», poi riapri l'app.`,
          en: `Copilot voice: NO Italian voice on this system (voices seen: ${vs.slice(0, 6).map((x) => `${x.name} [${x.lang}]`).join(' · ')}). The text stays Italian, but the timbre may sound English. Windows Settings → Speech → Add voices: Italian, then reopen the app.`,
        }), 'warn');
      }
      /* RETTORE DI CODA (28/10 sera, Mauro: «ultimo giro» e le posizioni in
         ritardo): la coda di speechSynthesis NON si svuota da sola quando
         gli annunci si accodano più di quanto duri la voce — anche con il
         loop della meta già tolto restava un ritardo se un giro accidentato
         incrociava gomme+benzina+gap in fila. Oltre i 2 discorsi in coda,
         i VECCHI cedono il posto: la voce resta sul presente. */
      cp.coda ??= 0;
      if (cp.coda >= 2) { speechSynthesis.cancel(); cp.coda = 0; }
      cp.coda++;
      u.onend = () => { cp.coda = Math.max(0, cp.coda - 1); };
      u.onerror = u.onend;
      speechSynthesis.speak(u);
    } catch { /* la voce non deve mai rompere la vista */ }
  };
  /* i narratori che si ripetono: per categoria un distanziello di tempo, così
     il copilota parla quando CAMBIA qualcosa, non in Loop ogni 4 secondi */
  const cpSay = (k, text, gapMs = 9000) => {
    const now = Date.now();
    if (cp.last[k] && now - cp.last[k] < gapMs) return;
    cp.last[k] = now;
    cpSpeak(text);
  };
  /* 8d) GEMELLO DEL PITWALL (31/10, gara delle 14:24): la bandiera a scacchi
     NON grida mai PRIMA del «Giro X fatto»: nel gioco la crocetta raggiunge
     la MMF un istante prima che il contatore giri salga, così la bandiera
     parlava 4 s in anticipo. Se in questo tick è appena stato annunciato un
     giro (entro 4,5 s: la pagina ticca ogni 4 s) esce subito DOPO,
     altrimenti va in coda e parla al primo giro annunciato in un tick
     successivo — soccorso 10 s se il giro non arriva mai. */
  const bandParla = () => {
    const adesso = Date.now();
    if (Number.isFinite(cp.last.giroFattoOra) && adesso - cp.last.giroFattoOra < 4500) {
      cpSpeak(cpT({ it: 'Bandiera a scacchi!', en: 'Checkered flag!' }));
    } else cp.last.bandieraP = adesso;
  };
  const fmtDelta = (ms) => (ms == null || !Number.isFinite(ms) ? '—' : (ms < 0 ? '−' : '+') + (Math.abs(ms) / 1000).toFixed(2) + ' s');
  /* la MAPPA «dove perdo tempo»: il contorno del best lap con sopra le fette
     colorate del delta (verde = guadagni, rosso = perdi) e il punto dell'auto */
  const deltaMapSvg = (track, segments, carPos) => {
    if (!track || track.length < 6) return '';
    const xs = track.map((p) => p[0]), zs = track.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const W = 270, H = 200, PAD = 16;
    const sx = Math.max(1, maxX - minX), sz = Math.max(1, maxZ - minZ);
    const s = Math.min((W - 2 * PAD) / sx, (H - 2 * PAD) / sz);
    const X = (x) => +(PAD + (x - minX) * s).toFixed(1);
    const Z = (z) => +(PAD + (z - minZ) * s).toFixed(1);
    const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])},${Z(p[1])}`).join(' ');
    const n = track.length;
    // i tagli del delta fino in piazza: la traccia si scansiona a passi di strada
    // regolari (25 m), quindi la frazione di giro 0..1 sta circa Sugli INDICI
    const segs = (Array.isArray(segments) ? segments : []).map((se) => {
      if (se.dv == null || Math.abs(se.dv) <= 0.1) return '';
      const i0 = Math.max(0, Math.floor(se.p * n) - 1);
      const i1 = Math.min(n - 1, i0 + Math.max(2, Math.ceil(n / 40)));
      if (i1 - i0 < 1) return '';
      const col = se.dv > 0.1 ? '#f66' : '#7f7';
      const label = `${tr({ it: 'fetta di giro', en: 'lap slice' })} ${(se.p * 100).toFixed(0)}% · ${fmtDelta(se.dv * 1000)}`;
      return `<path d="${line(track.slice(i0, i1 + 1))}" fill="none" stroke="${col}" stroke-width="4.2" opacity="0.95" stroke-linecap="round"><title>${esc(label)}</title></path>`;
    }).join('');
    const car = carPos && Number.isFinite(carPos[0]) && Number.isFinite(carPos[1])
      ? `<circle cx="${X(carPos[0])}" cy="${Z(carPos[1])}" r="4.5" fill="#fff" stroke="#5da9ff" stroke-width="2"><title>${tr({ it: 'la tua auto adesso', en: 'your car now' })}</title></circle>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:290px;min-width:230px;background:#0d1118;border:1px solid var(--line);border-radius:8px" role="img">
      <path d="${line(track)}" fill="none" stroke="var(--dim,#5a6b85)" stroke-width="2" stroke-linejoin="round"/>
      ${segs}${car}
    </svg>`;
  };
  const ingDraw = async () => {
    if (!document.body.contains(ingOut)) { window.__ingLiveStop?.(); return; }
    try {
      const m = await api('ingegnere', {});
      if (!document.body.contains(ingOut)) return;
      if (!m?.live) { ingOut.innerHTML = ''; cp.prevLive = false; return; }
      /* sessione NUOVA (era morta o strtotime avvio pagina): memoria dei
         narratori a zero e 15 s di silenzio — le MMF del gioco portano i
         valori della sessione PRECEDENTE nei primi istanti */
      if (!cp.seenLive) {
        cp.seenLive = true;
        cp.prevLive = true;
        cp.last = {};
        cp.detti = {};
        cp.at = 0;
        cp.grace = Date.now() + 15000;
      }
      /* SESSIONE NUOVA ANCHE CON LA LIVE GIÀ ACCESA (28/10, Mauro: finito il
         caricamento della gara la copilota annunciava «posizione persa»
         rimettendo insieme la posizione della sessione prima con quella
         della gara nuova). L'impronta (eventId+sessionId+tipo) la scrive la
         MMF una volta per sessione: cambia = sessione cambiata → memoria
         a zero e 20 s di silenzio (i primi istanti del caricamento portano
         ancora i valori vecchi, poi quelli giusti). */
      const firmaSess = m.sessionId ?? null;
      if (firmaSess != null && firmaSess !== cp.firma) {
        cp.firma = firmaSess;
        cp.last = {};
        cp.detti = {};   // sessione vera nuova: le frasi possono ridirsi da capo
        cp.at = 0;
        cp.grace = Date.now() + 20000;
      }
      /* RESET A GARA NUOVA (28/10 tardissimo, Mauro: «copilota muto» nella
         gara DOPO la gara): tra due gare sulla STESSA pista la firma resta
         identica — in SP la sessionId della SM non cambia (0, e l'L di
         eventId anche) — e le last della gara prima SOFFOCAVANO i narratori
         della gara dopo: il contatore giri monotono si fermava al giro 4
         vecchio, «Ultimo giro!» risultava già detto, la benzina era
         seminata. Il ritorno visibile live=false→true = gara nuova di
         riflesso: memoria a zero e 15 s di grazia (l'attesa carica i primi
         istanti coi valori TRASCINATI della sessione prima). */
      if (cp.prevLive === false) {
        cp.prevLive = true;
        cp.last = {};
        cp.detti = {};
        cp.at = 0;
        cp.grace = Date.now() + 15000;
      }
      const wearRow = (m.gauges?.wear || []).length === 4 ? `<span class="muted" style="font-size:11px">${tr({ it: 'gomme', en: 'tyres' })} LF ${m.gauges.wear[0]}% · RF ${m.gauges.wear[1]}% · LR ${m.gauges.wear[2]}% · RR ${m.gauges.wear[3]}%${m.gauges.temp?.every(v=>v>0)?' · core '+m.gauges.temp.map(v=>v+'°C').join('/'):''}</span>` : '';
      /* --- DELTA DI RITMO: il numero grande che oggi non c'era --- */
      const dv = m.delta?.dv ?? m.delta?.hudDv ?? null;   // ms, con il segno
      const dvCol = dv == null ? 'var(--text)' : dv < 0 ? '#7f7' : '#f66';
      const dvSub = m.delta?.source === 'tracked'
        ? tr({ it: `vs il tuo best della sessione${m.timing?.bestLap ? ' ' + esc(m.timing.bestLap) : ''}`, en: `vs your session best${m.timing?.bestLap ? ' ' + esc(m.timing.bestLap) : ''}` })
        : tr({ it: "delta HUD del gioco — il tuo best si traccia al primo giro valido", en: "HUD delta — your best gets traced from the first valid lap" });
      const dvHtml = `<div style="flex:1;min-width:190px">
          <div style="font-size:40px;font-weight:800;color:${dvCol};line-height:1;letter-spacing:-1px">${esc(fmtDelta(dv))}</div>
          <div class="muted" style="font-size:11px;margin-top:3px">${dvSub}</div>
          <div class="muted" style="font-size:11px;margin-top:2px">${m.timing?.lastLap ? tr({ it: 'ultimo giro ', en: 'last lap ' }) + `<b>${esc(m.timing.lastLap)}</b>` : ''}${m.timing?.bestLap ? ` · ${tr({ it: 'best ', en: 'best ' })}${esc(m.timing.bestLap)}` : ''}${dv != null && dv < 0 ? ` · <span style="color:#7f7">${tr({ it: 'stai andando sotto', en: 'running quicker' })}</span>` : dv != null ? ` · <span style="color:#f66">${tr({ it: 'stai perdendo', en: 'losing time' })}</span>` : ''}</div>
        </div>`;
      /* --- FINESTRA PIT: quando fermarsi, prima che la gomma dica la sua --- */
      const pit = m.pit;
      const pitHtml = pit?.need
        ? `<div class="banner warn" style="margin-top:8px;padding:8px 10px"><b>🔧 ${tr({ it: 'Finestra pit', en: 'Pit window' })}</b> — ${esc(pit.reason)}. ${tr({ it: 'Fermarsi al giro ', en: 'Pit on lap ' })}<b>${pit.pitLap + 1}</b> ${pit.lapsToWindow === 0 ? tr({ it: '(aperta adesso)', en: '(open now)' }) : `· ${tr({ it: 'si apre tra ', en: 'opens in ' })}<b>${pit.lapsToWindow}</b> ${tr({ it: 'giri', en: 'laps' })}`} · <span class="muted">${tr({ it: 'fermarsi dopo perdere ~', en: 'staying out costs ~' })}${pit.pitLossSec}s</span></div>`
        : (pit && pit.need === null ? `<div class="muted" style="font-size:11px;margin-top:6px">🔧 ${esc(pit.reason)}</div>` : '');
      const mapHtml = deltaMapSvg(m.mapTrack, m.delta?.segments, m.carPos);
      /* VIGIA DEL PARCO AUTO (24/10, Mauro): se l'auto del sedile non è una di
         quelle ammesse della serie, il pannello lo dice SUBITO — in rosso —
         perché all'import quella gara vale zero (0 punti, 0 premio). */
      const auto = m.auto ?? null;
      /* VOCE LATO PITWALL (29/10): da oggi la voce non vive più SOLO qui in
         pagina — il server parla da solo (voce-copilota.mjs, relatore di
         Windows): in gara con la GUI chiusa o su un'altra scheda la copilota
         taceva del tutto — è LA CAUSA della serata muta del 28/10. Quando
         il server ha la voce la pagina NON ripete i narratori in locale
         (niente doppia radio) e il chip comanda il Pitwall via POST. */
      const voceServer = !!m.voceServer;
      const autoHtml = auto?.ammesse?.length && !auto.ok
        ? `<div class="banner warn" style="margin-top:8px;padding:8px 10px;border-color:#c33"><b>🚫 ${tr({ it: 'Auto fuori dal parco della serie', en: 'Car outside the series pool' })}</b> — ${esc(auto.mine ?? '?')} · ${tr({ it: 'ammesse: ', en: 'allowed: ' })}${esc(auto.ammesse.join(', '))} · <b>${tr({ it: 'all\'import vale 0 punti e 0 premio', en: 'scores 0 points and 0 prize at import' })}</b></div>`
        : '';  // in parco: nessun rumore
      ingOut.innerHTML = `<div class="panel" style="border:1px solid var(--line);border-radius:8px;padding:9px 12px;background:#0d1118">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="font-size:12px"><b>${tr({ it: '🎧 Ingegnere LIVE', en: '🎧 Engineer LIVE' })}</b> <span class="muted" style="font-size:11px">· P${m.gauges.position??'—'}/${m.gauges.drivers??'—'}${m.gauges.lapsTotal!=null?` · ${tr({ it: 'giro ', en: 'lap ' })}${Math.min(m.gauges.lapsTotal, m.gauges.lapsDone+1)}/${m.gauges.lapsTotal}`:''}${m.gauges.timeLeft?` · ${tr({ it: 'resta ', en: 'left ' })}${esc(m.gauges.timeLeft)}`:''}${m.gauges.fuel!=null?` · ${tr({ it: 'benzina ', en: 'fuel ' })}${m.gauges.fuel} L`:''}${m.telemTrack?` · ${tr({ it: 'consumo da ', en: 'consumption from ' })}${esc(m.telemTrack)}`:''}</span></div>
          <button class="mini" id="cp-toggle" type="button" title="${esc(voceServer
            ? tr({ it: 'La voce la fa il PITWALL (server, Cosimo: parla anche con la GUI chiusa, in gara). Click: spegni tutto — copilota muta.', en: 'The voice comes from the server PITWALL (Cosimo: it speaks even with the GUI closed). Click to mute everything.' })
            : tr({ it: 'Copilota vocale: le stesse info dell\'ingegnere, dette con la voce. Click: lo accendi lato Pitwall (parla anche con la GUI chiusa).', en: 'Voice copilot: the same engineer info, spoken aloud. Click to enable it on the Pitwall side — it speaks even with the GUI closed.' }))}" style="margin-left:auto;letter-spacing:0.2px">
            <span style="color:${(voceServer || cp.on) ? '#7f7' : 'inherit'}">${voceServer ? tr({ it: '🔊 copilota (server)', en: '🔊 copilot (server)' }) : cp.on ? tr({ it: '🔊 copilota ON', en: '🔊 copilot ON' }) : tr({ it: '🔈 copilota', en: '🔈 copilot' })}</span></button>
          <select class="mini" id="cp-livello" title="${esc(tr({ it: 'Quanto parla il copilota: essenziale (box, benzina, bandiere, penalità) · normale (e giro, posizione, gomme) · full (anche delta e distanza)', en: 'How much the copilot speaks: essential / normal / full' }))}" style="margin-left:4px;letter-spacing:0.2px">
            ${['essenziale','normale','full'].map((lv) => `<option value="${lv}" ${(m.voceLevel ?? 'normale') === lv ? 'selected' : ''}>${lv === 'essenziale' ? tr({ it: 'radio: essenziale', en: 'radio: essential' }) : lv === 'normale' ? tr({ it: 'radio: normale', en: 'radio: normal' }) : tr({ it: 'radio: tutto', en: 'radio: everything' })}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-top:8px">
          ${dvHtml}
          ${mapHtml ? `<div style="flex:none">${mapHtml}<div class="muted" style="font-size:10.5px;margin-top:4px;max-width:290px"><span style="color:#7f7">■ ${tr({ it: 'guadagni', en: 'gain' })}</span> · <span style="color:#f66">■ ${tr({ it: 'perdi', en: 'lose' })}</span> · ${tr({ it: 'passa il mouse sulle fette per il decimo esatto', en: 'hover the slices for the exact tenth' })}</div></div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;margin-top:8px">${(m.tips||[]).map(t=>`<div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;line-height:1.4"><span style="flex:none">${t.icon}</span><span><b>${esc(t.title)}</b> — <span class="muted">${esc(t.text)}</span></span></div>`).join('')}</div>
        ${wearRow ? `<div style="margin-top:6px">${wearRow}</div>` : ''}
        ${pitHtml}
        ${autoHtml}
      </div>`;
      $('#cp-toggle', ingOut)?.addEventListener('click', async () => {
        if (voceServer) {
          // voce del PITWALL: il chip la spegne via POST — e MUTE anche la
          // radio locale (localStorage), così resta parlarne da una sola sorgente
          try { await api('voce-server', { on: false }); } catch { /* la pagina refresha comunque */ }
          cp.on = false;
          localStorage.setItem('evo-copilot', 'off');
          try { speechSynthesis.cancel(); } catch {}
        } else {
          cp.on = true;
          localStorage.setItem('evo-copilot', 'on');
          try { await api('voce-server', { on: true }); } catch { /* resta la locale */ }
          try { speechSynthesis.cancel(); } catch {}
        }
        ingDraw();
        drawCopilotStrip?.();   // il chip in testa segue sempre il cambio
      });
      /* SELETTORE LIVELLO (30/10, Mauro: «minimo indispensabile, normale o
         full»): persiste nel config (voceCopilota: livello) via POST, il
         tick del Pitwall il prossimo giro filtra le frasi col livello. Il
         livello 'essenziale' spegne gli annunci «di bravo narratore» (giro
         fatto, posizione, gomme, meta) tenendo SOLO ciò che serve in pista. */
      $('#cp-livello', ingOut)?.addEventListener('change', async (ev) => {
        const lv = String(ev.target.value ?? '');
        try { await api('voce-server', { livello: lv }); } catch { /* la pagina refresha comunque */ }
        if (lv !== 'off') { localStorage.setItem('evo-copilot', 'on'); }
        ingDraw();
        drawCopilotStrip?.();
      });
      /* PING della radio (29/10 sera): ogni 10 s dice al server lo stato del
         chip. 3ª cura (gara TimeAttack muta COL ping attivo): solo un ping
         con on:false tace il server (chip OFF = silenzio voluto); con chip
         ON la radio è SOLO il server (Cosimo, System.Speech — già sentito
         vivo ieri sera), la pagina NON ripete nulla (le sue voci da browser
         hanno già taciuto due gare anche col ping acceso: cache, attese,
         autoplay — irrispettabili). */
      try {
        if (Date.now() - (cp.ping ?? 0) > 10000) {
          cp.ping = Date.now();
          api('voce-pagina', { on: cp.on }).catch(() => {});   // fire-and-forget: mai in fila col polling live
        }
      } catch { /* il ping non deve rompere il pannello */ }
      /* --- i NARRATORI del copilota (LOCALI — zitti quando parla il server):
            oggi servono solo come scelta di riserva con voceCopilota OFF nel
            config (chip mostra la sua condizione senza «server») --- */
      if (cp.on && !voceServer && Date.now() > (cp.grace ?? 0)) {   // 3ª cura 29/10: il server è la radio; la pagina ripete solo se la voce server è OFF
        const g = m.gauges ?? {};
        /* 1) delta live: 20 s MINIMI fra discorsi (27/10: prima 12, parlava
              troppo), ma SOLO se il valore cambia
              per davvero (barre da 0.4 s): lo stesso «sei più lento di 0.3»
              ogni 12 s era rumore (24/10, Mauro in pista). Il primo numero
              si SEMINA in silenzio: i primi tick possono portare i dati
              bruciati della sessione prima. */
        if (dv != null) {
          const bucket = Math.round(dv / 400);
          if (cp.last.dvBucket == null || cp.at === 0) cp.last.dvBucket = bucket;   // semina senza voce
          else if (bucket !== cp.last.dvBucket && Date.now() - (cp.at ?? 0) > 20000) {
            cp.last.dvBucket = bucket; cp.at = Date.now();
            cpSpeak(dv < 0
              ? cpT({ it: `Sei più veloce del best di ${(Math.abs(dv)/1000).toFixed(1)}`, en: `You are ${(Math.abs(dv)/1000).toFixed(1)} quicker than best` })
              : cpT({ it: `Sei più lento del best di ${(dv/1000).toFixed(1)}`, en: `You are ${(dv/1000).toFixed(1)} slower than best` }));
          }
        }
        /* 2) TEMPO SUL TRAGUARDO (25/10, Mauro: «vorrei che dicesse il tempo
              di ogni giro sul traguardo» — in gara aveva sentito SOLO le
              posizioni): il giro compiuto si legge da lapsDone (totalLapCount
              dell'HUD, cresce a ogni taglio) e il lapNo del delta resta la
              scorta dove lapsDone non arriva (prova libera di sessioni
              strane). Il primo contatore si SEMINA in silenzio; un contatore
              che scende = sessione nuova, resetta tutto senza voce. Niente
              tempo nuovo = niente voce: all'avvio della live il giro può
              essere già compiuto della sessione precedente (24/10). */
        const lastLapTxt = m.timing?.lastLap ?? null;
        const lapNo = m.delta?.lapNo ?? null;
        let compiuto = (Number.isFinite(g.lapsDone) && g.lapsDone > 0) ? g.lapsDone
          : (lapNo != null && lapNo > 0 ? lapNo : null);
        /* 25/10 (sera, Brands Hatch): il copilota ha detto «Giro 4» su una
           gara da 3 — il taglio in più sul traguardo esiste nella telemetria
           (brucia benzina: 26.8 → 25.2 L) ma NON entra nei risultati ufficiali
           (il file del gioco resta 3 giri) né in quelli della carriera, e la
           voce NON deve più dire un giro oltre il totale della sessione:
           sarebbe artefatto, non gara.
        Gli HUD di modalità strane lasciano lapsDone a 0 per TUTTA la gara:
           in quel caso il contatore del delta è la scorta, e in DIRETTA:
           nella telemetria salvata lapNo parte da 0 e sale a ogni taglio
           (0,1,2,3,4 su una gara da 3), quindi lapNo = giri compiuti, non
           «giro corrente»: il vecchio lapNo-1 annunciava in ritardo di uno
           (Giro 2 sul traguardo del 1°). L'ho stickato nel replay del
           registro copilota: solo «Giro 3» sopra la gara, mai «Giro 4». */
        if (compiuto != null && Number.isFinite(g.lapsTotal) && g.lapsTotal > 0 && compiuto > g.lapsTotal) compiuto = g.lapsTotal;
        /* 28/10 tardo (Mauro: «ancora metà gara in loop»): dentro la STESSA
           sessione il contatore giri non torna MAI indietro. La scorta
           lapNo del delta e lapsDone dell’HUD a volte contraddicono
           (l’HUD fallisce un istante e il fallback riparte più basso):
           il vecchio reset «compiuto < giro → meta da capo» trasformava
           quel singolo istante in una RIPETIZIONE diretta (flag a false,
           annuncio 3b ripartiva) e con la guardia 70 s le ripetizioni
           si sentivano a catena tutto il giro. Ora i contatori si
           armonizzano in SILenzio e solo la FIRMA (sessione vera nuova,
           sopra) azzera la memoria. */
        if (compiuto != null && cp.last.giro != null && compiuto < cp.last.giro) compiuto = cp.last.giro;
        if (compiuto != null && cp.last.giro != null && compiuto > cp.last.giro && lastLapTxt && lastLapTxt !== cp.last.lastLapTxt) {
          const nuova = cpT({ it: `Giro ${compiuto} fatto in ${lastLapTxt}`, en: `Lap ${compiuto} in ${lastLapTxt}` });
          if (m.delta?.bestLapNo === compiuto) cpSpeak(nuova + ' ' + cpT({ it: 'nuovo best della sessione!', en: "that's a new session best!" }));
          else cpSay('lapdone', nuova);
          cp.last.giroFattoOra = Date.now();   // 8d: la bandiera aspetta QUESTO momento
        }
        // il contatore si avanza SOLO con un tempo nuovo: se il traguardo arriva
        // un attimo prima che l'HUD aggiorni lastLapMs, il giro prossimo si
        // annuncia al tick successivo (4 s) con il tempo giusto, non si perde
        // CROCE FINALE (30/10, gara a tempo): nuovo lastLap = traguardo appena
        // attraversato — calcolato PRIMA che la memoria aggiorni il lastLap.
        const croceFinale = compiuto != null && lastLapTxt != null && lastLapTxt !== cp.last.lastLapTxt;
        if (compiuto != null && lastLapTxt && lastLapTxt !== cp.last.lastLapTxt) cp.last.giro = compiuto;
        if (lastLapTxt != null) cp.last.lastLapTxt = lastLapTxt;
        if (lapNo != null) cp.last.lapNo = lapNo;   // serve per il confronto best di sessione
        /* 3) benzina: la voce solo quando i giri copribili calano davvero */
        if (g.lapsOnFuel != null && cp.last.fuel != null && g.lapsOnFuel < cp.last.fuel - 0.49) {
          cpSpeak(g.lapsLeft != null && g.lapsOnFuel < g.lapsLeft + 1
            ? cpT({ it: `Benzina critica: ${g.lapsOnFuel} giri, ne restano ${g.lapsLeft}`, en: `Fuel critical: ${g.lapsOnFuel} laps on the tank, ${g.lapsLeft} to go` })
            : cpT({ it: `Benzina per ${g.lapsOnFuel} giri`, en: `Fuel for ${g.lapsOnFuel} laps` }));
        }
        if (g.lapsOnFuel != null) cp.last.fuel = g.lapsOnFuel;
        /* 3b) BENZINA ALLA META GARA (25/10, Mauro): al primo giro della seconda
              metà una voce con litri e giri copribili una sola volta per
              sessione — in mezzo alla gara non si guarda l'HUD. 28/10 tardo:
              la soglia si legge da compiuto (contatore filtrato), non da
              g.lapsDone diretto — se l'HUD resta a 0 è la scorta a parlare. */
        if (g.lapsTotal != null && g.lapsTotal > 0 && compiuto != null && !cp.last.meta) {
          const meta = Math.ceil(g.lapsTotal / 2);
          if (compiuto + 1 >= meta) {
            cp.last.meta = true;
            cpSpeak(cpT({
              it: `Meta gara: ${g.fuel != null ? g.fuel + ' litri' : 'benzina sconosciuta'}, per ${g.lapsOnFuel ?? '?'} giri.`,
              en: `Half race: fuel ${g.fuel != null ? g.fuel + ' litres' : 'unknown'}, ${g.lapsOnFuel ?? '?'} laps on the tank${g.lapsLeft != null ? `, ${g.lapsLeft} to go` : ''}`,
            }));
          }
        }
        /* 4) gomme: parlo solo quando la soglia cambia fascia */
        const worst = (g.wear ?? []).filter(Number.isFinite).
          reduce((a, v) => Math.max(a, v), 0);
        const band = !worst ? 0 : worst >= 80 ? 2 : worst >= 55 ? 1 : 0;
        if (band > (cp.last.wearBand ?? 0) && band > 0) cpSpeak(cpT({ it: `Gomme al ${Math.round(worst)} percento`, en: `Tyres at ${Math.round(worst)} percent` }));
        if (worst != null) cp.last.wearBand = band;
        /* 5) gap davanti: sotto 1.5 s si annuncia — ma al massimo UNA volta
              ogni 25 s (27/10, Mauro: ogni decimo di secondo parlava troppo) */
        if (g.gapAhead != null && g.gapAhead > 0 && g.gapAhead < 1.5) {
          const k = Math.round(g.gapAhead * 10);
          if (cp.last.gap !== k) { cp.last.gap = k; cpSay('gap', cpT({ it: `Gap davanti ${g.gapAhead.toFixed(1)}`, en: `Gap ahead ${g.gapAhead.toFixed(1)}` }), 25000); }
        } else cp.last.gap = null;
        /* 6) finestra pit: la prima volta la dico con cura, poi solo se slitta */
        if (pit?.need && pit.pitLap != null && cp.last.pit !== pit.pitLap) {
          cp.last.pit = pit.pitLap;
          cpSpeak(pit.lapsToWindow === 0
            ? cpT({ it: `Sosta: aperta adesso, fermati questo giro`, en: `Pit window open: stop this lap` })
            : cpT({ it: `Sosta: si apre tra ${pit.lapsToWindow} giri, entro il giro ${pit.pitLap + 1}`, en: `Pit window in ${pit.lapsToWindow} laps, by lap ${pit.pitLap + 1}` }));
          /* se la finestra era GIÀ vicina alla prima vista (o slitta dentro le
             3 tacche), il conto alla rovescia (6b) parte dalla tacca di adesso:
             niente fratello doppio nello stesso minuto — 6 annuncia, 6b conta
             solo da qui in giri. */
          if (Number.isFinite(pit.lapsToWindow) && pit.lapsToWindow < 3) cp.last.pitN = pit.lapsToWindow;
        }
        /* 6b) CONTO ALLA SOSTA (27/10, richiesta Mauro: «questo giro o il
              prossimo?»): quando la finestra si avvicina il copilota conta.
              Con le gomme stanche lo dice nella frase — la decisione di fermarsi
              nasce da gomme+benzina insieme, non solo dal serbatoio. Una voce
              per tacca (2, 1, 0), niente loop; slitta la finestra → tacca si
              azzera e il nuovo conto ridice da capo. */
        if (pit?.need && Number.isFinite(pit.lapsToWindow)) {
          const stanche = (cp.last.wearBand ?? 0) >= 1;   // già oltre la prima soglia usura (55%)
          const tacca = pit.lapsToWindow >= 3 ? null : pit.lapsToWindow;
          if (tacca != null && cp.last.pitN !== tacca) {
            cp.last.pitN = tacca;
            cpSay('pitcount', cpT({
              it: tacca === 0
                ? `Fermarsi adesso: baia costa circa ${pit.pitLossSec} secondi`
                : tacca === 1
                  ? `Sosta questo giro o il prossimo${stanche ? ' — gomme stanche' : ''}`
                  : `Sosta tra ${tacca} giri${stanche ? ' — gomme al limite, contano anche le pressioni' : ''}`,
              en: tacca === 0
                ? `Pit now: the stop costs about ${pit.pitLossSec} seconds`
                : tacca === 1
                  ? `Pit this lap or the next${stanche ? ' — worn tyres' : ''}`
                  : `Pit in ${tacca} laps${stanche ? ' — tyres on the limit, pressures matter too' : ''}`,
            }), 12000);
          }
        } else cp.last.pitN = null;
        /* 6c) I BOX SI APRONO E CHIUDONO (28/10 sera, richiesta Mauro: «per il
              copilot implementa la voce quando apre/chiude i box»): il sensore
              inPit della MMF grafica, da questa sera NEI GAUGES dell'ingegnere
              (stessa strada di isLastLap — il tip «In pitlane» c'era da tempo,
              la voce della stessa cosa no). VOCE all'INGRESSO nel pitlane (limiter
              acceso: «box aperto») e all'USCITA («box chiuso», gomme in
              temperatura al primo giro). Si parla sul CAMBIO, mai in loop: il
              primissimo valore si SEMINA in silenzio (come il contatore giri),
              e la coda cpSay tiene 10 s minimo fra due discorsi baia (anche
              alternati, che i presupposti flapping non facciano le scale); i
              reset di sessione li tiene già la firma qui sopra. */
        if (g.inPit != null) {
          const sosta = cp.last.inPit;
          if (sosta != null && sosta !== g.inPit) {
            cpSay('box', cpT(g.inPit
              ? { it: 'Box aperto: in pitlane — limiter on, niente gas.', en: 'Pit lane open: in the pitlane — limiter on, no throttle.' }
              : { it: 'Box chiuso: fuori dal pitlane — gomme in temperatura al primo giro.', en: 'Pit lane closed: out of the pitlane — warm the tyres on the first lap.' }), 10000);
          }
          cp.last.inPit = g.inPit;
        }
        /* 7) AUTO DEL PARCO (24/10, Mauro): fuori dalla lista ammesse lo dico,
              e lo ripeto ogni 30 s finché il sedile non torna in regola */
        if (auto?.ammesse?.length && !auto.ok) {
          cpSay('autofuori', cpT({
            it: `${auto.mine ?? "Quest'auto"} fuori parco: ammesse ${auto.ammesse.slice(0, 3).join(', ')}. Gara senza punti.`,
            en: `${auto.mine ?? 'This car'} outside the pool: allowed ${auto.ammesse.slice(0, 3).join(', ')}. The race scores nothing.`,
          }), 30000);
        }
        /* 8) ULTIMO GIRO: lo dico una volta per sessione, poi la bandiera.
              28/10: la condizione PRIMA si appoggia al sensore isLastLap della
              MMF grafica, passato nell'ingegnere — nei flussi come la gara del
              24/10 il contatore rimaneva a 0 per TUTTA la gara e l'annuncio
              non avveniva MAI. 28/10 tardo: la scorta ora legge compiuto
              (contatore filtrato lasso su) anziché g.lapsDone diretto —
              se l'HUD si blocca su 0 il fallback parla LUI. */
        const lt = g.lapsTotal, ld = compiuto;
        /* 30/10 GARA A TEMPO (gara dei 5 min, Mauro): con gara a tempo il gioco
           NON scrive un totale di giri e l'intero ramo era ghiacciato dietro
           lt > 0 — nemmeno isLastLap, il sensore che il gioco dà SÉ in gara
           a tempo, poteva parlare: fine gara in silenzio. Come il narratore
           del Pitwall: «Ultimo giro!» da isLastLap anche senza totale; la
           bandiera senza totale arriva al TRAGUARDO dopo l'ultimo giro
           (nuovo lastLap con ultimo=true). */
        const ltOk = Number.isFinite(lt) && lt > 0;
        if (Number.isFinite(ld)) {
          if ((g.isLastLap || (ltOk && ld + 1 === lt)) && !cp.last.ultimo) { cp.last.ultimo = true; cp.last.ultimoGiro = ld; cpSpeak(cpT({ it: 'Ultimo giro!', en: 'Final lap!' })); }
          if (ltOk && ld >= lt && !cp.last.bandiera) { cp.last.bandiera = true; bandParla(); }
          else if (!ltOk && cp.last.ultimo && croceFinale && !cp.last.bandiera && Number.isFinite(cp.last.ultimoGiro) && ld > cp.last.ultimoGiro) { cp.last.bandiera = true; bandParla(); }
          if (ltOk && ld + 1 < lt) cp.last.ultimo = false;   // sessione nova: riparte il cancellino
        }
        /* 8c) BANDIERA DI FONDO (30/10 pomeriggio, gemello del Pitwall): la
           gara di Monza ha visto lapsTotal=0, isLastLap=false e timeLeft=null
           per TUTTA la sessione — nessuna delle tre fonti era viva e la fine
           giunse muta. L'unica cosa certa scritta dal gioco: il CAMBIO DI
           BANDIERA a scacchi al traguardo finale (flagCode 8). Con almeno un
           giro compiuto: «Bandiera a scacchi!» una volta sola anche se le
           altre fonti non sono mai arrivate. Bandiera già a scacchi al primo
           tick (entrare a gara finita): si SEMINA in silenzio. */
        if (!ltOk && !cp.last.bandiera) {
          if (cp.last.flagF === undefined) cp.last.flagF = g.flag;
          else if (cp.last.flagF !== 'a scacchi' && g.flag === 'a scacchi' && Number.isFinite(ld) && ld >= 1) {
            cp.last.bandiera = true;
            bandParla();
          }
          if (g.flag != null) cp.last.flagF = g.flag;
        }
        /* 8d) SVUOTAMENTO della coda (gemello del Pitwall): la bandiera in coda
           esce quando un giro viene annunciato (giroFattoOra DOPO la richiesta)
           o al soccorso di 10 s — mai prima di un giro annunciato. */
        if (cp.last.bandieraP != null) {
          const adesso = Date.now();
          if ((Number.isFinite(cp.last.giroFattoOra) && cp.last.giroFattoOra >= cp.last.bandieraP) || adesso - cp.last.bandieraP >= 10000) {
            cp.last.bandieraP = null;
            cpSpeak(cpT({ it: 'Bandiera a scacchi!', en: 'Checkered flag!' }));
          }
        }
        /* 8b) CONTO ALLA ROVESCIA (30/10, gare a tempo): ≤60 s «Ultimo minuto!»,
           ≤30 s «Trenta secondi!», una volta ciascuna per sessione. Il parsing
           tollerante (m:ss, h:mm:ss) e i flag sono gli STESSI del narratore
           del Pitwall (gemello). Con la stringa che non si capisce: ziti. */
        if (g.timeLeft != null) {
          const mta = String(g.timeLeft).match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})/);
          const secUlt = mta ? (mta[1] ? Number(mta[1]) * 3600 : 0) + Number(mta[2]) * 60 + Number(mta[3]) : null;
          if (secUlt != null) {
            if (secUlt <= 60 && !cp.last.minuto) { cp.last.minuto = true; cpSpeak(cpT({ it: 'Ultimo minuto!', en: 'Last minute!' })); }
            else if (secUlt <= 30 && !cp.last.minutoSegn) { cp.last.minutoSegn = true; cpSpeak(cpT({ it: 'Trenta secondi!', en: 'Thirty seconds!' })); }
          }
        }
        /* 9) POSIZIONE: cambia sedile in classifica → una voce (ma non a ogni tick) */
        if (g.position != null && cp.last.pos != null && g.position !== cp.last.pos) {
          const verso = g.position < cp.last.pos ? cpT({ it: 'recuperata', en: 'gained' }) : cpT({ it: 'persa', en: 'lost' });
          cpSay('postalk', cpT({ it: `P${g.position}, posizione ${verso}.`, en: `P${g.position}, position ${verso}.` }), 30000);   // 27/10: 15→30 s, parlava a ogni sorpasso
        }
        if (g.position != null) cp.last.pos = g.position;
        /* 10) BANDIERA BLU (28/10 notte, richiesta Mauro: «le bandiere blu non
              segnano corrette sulle endurance — copilota muto + cruscotto
              senza bandiera»): il flag PER AUTO della MMF grafica (shmem,
              FLAG[4]='blu') era nella snapshot da sempre e nessuno lo
              consumava: nelle gare multi-classe voce e pannello tacevano
              proprio quando ti doppiano. Si parla sul CAMBIO a blu (la
              primissima vista si SEMINA in silenzio, come i box del 6c):
              30 s di distanziello, e con il flag torna 'nessuna' la prossima
              doppietta ridice. Il tip nel pannello arriva dall'ingegnere
              (prio 0: in cima alla radio). */
        if (g.flag != null) {
          if (cp.last.bluf == null) { cp.last.bluf = g.flag; }   // semina senza voce
          else if (g.flag !== cp.last.bluf) {
            const eraBlu = cp.last.bluf === 'blu';
            if (!eraBlu && g.flag === 'blu') {
              cpSay('blu', cpT({
                it: 'Bandiera blu: chi ti doppietta ti sta sotto — lascia la linea al rettilineo.',
                en: 'Blue flag: you are being lapped — give up the line on the straight.',
              }), 30000);
            }
            cp.last.bluf = g.flag;
          }
        }
      }
    } catch { /* il live non deve mai rompere la vista */ }
  };
  if (ingOut) {
    ingDraw();
    const t = setInterval(ingDraw, 4000);
    // uscendo dal cruscotto si spegne anche la voce: niente radio fantasma
    window.__ingLiveStop = () => { clearInterval(t); try { if (cp.on) speechSynthesis.cancel(); } catch {} window.__ingLiveStop = null; };
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
        /* niente più sliderMin/Max da qui (31/10): la banda AI la comanda
           il trim adattivo (e ±1 del cruscotto), per le regole a mano c'è il
           pannello Difficoltà — questa scheda non la tocca più. */
        practiceStart: $('#rs-pstart', el).value === '' ? '' : Number($('#rs-pstart', el).value),
        qualifyStart: $('#rs-qstart', el).value === '' ? '' : Number($('#rs-qstart', el).value),
        warmupStart: $('#rs-wstart', el).value === '' ? '' : Number($('#rs-wstart', el).value),
        raceStart: $('#rs-rstart', el).value === '' ? '' : Number($('#rs-rstart', el).value),
        timeScale: Number($('#rs-time', el).value),
        distPct: Number($('#rs-dist', el).value),
        piano: $('#rs-piano', el)?.value || null,
      });
      toast(tr({ it: 'Regole salvate: vai a impostarle in EVO.', en: 'Rules saved: go set them in EVO.' }), 'ok');
      drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null }));
    } catch(e){ toast(e.message, 'err'); }
  });
  $('#rs-reset', el)?.addEventListener('click', async () => {
    try {
      await api('race-settings', { clear: true });
      toast(tr({ it: 'Tornati i consigli del tool.', en: 'Back to the tool suggestions.' }), 'ok');
      drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null }));
    } catch(e){ toast(e.message, 'err'); }
  });
  $('#b-accept-chal', el)?.addEventListener('click', async () => {
    try { await api('challenge-accept', {}); toast(tr({ it: 'Sfida accettata: in bocca al lupo.', en: 'Challenge accepted: good luck.' }), 'ok'); drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null })); }
    catch(e){ toast(e.message, 'err'); }
  });
  $$('.d-nudge', el).forEach(b => { b.onclick = async (e) => {
    e.preventDefault();
    try {
      const out = await api('difficulty-nudge', { delta: Number(b.dataset.d), car: $('#sel-car', el)?.value ?? null });
      drawCardInto(el, out.card);
      toast(`Difficoltà serie: ${out.card.difficulty.rangeMin}–${out.card.difficulty.rangeMax}%.`, 'ok');
    } catch(err){ toast(err.message, 'err'); }
  }; });
  $('#b-prop-accept', el)?.addEventListener('click', async () => {
    try {
      await api('difficulty-action', { op: 'accept' });
      drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null }));
      toast(tr({ it: 'Suggerimento accettato: trim aggiornato, banda EVO spostata.', en: 'Suggestion accepted: trim updated, EVO band moved.' }), 'ok');
      await refreshBoot();
    } catch(err){ toast(err.message, 'err'); }
  });
  $('#b-prop-reject', el)?.addEventListener('click', async () => {
    try {
      await api('difficulty-action', { op: 'reject' });
      drawCardInto(el, await api('card', { car: $('#sel-car', el)?.value ?? null }));
      toast(tr({ it: 'Suggerimento rifiutato.', en: 'Suggestion rejected.' }), 'info');
    } catch(err){ toast(err.message, 'err'); }
  });
  /* 27/10 (gara preparata verso mezzogiorno): il selettore auto esiste SOLO
     nella card che ha il render (`card.carImage`) — quando l'auto della card
     non combacia (es. Ferrari F40 LM assente nell'indice dei render) l'elemento
     MANCA e questa riga senza guard rompeva l'intero ridisegno dopo «Prepara
     tutto», cancellando anche le righe di log e coprendo il messaggio vero
     del server (auto fuori dizionario = gara che parte lo stesso). Guard. */
  $('#sel-car', el)?.addEventListener('change', async () => drawCardInto(el, await api('card', {car: $('#sel-car', el)?.value ?? null})));
  $('#b-copy', el).onclick = async () => {
    const text = `${card.nodeDisplay} — ${card.roundName} (R${card.roundIndex+1}/${card.totalRounds})\n` +
      card.settings.map(([k,v])=>`${k}: ${v}`).join('\n') + `\n${tr({ it: 'Difficoltà AI', en: 'AI difficulty' })}: ${card.difficulty.slider}% · ${tr({ it: 'aggressività', en: 'aggression' })} ${card.aggression}%`;
    try { await navigator.clipboard.writeText(text); toast(tr({ it: 'Scheda copia negli appunti.', en: 'Sheet copied to the clipboard.' }), 'ok'); }
    catch { toast(tr({ it: 'Il browser ha negato gli appunti.', en: 'The browser denied the clipboard.' }), 'err'); }
  };
  // banda live: stato della memoria condivisa + verifica automatica della config
  const liveBox = document.createElement('div');
  liveBox.className = 'livebar live-off';
  liveBox.innerHTML = `<span class="dot"></span><span class="st">Live</span><span class="muted">${tr({ it: 'in attesa del gioco…', en: 'waiting for the game…' })}</span>`;
  el.appendChild(liveBox);
  const pollLive = async () => {
    if (!document.body.contains(liveBox)) return;
    try {
      const car = $('#sel-car', el)?.value ?? null;
      const r = await api('live', { car });
      if (!document.body.contains(liveBox)) return;
      if (!r.game) {
        liveBox.className = 'livebar live-off';
        liveBox.innerHTML = `<span class="dot"></span><span class="st">Live</span><span class="muted">${tr({ it: 'EVO chiuso — la verifica parte quando lo apri', en: 'EVO closed — the check starts when you open it' })}</span>`;
      } else if (r.waiting) {
        liveBox.className = 'livebar live-off';
        liveBox.innerHTML = `<span class="dot on"></span><span class="st">${tr({ it: 'EVO aperto', en: 'EVO open' })}</span><span class="muted">— ${tr({ it: 'carica una sessione (anche solo prove libere) e la verifica parte da sola', en: 'load a session (even a free practice) and the check starts by itself' })}</span>`;
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
        liveBox.innerHTML = `<span class="dot ${r.check.ready?'on':''}"></span><span class="st">${r.check.ready?tr({ it: 'Configurazione corretta!', en: 'Configuration is correct!' }):tr({ it: 'Configura in EVO:', en: 'Set up in EVO:' })}</span>
          <span class="muted">${okN}/${r.check.rows.length} ok</span><div style="width:100%">${det}</div>`;
      } else {
        liveBox.className = 'livebar live-off';
        const s = r.session ?? {};
        liveBox.innerHTML = `<span class="dot on"></span><span class="st">${tr({ it: 'EVO aperto', en: 'EVO open' })}</span><span class="sep">·</span><span class="muted">${esc(legacyIt(s.type ?? ''))} · ${esc(s.track ?? '?')} ${esc(s.layout ?? '')} · ${esc(s.session.name || tr({ it: 'sessione libera', en: 'free session' }))}</span>`;
      }
    } catch { /* server occupato: riprova al prossimo giro */ }
    setTimeout(pollLive, 2000);
  };
  pollLive();
  $('#b-race', el).onclick = async () => {
    const btn = $('#b-race', el); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('race', {car: $('#sel-car', el)?.value});
      // anche qui il motivo reale del mancato avvio va nel toast (24/10)
const launchErr = r.launched?.error ? ` (${String(r.launched.error).split('\n')[0]})` : '';
const note = r.gameRunning ? tr({ it: 'EVO è già aperto: imposta la gara nella finestra esistente.', en: 'EVO is already open: set the race in the existing window.' }) : (r.launched && !r.launched.error ? tr({ it: 'Gioco avviato.', en: 'Game launched.' }) : tr({ it: `Gioco non avviato: aprilo tu.${launchErr}`, en: `Game not launched: open it yourself.${launchErr}` }));
      // ora, giri, PISTA e AUTO della ronda scritti nel gamemodesave/garage:
      // ogni segmento a segmento, con ⚠ quando va messo a mano (26/10, PC 2:
      // il bottone parlaceva solo di ora/giri — la pista restava Mount
      // Panorama e il cruscotto non diceva se «Prepara» l'avesse toccata)
      const p = r.prep ?? {};
      const segs = [];
      if (p.trackError) segs.push(`⚠ ${p.trackError.startsWith('ENOENT') ? tr({ it: 'pista da impostare a mano', en: 'track to set by hand' }) : p.trackError}`);
      else if (p.trackWritten) segs.push(tr({ it: `pista ${p.track} scritta: rientra nel weekend dal menu di EVO`, en: `track ${p.track} written: re-enter the weekend from EVO's menu` }));
      else if (p.trackSame) segs.push(tr({ it: `pista già ${p.track}: nulla da scrivere`, en: `track already ${p.track}: nothing to write` }));
      else if (p.track) segs.push(`⚠ ${tr({ it: `pista NON aggiornata (${p.track}): apri il weekend in EVO dal menu e ripremi Prepara`, en: `track NOT updated (${p.track}): open the weekend from EVO's menu and press Get ready again` })}`);
      if (p.carError) segs.push(`⚠ ${p.carError.startsWith('ENOENT') ? tr({ it: 'auto da selezionare a mano in EVO', en: 'car to pick by hand in EVO' }) : p.carError}`);
      // PIANO B GRID TYPE (26/10 notte): il selettore non scritto da fuori va
      // al toast CON LA GUIDA intera (menu Race Weekend → Grid Type → CUSTOM
      // → Applica) e rosso 15 s: è l'unico caso in cui l'amico deve toccare il
      // menu di EVO (richiesta Mauro: «dice quello che serve a mano»).
      // AUTO E GIOCO APERTO (27/10, chiesta da Mauro dopo «ho ancora la 75»):
      // il garage si rilegge SOLO AL LANCIO di EVO (lezione 22/10 + 26/10: la
      // copia in memoria comanda finché il processo vive) — la scrittura del
      // drivergarage c'è ma con EVO in piedi la voce neutra sembrava un "fatto".
      // Con il gioco aperto va in ⚠: chiudere EVO del tutto e riaprilo (arriva
      // da sola) OPPURE scegliere l'auto a mano nel garage del weekend.
      else if (p.carWritten) segs.push(r.gameRunning
        ? `⚠ ${tr({ it: `auto ${p.car} scritta sul disco, ma EVO APERTO non rilegge il garage: chiudi EVO del TUTTO e riaprilo (l'auto arriva da sola), o scegli l'auto a mano nel garage del weekend`, en: `car ${p.car} written to disk, but EVO OPEN does not re-read the garage: close EVO completely and relaunch (the car comes up by itself), or pick the car by hand in the weekend garage` })}`
        : tr({ it: `auto ${p.car} pronta al prossimo avvio di EVO`, en: `car ${p.car} ready at EVO's next launch` }));
      else if (p.carNote) segs.push(p.carNote);   // nota neutra (auto fuori dizionario): senza ⚠
      if (p.hourError) segs.push(`⚠ ${p.hourError}`);
      else if (p.hour != null) segs.push(`${tr({ it: 'ora', en: 'hour' })} ${p.hour}`);
      if (p.lapsError) segs.push(`⚠ ${p.lapsError}`);
      else if (p.laps != null) segs.push(p.laps);
      if (p.gridModeError) segs.push(`⚠ ${p.gridModeError}`);
      // DEDUPE (26/10, Mauro: «in rosso voglio solamente i problemi o le
      // azioni da eseguire»): server, ora e giri ripetono la STESSA azione
      // («entra una volta nel weekend, ripremi Prepara») in voci diverse —
      // una sola ne basta. La GUIDA Grid Type (CUSTOM + Applica) NON cade:
      // è l'istruzione unica che l'amico deve fare a mano nel menu di EVO.
      const AZIONE_WEEKEND = /enter the (round('s)? )?weekend in EVO once|entra in EVO nel weekend del round|gamemodesave (not found|non trovato)|premi di nuovo Prepara|press Get ready again/;
      const segsUnici = [];
      for (const s of segs) {
        if (AZIONE_WEEKEND.test(s) && segsUnici.some((v) => AZIONE_WEEKEND.test(v))) continue;
        segsUnici.push(s);
      }
      // CONSOLE (27/10, richiesta Mauro: «la schermata rossa sembra disastroso»):
      // niente più tostone rosso a lunga. Ogni segmento esce come RIGA del
      // log da terminale (verde su nero), rivelate in tempo reale una a una;
      // le righe ⚠ restano ambra e guidano la mano quando serve.
      const righe = [
        `🏁 ${tr({ it: 'Gara segnata', en: 'Race marked' })}${r.fee?` · ${tr({ it: 'iscrizione ', en: 'entry fee ' })}${money(r.fee)} €`:''}`,
        note,
      ];
      if (r.prep?.grid?.rebuild) righe.push(`${r.prep.grid.rebuild.startsWith('non riuscita') ? '⚠' : ''} Griglia serie: ${r.prep.grid.rebuild}`);
      for (const s of segsUnici) righe.push(s);
      prepConsole(righe);
      drawCardInto(el, r.card);
      await refreshBoot();
    /* 27/10: l'errore NON rimonta più il pannello da zero (solo «✖ ...»):
       le righe già scritte dal server restano in vista e l'errore si aggiunge
       in fondo — prima creditava tutto e l'amico perdeva cosa il tool
       aveva fatto. */
    } catch(e){ prepConsoleLine(`✖ ${e.message}`); btn.disabled=false; btn.textContent = tr({ it: '🏁 Prepara tutto e divertiti', en: '🏁 Get everything ready and have fun' }); }
  };
}

