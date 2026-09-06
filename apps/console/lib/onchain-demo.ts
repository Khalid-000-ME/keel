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
    fillSize: string;
    ticks: number;
  };
  fills: {
    tick: number;
    balance0Before: string;
    balance1Before: string;
    actualAmountOut: string;
    txHash: string;
    blockNumber: number;
    transactionIndex: number;
  }[];
  finalBalance0: string;
  finalBalance1: string;
};
