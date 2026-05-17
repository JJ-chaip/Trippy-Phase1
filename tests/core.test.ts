/**
 * Core infrastructure tests — types, budget math, commit validator,
 * module registry.
 *
 * These ensure the extensibility backbone works correctly before
 * any visual modules are added.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  zeroCost,
  addCosts,
  scaleCost,
  BUDGET_PROFILE_CONSUMER,
  BUDGET_PROFILE_MOBILE,
  BUDGET_AXES,
} from '../src/core/types/budget.js';
import type { CostVector, CostManifest } from '../src/core/types/budget.js';
import { CommitValidator } from '../src/core/validators/commit-validator.js';
import { ModuleRegistry } from '../src/core/registry/module-registry.js';
import type { TrModule, ModuleManifest, ModuleOutput } from '../src/core/types/module-types.js';
import { createSilentDrive, AUDIO_DRIVE_SCHEMA_VERSION } from '../src/core/types/audio-drive.js';
import type { AudioClockMs } from '../src/core/types/common.js';
import { brand } from '../src/core/types/common.js';
import { createDefaultLookState, applyDraftToState } from '../src/core/types/look-state.js';
import type { ParamDescriptor } from '../src/core/types/look-state.js';

// ═══════════════════════════════════════════════════════════════
// BUDGET MATH
// ═══════════════════════════════════════════════════════════════

describe('Budget math', () => {
  it('zeroCost returns all zeros', () => {
    const z = zeroCost();
    for (const axis of BUDGET_AXES) {
      expect(z[axis]).toBe(0);
    }
  });

  it('addCosts sums element-wise', () => {
    const a: CostVector = { cpu: 1, gpu: 2, vram: 3, bandwidth: 4, audioGraph: 5 };
    const b: CostVector = { cpu: 10, gpu: 20, vram: 30, bandwidth: 40, audioGraph: 50 };
    const sum = addCosts(a, b);
    expect(sum.cpu).toBe(11);
    expect(sum.gpu).toBe(22);
    expect(sum.vram).toBe(33);
    expect(sum.bandwidth).toBe(44);
    expect(sum.audioGraph).toBe(55);
  });

  it('addCosts with zero is identity', () => {
    const a: CostVector = { cpu: 5, gpu: 10, vram: 15, bandwidth: 20, audioGraph: 25 };
    const sum = addCosts(a, zeroCost());
    expect(sum).toEqual(a);
  });

  it('scaleCost multiplies all axes', () => {
    const v: CostVector = { cpu: 2, gpu: 4, vram: 6, bandwidth: 8, audioGraph: 10 };
    const scaled = scaleCost(v, 3);
    expect(scaled.cpu).toBe(6);
    expect(scaled.gpu).toBe(12);
    expect(scaled.vram).toBe(18);
    expect(scaled.bandwidth).toBe(24);
    expect(scaled.audioGraph).toBe(30);
  });

  it('scaleCost by 0 returns zeros', () => {
    const v: CostVector = { cpu: 100, gpu: 200, vram: 300, bandwidth: 400, audioGraph: 500 };
    const scaled = scaleCost(v, 0);
    for (const axis of BUDGET_AXES) {
      expect(scaled[axis]).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// COMMIT VALIDATOR
// ═══════════════════════════════════════════════════════════════

describe('CommitValidator', () => {
  let validator: CommitValidator;

  beforeEach(() => {
    validator = new CommitValidator(BUDGET_PROFILE_CONSUMER);
  });

  it('validates empty state with no manifests as valid', () => {
    const result = validator.validate({});
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('validates within-budget manifests as valid', () => {
    const manifest: CostManifest = {
      moduleId: 'test-module',
      base: { cpu: 2, gpu: 10, vram: 50, bandwidth: 5, audioGraph: 4 },
      perInstance: zeroCost(),
    };
    validator.registerCost(manifest);
    const result = validator.validate({});
    expect(result.valid).toBe(true);
  });

  it('rejects over-budget manifests', () => {
    const manifest: CostManifest = {
      moduleId: 'expensive-module',
      base: { cpu: 100, gpu: 10, vram: 50, bandwidth: 5, audioGraph: 4 },
      perInstance: zeroCost(),
    };
    validator.registerCost(manifest);
    const result = validator.validate({});
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]!.axis).toBe('cpu');
  });

  it('accounts for multiple modules', () => {
    validator.registerCost({
      moduleId: 'mod-a',
      base: { cpu: 4, gpu: 50, vram: 128, bandwidth: 25, audioGraph: 16 },
      perInstance: zeroCost(),
    });
    validator.registerCost({
      moduleId: 'mod-b',
      base: { cpu: 5, gpu: 60, vram: 130, bandwidth: 30, audioGraph: 20 },
      perInstance: zeroCost(),
    });
    const result = validator.validate({});
    expect(result.valid).toBe(false);
    // GPU: 50+60=110 > 100, VRAM: 128+130=258 > 256, etc.
  });

  it('accounts for instance counts in perInstance costs', () => {
    validator.registerCost({
      moduleId: 'instanced',
      base: { cpu: 1, gpu: 5, vram: 10, bandwidth: 2, audioGraph: 1 },
      perInstance: { cpu: 1, gpu: 5, vram: 10, bandwidth: 2, audioGraph: 1 },
    });
    const counts = new Map([['instanced', 3]]);
    const result = validator.validate({}, counts);
    // base + 2 * perInstance = cpu: 1+2=3, gpu: 5+10=15, vram: 10+20=30...
    expect(result.totalCost.cpu).toBe(3);
    expect(result.totalCost.gpu).toBe(15);
  });

  it('tryCommit accepts valid state', () => {
    const outcome = validator.tryCommit({}, { someParam: 1 });
    expect(outcome.accepted).toBe(true);
    expect(outcome.state).toEqual({ someParam: 1 });
    expect(outcome.rejectionReasons).toHaveLength(0);
  });

  it('tryCommit rejects over-budget and returns previous state', () => {
    validator.registerCost({
      moduleId: 'big',
      base: { cpu: 100, gpu: 0, vram: 0, bandwidth: 0, audioGraph: 0 },
      perInstance: zeroCost(),
    });
    const prev = { x: 1 };
    const proposed = { x: 2 };
    const outcome = validator.tryCommit(prev, proposed);
    expect(outcome.accepted).toBe(false);
    expect(outcome.state).toEqual(prev);
    expect(outcome.rejectionReasons.length).toBeGreaterThan(0);
  });

  it('unregisterCost removes a manifest', () => {
    validator.registerCost({
      moduleId: 'temp',
      base: { cpu: 100, gpu: 0, vram: 0, bandwidth: 0, audioGraph: 0 },
      perInstance: zeroCost(),
    });
    expect(validator.validate({}).valid).toBe(false);
    validator.unregisterCost('temp');
    expect(validator.validate({}).valid).toBe(true);
  });

  it('setProfile switches budget profile', () => {
    validator.registerCost({
      moduleId: 'mid',
      base: { cpu: 6, gpu: 0, vram: 0, bandwidth: 0, audioGraph: 0 },
      perInstance: zeroCost(),
    });
    // Consumer ceiling cpu=8 → valid
    expect(validator.validate({}).valid).toBe(true);
    // Mobile ceiling cpu=4 → invalid
    validator.setProfile(BUDGET_PROFILE_MOBILE);
    expect(validator.validate({}).valid).toBe(false);
  });

  it('budgetSummary returns usage percentages', () => {
    validator.registerCost({
      moduleId: 'half',
      base: { cpu: 4, gpu: 50, vram: 128, bandwidth: 25, audioGraph: 16 },
      perInstance: zeroCost(),
    });
    const summary = validator.budgetSummary();
    expect(summary.cpu.percent).toBe(50);
    expect(summary.gpu.percent).toBe(50);
  });

  it('violation reports correct overage percent', () => {
    validator.registerCost({
      moduleId: 'over',
      base: { cpu: 12, gpu: 0, vram: 0, bandwidth: 0, audioGraph: 0 },
      perInstance: zeroCost(),
    });
    const result = validator.validate({});
    const cpuViolation = result.violations.find(v => v.axis === 'cpu');
    expect(cpuViolation).toBeDefined();
    // 12 over ceiling 8 = 50% overage
    expect(cpuViolation!.overagePercent).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// MODULE REGISTRY
// ═══════════════════════════════════════════════════════════════

function createStubModule(
  id: string,
  deps: string[] = [],
  updateFn?: () => ModuleOutput,
): TrModule {
  const manifest: ModuleManifest = {
    id,
    name: `Stub ${id}`,
    version: '0.0.1',
    category: 'utility',
    description: `Test stub module ${id}`,
    costManifest: {
      moduleId: id,
      base: zeroCost(),
      perInstance: zeroCost(),
    },
    dependencies: deps,
  };

  return {
    manifest,
    init: () => {},
    update: () => (updateFn ? updateFn() : {}),
    dispose: () => {},
  };
}

describe('ModuleRegistry', () => {
  let registry: ModuleRegistry;

  beforeEach(() => {
    registry = new ModuleRegistry();
  });

  it('starts empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.initialised).toBe(false);
  });

  it('registers a module', () => {
    registry.register(createStubModule('a'));
    expect(registry.size).toBe(1);
    expect(registry.get('a')).toBeDefined();
  });

  it('throws on duplicate registration', () => {
    registry.register(createStubModule('a'));
    expect(() => registry.register(createStubModule('a'))).toThrow('duplicate');
  });

  it('throws on registration after init', () => {
    registry.register(createStubModule('a'));
    registry.init({});
    expect(() => registry.register(createStubModule('b'))).toThrow('after init');
  });

  it('throws on update before init', () => {
    registry.register(createStubModule('a'));
    const drive = createSilentDrive(0 as AudioClockMs);
    expect(() => registry.update(drive, {}, 16)).toThrow('must call init');
  });

  it('throws on double init', () => {
    registry.register(createStubModule('a'));
    registry.init({});
    expect(() => registry.init({})).toThrow('already initialised');
  });

  it('initialises modules in dependency order', () => {
    const order: string[] = [];
    const makeModule = (id: string, deps: string[]): TrModule => ({
      ...createStubModule(id, deps),
      init: () => { order.push(id); },
    });

    registry.register(makeModule('c', ['b']));
    registry.register(makeModule('b', ['a']));
    registry.register(makeModule('a', []));
    registry.init({});

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('detects dependency cycles', () => {
    registry.register(createStubModule('a', ['b']));
    registry.register(createStubModule('b', ['a']));
    expect(() => registry.init({})).toThrow('cycle');
  });

  it('detects missing dependencies', () => {
    registry.register(createStubModule('a', ['nonexistent']));
    expect(() => registry.init({})).toThrow('not registered');
  });

  it('updates modules and returns outputs', () => {
    registry.register(
      createStubModule('a', [], () => ({ value: 42 })),
    );
    registry.init({});
    const drive = createSilentDrive(0 as AudioClockMs);
    const frame = registry.update(drive, {}, 16);
    expect(frame.outputs.get('a')).toEqual({ value: 42 });
  });

  it('updates in dependency order', () => {
    const order: string[] = [];
    const makeModule = (id: string, deps: string[]): TrModule => ({
      ...createStubModule(id, deps),
      update: () => { order.push(id); return {}; },
    });

    registry.register(makeModule('c', ['a']));
    registry.register(makeModule('a', []));
    registry.register(makeModule('b', ['a']));
    registry.init({});

    const drive = createSilentDrive(0 as AudioClockMs);
    registry.update(drive, {}, 16);
    // a must come before b and c
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
  });

  it('dispose clears all modules', () => {
    registry.register(createStubModule('a'));
    registry.init({});
    registry.dispose();
    expect(registry.size).toBe(0);
    expect(registry.initialised).toBe(false);
  });

  it('getOutput returns undefined for unknown module', () => {
    expect(registry.getOutput('nonexistent')).toBeUndefined();
  });

  it('get returns undefined for unknown module', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('handles diamond dependency graph', () => {
    // a → b, a → c, b → d, c → d
    registry.register(createStubModule('d', []));
    registry.register(createStubModule('b', ['d']));
    registry.register(createStubModule('c', ['d']));
    registry.register(createStubModule('a', ['b', 'c']));
    // Should not throw — d is visited once
    registry.init({});
    expect(registry.moduleIds.indexOf('d')).toBeLessThan(registry.moduleIds.indexOf('b'));
    expect(registry.moduleIds.indexOf('d')).toBeLessThan(registry.moduleIds.indexOf('c'));
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIO DRIVE
// ═══════════════════════════════════════════════════════════════

describe('CanonicalAudioDrive', () => {
  it('createSilentDrive returns valid silent snapshot', () => {
    const drive = createSilentDrive(1000 as AudioClockMs);
    expect(drive.schemaVersion).toBe(AUDIO_DRIVE_SCHEMA_VERSION);
    expect(drive.tAnalysisMs).toBe(1000);
    expect(drive.rms).toBe(0);
    expect(drive.peak).toBe(0);
    expect(drive.gateOpen).toBe(false);
    expect(drive.active).toBe(false);
    expect(drive.status).toBe('SILENT');
    expect(drive.bands).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// LOOK STATE
// ═══════════════════════════════════════════════════════════════

describe('LookState', () => {
  const descriptors: ParamDescriptor[] = [
    {
      key: 'speed',
      label: 'Speed',
      min: 0,
      max: 10,
      step: 0.1,
      defaultValue: 1.0,
      costCoefficients: { cpu: 0.1 },
      group: 'motion',
      tier: 'essential',
    },
    {
      key: 'brightness',
      label: 'Brightness',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.8,
      costCoefficients: { gpu: 0.5 },
      group: 'color',
      tier: 'essential',
    },
  ];

  it('createDefaultLookState uses descriptor defaults', () => {
    const state = createDefaultLookState(descriptors);
    expect(state['speed']).toBe(1.0);
    expect(state['brightness']).toBe(0.8);
  });

  it('applyDraftToState merges overrides', () => {
    const base = createDefaultLookState(descriptors);
    const draft = applyDraftToState(base, { speed: 5.0 });
    expect(draft['speed']).toBe(5.0);
    expect(draft['brightness']).toBe(0.8);
  });

  it('applyDraftToState does not mutate base', () => {
    const base = createDefaultLookState(descriptors);
    applyDraftToState(base, { speed: 5.0 });
    expect(base['speed']).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════
// BRANDED TYPES
// ═══════════════════════════════════════════════════════════════

describe('Branded types', () => {
  it('brand wraps a number', () => {
    const ms = brand(1000, 'AudioClockMs');
    // At runtime it's just a number
    expect(ms).toBe(1000);
  });

  it('brand wraps a string', () => {
    const ver = brand('0.1.0', 'SchemaVersion');
    expect(ver).toBe('0.1.0');
  });
});

// ═══════════════════════════════════════════════════════════════
// MATH UTILS
// ═══════════════════════════════════════════════════════════════

describe('Math utils (see math.test.ts)', () => {
  it('math tests are in a dedicated file', () => {
    expect(true).toBe(true);
  });
});
