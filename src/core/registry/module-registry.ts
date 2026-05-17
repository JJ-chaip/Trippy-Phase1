/**
 * ModuleRegistry — the extensibility backbone.
 *
 * Modules register themselves here. The registry handles:
 *   - Dependency ordering (topological sort)
 *   - Lifecycle management (init → update → dispose)
 *   - Output routing between modules
 *   - Preventing duplicate registrations
 *
 * Adding a new module requires ZERO changes to existing code:
 *   1. Create module in src/modules/<name>/
 *   2. Call registry.register(myModule)
 *   3. Done — the registry handles the rest.
 */

import type { CanonicalAudioDrive } from '../types/audio-drive.js';
import type { UserLookState } from '../types/look-state.js';
import type {
  ModuleId,
  ModuleOutput,
  TrModule,
} from '../types/module-types.js';

export interface FrameOutputs {
  readonly outputs: ReadonlyMap<ModuleId, ModuleOutput>;
}

export class ModuleRegistry {
  private readonly _modules = new Map<ModuleId, TrModule>();
  private _sortedIds: readonly ModuleId[] = [];
  private _initialised = false;
  private readonly _outputs = new Map<ModuleId, ModuleOutput>();

  /** Number of registered modules. */
  get size(): number {
    return this._modules.size;
  }

  /** Whether the registry has been initialised. */
  get initialised(): boolean {
    return this._initialised;
  }

  /** Get a registered module by ID. */
  get(id: ModuleId): TrModule | undefined {
    return this._modules.get(id);
  }

  /** Get all registered module IDs. */
  get moduleIds(): readonly ModuleId[] {
    return this._sortedIds;
  }

  /** Get the last frame output for a module. */
  getOutput(id: ModuleId): ModuleOutput | undefined {
    return this._outputs.get(id);
  }

  /**
   * Register a module. Must be called before init().
   * Throws if a module with the same ID is already registered.
   */
  register(module: TrModule): void {
    if (this._initialised) {
      throw new Error(
        `ModuleRegistry: cannot register '${module.manifest.id}' after init()`,
      );
    }
    if (this._modules.has(module.manifest.id)) {
      throw new Error(
        `ModuleRegistry: duplicate module ID '${module.manifest.id}'`,
      );
    }
    this._modules.set(module.manifest.id, module);
  }

  /**
   * Initialise all registered modules in dependency order.
   * Throws if there are unsatisfied dependencies or cycles.
   */
  init(lookState: UserLookState): void {
    if (this._initialised) {
      throw new Error('ModuleRegistry: already initialised');
    }

    this._sortedIds = this._topologicalSort();

    for (const id of this._sortedIds) {
      const mod = this._modules.get(id);
      if (!mod) continue;
      mod.init({
        lookState,
        registerParam: (_key: string, _descriptor) => {
          // Param registration will be wired in H1.
          // For now this is a no-op placeholder in the context,
          // but modules can still call it without error.
        },
      });
    }

    this._initialised = true;
  }

  /**
   * Update all modules in dependency order.
   * Returns a map of module outputs for the current frame.
   */
  update(
    drive: CanonicalAudioDrive,
    state: UserLookState,
    dtMs: number,
  ): FrameOutputs {
    if (!this._initialised) {
      throw new Error('ModuleRegistry: must call init() before update()');
    }

    this._outputs.clear();

    for (const id of this._sortedIds) {
      const mod = this._modules.get(id);
      if (!mod) continue;
      const output = mod.update(drive, state, dtMs);
      this._outputs.set(id, output);
    }

    return { outputs: new Map(this._outputs) };
  }

  /**
   * Dispose all modules in reverse dependency order.
   */
  dispose(): void {
    const reversed = [...this._sortedIds].reverse();
    for (const id of reversed) {
      const mod = this._modules.get(id);
      if (!mod) continue;
      mod.dispose();
    }
    this._modules.clear();
    this._sortedIds = [];
    this._outputs.clear();
    this._initialised = false;
  }

  /**
   * Topological sort of modules by dependencies.
   * Throws on missing dependencies or cycles.
   */
  private _topologicalSort(): ModuleId[] {
    const visited = new Set<ModuleId>();
    const visiting = new Set<ModuleId>();
    const sorted: ModuleId[] = [];

    const visit = (id: ModuleId): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`ModuleRegistry: dependency cycle detected at '${id}'`);
      }

      const mod = this._modules.get(id);
      if (!mod) {
        throw new Error(`ModuleRegistry: missing dependency '${id}'`);
      }

      visiting.add(id);

      for (const depId of mod.manifest.dependencies) {
        if (!this._modules.has(depId)) {
          throw new Error(
            `ModuleRegistry: module '${id}' depends on '${depId}' which is not registered`,
          );
        }
        visit(depId);
      }

      visiting.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    for (const id of this._modules.keys()) {
      visit(id);
    }

    return sorted;
  }
}
