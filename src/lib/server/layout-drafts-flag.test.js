import { beforeEach, expect, test, vi } from 'vitest';
import { render } from 'svelte/server';
const state = vi.hoisted(() => ({ env: /** @type {Record<string,string>} */ ({}), writes: vi.fn(), resolve: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: state.env }));
vi.mock('$lib/server/home-access.js', () => ({ resolveHome: state.resolve }));
vi.mock('$lib/server/fulcra-files.js', () => ({
  listFulcraJSON: async () => [], writeFulcraJSON: state.writes, readFulcraFile: async () => null
}));
import HomeLayout from '../components/HomeLayout.svelte';
import { POST } from '../../routes/api/home/layout/+server.js';
beforeEach(() => { delete state.env.PUBLIC_HOME_LAYOUT_DRAFTS_ENABLED; vi.clearAllMocks(); });
test('disabled draft editor hides generic starters while retaining the existing building viewer', () => {
  state.env.PUBLIC_HOME_LAYOUT_DRAFTS_ENABLED = 'false';
  const html = render(HomeLayout, { props: { home: { id: 'example', reconstruction: {buildingModel: {schemaVersion:1, units:'feet', levels:[{id:'ground',elevationFeet:0,heightFeet:10}],rooms:[{id:'living',name:'Living',level:'ground',polygon:[[0,0],[20,0],[20,15],[0,15]],heightFeet:10,sourcePage:1,sourceSheet:'A1',basis:'source trace'}],walls:[],features:[],roofs:[],assumptions:[]}} }, role: 'maintainer' } }).body;
  expect(html).not.toContain('Start a correctable floor plan');
  expect(html).not.toContain('Simple rectangle');
  expect(html).not.toContain('Build from a layout interview');
  expect(html).toContain('Explore the residence');
  expect(html).toContain('Interactive representative house model');
});
test('generic deployment keeps the rough layout editor available by default', () => {
  const html = render(HomeLayout, { props: { home: { id: 'example' }, role: 'maintainer' } }).body;
  expect(html).toContain('Simple rectangle');
  expect(html).toContain('Build from a layout interview');
});
test('disabled draft endpoint refuses even a direct caller without reading or writing home data', async () => {
  state.env.PUBLIC_HOME_LAYOUT_DRAFTS_ENABLED = 'false';
  await expect(POST(/** @type {any} */ ({ cookies: { get: () => 'synthetic-caller' }, request: new Request('https://example.test/api/home/layout', { method: 'POST', body: '{}' }) }))).rejects.toMatchObject({ status: 403 });
  expect(state.resolve).not.toHaveBeenCalled();
  expect(state.writes).not.toHaveBeenCalled();
});
