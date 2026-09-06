/**
 * A faithful mirror of contracts/src/libs/AvellanedaStoikov.sol, in floats.
 *
 * Used *only* to preview a strategy before it exists on-chain -- once one is
 * shipped, every number the console shows comes from the contract itself via
 * KeelDemoTaker.previewFill, because a re-implementation is a claim and a
 * contract call is evidence. Kept faithful anyway (same terms, same clamps,
 * same 500bps penalty ramp) so the designed curve matches the shipped one.
 */

export interface KeelParams {
  /** Risk aversion. Higher = skews harder for the same drift. */
  gamma: number;
  /** Variance proxy. Scales the skew and the time-varying spread together. */
  sigmaSq: number;
  /** delta0 -- the spread floor the maker always charges. */
  baseSpread: number;
  /** Seconds until the strategy's horizon T. */
  horizonSecs: number;
}

export const MAX_PENALTY_BPS = 500;

/** T - t, floored at zero. */
export function remainingSecs(p: KeelParams, elapsedSecs: number): number {
  return Math.max(0, p.horizonSecs - elapsedSecs);
}

/** r(s,q,t) = s - q * gamma * sigma^2 * (T - t) */
export function reservationPrice(mid: number, q: number, p: KeelParams, elapsedSecs = 0): number {
  return mid - q * p.gamma * p.sigmaSq * remainingSecs(p, elapsedSecs);
}

/** delta(t) = delta0 + gamma * sigma^2 * (T - t) */
export function halfSpread(p: KeelParams, elapsedSecs = 0): number {
  return Math.max(0, p.baseSpread + p.gamma * p.sigmaSq * remainingSecs(p, elapsedSecs));
}

/** Linear ramp to 500bps as |q|/bound goes 0 -> 1, clamped above. */
export function softBoundPenaltyBps(q: number, bound: number): number {
  if (bound === 0) return 0;
  const raw = (Math.abs(q) / Math.abs(bound)) * MAX_PENALTY_BPS;
  return Math.min(MAX_PENALTY_BPS, raw);
}

export interface QuotePair {
  reservation: number;
  halfSpread: number;
  penaltyBps: number;
  /** Price for the fill that pushes inventory further from target. */
  exposed: number;
  /** Price for the fill that mean-reverts inventory toward target. */
  covered: number;
}

/**
 * Both sides of the quote at a given inventory drift. Mirrors
 * `applyInventorySkew`: the exposed side is quoted at r - delta and pays the
 * soft-bound penalty; the covered side is quoted at r + delta and pays
 * nothing extra.
 */
export function quoteAtDrift(mid: number, q: number, p: KeelParams, bound: number, elapsedSecs = 0): QuotePair {
  const r = reservationPrice(mid, q, p, elapsedSecs);
  const d = halfSpread(p, elapsedSecs);
  const penaltyBps = q >= 0 ? softBoundPenaltyBps(q, bound) : 0;

  const exposedBase = Math.max(0, r - d);
  return {
    reservation: r,
    halfSpread: d,
    penaltyBps,
    exposed: exposedBase * (1 - penaltyBps / 10_000),
    covered: r + d,
  };
}

/** WAD helpers -- the contracts take 18-decimal fixed point for every param. */
export const WAD = 10n ** 18n;

export function toWad(value: number): bigint {
  // Round-trip through a fixed 18-decimal string so 5e-4 doesn't land on
  // 499999999999999.94 the way naive float * 1e18 does.
  const [whole, frac = ""] = value.toFixed(18).split(".");
  return BigInt(whole) * WAD + BigInt(frac.padEnd(18, "0").slice(0, 18)) * (value < 0 ? -1n : 1n);
}

export function fromWad(value: bigint): number {
  return Number(value) / 1e18;
}
