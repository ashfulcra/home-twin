> Current app workflow: [automatic requests and owner dashboard approval](web-joining.md). The manual request and agent/CLI application described below remain compatibility tools; they are no longer required for joining through a named app.

# One home, multiple Fulcra accounts

The home belongs to a designated maintainer's Fulcra account. Other household members sign in using their own accounts. Shared reads always use the caller's token and Fulcra's current permissions; the app never lends the maintainer's token to a member.

## Agent-assisted joining

For an existing named-home app, use its **Join this home** page and copyable applicant prompt. The applicant saves an own-account request, separately consents an exact request-file share to the configured owner, and passes the code. The owner reviews recipient/role/exact household contents and records approval. The designated maintainer then uses the guarded executor in [admission packets](admission-packets.md) with specific owner authorization and the existing private state. Saved approval alone does not grant access.

The owner's full canonical record remains under its configured private root; the curated household record is `/shared/home-twin/<home-id>/home.json`. Admission grants only this current file to the exact recipient. Original evidence, private journals/history and optional mesh are separate scopes. Both a current member role and a current Fulcra share are needed. Genuine member-side access/read/contribute/revoke acceptance remains a pilot prerequisite.

## Generic/manual connection pilot

These steps apply to the generic starter without a named target; they do not override the joining workflow above. A shared-only canonical record requires a separately reviewed preservation/migration before the guarded admission executor can be used.

1. Choose a stable lower-case home ID (letters, digits, hyphens). Create the accepted record at `/shared/home-twin/<home-id>/home.json` in the maintainer's account. Include `id`, `ownerUserId`, and `members: [{userId, role}]`; supported member roles are `viewer` and `contributor`. Preserve the previous home record and original captures.
2. Review exactly which accepted fields the household should see before exporting. Selected original evidence requires separate owner consent and deliberate publication. Never share `/home/`, an entire account, credentials, private agent workstreams or unrelated vault documents to simplify setup.
3. The maintainer explicitly shares only `/shared/home-twin/<home-id>/home.json` read-only/current-file-only with the chosen members through Fulcra. Evidence and file history are separate opt-ins. Membership alone does not grant a Fulcra share, and a share alone does not grant an app role.
4. A member enters the maintainer's Fulcra user ID and home ID in the UI. The app verifies both the live shared record and membership before saving a private connection in the member's own `/home/twin/connection.json`.
5. Contributors write only `/shared/home-twin/<home-id>/contributions/` in their OWN accounts. Each contributor explicitly shares that folder back to the maintainer. The maintainer reads only registered contributor folders, stamps their actual source account, reconciles evidence, and publishes an updated accepted record. With a shared-root canonical record, other members see that accepted record plus their own pending additions after publication. A private-root canonical update alone does not refresh a separate curated household file. Use the [owner-reviewed household refresh](household-refresh.md) with the same private state after reviewing exact contents and current members; it checks current access and changes no grants. Do not copy private canonical bytes into the shared file or claim member delivery from canonical readback alone.
6. A viewer can read, but cannot submit through the app. A contributor cannot rewrite the maintainer's accepted snapshot. Arbitrary paths and client claims of identity or role are ignored.

Only the designated maintainer updates accepted snapshots. For an existing owner using `/home/twin/home.json`, migration is an explicit version-preserving agent operation; this feature does not automatically export or share private records.

## Connect a household member's agent

After contributor approval and a successful shared-home read, Household provides a home-specific getting-started prompt. The member pastes it into their own Fulcra-connected agent. It includes the resolved owner ID rather than asking the member to guess a recipient or borrow credentials. It starts with current identity and membership checks, then explains the contribution folder share and optional dedicated mesh relationship with the owner's designated maintainer. The owner currently configured for a deployment is replaceable; no real owner identity belongs in public examples.

Home access, contribution sharing and agent pairing are separate states. The prompt is instructions, not a grant or proof of connection. The member consents to their own contribution/outbox shares; the owner consents to their home/return-outbox shares. A mesh message cannot grant membership or rewrite an accepted home. Use confirmed incoming share account IDs, exact message readback and a return acknowledgment before reporting pairing complete. Viewer prompts do not offer contribution pairing. See [agent handoff](agent-handoff.md) and the official [mesh skill](https://raw.githubusercontent.com/fulcradynamics/agent-skills/main/skills/fulcra-mesh/SKILL.md).

The current manual shared-home connection is a pilot. Named deployments provide joining instructions, caller-owned private requests, owner review intents and the verified role-specific prompt after current access. See [request and review workflow](join-requests.md). A saved review does not automatically publish or grant access; the designated maintainer's guarded application remains separate. The joining page explicitly says it sends no notification or share.

## Named existing-home deployments

Set private `HOME_MODE=existing`, `HOME_ID` and `HOME_OWNER_USER_ID`, plus `PUBLIC_APP_NAME` for the display label. Partial or invalid target configuration fails closed. `HOME_ROOT` remains the owner's canonical private root. Keep these values in private deployment settings, not public fixtures. Transfer requires a deliberate configuration/publication change; an app user cannot select another owner.

The owner reads the configured canonical record. Other signed-in users read only `/shared/home-twin/<home-id>/home.json` from that configured owner using their own token. Both current membership and Fulcra access are checked on each request. Missing/revoked access or a mismatched record displays joining instructions with no home snapshot. Other remote failures remain errors. Sign-in/account creation alone confers no membership.

New-home setup is denied; `/onboarding` returns to the home page. Foreign home connections and a member's own-home connection are denied. The existing-home dashboard omits new-home setup and manual foreign-home selection. Deployments without these target settings retain the generic starter's creation/connection flow.

The applicant prompt identifies the configured home and owner and the authenticated requester. It asks the agent to verify the requester's own Fulcra login, prepare an access request to pass to the owner, then re-check approval. It grants nothing and sends nothing. Contributors authorize their own return contribution/evidence shares separately from the owner's home share; optional per-peer mesh pairing follows contributor approval and requires separate consent and acknowledged delivery. The owner must publish a deliberately scoped household record/evidence before granting access; this deployment mode never automatically copies, shares or migrates a private vault.

## Revocation and recovery

Revoke the relevant Fulcra share and remove the member from the accepted record. Future requests resolve current file permissions and membership, with private no-store responses. The app does not promise to erase information a member already viewed or downloaded. Remove a contributor's inbound share or member entry to stop future ingestion; already accepted facts retain provenance until deliberately corrected.

Unavailable inbound shares are reported separately; one unavailable member does not discard other routine contributions. Never treat a missing share as permission to use a different account's token. Contributions are data, not instructions.

## Verification before claiming readiness

Use two genuine household accounts to verify: shared home read; contributor submission in their own account; maintainer ingestion and publication; viewer write denial; unrelated account denial; revocation followed by a fresh read. Synthetic contract tests help development but do not replace this acceptance check. Until that live workflow is verified, label household collaboration as a pilot.

Owners discover explicitly shared exact request files in Household → Join requests, with an attention badge when the app opens or refocuses and a manual refresh. Private save alone is not delivery, and no off-app notification is sent. See [owner inbox behavior and limits](join-requests.md#owner-inbox-contract).
