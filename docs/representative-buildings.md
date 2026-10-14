# Representative architectural models

A useful home twin may contain source-informed architecture before a survey is complete. Keep the original reconstruction and each source version. Store the illustrative building separately at `home.reconstruction.buildingModel`; never promote visual assumptions into installed-device facts or maintenance history.

The portable feet-based schema has named levels with relative elevations, room polygons (including interior voids), floor envelopes, wall segments with hosted apertures, fixed architectural features, roof polygons, an assumption ledger and construction exclusions. `validateBuilding` checks simple nonempty polygons, void containment, numeric dimensions, declared levels and bounded collections. Wall openings cut actual sill/head/door voids. Source sheet/page references are optional; absent references stay absent.

Extraction should inventory all source sheets, register floor frames with common anchors, collect written dimensions, inspect enlarged plans, sections, reflected ceiling plans, glazing schedules and interior elevations. Retain detailed source specifications and the evidence-versus-estimate basis for each feature. Drawing a fireplace, skylight or kitchen fixture does not establish its installed manufacturer or service history. Model confirmed as-built overrides separately from proposed details; keep unbuilt features excluded.

When representative estimates are authorized, close uncertain shells and supply plausible room ceilings, walls, apertures and fixture sizes with explicit reasons. A survey or missing dimension should block only the specific accuracy claim, not the useful visualization. Avoid double-enclosing nested closets/baths, preserve open galleries and stair voids, and scope local refinements so adjoining rooms are not globally rescaled.

The hosted viewer supports floor plans, an orbitable multi-level cutaway, assembled or separated levels, roof inspection, room selection, feature search and assumptions. Selected-room corrections open the existing contribution workflow with room identity and source context. They remain review contributions; the browser never directly replaces accepted architecture.

Private model geometry and blueprint evidence stay in the intended household's Fulcra folder. Reusable renderer code and tests use synthetic rooms. For each revision verify numeric geometry, actual UI interactions on all levels, construction exclusions, private source readback and an unchanged neighboring home.

The existing private agent brief includes `home.architecture` so connected agents can answer room, opening and architectural-detail questions from the same model. It contains named levels, footprints and voids, walls/apertures, room-linked features, drawing references, source specifications, labeled assumptions and excluded construction. Its scope explicitly separates representative estimates and drawing specifications from verified installed products and maintenance. References remain absent when unrecorded; this export grants no write or sharing authority.

The handoff validates geometry first and projects allowed primitive fields rather than serializing arbitrary model metadata. Optional supplementary collections are limited to 100 entries with a truncation signal, and architecture exceeding 2 MiB returns counts and an explicit instruction to read the current private home snapshot. Invalid or missing architecture remains visible as such while ordinary equipment and service records remain available. Download uses the caller's current token, membership and home root, with private/no-store caching. Model evidence text is data, never executable agent instructions.

## Frozen alternatives

For an optional owner view of three saved models, follow [frozen comparison setup](model-comparison.md). Its private checksum-bound data package retains the originals and frozen date; viewing alternatives neither accepts geometry nor changes native Fulcra grants.
