// nome-pilota.mjs — il nome del pilota come viene scritto nei risulrati EVO.
export function nomePilota(name, surname) {
  const n = String(name ?? '').replace(/^[•\u2022]\s*/, '').trim();
  const s = String(surname ?? '').trim();
  if (!n) return s;
  if (!s) return n;
  // profili di primo EVO con nome=cognome («Turbigno Turbigno», 15/4):
  // si scrive una volta sola, il cognome.
  if (n.toLowerCase() === s.toLowerCase()) return s;
  return `${n} ${s}`;
}
