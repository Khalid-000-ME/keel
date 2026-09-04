import { Address, HexString, type CallInfo, AquaProtocolContract } from "@1inch/aqua-sdk";
import type { KeelStrategyConfig } from "@keel/seam";

import { buildKeelProgram } from "./instructions.js";
import { buildOrder } from "./order.js";
import { encodeOrder } from "./abi.js";

/**
 * Builds the calldata for shipping a Keel strategy on Aqua -- via the real
 * `@1inch/aqua-sdk`'s `AquaProtocolContract`, not a hand-rolled encoder for
 * `Aqua.ship()` itself (only the *strategy* bytes inside it, `abi.encode(order)`,
 * are Keel/SwapVM-specific and need this repo's own encoders).
 *
 * @dev `@1inch/aqua-sdk` (checked at v0.3.1) exports a stateless
 *      `AquaProtocolContract` with static calldata-builders (`buildShipTx`
 *      returns `{to, data, value}`), not an async client with its own
 *      `.ship()` network call -- the caller submits the returned `CallInfo`
 *      through their own wallet/provider (viem, ethers, ...). This is a
 *      correction against the PRD's original sketch, which assumed a
 *      stateful `AquaClient`; the real SDK is a lower-level, wallet-
 *      agnostic calldata encoder.
 * @returns a `CallInfo` ({to, data, value}) ready to submit as a
 *          transaction to the given Aqua deployment.
 */
export interface ShipAmounts {
  amountIn: bigint;
  amountOut: bigint;
}

export function buildShipKeelStrategyTx(
  aquaAddress: `0x${string}`,
  keelRouterAddress: `0x${string}`,
  config: KeelStrategyConfig,
  amounts: ShipAmounts,
  saltSeed: bigint,
): CallInfo {
  const program = buildKeelProgram(
    {
      gammaWad: config.params.gammaWad,
      sigmaSqWad: config.params.sigmaSqWad,
      baseSpreadWad: config.params.baseSpreadWad,
      targetInventoryWad: config.targetInventoryWad,
      boundWad: config.boundWad,
      horizonSecs: config.params.horizonSecs,
      startTimestamp: Math.floor(Date.now() / 1000),
    },
    saltSeed,
  );

  const tokenInIsA = BigInt(config.tokenIn) < BigInt(config.tokenOut);
  const [tokenA, tokenB] = tokenInIsA ? [config.tokenIn, config.tokenOut] : [config.tokenOut, config.tokenIn];
  const [amountA, amountB] = tokenInIsA
    ? [amounts.amountIn, amounts.amountOut]
    : [amounts.amountOut, amounts.amountIn];

  const order = buildOrder({
    maker: config.maker,
    tokenA,
    tokenB,
    useAquaInsteadOfSignature: true,
    program,
  });

  const strategy = new HexString(encodeOrder(order));

  return AquaProtocolContract.buildShipTx(new Address(aquaAddress), {
    app: new Address(keelRouterAddress),
    strategy,
    amountsAndTokens: [
      { token: new Address(tokenA), amount: amountA },
      { token: new Address(tokenB), amount: amountB },
    ],
  });
}
