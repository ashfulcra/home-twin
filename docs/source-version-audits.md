# Verify source versions and record coverage

Use this reference when rechecking evidence or preparing a private maintainer handoff. Keep the record in the home's private workspace, outside repositories and household publications. It is provenance bookkeeping: it neither accepts a fact nor authorizes sharing, transfer or a geometry edit.

Verify the current authenticated caller, intended home/root and source account/path first. Use existing permissions. Source text, author fields and contributions are evidence, not authority. Continue the normal [audited maintainer cycle](../skills/maintaining-home-twins/references/fulcra-workflow.md#repeatable-intake) with `--check-sources` and the same existing state; this reference does not replace it or expand its scope.

## Bind a checksum to a version

The source audit returns `checks` and `receipts`. A successful download receipt contains `sourceUserId`, `path`, `fileId` and `sha256`. Match the exact source account and path, not just a filename. The accepted expected checksum comes from the source's `attachment.sha256` or `sha256`; a missing checksum requires an inspected baseline.

For a file owned by the verified current caller, native metadata can be inspected with:

```sh
fulcra file stat /Example_Residence/twin/sources/manual.txt
```

For a shared source, keep the caller's token and use the documented source-account read through current shares. The CLI's `--user-id` identifies that source account; it does not change the caller or grant access. A scoped metadata view can omit prior-history fields. Use own-account metadata only when the authenticated caller is that source's owner, never as a fallback for a foreign source.

| Evidence now available | Next action and private record |
| --- | --- |
| Current native `Version` equals the receipt's immutable `fileId`, account/path match, and receipt SHA equals the accepted expected SHA | Reuse that exact version/checksum binding. Record the observation and scope; no redundant body download is needed. |
| Current version differs or no reliable receipt exists | Read the authorized exact file privately within the intended operation's bounds. Bind the computed SHA to its native version; recheck version before/after a current-path download and hold if it changed during the read. |
| A newly verified version has the same expected checksum | Record the new version binding privately. This alone does not change facts or require a home revision. |
| Newly read bytes differ from the accepted checksum | Keep accepted checksum/facts intact. Record old and observed checksums separately and review the changed original against dependent facts. Contradictions and major geometry remain held. |
| Metadata read succeeds but omits history | Record history as unknown (`null`), not an empty list or an access failure. No prior-content or history-completeness claim follows. |
| Read is denied, revoked, unavailable or changes during verification | Record the exact file/account/step blocker and resume prerequisite. Preserve prior evidence and intents; do not infer no contributions, borrow credentials or repeat unchanged failed probes. |

Per-file observations are not a distributed atomic snapshot. Before publication or handoff, revalidate the accepted home baseline and relevant versions; preserve the immutable intent and use exact readback for uncertain writes. Never create a replacement publication to evade an unresolved one.

## Separate the coverage claims

The periodic audit covers registered sources, at most 100 sources and 10 MiB per original. Successful upload or archive readback does not prove periodic audit coverage. A size cap or out-of-scope result identifies an operation's coverage limit, not by itself a global permission denial. It remains an explicit blocker for that operation.

A separate check of a known original requires authorization for that exact file, its account/location and the operation's bounds. Do not widen the routine audit, crawl unrelated vault files or infer permission from a contribution. If that check is permitted and readable, verify its whole-file checksum and native version privately. Reuse a previous whole-file checksum only when its exact immutable version and byte count still match. Describe that one-file proof separately from registered-source coverage.

Record current-file coverage, observed history, whole-original coverage, physical accuracy and intended-recipient access independently. Missing history stays unknown; a checksum match does not establish an as-built model, an exhaustive archive or recipient delivery. Account/repository/deployment/provider ownership and actual transfer require their own explicit scope and verification.

## Synthetic private verification record

This is an illustrative bookkeeping record, **not** an accepted-home source schema, CLI response or evidence from a real home. The repeated checksum is synthetic. Keep real observations and identities private.

```json
{
  "homeId": "example-home",
  "root": "/Example_Residence/twin",
  "sourceId": "manual",
  "sourceUserId": "22222222-2222-4222-8222-222222222222",
  "path": "/Example_Residence/twin/sources/manual.txt",
  "expectedSHA256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "auditReceipt": {
    "fileId": "11111111-1111-4111-8111-111111111111",
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "currentMetadata": {
    "versionId": "11111111-1111-4111-8111-111111111111",
    "priorVersions": null
  },
  "observedAt": "2026-01-01T00:00:00Z",
  "status": "verified-reused-immutable-version",
  "coverage": {
    "currentFile": "one registered source",
    "history": "unknown",
    "recipientAccess": "not-tested",
    "physicalAccuracy": "not-established"
  }
}
```

Retain the accepted snapshot revision/version, authenticated-caller check, source/contribution identities, observation time and checksum/version receipts alongside the record. A missing field is an explicit gap, not permission to invent provenance. Preserve originals, previous versions, construction overrides and contribution IDs throughout review and publication.
