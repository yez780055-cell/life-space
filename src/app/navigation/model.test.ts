import { describe, expect, it } from 'vitest';
import { currentLayer, initialSnapshot, openGuide, openSurface, switchModule } from './model';

describe('navigation layers', () => {
  it('places a modal above settings above the module child page', () => {
    const child = openGuide(initialSnapshot('period'));
    const settings = openSurface(child, 'settings');
    const modal = openSurface(settings, 'about');
    expect(currentLayer(modal)).toBe('about');
    expect(currentLayer({ ...modal, surfaces: ['settings'] })).toBe('settings');
    expect(currentLayer(child)).toBe('guide');
  });

  it('keeps each module page state when switching', () => {
    const periodGuide = openGuide(initialSnapshot('period'));
    expect(switchModule(periodGuide, 'todo').pages.period).toBe('guide');
  });
});
