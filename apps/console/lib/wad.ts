const WAD = 10n ** 18n;

/** Formats a WAD (18-decimal) bigint-as-string value to a fixed-decimal display string. */
export function formatWad(value: string | bigint, decimals = 2): string {
  const v = typeof value === "string" ? BigInt(value) : value;
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const whole = abs / WAD;
  const frac = (abs % WAD).toString().padStart(18, "0").slice(0, decimals);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function wadToNumber(value: string | bigint): number {
  return Number(formatWad(value, 6));
}
