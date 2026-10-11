# Refresh an existing household view

At a private canonical root, the regular maintainer publisher updates the owner's accepted snapshot. Members read a separate curated file. After a reviewed canonical update, the owner prepares and reviews a fresh household refresh packet, then the designated maintainer applies it using the same private state directory. Canonical readback alone is not member-visible publication or delivery evidence.

Under Household, first preview the current household records. Once there are approved members, **Prepare an update for your home agent** downloads a private packet. The owner must review its complete `publication` contents and current `publication.members` before authorizing application. The packet includes exact publication and membership hashes, current canonical file identity/revision/raw hash, and a private root. It grants no access and uploads nothing. Keep the downloaded packet outside repositories and change its permissions to mode 0600. Preparation is owner-only; missing members or inconsistent canonical data hold it.

Use the owner's own Fulcra CLI login and existing per-home private maintainer state. After exact content/member approval:

```sh
node scripts/home-household-refresh.mjs apply PRIVATE_PACKET EXISTING_STATE \
  --owner-approved --publication-sha EXACT_PUBLICATION_SHA \
  --members-sha EXACT_MEMBERS_SHA
```

Those values come from the reviewed packet; changed content or membership requires a fresh review. Do not manufacture approval from a contribution. The executor requires current outgoing Fulcra grants for every current member. Each relevant grant must be limited to the current curated home file, approved recipients only, without folders, file history, groups, all-account access or time filters. Broad, unknown, revoked, missing or changed grants hold publication. This executor cannot create, change or revoke any grant; restore or correct access separately with specific consent.

The executor authenticates the current owner, regenerates the allowlisted projection from the exact current canonical baseline, and rechecks membership and normalized outgoing grant receipts before committing and at final readback. It preserves prior shared publication bytes in the owner's private history. It writes only that history backup and `/shared/home-twin/<home-id>/home.json`; canonical data, membership, revision, grants, contribution/evidence return shares, mesh and messages are unchanged. Selected household text, contacts, equipment and model geometry are intentionally visible; private fields and original documents are excluded, but freeform text still needs content review.

One designated writer uses the existing `.cycle.lock`, immutable `household-refresh/` intents and `household-refresh.json` pointer. Pending or unknown admission/routine publication blocks refresh; pending or corrupt refresh blocks the other publishers. Do not make another state directory or clear a live lock to bypass recovery. A killed process leaves its lock for inspection. A commit is recorded in flight before sending bytes; lost responses resolve only by exact current readback. Invisible uncertain writes are never blindly repeated. Preserve the same packet and intent until the operation can be inspected and resolved. A changed canonical baseline, publication or outgoing grant receipt holds the old packet. A newer, malformed or divergent same-revision shared publication holds before any writes: inspect the sources and reconcile a new accepted canonical revision rather than silently overwrite a potentially newer member view. Intentional same-revision repairs are not supported by this executor.

A read-only audited intake cycle may prepare a private report while an intent is pending, when the lock is free; it cannot resolve the intent. Never run it concurrently with an executor. After coherent recovery, prepare a fresh intake/packet before later publication. These guards are local, not distributed compare-and-swap. Outside writers can still race, so halt on drift and keep one designated maintainer.

A confirmed result proves owner-side publication and exact outgoing access checks. It reports `memberAccessVerified: false`: verify actual reads and revocation using the genuine member's own account before claiming delivery. No synthetic account, owner-token browser or download is a substitute for that pilot. No schedule or automatic refresh is installed by this command.
