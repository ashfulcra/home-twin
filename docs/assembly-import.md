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
