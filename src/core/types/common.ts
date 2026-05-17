/**
 * Branded / opaque types for type-safe domain values.
 *
 * A branded type is a primitive wrapped with a unique tag so that
 * e.g. AudioClockMs and plain `number` are not interchangeable.
 * This catches unit-mismatch bugs at compile time.
 */

declare const __brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Time ────────────────────────────────────────────────────────
/** Milliseconds on the audio-analysis clock. */
export type AudioClockMs = Brand<number, 'AudioClockMs'>;

/** Milliseconds on the wall clock (performance.now). */
export type WallClockMs = Brand<number, 'WallClockMs'>;

/** Seconds (generic). */
export type Seconds = Brand<number, 'Seconds'>;

// ── Audio ───────────────────────────────────────────────────────
/** RMS amplitude in [0, 1]. */
export type NormalisedAmplitude = Brand<number, 'NormalisedAmplitude'>;

/** Frequency in Hz. */
export type Hz = Brand<number, 'Hz'>;

/** Normalised scalar in [0, 1]. */
export type UnitScalar = Brand<number, 'UnitScalar'>;

/** Gain multiplier (positive, may exceed 1). */
export type GainMultiplier = Brand<number, 'GainMultiplier'>;

// ── Schema ──────────────────────────────────────────────────────
/** Semver-style schema version string. */
export type SchemaVersion = Brand<string, 'SchemaVersion'>;

/** SHA-256 hex hash (or similar content hash). */
export type ContentHash = Brand<string, 'ContentHash'>;

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Cast a raw value to a branded type. Use only at system boundaries
 * (parsing, deserialization, test fixtures). Interior code should
 * pass branded values through without re-casting.
 */
export function brand<B extends string>(value: number, _tag: B): Brand<number, B>;
export function brand<B extends string>(value: string, _tag: B): Brand<string, B>;
export function brand<B extends string>(
  value: number | string,
  _tag: B,
): Brand<number, B> | Brand<string, B> {
  return value as Brand<number, B> | Brand<string, B>;
}

/**
 * Unwrap a branded type back to its primitive. Use sparingly — prefer
 * keeping values branded through the pipeline.
 */
export function unbrand<T extends Brand<number, string>>(value: T): number;
export function unbrand<T extends Brand<string, string>>(value: T): string;
export function unbrand(value: unknown): number | string {
  return value as number | string;
}
