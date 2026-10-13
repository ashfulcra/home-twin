// Synthetic approved baseline fixture; no real household geometry.
/** @returns {any} */
export const modelPatchHome = () => ({
  id: 'example',
  revision: 7,
  ownerUserId: 'synthetic-owner',
  contacts: [{ id: 'contact', name: 'Example' }],
  reconstruction: {
    source: { sha256: 'a'.repeat(64), file: 'synthetic.pdf' },
    userOverrides: { construction: { addition: 'existing' } },
    rooms: [
      {
        id: 'trace',
        polygon: [
          [0, 0],
          [20, 0],
          [20, 10],
          [0, 10]
        ]
      }
    ],
    buildingModel: {
      schemaVersion: 1,
      id: 'synthetic-model',
      artifactVersion: 'approved-fixture-v1',
      units: 'feet',
      coordinateFrame: { north: 'synthetic-up' },
      levels: [
        { id: 'main', heightFeet: 10, elevationFeet: 0 },
        { id: 'upper', heightFeet: 9, elevationFeet: 12 }
      ],
      rooms: [
        {
          id: 'living',
          name: 'Living',
          level: 'main',
          heightFeet: 10,
          polygon: [
            [0, 0],
            [20, 0],
            [20, 10],
            [0, 10]
          ],
          sourcePage: 1,
          sourceSheet: 'A1',
          basis: { type: 'source', sourceVersion: 'original-v1' }
        },
        {
          id: 'upper-room',
          name: 'Upper',
          level: 'upper',
          heightFeet: 9,
          polygon: [
            [0, 0],
            [20, 0],
            [20, 10],
            [0, 10]
          ],
          sourcePage: 2,
          sourceSheet: 'A2'
        }
      ],
      walls: [
        {
          id: 'wall',
          roomId: 'living',
          level: 'main',
          start: [0, 0],
          end: [20, 0],
          heightFeet: 10,
          thicknessFeet: 0.5,
          basis: { type: 'estimate', note: 'Synthetic only' },
          openings: [
            {
              id: 'door',
              kind: 'door',
              offsetFeet: 4,
              widthFeet: 3,
              heightFeet: 7,
              sillFeet: 0,
              basis: 'synthetic estimate'
            }
          ]
        },
        {
          id: 'fixed-wall',
          level: 'upper',
          start: [0, 0],
          end: [20, 0],
          heightFeet: 9,
          thicknessFeet: 0.5,
          openings: []
        }
      ],
      features: [],
      roofs: [],
      floorEnvelopes: [
        {
          id: 'floor',
          level: 'main',
          elevationFeet: 0,
          thicknessFeet: 0.5,
          polygon: [
            [0, 0],
            [20, 0],
            [20, 10],
            [0, 10]
          ],
          holes: [
            [
              [8, 3],
              [10, 3],
              [10, 5],
              [8, 5]
            ]
          ]
        }
      ],
      assumptions: [{ id: 'estimated', reason: 'Not measured' }],
      unknownMetadata: { userChoice: 'preserve exactly' }
    }
  }
});
export const modelPatchDraft = () => ({
  kind: 'model-patch',
  note: 'Synthetic door-width correction for review',
  sourceIds: ['manual'],
  edits: [
    {
      target: 'opening',
      wallId: 'wall',
      openingId: 'door',
      field: 'widthFeet',
      expected: 3,
      value: 3.5
    }
  ]
});
