/**
 * Turns a JS number into a plain decimal string safe to hand to viem's
 * `parseUnits` -- never `String(value)` directly.
 *
 * `String()`/template-literal coercion switches to exponential notation for
 * any number under ~1e-6 (`String(0.0000005)` -> `"5e-7"`), and
 * `parseUnits` rejects that outright ("Value `5e-7` is not a valid decimal
 * number") -- thrown synchronously, in the middle of a component's render,
 * with nothing catching it. That's exactly what crashed the strategy fill
 * inputs once the WETH side's minimum was lowered past 1e-6 (see
 * strategy-card.tsx / app/strategies/[hash]/page.tsx): a value the UI
 * happily accepted became unparseable the instant it needed to become an
 * amount. `toFixed` never produces exponential notation regardless of
 * magnitude, so rounding to the token's own decimals here is both correct
 * (parseUnits wouldn't accept more fractional digits than that anyway) and
 * crash-proof.
 */
export function toDecimalString(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(Math.min(Math.max(decimals, 0), 100));
}

/**
 * Axis ticks want scale, not full precision -- the exact figures belong in
 * point tooltips and quote boxes, which keep PRICE_DECIMALS.
 *
 * Rendering ticks at the full 10 decimals produced 12-character labels like
 * "0.0006084066". They're right-anchored just inside the chart's left
 * gutter, so they ran off the edge of the viewBox and rendered clipped --
 * a tick reading "006084066", silently missing its leading "0.0". Below
 * 0.001 an exponent is both shorter and easier to compare at a glance than
 * counting leading zeros.
 */
export function axisTick(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  return Math.abs(value) < 0.001 ? value.toExponential(2) : value.toPrecision(4);
}
