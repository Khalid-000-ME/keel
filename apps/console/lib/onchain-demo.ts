import onchainDemoData from "@/data/onchain-demo.json";

/**
 * A real Keel position shipped and filled on Base Sepolia against the live
 * Aqua + KeelRouter deployment -- every hash here is a genuine, currently
 * confirmable transaction (see docs/onchain-demo/base-sepolia-run-1.json's
 * verificationNote for how each was independently re-derived from
 * `cast receipt`/`cast tx` after the broadcast, since forge's own
 * run-latest.json mislabeled which hash belonged to which call in this
 * run). Captured once and checked in specifically so the demo has a
 * concrete fallback if the live RPC or subgraph is unreachable on the day.
 */
export const onchainDemo = onchainDemoData as {
  chain: string;
  chainId: number;
  explorer: string;
  deployedContracts: { aqua: string; keelRouter: string };
  demoTokens: { token0: string; token1: string };
  /** USDC / WETH -- the real pair, not the retired mock one. */
  tokenSymbols: { token0: string; token1: string };
  tokenDecimals: { token0: number; token1: number };
  maker: string;
  demoTaker: string;
  strategyHash: string;
  shipTxHash: string;
  shipBlockNumber: number;
  params: {
    gammaWad: string;
    sigmaSqWad: string;
    baseSpreadWad: string;
    targetInventoryWad: string;
    boundWad: string;
    horizonSecs: number;
    /** WAD-normalized, like the balances -- see the file's decimalsNote. */
    fillSize: string;
    /** The same size in USDC's native 6 decimals, as actually submitted. */
    fillSizeRaw: string;
    ticks: number;
  };
  fills: {
    tick: number;
    /** Sender nonce -- the only trustworthy ordering for this run. */
    nonce: number;
    balance0Before: string;
    balance0BeforeRaw: string;
    balance1Before: string;
    actualAmountOut: string;
    txHash: string;
    blockNumber: number;
  }[];
  finalBalance0: string;
  finalBalance0Raw: string;
  finalBalance1: string;
};
