/** Readable exact review, without paths, authority metadata or hidden record fields.
 * @param {any} draft @param {any} home */
export function recordCard(draft, home) {
  const titles = {
    note: 'Home note',
    fact: 'Equipment detail',
    contact: 'Contact',
    maintenance: 'Maintenance record',
    schedule: draft.field === 'chore' ? 'Chore' : 'Maintenance task',
    'task-completion': 'Completed task'
  };
  const fields = {
    model: 'Model',
    manufacturer: 'Manufacturer',
    serial: 'Serial number',
    capacity: 'Capacity',
    installedAt: 'Installation date'
  };
  /** @type {string[][]} */ const rows = [];
  /** @param {string} label @param {any} value */ const add = (label, value) => {
    if (value) rows.push([label, String(value)]);
  };
  /** @param {any[]} items @param {string} id */ const name = (items, id) =>
    items?.find((item) => item.id === id)?.name ?? id;
  add(
    draft.kind === 'contact' ? 'Name' : 'Title',
    draft.value && draft.kind !== 'fact' ? draft.value : ''
  );
  add(draft.kind === 'contact' ? 'Trade' : '', draft.kind === 'contact' ? draft.field : '');
  add('Details', draft.text);
  add('Equipment', draft.entityId ? name(home.equipment, draft.entityId) : '');
  add(
    'Field',
    draft.kind === 'fact'
      ? (fields[/** @type {keyof typeof fields} */ (draft.field)] ?? draft.field)
      : ''
  );
  add('Value', draft.kind === 'fact' ? draft.value : '');
  add('Phone', draft.phone);
  add('Email', draft.email);
  add('Contact', draft.contactId ? name(home.contacts, draft.contactId) : '');
  add('Task', draft.scheduleId ? name(home.schedules, draft.scheduleId) : '');
  add('Completed', draft.performedAt);
  add('Occurrence due', draft.occurrenceDueAt);
  add('Due', draft.dueAt);
  add('Assigned to', draft.assignee);
  add(
    'Repeats',
    draft.recurrence ? `Every ${draft.recurrence.every} ${draft.recurrence.unit}` : ''
  );
  add(
    'Sources',
    (draft.sourceIds ?? [])
      .map(
        (/** @type {string} */ id) =>
          home.sources?.find((/** @type {any} */ s) => s.id === id)?.title ?? id
      )
      .join(', ')
  );
  return { title: titles[/** @type {keyof typeof titles} */ (draft.kind)] ?? 'Home record', rows };
}
