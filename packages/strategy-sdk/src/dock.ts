import { Address, HexString, type CallInfo, AquaProtocolContract } from "@1inch/aqua-sdk";

/** Builds the calldata to dock (close) a shipped Keel strategy, via the real @1inch/aqua-sdk. */
export function buildDockTx(
  aquaAddress: `0x${string}`,
  keelRouterAddress: `0x${string}`,
  strategyHash: `0x${string}`,
  tokens: `0x${string}`[],
): CallInfo {
  return AquaProtocolContract.buildDockTx(new Address(aquaAddress), {
    app: new Address(keelRouterAddress),
    strategyHash: new HexString(strategyHash),
    tokens: tokens.map((t) => new Address(t)),
  });
}
