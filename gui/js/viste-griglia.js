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
  const badgeOk = `<span class="tag green">${tr({ it: 'convalidata', en: 'validated' })}</span>`;
  const badgeKo = `<span class="tag warn">${tr({ it: 'da convalidare', en: 'to validate' })}</span>`;

  const confTag = (c) => c === 'alta' ? `<span class="tag green">${tr({ it: 'confidenza alta', en: 'high confidence' })}</span>`
    : c === 'media' ? `<span class="tag warn">${tr({ it: 'confidenza media', en: 'medium confidence' })}</span>`
    : c === 'bassa' ? `<span class="tag red">${tr({ it: 'confidenza bassa', en: 'low confidence' })}</span>` : '';

  m.innerHTML = `
  <div class="panel">
    <h2>${tr({ it: 'Griglia', en: 'Grid' })} <span class="muted" style="font-size:12.5px">${data.exists ? `${data.cells.length} ${tr({ it: 'celle', en: 'cells' })} · ${data.drivers} ${tr({ it: 'piloti', en: 'drivers' })} · AI ${data.aiMin ?? '–'}–${data.aiMax ?? '–'} · PI ${data.piMin ?? '–'}–${data.piMax ?? '–'}` : ` (${tr({ it: 'file customgrid non trovato', en: 'customgrid file not found' })})`}</span></h2>
    ${data.classe ? `<div style="margin:6px 0 10px">${tr({ it: 'Classe combaciata:', en: 'Matched class:' })} <b>${esc(data.classe)}</b>${data.perTraccia ? ` · ${tr({ it: 'per-traccia', en: 'per-track' })} <b>${esc(data.perTraccia)}</b> ${data.convalidato ? badgeOk : badgeKo}` : ''}</div>` : `<div class="muted" style="margin:6px 0 10px">${tr({ it: 'Nessuna classe combacia con le auto della griglia', en: 'No class matches the grid cars' })}</div>`}
    ${data.escluseClasse?.length || data.escluseTraccia?.length ? `<div class="banner" style="border-color:#d9a83e">${tr({ it: 'Auto escluse ancora presenti nel file: {A} → usa "Applica bilancio" per rimuoverle', en: 'Excluded cars still in the file: {A} → use "Apply balance" to remove them' }).replace('{A}', esc([...(data.escluseClasse ?? []), ...(data.escluseTraccia ?? [])].join(' · ')))}</div>` : ''}
    <table><thead><tr><th>#</th><th>${tr({ it: 'Auto', en: 'Car' })}</th><th>${tr({ it: 'Preset', en: 'Preset' })}</th><th class="right">${tr({ it: 'Zavorra / Penalità', en: 'Ballast / Penalty' })}</th></tr></thead>
    <tbody>${(data.cells ?? []).map((c, i) => `<tr><td class="muted">${i + 1}</td><td>${esc(c.name)}</td><td class="muted" style="font-size:11.5px">${esc(c.preset ?? '—')}</td><td class="right">${kgpct(c)}</td></tr>`).join('')}</tbody>
    </table>
  </div>

  <div class="panel">
    <h2>${tr({ it: 'Classi e regole', en: 'Classes and rules' })}</h2>
    ${(data.classi ?? []).map((cl) => `
      <details ${data.classe === cl.id ? 'open' : ''} style="margin-bottom:10px;border:1px solid var(--line,#333);border-radius:8px;padding:10px">
        <summary style="cursor:pointer"><b>${esc(cl.id)}</b> ${cl.aiStandard ? `<span class="muted">· AI ${cl.aiStandard[0]}–${cl.aiStandard[1]}</span>` : ''}
          ${(cl.convalidatoSu || []).length ? ` · ${tr({ it: 'su ', en: 'on ' })}${esc(cl.convalidatoSu.join(', '))}: ${badgeOk}` : ''}</summary>
        <div class="row" style="align-items:start;gap:14px;margin-top:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:280px">
            <div class="muted" style="margin-bottom:4px">${tr({ it: 'Regole base', en: 'Base rules' })}${cl.autoBase ? ` — ${tr({ it: 'base: ', en: 'base: ' })}<b>${esc(legacyIt(cl.autoBase))}</b>` : ''}</div>
            <table><tbody>${cl.regole.map((r) => `<tr><td>${esc(r.auto)}</td><td class="muted" style="font-size:11.5px">${esc(r.preset ?? '')}</td><td class="right">${r.kg}kg / ${pct(r.pct)}</td><td>${r.escluso ? `<span class="tag red">${tr({ it: 'esclusa', en: 'excluded' })}</span>` : ''}</td></tr>`).join('')}</tbody></table>
          </div>
          <div style="flex:1;min-width:280px">
            <div class="muted" style="margin-bottom:4px">${tr({ it: 'Supplementi per-traccia', en: 'Per-track supplements' })}</div>
            ${cl.perTraccia.length ? cl.perTraccia.map((pt) => `
              <div style="margin-bottom:8px;padding:8px;border-left:3px solid var(--line,#333)">
                <b>${esc(pt.traccia)}</b> ${pt.convalidato ? badgeOk : badgeKo}
                ${pt.restrictorPct ? `<div class="muted" style="font-size:11.5px">${esc(Object.entries(pt.restrictorPct).map(([p, v]) => `${p.replace(/^preset_/, '')} → ${pct(v)}`).join(' · '))}</div>` : ''}
                ${pt.aiStandard ? `<div class="muted" style="font-size:11.5px">${tr({ it: 'AI per-traccia', en: 'per-track AI' })} ${pt.aiStandard[0]}–${pt.aiStandard[1]}</div>` : ''}
                ${pt.escludiAuto?.length ? `<div class="muted" style="font-size:11.5px">${esc(pt.escludiAuto.join(' · '))}</div>` : ''}
                ${pt.nota ? `<div class="muted" style="font-size:11px;margin-top:4px">${esc(String(pt.nota).slice(0, 200))}${String(pt.nota).length > 200 ? '…' : ''}</div>` : ''}
              </div>`).join('')
            : `<div class="faint">${tr({ it: 'nessuna variante per-traccia', en: 'no per-track variant' })}</div>`}
          </div>
        </div>
      </details>`).join('')}
  </div>

  <div class="panel">
    <h2>${tr({ it: 'Sede del weekend', en: 'Weekend venue' })} <span class="muted" style="font-size:12px">${tr({ it: 'pista della ronda corrente · scrittura a gioco APERTO', en: 'current round track · write allowed with the GAME OPEN' })}</span></h2>
    <div id="wtrack-box" class="muted" style="font-size:12px">${tr({ it: 'carico…', en: 'loading…' })}</div>
  </div>

  <div class="panel">
    <h2>${tr({ it: 'Calibrazione dai risultati reali', en: 'Calibration from real results' })} <span class="muted" style="font-size:12px">${data.calib?.eventi ? `${data.calib.eventi} ${tr({ it: 'gare nel registro', en: 'races in the log' })} · ${esc((data.calib.file ?? '').split('/').slice(-1)[0])}` : tr({ it: 'si riempie da sola ad ogni import', en: 'fills itself at every import' })}</span></h2>
    ${(data.calib?.gruppi ?? []).length ? data.calib.gruppi.map((g) => `
      <details open style="margin-bottom:10px;border:1px solid var(--line,#333);border-radius:8px;padding:10px">
        <summary style="cursor:pointer"><b>${esc(g.classe)}</b> · <b>${esc(g.trkKey)}</b> — ${g.obs} ${tr({ it: 'gare', en: 'races' })} (${g.ok} ${tr({ it: 'in tolleranza', en: 'within tolerance' })}) ${confTag(g.confidenza)} ${g.convalidatoAdesso ? badgeOk : ''}</summary>
        <table><thead><tr><th>${tr({ it: 'Auto (AI)', en: 'Car (AI)' })}</th><th class="right">${tr({ it: 'Δ mediana vs base', en: 'Δ median vs base' })}</th></tr></thead>
        <tbody>${g.perAuto.map((a) => `<tr><td>${esc(a.auto)}</td><td class="right" style="color:${a.medSec <= -0.8 ? '#e07070' : a.medSec < 0.8 ? '#7ec97e' : 'inherit'}">${a.medSec > 0 ? '+' : ''}${Number(a.medSec).toFixed(2)}s</td></tr>`).join('') || `<tr><td colspan="2" class="muted">${tr({ it: 'nessun dato per-auto (base nuda o cap raggiunto)', en: 'no per-car data (bare base or cap reached)' })}</td></tr>`}</tbody></table>
        ${(g.ultimaProposta ?? []).length ? `<div class="banner" style="margin-top:8px;border-color:#d9a83e"><b>${tr({ it: 'Ultima proposta (', en: 'Last proposal (' })}${esc(String(g.ultimoAt ?? '').slice(0, 10))}):</b><br>${g.ultimaProposta.map((p) => p.leva === 'campo-ai' ? `${tr({ it: 'campo AI', en: 'AI field' })} ${esc(p.da)} → <b>${esc(p.a)}</b> — ${esc(legacyIt(p.perche))}` : `${esc(p.auto ?? '')}: ${esc(p.da)} → <b>${esc(p.a)}</b> — ${esc(legacyIt(p.perche))}`).join('<br>')}</div>` : `<div class="muted" style="margin-top:8px">${tr({ it: 'nessuna proposta: i supplementi tengono', en: 'no proposal: supplements hold' })}</div>`}
        ${g.suggerisciConvalida ? `<div class="muted" style="margin-top:6px">${tr({ it: 'convalidabile ora da terminale:', en: 'validatable now from the terminal:' })} <b>node ac-evo-career.mjs griglia-calib --convalida "${esc(g.trkKey)}"</b></div>` : ''}
      </details>`).join('')
    : `<div class="muted">${tr({ it: "Ancora nessuna gara nella classe conosciuta dopo l'attivazione: ogni import con auto di una classe nota aggiunge qui osservazione e proposte. Sistema: node ac-evo-career.mjs griglia-calib", en: 'No race in a known class yet since activation: every import with cars of a known class adds an observation and proposals here. Fix it: node ac-evo-career.mjs griglia-calib' })}</div>`}
  </div>

  <div class="panel">
    <h2>${tr({ it: 'Azioni', en: 'Actions' })} <span class="muted" style="font-size:12px">${tr({ it: '(EVO deve essere chiuso)', en: '(EVO must be closed)' })}</span></h2>
    <div class="row" style="flex-wrap:wrap">
      <select id="g-classe" style="min-width:220px">${(data.classi ?? []).map((c) => `<option value="${esc(c.id)}" ${data.classe === c.id ? 'selected' : ''}>${esc(c.id)}</option>`).join('')}</select>
      <input id="g-track" type="text" placeholder="${tr({ it: 'traccia (es. Sebring International Raceway)', en: 'track (e.g. Sebring International Raceway)' })}" style="width:260px" value="${esc(data.perTraccia ?? '')}">
      <button class="act" id="g-apply">${tr({ it: 'Applica bilancio', en: 'Apply balance' })}</button>
    </div>
    <div class="row" style="flex-wrap:wrap;margin-top:8px">
      <span class="muted">AI</span>
      <input id="g-ai-min" type="number" min="0" max="100" value="${data.aiMin ?? 99}" style="width:70px">
      <span class="muted">–</span>
      <input id="g-ai-max" type="number" min="0" max="100" value="${data.aiMax ?? 100}" style="width:70px">
      <button class="ghost" id="g-ai">${tr({ it: 'Imposta intervallo AI', en: 'Set AI range' })}</button>
      <button class="ghost" id="g-drop">${tr({ it: 'Rimuovi auto escluse dal file', en: 'Remove excluded cars from file' })}</button>
      <button class="ghost" id="g-reload">${tr({ it: 'Ricarica', en: 'Reload' })}</button>
    </div>
    <div id="grid-out" style="margin-top:12px"></div>
    <div class="muted" style="font-size:11.5px;margin-top:10px">${tr({ it: '"Applica bilancio" riscrive zavorre/penalità della classe (con supplementi per-traccia se la traccia combacia) e rimuove dal pool le auto in escludiAuto (di classe o per-traccia).', en: '"Apply balance" rewrites the class ballast/penalties (with per-track supplements if the track matches) and removes escludiAuto cars from the pool (class-level or per-track).' })}</div>
  </div>`;

  const out = (html, kind) => { $('#grid-out').innerHTML = html ? `<div class="banner ${kind ?? ''}">${html}</div>` : ''; };
  const busy = (btn, on, text) => { btn.disabled = on; btn.innerHTML = on ? '<span class="spin"></span>' : text; };

  $('#g-reload').onclick = () => render();

  $('#g-apply').onclick = async () => {
    const b = $('#g-apply'); busy(b, true, tr({ it: 'Applica', en: 'Apply' }));
    try {
      const r = await api('grid-apply', { serie: $('#g-classe').value, track: $('#g-track').value.trim() || null });
      out(tr({ it: 'scrivto per {C}{T} · {N} celle toccate — rileggo…', en: 'written for {C}{T} · {N} cells touched — reloading…' }).replace('{C}', `<b>${esc(r.classe)}</b>`).replace('{T}', esc(r.trkMsg ?? '')).replace('{N}', r.report.length));
      setTimeout(render, 900);
    } catch (e) { out(esc(e.message), 'bad'); busy(b, false, tr({ it: 'Applica', en: 'Apply' })); }
  };

  $('#g-ai').onclick = async () => {
    try { await api('grid-ai', { min: Number($('#g-ai-min').value), max: Number($('#g-ai-max').value) }); out(tr({ it: 'Intervallo AI riscritto sul customgrid.', en: 'AI range rewritten on the customgrid.' })); setTimeout(render, 600); }
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
        ? `<span class="tag green">${tr({ it: 'già a posto', en: 'already in place' })}</span>`
        : wt.same === false ? `<span class="tag warn">${tr({ it: 'da sistemare', en: 'needs fixing' })}</span>` : '';
      wtBox.innerHTML = `
        <div>${tr({ it: 'sul file: ', en: 'on file: ' })}<b>${esc(wt.current ?? tr({ it: 'file non trovato', en: 'file not found' }))}</b> · ${tr({ it: 'ronda attesa: ', en: 'expected round: ' })}<b>${esc(wt.expected ?? '—')}</b> ${assert}</div>
        ${wt.expected ? `<div class="row" style="margin-top:8px;flex-wrap:wrap">
          <button class="act" id="wtrack-set">${tr({ it: 'Porta il weekend su "{T}"', en: 'Move the weekend to "{T}"' }).replace('{T}', esc(wt.expected))}</button>
          ${tr({ it: '<span class="muted" style="font-size:11.5px">scrive anche con EVO aperto · backup automatico</span>', en: '<span class="muted" style="font-size:11.5px">writes even with EVO open · automatic backup</span>' })}
        </div>` : ''}`;
      $('#wtrack-set')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = tr({ it: 'scrivo…', en: 'writing…' });
        try {
          const r = await api('weekend-track', { track: wt.expected });
          wtBox.innerHTML = `<div class="banner ok">${tr({ it: 'settata: ', en: 'set: ' })}<b>${esc(r.current)}</b>${r.written ? ` · ${tr({ it: 'backup ', en: 'backup ' })}${esc(String(r.backup).split('/').pop())}` : ` (${tr({ it: 'già in piedi', en: 'already in place' })})`} — ${tr({ it: 'nel menu di EVO esci e rientra nella schermata pista per vederla.', en: 'in the EVO menu leave and re-enter the track screen to see it.' })}</div>`;
        } catch (err) { wtBox.innerHTML = `<div class="banner bad">${esc(err.message)}</div>`; }
      });
    }
  } catch { /* il pannello sede non deve mai rompere la tab */ }

  $('#g-drop').onclick = async () => {
    const b = $('#g-drop'); busy(b, true, tr({ it: 'Rimuovi', en: 'Remove' }));
    try {
      const preset = prompt(tr({ it: 'Preset o Nome auto da rimuovere (es. preset_mk8gti_mech_1):', en: 'Preset or car Name to remove (e.g. preset_mk8gti_mech_1):' }));
      if (!preset) { busy(b, false, tr({ it: 'Rimuovi', en: 'Remove' })); return; }
      const cls = (data.classi ?? []).find((c) => c.id === data.classe);
      const escluse = [...(cls?.regole?.filter((r) => r.escluso).map((r) => r.preset ?? r.auto) ?? [])];
      const matchers = preset === 'ESCLUSE' ? escluse : [preset];
      const r = await api('grid-drop', { matchers });
      out(r.droppate?.length ? `${tr({ it: 'Rimosse: ', en: 'Removed: ' })}${esc(r.droppate.join(' · '))}` : tr({ it: 'Nessuna cella corrispondente.', en: 'No matching cell.' }));
      setTimeout(render, 600);
    } catch (e) { out(esc(e.message), 'bad'); }
    busy(b, false, tr({ it: 'Rimuovi', en: 'Remove' }));
  };
}
