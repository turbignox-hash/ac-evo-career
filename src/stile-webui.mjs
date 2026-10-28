// stile-webui.mjs — I CINQUE MISCUGLI per la GUI (28/10, richiesta Mauro).
// Le cinque serie nate da tools/_genera-stili.mjs hanno classe + nodo ladder,
// ma il tab Campionati elenca SOLE le serie con sedile firmato: prima dell'
// iscrizione il pescaggio non si vede. Questo endpoint porta in GUI anche le
// non-iscritte, con pool sorteggiato, seme, regole (tag cap) e calendario.
// Fonte dati UNICA: loadClasses() (data/grid-classes.json, la STESSA che legge
// gridbuilder quando scrive la griglia — in GUI vedi esattamente ciò che gira).
import { loadClasses } from './gridbuilder.mjs';

const PROPRIETARI = new Set([
  'campionato_epoca', 'campionato_moderno', 'campionato_strada',
  'campionato_pista', 'campionato_corsa',
]);

export function stileOverview(ladder, state) {
  const classi = loadClasses().classi ?? {};
  const nomi = ladder.contentNames?.tracks ?? {};
  const nomiCars = ladder.contentNames?.cars ?? {};
  const rep = state.rep ?? 0;
  const stili = [];
  for (const node of ladder.nodes ?? []) {
    if (!PROPRIETARI.has(node.nodeId)) continue;
    const cls = classi[node.nodeId] ?? null;
    stili.push({
      id: node.nodeId,
      display: node.display,
      level: node.level ?? 0,
      repRequired: node.repRequired ?? 0,
      rep,
      sbloccato: rep >= (node.repRequired ?? 0),
      iscritto: !!(state.seats?.[node.nodeId]),
      isCurrent: node.nodeId === state.node,
      finestra: cls && cls.piMin != null ? [cls.piMin, cls.piMax] : [node.finestra?.[0] ?? null, node.finestra?.[1] ?? null],
      seed: (String(cls?.storia?.[0]?.variante ?? '').match(/seed=(\d+)/) ?? [])[1] ?? null,
      // poolAuto della classe (l'UNICA verità usata da gridbuilder per il pool);
      // resolved via contentNames del ladder: carLinkHtml li rende cliccabili.
      pool: (cls?.poolAuto ?? node.cars ?? []).map((id) => nomiCars[id] ?? id),
      regole: (cls?.regole ?? []).map((r) => ({
        auto: r.auto,
        kg: r.ballastKg ?? 0,
        pct: r.restrictorPct ?? 0,
        // le regole al cap portano la nota «→ cap 20; la prima gara decide»
        cap: /→ cap/.test(r.nota ?? ''),
      })),
      calendario: (node.calendar ?? []).map((r) => nomi[r.track] ?? r.track),
    });
  }
  return { stili };
}
