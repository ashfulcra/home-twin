/** Build a read model without turning absent evidence into facts.
 * @param {any} home @param {string} asOf
 */
export function projectHome(home, asOf) {
  const now = Date.parse(asOf);
  const sources = (home.sources ?? []).map((/** @type {any} */ source) => {
    const verified = Date.parse(source.verifiedAt);
    return { ...source, freshness: !Number.isFinite(verified) || verified > now ? 'unknown' : now - verified > 30 * 86400000 ? 'stale' : 'recent' };
  });
  /** @param {any} record */
  const evidence = (record) => (record.sourceIds ?? []).map((/** @type {string} */ id) => sources.find((/** @type {any} */ source) => source.id === id)).filter(Boolean);
  const history = home.history ?? [];
  const equipment = (home.equipment ?? []).map((/** @type {any} */ item) => {
    const completed = history.filter((/** @type {any} */ event) => event.equipmentId === item.id && event.kind === 'maintenance' && event.status === 'completed' && Number.isFinite(Date.parse(event.performedAt)) && Date.parse(event.performedAt) <= now).sort((/** @type {any} */ a, /** @type {any} */ b) => Date.parse(b.performedAt) - Date.parse(a.performedAt));
    const lastService = completed[0] ?? null;
    const providerId = item.contactId ?? lastService?.contactId;
    return { ...item, lastService, provider: (home.contacts ?? []).find((/** @type {any} */ contact) => contact.id === providerId) ?? null, room: (home.rooms ?? []).find((/** @type {any} */ room) => room.id === item.roomId) ?? null, sources: evidence(item) };
  });
  const schedules = (home.schedules ?? []).map((/** @type {any} */ schedule) => {
    const due = Date.parse(schedule.dueAt);
    return { ...schedule, state: !Number.isFinite(due) ? 'unscheduled' : due < now ? 'past-due' : 'upcoming', sources: evidence(schedule) };
  });
  return { ...home, sources, equipment, schedules, history, asOf };
}
