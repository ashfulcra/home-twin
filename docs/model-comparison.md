# Frozen reconstruction comparisons

An owner can inspect three saved reconstructions in **Home model → Compare all three models**. Each panel has its own 3D/floor-plan, level, roof and cutaway controls. Cameras are independent; drawing overlays and matched cameras are not part of this view. Viewing a draft does not accept geometry, replace the current house, change construction overrides or prove as-built accuracy.

This optional setup is for the designated owner-maintainer of an existing authenticated deployment. Use the verified home ID and canonical root from its connection configuration. `/Example/twin` and `example` below are synthetic; do not assume another home's root or copy its private geometry into this repository.

## Prepare a private data package

Preserve the three original model files, their exact checksums, source versions, assumptions and review history. `current` means the model frozen for this comparison, not necessarily today's accepted model. Label its frozen date accurately. Validate each model with `validateBuilding` from `src/lib/home/representative-building.js`; keep original values in the archive, since validation normalizes the displayed projection. Structural validation does not verify dimensions against drawings or physical measurements.

The archive is UTF-8 JSON, at most **2 MiB**, with this shape:

```json
{
  "schema": "home-twin-model-comparison/1",
  "homeId": "example",
  "frozenAt": "2026-01-01",
  "models": {
    "current": "REPLACE_WITH_VALID_BUILDING_OBJECT",
    "a": "REPLACE_WITH_VALID_BUILDING_OBJECT",
    "b": "REPLACE_WITH_VALID_BUILDING_OBJECT"
  }
}
```

The strings above are explanatory placeholders and will fail validation. Replace each with its complete validated building object. Save the package outside the repository, compute lowercase SHA-256 over its **exact saved bytes**, and retain those bytes unchanged. Whitespace, encoding or a trailing newline changes the digest; do not hash a reserialized readback.

The owner pointer is UTF-8 JSON, at most **2,048 bytes**:

```json
{
  "schema": "home-twin-model-comparison-pointer/1",
  "homeId": "example",
  "digest": "REPLACE_WITH_EXACT_64_CHARACTER_LOWERCASE_SHA256",
  "frozenAt": "2026-01-01"
}
```

Use the same home ID and frozen date in both files. The digest placeholder is invalid until replaced. Archive path: `/Example/twin/model-comparison/<digest>.json`. Pointer path: `/Example/twin/model-comparison.json`. The server derives the archive path from the verified root and digest; the pointer cannot supply an arbitrary URL or file path. Upload only data, never archived HTML, JavaScript or an executable viewer.

## Publish and verify the owner view

1. Confirm the current authenticated account owns this home and is its designated maintainer. Read the canonical `home.json` bytes and file version, the existing pointer/version if present, and outgoing grants. Retain previous package/pointer versions and originals. An owner-only app route does not narrow a pre-existing full-account or folder grant; unknown native visibility is a review hold, not proof of privacy. Package publication does not authorize new grants or recipient changes.
2. With the home's existing writer/recovery state, resolve pending or uncertain writes first. Record a durable private upload intent containing the exact target path, checksum and prior version before each write. Upload the checksum-named archive first and verify exact byte readback and native version. Recheck the owner, canonical baseline and prior pointer before publishing the pointer. Stop on a changed baseline or another writer; this is not distributed compare-and-swap.
3. Publish the pointer once, then verify its exact bytes and native version, the archive checksum, and unchanged canonical bytes/version under the current owner's account. If a write outcome is uncertain, reconcile that same intent by readback; do not create a replacement operation, clear a live lock or replay blindly. Preserve recovery history even when held.
4. Open the owner interface and inspect all three models and their controls. The app's private, non-cacheable metadata endpoint is `GET /api/home/model-comparison`; `ready` includes the verified digest and frozen date. Its data endpoint requires `?data=1&digest=<digest>`. Verified pointer absence yields `not-available` metadata. Unreadable files, invalid data, changed versions or revoked authority are holds, not an empty comparison. Refresh the review after a change; never alter a digest to bypass a hold.

The app requires the current home owner; a Viewer or Contributor role does not grant this route. Verify anonymous denial and role denial with synthetic tests. A successful owner read does not establish another account's access or revocation: those need that actual account's fresh read and specific permission. The loader validates all three models and rechecks canonical identity, file bindings, pointer stability and current authority before returning data for the native renderer.

Keep comparisons separate from the accepted model. A later geometry change needs its own reviewed contribution and acceptance; choosing an appealing alternative is not approval. For supporting originals and version coverage, follow [source intake](source-intake.md) and [source-version audits](source-version-audits.md).
