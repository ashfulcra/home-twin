# Home care and evidence

All maintainable systems and household tasks can be recorded. System placeholders are not verified equipment. A provider's name/trade/contact and each completed maintenance visit retain source or authenticated contributor evidence. An unknown last-service date never means “never serviced.”

The Care UI looks up plumber/electrician/roofing contacts and matching equipment service/provider records. It is evidence lookup, not a general-purpose language model. Equipment links open the associated dashboard record; original document links open the source.

Add `contact`, `schedule` or `task-completion` contributions through the authenticated API/UI. Contact uses `value` (name), `field` (trade), optional phone/email/text. Schedule uses `value` (title), `field` (`chore` or `maintenance`), explicit `dueAt`, optional assignee/entityId/text. Completion uses scheduleId, actual performedAt and text. Maintenance accepts optional contactId referring to a recorded contact. Dates and recorders are distinct. Retrying the same contribution ID has one effect.

Date-only deadlines use the home's calendar day. Completion is recorded independently; there is no inferred visit or invented recurring interval. A recurring task needs a new explicitly established occurrence; the current app does not silently advance it. In-app due cards are reminders. External notifications, child-directed messages and device control require explicitly configured channels, recipients and authorization; none are enabled by default.
