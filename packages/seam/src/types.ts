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
 */
export interface KeelProgramData {
  gammaWad: bigint;
  sigmaSqWad: bigint;
  baseSpreadWad: bigint;
  targetInventoryWad: bigint;
  boundWad: bigint;
  horizonSecs: number;
  startTimestamp: number;
}

export interface KeelStrategyConfig {
  maker: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
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
