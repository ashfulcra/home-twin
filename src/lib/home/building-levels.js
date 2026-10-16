/** Logical floors retain split physical datums. No geometry or source authority is inferred. */
/** @param {any[]} levels @param {string} id */
export function logicalLevel(levels, id) {
  const level = levels.find((l) => l.id === id);
  return level?.logicalGroup ?? level?.id ?? id;
}
/** @param {any[]} levels */
export function floorLevels(levels) {
  return levels.filter((l) => logicalLevel(levels, l.id) === l.id);
}
/** @param {any[]} levels @param {string} id @param {string} selected */
export function levelMatches(levels, id, selected) {
  return selected === 'all' || logicalLevel(levels, id) === logicalLevel(levels, selected);
}
/** @param {any[]} levels @param {string} id */
export function levelSeparation(levels, id) {
  return (
    Math.max(
      0,
      floorLevels(levels).findIndex((l) => l.id === logicalLevel(levels, id))
    ) * 16
  );
}
