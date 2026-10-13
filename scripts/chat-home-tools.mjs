import { searchHomeKnowledge } from '../src/lib/home/knowledge-search.js';
const definitions = [
  ['read_home', 'Read current home overview', {}],
  [
    'search_records',
    'Find current equipment, care, contacts, notes and history',
    { query: { type: 'string', maxLength: 120 } }
  ],
  [
    'read_source',
    'Read one home source by its existing ID',
    { sourceId: { type: 'string', maxLength: 200 } }
  ],
  [
    'read_model_region',
    'Read bounded model components by their exact IDs',
    { ids: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 12 } }
  ]
].map(([name, description, properties]) => ({
  type: 'function',
  name,
  description,
  strict: true,
  parameters: {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  }
}));
/** Fresh current caller authority is injected; arbitrary paths and commands are absent. @param {any} options */
export function createChatHomeTools({ authorize, readSource }) {
  return {
    definitions /** @param {string} name @param {any} args */,
    async execute(/** @type {string} */ name, /** @type {any} */ args) {
      const definition = definitions.find((x) => x.name === name);
      if (!definition) throw Error('Unsupported home tool');
      const keys = Object.keys(definition.parameters.properties);
      if (
        !args ||
        typeof args !== 'object' ||
        Array.isArray(args) ||
        Object.keys(args).length !== keys.length ||
        Object.keys(args).some((k) => !keys.includes(k))
      )
        throw Error('Invalid home tool arguments');
      if (
        (name === 'search_records' &&
          (typeof args.query !== 'string' || args.query.length > 120)) ||
        (name === 'read_source' &&
          (typeof args.sourceId !== 'string' || args.sourceId.length > 200)) ||
        (name === 'read_model_region' &&
          (!Array.isArray(args.ids) ||
            args.ids.length > 12 ||
            args.ids.some((/** @type {any} */ id) => typeof id !== 'string' || id.length > 200)))
      )
        throw Error('Invalid home tool arguments');
      const access = await authorize(),
        home = access.home;
      if (!home || !['viewer', 'contributor', 'maintainer'].includes(access.role))
        throw Error('Current home access required');
      if (name === 'read_home')
        return {
          id: home.id,
          name: home.name,
          revision: home.revision,
          rooms: (home.rooms ?? [])
            .slice(0, 100)
            .map((/** @type {any} */ r) => ({ id: r.id, name: r.name, level: r.level })),
          equipment: (home.equipment ?? [])
            .slice(0, 40)
            .map((/** @type {any} */ e) => ({ id: e.id, name: e.name, system: e.system })),
          sourceCount: (home.sources ?? []).length,
          modelAvailable: !!home.reconstruction?.buildingModel
        };
      if (name === 'search_records')
        return { records: searchHomeKnowledge(home, args.query).slice(0, 20) };
      if (name === 'read_source') {
        const source = home.sources?.find((/** @type {any} */ s) => s.id === args.sourceId);
        if (!source) throw Error('Source is not in current home');
        return readSource(source, access);
      }
      const model = home.reconstruction?.buildingModel;
      if (!model) throw Error('Home model unavailable');
      const wanted = new Set(args.ids);
      return {
        revision: home.revision,
        units: model.units,
        levels: model.levels,
        rooms: model.rooms.filter((/** @type {any} */ r) => wanted.has(r.id)),
        walls: model.walls.filter((/** @type {any} */ w) => wanted.has(w.id)),
        features: model.features.filter((/** @type {any} */ f) => wanted.has(f.id)),
        roofs: model.roofs.filter((/** @type {any} */ r) => wanted.has(r.id))
      };
    }
  };
}
