# Joining an existing home

Signing in to a named home submits one access request, then shows a pending page. The login screen discloses that only the access request is shared with that home's owner. Signing in never creates another home or grants access. Pending callers receive no home records or agent onboarding instructions.

The owner opens Household, reads a request, chooses Viewer or Contributor, reviews the exact curated household records and confirms the recipient and scope. **Approve access** saves the content-bound decision and applies it through the persistent access service. The owner does not need an AI agent. This changes canonical membership, preserves earlier snapshots, publishes the reviewed household projection and creates an exact current-file-only share. Original documents, private vaults, other homes, file history, return contributions and agent meshes are excluded. A small separate outcome file tells the applicant the decision. Declining shares only that outcome, without home access.

The applicant selects **Check for approval** to enter the home through a fresh read under their own Fulcra token. Only this proves their current access. The owner's outgoing receipt is not proof that the applicant has read it. Approved contributors can optionally connect an agent and consent to return contribution/evidence shares or a mesh afterwards.

## Persistent service

Run node scripts/home-access-service.mjs /private/access-service.json. This is ordinary backend code, not an agent. Use a private persistent filesystem and the SAME per-home state directories/checkpoints/locks as the designated maintainer. For a hosted serverless frontend, run this service on a persistent host behind TLS; process-local locks or temporary function filesystems are not substitutes. A deployment may host it alongside its maintainer or on an independently maintained server. Keep private configuration and journals outside repositories.

Configuration has a long random private key, loopback port (default6193), and a homes array. Each home has homeId, ownerUserId, root and stateDirectory, matching its current private maintainer checkpoint. Use a separate private canonical root such as /Example/twin.

Set private HOME_ACCESS_SERVICE_URL and HOME_ACCESS_SERVICE_KEY in the frontend deployment. Only the frontend's server forwards the current authenticated caller token. The service verifies that token with Fulcra; it never loads a fallback owner's credential or saves caller tokens. Configuration allowlists the home's identity, canonical root and existing state. The canonical root must be separate from the curated household publication. Keep routing and service credentials separate for transferred instances.

Automatic requests use a per-account private lock and reuse the first immutable own request, including a matching existing manual request. Fulcra receives only a direct request-file share addressed to this home's configured owner. Before every upload/share the journal records in-flight state. A lost response requires exact readback; retry never blindly duplicates an uncertain grant. A revoked request share remains held for inspection rather than being recreated.

Dashboard decisions reuse the existing admission packet, journal and maintainer lock. The immutable packet survives a lost browser response even after membership advances the home revision. **Continue access setup** confirms the same operation, including after a page reload. A different admission cannot bypass a pending one. External edits or unclear operation outcomes remain explicit failures, not a false approval.

The service must be supervised across restarts. Do not delete a live lock or expiry-steal an abandoned one. Inspect its operation and exact Fulcra readback before recovery. The local lock serializes this deployment's designated writer; Fulcra has no distributed file compare-and-swap and arbitrary outside writers still need reconciliation. Return contribution shares and meshes require the member's separate specific consent.

## Verification

Run the full unit suite, type check and build. Exercise pending and approved UI branches, anonymous/member denial, owner review/application, repeated login, reload recovery, stale baselines, concurrent locking and lost write/share responses. Verify TLS relay and current-owner endpoints on the actual deployment. A synthetic transport can test journal recovery without granting private home access; document real second-account read/contribute/revoke testing separately when that intended account is available.
