// lang.mjs — infrastruttura lingua per CLI, server e localizzazione della
// scala carriera. La scelta vive in UN posto per il tutto: l'impostazione in
// GUI la scrive in evo.config.json (via /api/lang) e CLI/server la leggono
// da là. EVO_LANG d'ambiente resta arbitrato superiore (comanda se presente).
// Esempi:
//   EVO_LANG=en node ac-evo-career.mjs weather --v   (override esplicito)
const ENV_LANG = process.env.EVO_LANG;
const ENV_OVERRIDE = ENV_LANG != null && ENV_LANG !== '';
const wantEn = (v) => /^(en|eng)$/i.test(String(v ?? ''));
let _lang = wantEn(ENV_LANG) ? 'en' : 'it';

export const hasEnvOverride = () => ENV_OVERRIDE;
export const lang = () => _lang;
export function setLang(l) { _lang = wantEn(l) ? 'en' : 'it'; return _lang; }
/** Lingua salvata dal config del server: si applica solo senza override d'ambiente. */
export function applyLangConfig(stored) {
  if (ENV_OVERRIDE || stored == null) return _lang;
  return setLang(stored);
}

export const tr = (p) => (p && (p[lang()] ?? p.it)) ?? '';

/* ------------------------------------------------------------------ */
/* localizzazione della scala carriera                                 */
/* ------------------------------------------------------------------ */
/* I testi generici della scala (discipline, archetipi, nomi serie)     */
/* vivono nel ladder con i campi italiani e i loro gemelli *En. Qui,    */
/* a tempo di caricamento (loadLadder di cli e webui), traduco in      */
/* lingua corrente. Le scritture su file (orario) passano da           */
/* delocalizeLadder() e il JSON su disco resta sempre italiano.        */

// nomi di serie che non seguono i pattern generici
const DISPLAY_EN = new Map([
  ['Coppa Città', 'City Cup'],
  ['Trofeo Hatch', 'Hatch Trophy'],
  ['Turismo Legends', 'Touring Legends'],
  ['Berline Moderne', 'Modern Saloons'],
  ['Formula 2004 - Prova', 'Formula 2004 - Test'],
  ['GT4 Serie B', 'GT4 Series B'],
  ['GT3 Serie A', 'GT3 Series A'],
  ['Leggende Stradali', 'Road Legends'],
  ['Coppa Strada', 'Street Cup'],
  ['Coppa Gruppo B', 'Group B Cup'],
  ['Rally Anni 90', '90s Rally'],
  ['Strade Leggendarie', 'Legendary Roads'],
  ['Strada Elite', 'Street Elite'],
]);

function displayEn(display) {
  if (DISPLAY_EN.has(display)) return DISPLAY_EN.get(display);
  if (/^Coppa /.test(display)) {
    const stem = display.slice('Coppa '.length);
    return / (Cup|Trophy)$/.test(stem) ? stem : stem + ' Cup';
  }
  if (/^Trofeo /.test(display)) return display.slice('Trofeo '.length) + ' Trophy';
  if (/ Coppa$/.test(display) && !/^Coppa/.test(display)) return display.slice(0, -' Coppa'.length) + ' Cup';
  if (/ Trofeo$/.test(display) && !/^Trofeo/.test(display)) return display.slice(0, -' Trofeo'.length) + ' Trophy';
  return null; // già adatta a EN ("GT4 Open", "Formula Elite", ...)
}

/** Traduce name/description/display del ladder nella lingua corrente, in place.

 *  Il file su disco resta sempre italiano: le scritture (orario) rileggono
 *  la base dal disco e vi copiano solo i campi che intendono cambiare. */
export function localizeLadder(ladder) {
  if (lang() !== 'en' || !ladder || typeof ladder !== 'object') return ladder;
  for (const d of ladder.disciplines ?? []) {
    if (d.nameEn) d.name = d.nameEn;
    if (d.descriptionEn) d.description = d.descriptionEn;
  }
  for (const a of Object.values(ladder.archetypes ?? {})) {
    if (a.nameEn) a.name = a.nameEn;
    if (a.descriptionEn) a.description = a.descriptionEn;
  }
  for (const n of ladder.nodes ?? []) {
    if (n.display) n.display = displayEn(n.display) ?? n.display;
  }
  return ladder;
}

