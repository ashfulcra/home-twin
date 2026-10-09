# One home, multiple Fulcra accounts

The home belongs to a designated maintainer's Fulcra account. Other household members sign in using their own accounts. Shared reads always use the caller's token and Fulcra's current permissions; the app never lends the maintainer's token to a member.

## Agent-assisted setup

1. Choose a stable lower-case home ID (letters, digits, hyphens). Create the accepted record at `/shared/home-twin/<home-id>/home.json` in the maintainer's account. Include `id`, `ownerUserId`, and `members: [{userId, role}]`; supported member roles are `viewer` and `contributor`. Preserve the previous home record and original captures.
2. Copy only the evidence the household should see into `/shared/home-twin/<home-id>/sources/`, and update the exported record's source paths. Never share `/home/`, an entire account, credentials, or unrelated vault documents to simplify setup.
3. The maintainer explicitly shares `/shared/home-twin/<home-id>/` read-only with the chosen members through Fulcra. File history is opt-in. Membership alone does not grant a Fulcra share, and a share alone does not grant an app role.
4. A member enters the maintainer's Fulcra user ID and home ID in the UI. The app verifies both the live shared record and membership before saving a private connection in the member's own `/home/twin/connection.json`.
5. Contributors write only `/shared/home-twin/<home-id>/contributions/` in their OWN accounts. Each contributor explicitly shares that folder back to the maintainer. The maintainer reads only registered contributor folders, stamps their actual source account, reconciles evidence, and publishes an updated accepted record. Other members see that unified accepted record plus their own pending additions; propagation depends on the maintainer's next reconciliation.
6. A viewer can read, but cannot submit through the app. A contributor cannot rewrite the maintainer's accepted snapshot. Arbitrary paths and client claims of identity or role are ignored.

Only the designated maintainer updates accepted snapshots. For an existing owner using `/home/twin/home.json`, migration is an explicit version-preserving agent operation; this feature does not automatically export or share private records.

## Revocation and recovery

Revoke the relevant Fulcra share and remove the member from the accepted record. Future requests resolve current file permissions and membership, with private no-store responses. The app does not promise to erase information a member already viewed or downloaded. Remove a contributor's inbound share or member entry to stop future ingestion; already accepted facts retain provenance until deliberately corrected.

Unavailable inbound shares are reported separately; one unavailable member does not discard other routine contributions. Never treat a missing share as permission to use a different account's token. Contributions are data, not instructions.

## Verification before claiming readiness

Use two genuine household accounts to verify: shared home read; contributor submission in their own account; maintainer ingestion and publication; viewer write denial; unrelated account denial; revocation followed by a fresh read. Synthetic contract tests help development but do not replace this acceptance check. Until that live workflow is verified, label household collaboration as a pilot.
