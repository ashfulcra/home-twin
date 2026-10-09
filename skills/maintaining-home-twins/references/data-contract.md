# Home Twin data contract

Use the repository's `examples/home.json` as the minimal accepted schema v1. Required: schemaVersion1, positive integer revision, stable lowercase home ID, name. Collections: rooms, equipment, contacts, history, schedules, sources, notes. Empty collections and null plan are useful, valid states. Shared homes additionally need authenticated ownerUserId and members with userId/role(viewer or contributor).

Equipment: stable id, user-facing name, system, optional manufacturer/model/serial/capacity/installedAt, roomId, contactId, facts[{name,value}], sourceIds. An equipment placeholder is not a confirmed installed unit. Keep evidence origin and inventoryStatus explicit.

Sources: id,title,path,origin,recordedAt,verifiedAt. Import time is not verification. For shared homes copy only household-approved originals to `/shared/home-twin/<home-id>/sources/` and point source paths there.

History: stable id,kind=maintenance,status=completed,equipmentId,performedAt,summary,contactId,sourceIds. Use actual evidenced service date. Schedules: id,kind(maintenance/chore/automation),name,dueAt,description,sourceIds; recurrence is not completion. Missing dueAt is unscheduled. Contacts: id,name,trade,phone,email,sourceIds; don't invent provider identities.

Contributions: UUID id,homeId,baseRevision,kind(note/fact/maintenance/geometry),optional entityId. Note/layout use text; fact uses field(model/manufacturer/serial/capacity/installedAt) and value; maintenance uses actual performedAt and text. Server stamps authorUserId and recordedAt. Keep the same UUID/payload across uncertain retries. Different content needs a new ID. The API rejects arbitrary paths and identity claims.

One maintainer publishes accepted snapshots. Record review decisions separately at `/shared/home-twin/<home-id>/reviews/<decision-uuid>.json` with contributionIds,previousValue,selectedValue,reason,evidencePaths,reviewedBy,reviewedAt. The current app displays conflicts but does not automatically apply decision files; the maintainer deliberately changes accepted facts after review. Never delete original evidence to clear a queue.

Validate locally: `node scripts/home-agent.mjs validate examples/home.json`. Reconcile downloaded, authenticated-attribution contribution files: `node scripts/home-agent.mjs reconcile accepted.json incoming/ new-report.json`. The report has home,accepted,review; this does not publish anything. Review the report and preserve the baseline. The script refuses to overwrite its output. Verify source accounts using authenticated shared download metadata; a JSON author assertion alone is not proof.

Layout drafts are documented in the matching repository’s `docs/layout-drafts.md`. They retain estimated rectangles, interview answers, raw freeform dimension text, canonical feet and overlap warnings. Select a floor/room/segment to refine locally. New or changed geometry is queued for review, never silently applied to the accepted model. Read registered members’ nested `contributions/layout-drafts/` with account attribution; explicitly reviewed snapshot publication still follows the single-maintainer version procedure.
