// Mezcla Fisher-Yates (no destructiva).
export function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Reparte los equipos (ya mezclados) en `numGroups` grupos lo más
 * balanceados posible, con reparto tipo "serpiente" no necesario:
 * un simple round-robin de asignación mantiene tamaños equilibrados.
 *
 * @param {number[]} teamIds
 * @param {number} numGroups
 * @returns {number[][]} grupos de ids
 */
export function distributeIntoGroups(teamIds, numGroups) {
  const shuffled = shuffle(teamIds);
  const groups = Array.from({ length: numGroups }, () => []);
  shuffled.forEach((id, idx) => {
    groups[idx % numGroups].push(id);
  });
  return groups;
}
