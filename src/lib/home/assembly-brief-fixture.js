// Synthetic test utility; no live home data.
/** @returns {any} */
export function assemblyBriefFixture() {
  return {
    previewDigest: 'a'.repeat(64),
    baselineCurrent: false,
    model: {
      schema: 'home-twin-assembly-preview/1',
      status: 'source-preview-needs-review',
      homeBinding: {
        homeId: 'example-home',
        canonicalFileVersion: 'source-v1',
        canonicalDigest: 'b'.repeat(64)
      },
      units: 'feet',
      coordinateSystem: 'X=east Y=up Z=north; absolute Revit Z elevations',
      levels: [
        {
          id: 'upper',
          label: 'Upper',
          elevationFeet: 8,
          ceilingElevationFeet: 17,
          provisional: true,
          source: 'Original survey'
        }
      ],
      rooms: [
        {
          id: 'upper:closet-a',
          nativeId: 'closet-a',
          name: 'Closet',
          level: 'upper',
          polygon: [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4]
          ],
          wallIds: ['upper:wall'],
          evidenceIds: ['survey'],
          provisional: false,
          floorElevationFeet: 8,
          ceilingElevationFeet: 16,
          floorProvisional: false,
          ceilingProvisional: true,
          verticalProvisional: true,
          kind: null
        }
      ],
      walls: [
        {
          id: 'upper:wall',
          nativeId: 'wall',
          level: 'upper',
          start: [0, 0],
          end: [4, 0],
          thicknessFeet: 0.5,
          heightFeet: 8,
          kind: 'wall',
          roomIds: ['upper:closet-a'],
          evidenceIds: ['survey'],
          provisional: false,
          openings: [
            {
              id: 'upper:door',
              nativeId: 'door',
              kind: 'door',
              offsetFeet: 1,
              widthFeet: 2,
              sillFeet: 0,
              headFeet: 7,
              evidenceIds: ['survey'],
              provisional: true
            }
          ]
        }
      ],
      sceneParts: [{ name: 'upper/roof', kind: 'roof', level: 'upper', provisional: true }],
      mesh: {
        sha256: 'c'.repeat(64),
        filename: 'c'.repeat(64) + '.obj',
        vertices: 10,
        faces: 8,
        parts: 1
      },
      sourceReceipts: [
        { id: 'assembly', sha256: 'd'.repeat(64) },
        { id: 'upper', sha256: 'e'.repeat(64) },
        { id: 'mesh', sha256: 'c'.repeat(64) }
      ],
      uncertainties: ['Ceiling needs confirmation.'],
      limitations: ['Original sloped roof remains in the original mesh.']
    }
  };
}
