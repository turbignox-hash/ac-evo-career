// meccanico.js — la FIGURA del box (21/10): il meccanico è il personaggio del
// tool, non un pannello in più. Icona SVG e micro-accessori per la GUI.
(function () {
  'use strict';

  /** Icona del meccanico: cappellino + tuta + chiave inglese, in tono col tema. */
  window.mechIcon = function (size = 24) {
    const s = Number(size) || 24;
    return `<svg viewBox="0 0 32 32" style="width:${s}px;height:${s}px" aria-hidden="true">
  <circle cx="14" cy="8.6" r="4.2" fill="currentColor" opacity=".9"/>
  <path d="M8.9 6.9h10.2l-.7-2.4a4.9 4.9 0 0 0-8.8 0z" fill="currentColor"/>
  <rect x="12.8" y="12.2" width="2.4" height="4.4" rx="1" fill="currentColor" opacity=".8"/>
  <path d="M5.6 27.5c0-5.6 3.8-9.6 8.4-9.6s8.4 4 8.4 9.6z" fill="currentColor" opacity=".78"/>
  <g transform="rotate(38 25 21)">
    <circle cx="25" cy="18.2" r="2.7" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <rect x="24" y="21.2" width="2" height="8.2" rx="1" fill="currentColor"/>
  </g>
</svg>`;
  };

  /**
   * La RIGA IDENTITÀ del meccanico (pannello Consigli del box):
   * avatar + nome + badge di umore + monitor di box (stato EVO e ultima telemetria).
   * stato = { allGood: bool, bad: n, warn: n, live: string|null, telem: string|null }
   */
  window.mechIdentity = function (stato) {
    const s = stato ?? {};
    const bad = Number(s.bad) || 0, warn = Number(s.warn) || 0;
    let badge, cls;
    if (bad > 0) { badge = `${tr({ it: '❗ ', en: '❗ ' })}${bad} ${tr({ it: 'voci rosse: lavoro da fare', en: 'red items: work to do' })}`; cls = 'bad'; }
    else if (warn > 0) { badge = `${tr({ it: '🧰 ', en: '🧰 ' })}${warn} ${tr({ it: 'da leggere, nessun dramma', en: 'to read, no drama' })}`; cls = 'warn'; }
    else { badge = tr({ it: '✔ soddisfatto — la macchina è a punto', en: '✔ satisfied — the car is on point' }); cls = 'ok'; }
    const monitor = [];
    const live = s.live === 'in pista' ? tr({ it: 'in pista', en: 'out on track' }) : s.live;
    if (s.live) monitor.push(`<span class="chip ${s.live === 'in pista' ? 'gold' : ''}"><span class="dot ${s.live === 'in pista' ? 'on' : ''}"></span>${live}</span>`);
    if (s.telem) monitor.push(`<span class="chip">📺 ${tr({ it: 'telem.', en: 'telem.' })} ${s.telem}</span>`);
    /* MONITOR TEST: mentre il meccanico lavora (checklist attiva) mostra quante
       aree sta verificando — e quando finisce, che sono tutte a punto. */
    if (Number(s.areas) > 0) monitor.push(tr({
      it: `<span class="chip ${bad || warn ? '' : 'green'}">🧪 ${s.areas} ${s.areas === 1 ? 'area' : 'aree'} in monitoraggio</span>`,
      en: `<span class="chip ${bad || warn ? '' : 'green'}">🧪 ${s.areas} area${s.areas === 1 ? '' : 's'} monitored</span>`
    }));
    /* SETUP CAMBIATO: se il file caricato su disco è più nuovo dell'ultima
       telemetria analizzata, i dati del meccanico parlano del vecchio setup. */
    if (s.stale) monitor.push(`<span class="chip red" title="${tr({ it: "Il file di setup montato è cambiato DOPO l'ultima uscita: i numeri del box parlano del vecchio assetto — fai 2 giri per rigenerare la base.", en: 'The mounted setup file changed AFTER the last run: the numbers in the box refer to the old setup — do 2 laps to regenerate the baseline.' })}">⚠️ ${tr({ it: 'dati del vecchio setup', en: 'old-setup data' })}</span>`);
    return `<div class="mech-id">
      <span class="mech-avatar">${window.mechIcon(22)}</span>
      <span class="mech-name"><b>${tr({ it: 'Il Meccanico', en: 'The Mechanic' })}</b> <span class="muted">— ${tr({ it: "responsabile dell'assetto, dal box", en: 'in charge of the setup, from the box' })}</span></span>
      <span class="mech-badge ${cls}">${badge}</span>
      ${monitor.length ? `<span class="mech-live">${monitor.join(' ')}</span>` : ''}
    </div>`;
  };
})();
