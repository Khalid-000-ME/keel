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
 * tokenInDecimals/tokenOutDecimals exist because `targetInventoryWad` (and
 * therefore the skew term derived from it) is always WAD-scaled, while the
 * live Aqua balances the opcode reads are in each token's own *native*
 * decimals -- see KeelInstructions.sol's ProgramData doc comment for the
 * full reasoning. Every token this project shipped against until real
 * USDC happened to be 18-decimal, which is why this field didn't exist
 * before.
 */
export interface KeelProgramData {
  gammaWad: bigint;
  sigmaSqWad: bigint;
  baseSpreadWad: bigint;
  targetInventoryWad: bigint;
  boundWad: bigint;
  horizonSecs: number;
  startTimestamp: number;
  tokenInDecimals: number;
  tokenOutDecimals: number;
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
