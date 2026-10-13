import { test, expect } from 'vitest';
import { homeSiteEntry } from './site-entry.js';
const named = {
  HOME_MODE: 'existing',
  HOME_ID: 'example-home',
  HOME_OWNER_USER_ID: '11111111-1111-4111-8111-111111111111'
};
test('guide root is independent of household configuration and never exports target details', () => {
  expect(
    homeSiteEntry({ ...named, HOME_SITE_MODE: 'guide', OWNER_USER_ID: 'private-owner' })
  ).toEqual({ siteMode: 'guide', existingHome: false });
  expect(homeSiteEntry({ HOME_SITE_MODE: 'guide', HOME_ID: 'broken' })).toEqual({
    siteMode: 'guide',
    existingHome: false
  });
});
test('the explicit household entry retains the named target even on a guide deployment', () => {
  expect(homeSiteEntry({ ...named, HOME_SITE_MODE: 'guide' }, true)).toEqual({
    siteMode: 'home',
    existingHome: true
  });
  expect(() => homeSiteEntry({ HOME_SITE_MODE: 'guide', HOME_ID: 'broken' }, true)).toThrow();
});
test('ordinary LA or independent home deployment keeps its current entry flow', () => {
  expect(homeSiteEntry(named)).toEqual({ siteMode: 'home', existingHome: true });
  expect(homeSiteEntry({})).toEqual({ siteMode: 'home', existingHome: false });
  expect(() => homeSiteEntry({ HOME_SITE_MODE: 'typo' })).toThrow(/site/i);
});
