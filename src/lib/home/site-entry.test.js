import { test, expect } from 'vitest';
import { homeSiteEntry, householdReturnUrl, confirmedSetupDestination } from './site-entry.js';
test('confirmed onboarding returns to the household entry and never redirects an uncertain save', () => {
  const guide = householdReturnUrl({ HOME_SITE_MODE: 'guide' }),
    ordinary = householdReturnUrl({});
  expect(confirmedSetupDestination({ status: 'ready', homeId: 'example-home' }, guide)).toBe(
    '/home'
  );
  expect(confirmedSetupDestination({ status: 'ready', homeId: 'example-home' }, ordinary)).toBe(
    '/'
  );
  expect(
    confirmedSetupDestination({ status: 'pending-readback', homeId: 'example-home' }, guide)
  ).toBeNull();
  expect(() => confirmedSetupDestination({}, guide)).toThrow(/confirm/i);
});
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
