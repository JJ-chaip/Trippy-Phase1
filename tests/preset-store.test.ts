/**
 * Tests for the PresetStore.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPresetStore,
  selectPreset,
  nextPreset,
  prevPreset,
  presetStoreTick,
  getInterpolatedPreset,
} from '../src/presets/presetStore.js';
import { ALL_PRESETS } from '../src/render/presets.js';
import type { PresetStoreState } from '../src/presets/presetStore.js';

describe('PresetStore', () => {
  let store: PresetStoreState;

  beforeEach(() => {
    store = createPresetStore();
  });

  it('creates with a valid default preset', () => {
    expect(store.current).toBeDefined();
    expect(ALL_PRESETS.some(p => p.id === store.current.id)).toBe(true);
    expect(store.transitionProgress).toBe(1);
    expect(store.previous).toBeNull();
    expect(store.autoCycle).toBe(false);
  });

  it('selectPreset starts a transition', () => {
    const target = ALL_PRESETS.find(p => p.id !== store.current.id);
    if (!target) throw new Error('Need at least 2 presets');
    const prev = store.current;

    selectPreset(store, target);

    expect(store.current).toBe(target);
    expect(store.previous).toBe(prev);
    expect(store.transitionProgress).toBe(0);
  });

  it('selectPreset is no-op for same preset', () => {
    selectPreset(store, store.current);
    expect(store.previous).toBeNull();
    expect(store.transitionProgress).toBe(1);
  });

  it('nextPreset cycles forward', () => {
    const idx = ALL_PRESETS.findIndex(p => p.id === store.current.id);
    const expectedNext = ALL_PRESETS[(idx + 1) % ALL_PRESETS.length];

    nextPreset(store);

    expect(store.current.id).toBe(expectedNext?.id);
  });

  it('prevPreset cycles backward', () => {
    const idx = ALL_PRESETS.findIndex(p => p.id === store.current.id);
    const expectedPrev = ALL_PRESETS[(idx - 1 + ALL_PRESETS.length) % ALL_PRESETS.length];

    prevPreset(store);

    expect(store.current.id).toBe(expectedPrev?.id);
  });

  it('presetStoreTick advances transition', () => {
    const target = ALL_PRESETS.find(p => p.id !== store.current.id);
    if (!target) throw new Error('Need at least 2 presets');

    selectPreset(store, target);
    expect(store.transitionProgress).toBe(0);

    presetStoreTick(store, 600);
    expect(store.transitionProgress).toBeGreaterThan(0);
    expect(store.transitionProgress).toBeLessThan(1);

    // Complete the transition
    presetStoreTick(store, 2000);
    expect(store.transitionProgress).toBe(1);
    expect(store.previous).toBeNull();
  });

  it('getInterpolatedPreset returns current when no transition', () => {
    const result = getInterpolatedPreset(store);
    expect(result.id).toBe(store.current.id);
  });

  it('getInterpolatedPreset blends during transition', () => {
    const first = ALL_PRESETS[0];
    const second = ALL_PRESETS[1];
    if (!first || !second) throw new Error('Need at least 2 presets');

    store.current = first;
    store.previous = null;
    store.transitionProgress = 1;

    selectPreset(store, second);
    presetStoreTick(store, 600);

    const blended = getInterpolatedPreset(store);
    // During mid-transition, the blended ringCount should be between the two
    expect(blended.ringCount).toBeGreaterThanOrEqual(
      Math.min(first.ringCount, second.ringCount),
    );
    expect(blended.ringCount).toBeLessThanOrEqual(
      Math.max(first.ringCount, second.ringCount),
    );
  });

  it('autoCycle advances presets after interval', () => {
    store.autoCycle = true;
    store.autoCycleIntervalSec = 1;
    const startId = store.current.id;

    // Tick past the auto-cycle interval
    presetStoreTick(store, 1500);

    expect(store.current.id).not.toBe(startId);
  });
});
