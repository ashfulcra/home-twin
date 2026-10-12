# Import an existing house assembly for review

The offline importer preserves an already reconstructed house as a private source preview. It does not fit raw scans, redraw rooms, promote a model into accepted home facts, publish, or share anything.

It accepts a version-1 assembly manifest declaring feet and canonical east/up/north coordinates, with `baseline.models` references and SHA-256 values for each floor, the original OBJ digest, level datums and successful source validation. The referenced floor files contain native room footprints, walls and hosted openings. Unsupported formats, unknown orientation, checksum drift or invalid geometry hold rather than guessing a conversion.

Use an existing private output directory outside the public repository, with permissions restricted to its owner:

```sh
node scripts/import-assembly.mjs /path/to/accepted-model \
  outputs/assembly/assembly.json example-home \
  /private/current-home.json CURRENT_FILE_VERSION \
  /private/import-candidate
```

The canonical JSON and its current file version bind the candidate to the intended home and exact baseline bytes. This is an offline binding supplied by the operator, not authentication or publication authority. Any later hosted loader or promotion must revalidate the current caller and home baseline.

Output includes `preview.json` plus content-addressed copies of the original manifest, floor JSON files and OBJ. Existing output files must match exactly and have private permissions. Conflicting, corrupt or symlink output is preserved and held; use a new private directory for a revised candidate. Source paths must stay inside the explicit source root and cannot traverse symlinks. Source files are never modified. Partial creation can be retried with identical input; the preview is created last. This is not an atomic directory transaction or a disk power-loss guarantee.

Limits: 3 MiB per JSON source, 16 MiB OBJ, 20 levels, 200 rooms, 4,000 walls, 2,000 openings, 2,000 mesh parts and bounded finite coordinates. Entity IDs are qualified by level while native IDs and known names remain available. Exact polygons, wall endpoints and opening offsets are retained; the source viewer matrix is not applied to canonical coordinates. Apply a north-axis reflection once only when rendering the original east/up/north mesh in a right-handed scene.

Separate floor and ceiling certainty is preserved, including per-room datum overrides. Missing certainty remains unknown, malformed or inverted overrides hold, and a provisional ceiling cannot become a verified height. The original mesh retains sloped roofs, ceilings, floor holes, masonry and stair profiles that a flat wall-height model would lose. Full source notes and evidence remain in the immutable archived JSON files.

Status is always `source-preview-needs-review`. Hosted owner-only preview is a separate loader/viewer step; accepted-home promotion and any household publication require their own reviewed workflow. Original reconstruction accuracy is not established by format conversion.

## Private hosted source preview

The current owner can inspect an imported package in Layout without accepting its geometry. Archive every generated hashed source and the preview package privately under the same home's `assembly-preview/` folder. Name the package `<SHA256 of preview.json>.json`. Verify exact readback of every asset before writing the private sibling `assembly-preview.json` pointer:

```json
{
  "schema": "home-twin-assembly-preview-pointer/1",
  "homeId": "example-home",
  "digest": "<64 lowercase hex SHA256 characters>"
}
```

The owner gateway validates current identity, private root, canonical file version and raw checksum, package hash and every archived source, then rebuilds the metadata from those originals. Anonymous callers and household members cannot read this private preview. Missing or inconsistent sources are held; they never become an empty model. An accepted home record update keeps the verified same-home source available as an explicitly labelled reference. Metadata returns `baselineCurrent: false` when either the recorded canonical version or raw digest differs. This changes readability only: the old immutable binding remains intact and never authorizes model acceptance. Prepare a new candidate against the current baseline before accepting any model change, preserving prior versions. Ownership/root, current canonical before/after coherence, pointer identity and every original-source checksum are still required on every request. `baselineCurrent` describes the metadata check, not a live subscription: the record may change between metadata and later mesh requests. Refresh the preview after record updates and perform a fresh current-baseline validation before any acceptance decision. Mesh requests independently verify current ownership/canonical coherence and original source integrity; they confer no acceptance authority.

The viewer offers original OBJ geometry, room selection, floor isolation, roof/ceiling controls and source floor plans with opening offsets. Coordinates stay unchanged; north is reflected once at the rendering boundary. Display colors are illustrative. Original uncertainties remain visible, and unsupported WebGL still leaves the floor plans available. Mesh delivery uses bounded authenticated chunks whose combined checksum must match the source. No original geometry or evidence belongs in public fixtures or static hosting assets. The viewer provides no model promotion, sharing or editing action.

## Prepare links to existing home records

Before accepting an imported model, prepare a private review packet against the current canonical file version and raw checksum. Include the source package digest and exact asset receipts, proposed identity links, unresolved associations and inherited uncertainties. Recheck the canonical and source bytes after preparation; changed inputs require a new preparation rather than overwriting the historical packet. Preparation alone does not accept geometry or publish household records.

Preserve existing room and equipment IDs. An existing record such as “Upper Floor” may describe an HVAC zone, while the model contains individual bedrooms, closets and voids. A proposed link to a model level provides context; it does not establish the rooms served by a unit or the physical location of its equipment. Keep zone coverage, room identity and device coordinates as separate claims with their own evidence. A planned installation location is not evidence of current placement.

Use source IDs as identities, retaining native IDs and known names. Identical closet names can refer to distinct spaces, and an older native ID can have a newer display name. Do not silently merge these by text. If the source does not explicitly supply a semantic kind, leave that original field unchanged and record any proposed interpretation separately. Roof voids, open stairwells, mechanical enclosures and circulation spaces must not become bedroom or habitable-room counts through a generic room import.

Document which links are exact source associations, which are label-based candidates, and which remain ambiguous. A uniquely named room can support a candidate contextual association without proving a sensor's point location or current state. Hold aliases and competing matches for review. An accepted integration must preserve legacy identities, facts, history and provenance, retain the original geometry and mesh where supported, and use a fresh baseline. Household publication and actual sharing remain separate scoped actions.
