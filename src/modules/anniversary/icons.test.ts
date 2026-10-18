import { describe, expect, it } from 'vitest';
import { ANNIVERSARY_ICON_CATALOG, DEFAULT_ANNIVERSARY_ICON, isAnniversaryIconKey, normalizeAnniversaryIcon } from './icons';

describe('Anniversary icon catalog', () => {
  it('contains the complete local icon set with unique stable keys and accessible Chinese names', () => {
    expect(ANNIVERSARY_ICON_CATALOG.map(({ key }) => key)).toEqual([
      'heart', 'star', 'sparkles', 'cake', 'gift', 'ring', 'home', 'flower',
      'plane', 'car', 'camera', 'music', 'graduation', 'paw', 'baby', 'calendar'
    ]);
    expect(new Set(ANNIVERSARY_ICON_CATALOG.map(({ key }) => key)).size).toBe(ANNIVERSARY_ICON_CATALOG.length);
    expect(ANNIVERSARY_ICON_CATALOG.every(({ label }) => label.trim().length > 0)).toBe(true);
    expect(DEFAULT_ANNIVERSARY_ICON).toBe('heart');
  });

  it('validates persisted keys and falls back safely for absent or unknown values', () => {
    expect(isAnniversaryIconKey('plane')).toBe(true);
    expect(isAnniversaryIconKey('not-installed')).toBe(false);
    expect(normalizeAnniversaryIcon('music')).toBe('music');
    expect(normalizeAnniversaryIcon(undefined)).toBe('heart');
    expect(normalizeAnniversaryIcon('not-installed')).toBe('heart');
  });
});
