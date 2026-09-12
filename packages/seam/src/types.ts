/**
 * Mirrors contracts/src/libs/AvellanedaStoikov.sol's Params struct.
 * All *Wad fields are 18-decimal fixed point (WAD = 1e18).
 */
export interface AvellanedaStoikovParams {
  gammaWad: bigint;
  sigmaSqWad: bigint;
  baseSpreadWad: bigint;
  horizonSecs: number;
}

/**
 * Mirrors contracts/src/instructions/KeelInstructions.sol's
 * KeelInventorySkew.ProgramData struct -- the immediate bytes packed into
 * a Keel strategy's program at ship time.
 *
 * tokenADecimals/tokenBDecimals exist because `targetInventoryWad` (and
 * therefore the skew term derived from it) is always WAD-scaled, while the
 * live Aqua balances the opcode reads are in each token's own *native*
 * decimals -- see KeelInstructions.sol's ProgramData doc comment for the
 * full reasoning. Every token this project shipped against until real
 * USDC happened to be 18-decimal, which is why this field didn't exist
 * before.
 *
 * They are keyed to tokenA/tokenB -- the order's own two tokens, sorted by
 * address -- and not to the swap's in/out sides, which change with the
 * direction of each fill. `tokenA` is carried in the program for the same
 * reason: it is what lets the opcode tell which direction a fill is running
 * (`ctx.query.tokenIn == tokenA`) and therefore which scale belongs to which
 * side. Keying these to in/out is what broke every covered-side (B->A) fill.
 */
export interface KeelProgramData {
  gammaWad: bigint;
  sigmaSqWad: bigint;
  baseSpreadWad: bigint;
  targetInventoryWad: bigint;
  boundWad: bigint;
  horizonSecs: number;
  startTimestamp: number;
  tokenADecimals: number;
  tokenBDecimals: number;
  /** The order's tokenA (the lower-sorting of the pair). */
  tokenA: `0x${string}`;
}

export interface KeelStrategyConfig {
  maker: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  targetInventoryWad: bigint;
  boundWad: bigint;
  params: AvellanedaStoikovParams;
}

/**
 * One row of contracts/script/AdversarialFlow.s.sol's CSV output
 * (tick,mid,stock_inventory,stock_pnl,keel_inventory,keel_pnl), consumed by
 * packages/sim-report.
 */
export interface SimFillRecord {
  tick: number;
  midWad: bigint;
  stockInventoryWad: bigint;
  stockPnlWad: bigint;
  keelInventoryWad: bigint;
  keelPnlWad: bigint;
}
