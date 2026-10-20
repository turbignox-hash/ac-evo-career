'use strict';
/* viste-griglia.js — tab GRIGLIA: la pagina del bilanciamento.
 *
 * Fin qui le regole vivevano nel file (grid-classes.json) e si combaciavano da
 * riga di comando (grid-balance / griglia). Questa vista le gestisce a vista:
 *   • lo stato del customgrid in attesa (celle: auto, zavorre, penalità)
 *   • le classi con la loro storia di convalida (per-traccia incluso)
 *   • i bottoni: applica bilancio, rimuovi auto escluse, intervallo AI
 * Scrittura protetta: EVO deve essere CHIUSO (il guardiano lo dice da sé).
 */
async function drawGridTab(m){
  const data = await api('grid');
  const pct = (v) => Number(v ?? 0).toFixed(1).replace(/\.0$/, '') + '%';
  const kgpct = (c) => `${c.kg}kg / ${pct(c.pct)}`;
  const badgeOk = '<span class="tag green">convalidata</span>';
  const badgeKo = '<span class="tag warn">da convalidare</span>';

  const confTag = (c) => c === 'alta' ? '<span class="tag green">confidenza alta</span>'
    : c === 'media' ? '<span class="tag warn">confidenza media</span>'
    : c === 'bassa' ? '<span class="tag red">confidenza bassa</span>' : '';

  m.innerHTML = `
  <div class="panel">
    <h2>Griglia <span class="muted" style="font-size:12.5px">${data.exists ? `${data.cells.length} celle · ${data.drivers} piloti · AI ${data.aiMin ?? '–'}–${data.aiMax ?? '–'} · PI ${data.piMin ?? '–'}–${data.piMax ?? '–'}` : ' (file customgrid non trovato)'}</span></h2>
    ${data.classe ? `<div style="margin:6px 0 10px">Classe combaciata: <b>${esc(data.classe)}</b>${data.perTraccia ? ` · per-traccia <b>${esc(data.perTraccia)}</b> ${data.convalidato ? badgeOk : badgeKo}` : ''}</div>` : '<div class="muted" style="margin:6px 0 10px">Nessuna classe combacia con le auto della griglia</div>'}
    ${data.escluseClasse?.length || data.escluseTraccia?.length ? `<div class="banner" style="border-color:#d9a83e">Auto escluse ancora presenti nel file: ${esc([...(data.escluseClasse ?? []), ...(data.escluseTraccia ?? [])].join(' · '))} → usa “Applica bilancio” per rimuoverle</div>` : ''}
    <table><thead><tr><th>#</th><th>Auto</th><th>Preset</th><th class="right">Zavorra / Penalità</th></tr></thead>
    <tbody>${(data.cells ?? []).map((c, i) => `<tr><td class="muted">${i + 1}</td><td>${esc(c.name)}</td><td class="muted" style="font-size:11.5px">${esc(c.preset ?? '—')}</td><td class="right">${kgpct(c)}</td></tr>`).join('')}</tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Classi e regole</h2>
    ${(data.classi ?? []).map((cl) => `
      <details ${data.classe === cl.id ? 'open' : ''} style="margin-bottom:10px;border:1px solid var(--line,#333);border-radius:8px;padding:10px">
        <summary style="cursor:pointer"><b>${esc(cl.id)}</b> ${cl.aiStandard ? `<span class="muted">· AI ${cl.aiStandard[0]}–${cl.aiStandard[1]}</span>` : ''}
          ${(cl.convalidatoSu || []).length ? ` · su ${esc(cl.convalidatoSu.join(', '))}: ${badgeOk}` : ''}</summary>
        <div class="row" style="align-items:start;gap:14px;margin-top:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:280px">
            <div class="muted" style="margin-bottom:4px">Regole base${cl.autoBase ? ` — base: <b>${esc(cl.autoBase)}</b>` : ''}</div>
            <table><tbody>${cl.regole.map((r) => `<tr><td>${esc(r.auto)}</td><td class="muted" style="font-size:11.5px">${esc(r.preset ?? '')}</td><td class="right">${r.kg}kg / ${pct(r.pct)}</td><td>${r.escluso ? '<span class="tag red">esclusa</span>' : ''}</td></tr>`).join('')}</tbody></table>
          </div>
          <div style="flex:1;min-width:280px">
            <div class="muted" style="margin-bottom:4px">Supplementi per-traccia</div>
            ${cl.perTraccia.length ? cl.perTraccia.map((pt) => `
              <div style="margin-bottom:8px;padding:8px;border-left:3px solid var(--line,#333)">
                <b>${esc(pt.traccia)}</b> ${pt.convalidato ? badgeOk : badgeKo}
                ${pt.restrictorPct ? `<div class="muted" style="font-size:11.5px">${esc(Object.entries(pt.restrictorPct).map(([p, v]) => `${p.replace(/^preset_/, '')} → ${pct(v)}`).join(' · '))}</div>` : ''}
                ${pt.aiStandard ? `<div class="muted" style="font-size:11.5px">AI per-traccia ${pt.aiStandard[0]}–${pt.aiStandard[1]}</div>` : ''}
                ${pt.escludiAuto?.length ? `<div class="muted" style="font-size:11.5px">escluse: ${esc(pt.escludiAuto.join(' · '))}</div>` : ''}
                ${pt.nota ? `<div class="muted" style="font-size:11px;margin-top:4px">${esc(String(pt.nota).slice(0, 200))}${String(pt.nota).length > 200 ? '…' : ''}</div>` : ''}
              </div>`).join('')
            : '<div class="faint">nessuna variante per-traccia</div>'}
          </div>
        </div>
      </details>`).join('')}
  </div>

  <div class="panel">
    <h2>Sede del weekend <span class="muted" style="font-size:12px">pista della ronda corrente · scrittura a gioco APERTO</span></h2>
    <div id="wtrack-box" class="muted" style="font-size:12px">carico…</div>
  </div>

  <div class="panel">
    <h2>Calibrazione dai risultati reali <span class="muted" style="font-size:12px">${data.calib?.eventi ? `${data.calib.eventi} gare nel registro · ${esc((data.calib.file ?? '').split('/').slice(-1)[0])}` : 'si riempie da sola ad ogni import'}</span></h2>
    ${(data.calib?.gruppi ?? []).length ? data.calib.gruppi.map((g) => `
      <details open style="margin-bottom:10px;border:1px solid var(--line,#333);border-radius:8px;padding:10px">
        <summary style="cursor:pointer"><b>${esc(g.classe)}</b> · <b>${esc(g.trkKey)}</b> — ${g.obs} gare (${g.ok} in tolleranza) ${confTag(g.confidenza)} ${g.convalidatoAdesso ? badgeOk : ''}</summary>
        <table><thead><tr><th>Auto (AI)</th><th class="right">Δ mediana vs base</th></tr></thead>
        <tbody>${g.perAuto.map((a) => `<tr><td>${esc(a.auto)}</td><td class="right" style="color:${a.medSec <= -0.8 ? '#e07070' : a.medSec < 0.8 ? '#7ec97e' : 'inherit'}">${a.medSec > 0 ? '+' : ''}${Number(a.medSec).toFixed(2)}s</td></tr>`).join('') || '<tr><td colspan="2" class="muted">nessun dato per-auto (base nuda o cap raggiunto)</td></tr>'}</tbody></table>
        ${(g.ultimaProposta ?? []).length ? `<div class="banner" style="margin-top:8px;border-color:#d9a83e"><b>Ultima proposta (${esc(String(g.ultimoAt ?? '').slice(0, 10))}):</b><br>${g.ultimaProposta.map((p) => p.leva === 'campo-ai' ? `campo AI ${esc(p.da)} → <b>${esc(p.a)}</b> — ${esc(p.perche)}` : `${esc(p.auto ?? '')}: ${esc(p.da)} → <b>${esc(p.a)}</b> — ${esc(p.perche)}`).join('<br>')}</div>` : '<div class="muted" style="margin-top:8px">nessuna proposta: i supplementi tengono</div>'}
        ${g.suggerisciConvalida ? `<div class="muted" style="margin-top:6px">convalidabile ora da terminale: <b>node ac-evo-career.mjs griglia-calib --convalida "${esc(g.trkKey)}"</b></div>` : ''}
      </details>`).join('')
    : '<div class="muted">Ancora nessuna gara nella classe conosciuta dopo l\'attivazione: ogni import con auto di una classe nota aggiunge qui osservazione e proposte. Sistema: node ac-evo-career.mjs griglia-calib</div>'}
  </div>

  <div class="panel">
    <h2>Azioni <span class="muted" style="font-size:12px">(EVO deve essere chiuso)</span></h2>
    <div class="row" style="flex-wrap:wrap">
      <select id="g-classe" style="min-width:220px">${(data.classi ?? []).map((c) => `<option value="${esc(c.id)}" ${data.classe === c.id ? 'selected' : ''}>${esc(c.id)}</option>`).join('')}</select>
      <input id="g-track" type="text" placeholder="traccia (es. Sebring International Raceway)" style="width:260px" value="${esc(data.perTraccia ?? '')}">
      <button class="act" id="g-apply">Applica bilancio</button>
    </div>
    <div class="row" style="flex-wrap:wrap;margin-top:8px">
      <span class="muted">AI</span>
      <input id="g-ai-min" type="number" min="0" max="100" value="${data.aiMin ?? 99}" style="width:70px">
      <span class="muted">–</span>
      <input id="g-ai-max" type="number" min="0" max="100" value="${data.aiMax ?? 100}" style="width:70px">
      <button class="ghost" id="g-ai">Imposta intervallo AI</button>
      <button class="ghost" id="g-drop">Rimuovi auto escluse dal file</button>
      <button class="ghost" id="g-reload">Ricarica</button>
    </div>
    <div id="grid-out" style="margin-top:12px"></div>
    <div class="muted" style="font-size:11.5px;margin-top:10px">“Applica bilancio” riscrive zavorre/penalità della classe (con supplementi per-traccia se la traccia combacia) e rimuove dal pool le auto in escludiAuto (di classe o per-traccia).</div>
  </div>`;

  const out = (html, kind) => { $('#grid-out').innerHTML = html ? `<div class="banner ${kind ?? ''}">${html}</div>` : ''; };
  const busy = (btn, on, text) => { btn.disabled = on; btn.innerHTML = on ? '<span class="spin"></span>' : text; };

  $('#g-reload').onclick = () => render();

  $('#g-apply').onclick = async () => {
    const b = $('#g-apply'); busy(b, true, 'Applica');
    try {
      const r = await api('grid-apply', { serie: $('#g-classe').value, track: $('#g-track').value.trim() || null });
      out(`scrivto per <b>${esc(r.classe)}</b>${esc(r.trkMsg ?? '')} · ${r.report.length} celle toccate — rileggo…`);
      setTimeout(render, 900);
    } catch (e) { out(esc(e.message), 'bad'); busy(b, false, 'Applica'); }
  };

  $('#g-ai').onclick = async () => {
    try { await api('grid-ai', { min: Number($('#g-ai-min').value), max: Number($('#g-ai-max').value) }); out('Intervallo AI riscritto sul customgrid.'); setTimeout(render, 600); }
    catch (e) { out(esc(e.message), 'bad'); }
  };

  // SEDE DEL WEEKEND: la pista della ronda corrente scritta nel gamemodesave.
  // A differenza delle azioni griglia, QUESTA è permessa a gioco aperto: il menu
  // di EVO adotta il file riscritto (verificato 3/3 con Suzuka ↔ Red Bull Ring).
  try {
    const wt = await api('weekend-track');
    const wtBox = $('#wtrack-box');
    if (wtBox) {
      const assert = wt.same === true
        ? '<span class="tag green">già a posto</span>'
        : wt.same === false ? '<span class="tag warn">da sistemare</span>' : '';
      wtBox.innerHTML = `
        <div>sul file: <b>${esc(wt.current ?? 'file non trovato')}</b> · ronda attesa: <b>${esc(wt.expected ?? '—')}</b> ${assert}</div>
        ${wt.expected ? `<div class="row" style="margin-top:8px;flex-wrap:wrap">
          <button class="act" id="wtrack-set">Porta il weekend su "${esc(wt.expected)}"</button>
          <span class="muted" style="font-size:11.5px">scrive anche con EVO aperto · backup automatico</span>
        </div>` : ''}`;
      $('#wtrack-set')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'scrivo…';
        try {
          const r = await api('weekend-track', { track: wt.expected });
          wtBox.innerHTML = `<div class="banner ok">settata: <b>${esc(r.current)}</b>${r.written ? ` · backup ${esc(String(r.backup).split('/').pop())}` : ' (già in piedi)'} — nel menu di EVO esci e rientra nella schermata pista per vederla.</div>`;
        } catch (err) { wtBox.innerHTML = `<div class="banner bad">${esc(err.message)}</div>`; }
      });
    }
  } catch { /* il pannello sede non deve mai rompere la tab */ }

  $('#g-drop').onclick = async () => {
    const b = $('#g-drop'); busy(b, true, 'Rimuovi');
    try {
      const preset = prompt('Preset o Nome auto da rimuovere (es. preset_mk8gti_mech_1):');
      if (!preset) { busy(b, false, 'Rimuovi'); return; }
      const cls = (data.classi ?? []).find((c) => c.id === data.classe);
      const escluse = [...(cls?.regole?.filter((r) => r.escluso).map((r) => r.preset ?? r.auto) ?? [])];
      const matchers = preset === 'ESCLUSE' ? escluse : [preset];
      const r = await api('grid-drop', { matchers });
      out(r.droppate?.length ? `Rimosse: ${esc(r.droppate.join(' · '))}` : 'Nessuna cella corrispondente.');
      setTimeout(render, 600);
    } catch (e) { out(esc(e.message), 'bad'); }
    busy(b, false, 'Rimuovi');
  };
}
