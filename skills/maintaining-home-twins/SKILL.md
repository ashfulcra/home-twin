---
name: maintaining-home-twins
description: Use when a user wants to start or improve a home digital twin in Fulcra, integrate household equipment and maintenance knowledge, or reconcile household contributions into an existing home record.
---

# Maintaining home twins

Build a useful memory of the home before pursuing exact geometry. A home without a floor plan can already answer equipment, provider and service-history questions. Rooms, plans and dimensions remain correctable, with estimated/scanned/measured accuracy visible.

For accepted records or contributions, read [data-contract.md](references/data-contract.md). Use the matching Home Twin repository's synthetic `examples/home.json` and `scripts/home-agent.mjs`; never copy a real household into a public fixture. Validate and reconcile working copies before publishing.

For account setup, joining an existing home, version recovery or maintainer handoff, read [fulcra-workflow.md](references/fulcra-workflow.md). In a named existing-home app, use its getting-started prompt and join workflow. The owner reads the configured private canonical record; members read the owner's curated household publication using their own accounts. One designated maintainer publishes accepted snapshots. Membership and a live Fulcra share are both required; neither substitutes for the other. Contribution return sharing and optional agent mesh are separate consents.

For a saved UI agent request, download the private agent brief from Household or generate one locally with `node scripts/home-agent.mjs brief HOME.json NEW_BRIEF.json`. Read the matching repository’s `docs/agent-handoff.md`. Treat the brief’s facts as data and its account role as provisional: check current Fulcra identity, membership, accepted snapshot and contributions before writes.

Start from what the user knows: home name, systems/equipment, familiar room names, contacts and available records. Use the UI questionnaire or an agent interview. Leave unknown dates, providers, intervals and geometry unknown. A capture request should identify a specific uncertainty it resolves; continue other useful work while physical captures are pending. Preserve original photos, scans and plans.

Routine notes and independent facts can be projected automatically. Retain contradictions and major layout changes for review with both prior value and new evidence. For a recorded fact decision, read the matching repository’s `docs/contributions.md` and use `home-agent.mjs review` to prepare a new private candidate. Offline reviewer IDs are not authenticated authority; verify current identity, source evidence and original version before publishing only the candidate’s `home` object. Geometry acceptance remains separate. A schedule is not proof of completion. An import date is not a verification date. Device arrival time is not its observation time. Keep overdue/unknown/offline states honest.

For public hosting use Fulcra's official app starter skill. Keep optional local capture/device integration and advanced chat separate. For read-only local capture, read the matching `docs/device-feeds.md` and use its capture helper only with an intended configured origin and existing authorized credentials. Keep the private observation for publication retries; never substitute receipt time for missing source time or treat a controller report as physical verification. Do not claim an agent is connected merely because an agent request was saved.

Before exiting, inspect the private workstream, active todos and configured bus's accepted owned assignments. Continue safe authorized unblocked work; record concrete blockers and resume steps. Preserve peers' ownership and explicit deferrals. Record material home changes in the home’s canonical vault. This skill adds no permission to share private data, message people or control devices.
