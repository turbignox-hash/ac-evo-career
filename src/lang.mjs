// lang.mjs — infrastruttura lingua per CLI e server (fase 4). Semplice ed
// esplicita come tr() della GUI: la scelta vive nella variabile d'ambiente
// EVO_LANG ('it' predefinito, 'en' alternato); niente nuovi campi nel save.
// Esempi:
//   EVO_LANG=en node ac-evo-career.mjs weather --v
export const LANG = /^(en|eng)$/i.test(process.env.EVO_LANG ?? '') ? 'en' : 'it';

export const tr = (p) => (p && (p[LANG] ?? p.it)) ?? '';
