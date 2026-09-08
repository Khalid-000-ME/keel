/**
 * Turns a thrown wallet/RPC error into one line a demo audience can act on.
 *
 * The wallet-RPC case is called out explicitly because it is genuinely
 * confusing otherwise: writes go through `getConnectorClient()` -- a wallet
 * client over the injected provider -- so `eth_sendTransaction` and the
 * wallet's own gas estimation run against whatever RPC the *wallet* has
 * configured for this chain, not the endpoints in
 * NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL. A rate-limited wallet RPC therefore
 * breaks exactly the fill/ship/dock buttons while every live read on the
 * same screen keeps working -- which reads as "the app is broken" unless
 * the message says where to actually look.
 */
export function txErrorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);

  if (/user rejected|denied/i.test(message)) return "Cancelled in wallet.";

  if (/exceeds defined limit|rate limit|too many requests|429|request limit/i.test(message)) {
    return "Your wallet's RPC rate-limited this transaction. Sends go through the wallet's own endpoint, not this site's — switch the Base Sepolia RPC in your wallet's network settings and retry.";
  }

  if (/insufficient funds/i.test(message)) {
    return "Not enough Base Sepolia ETH for gas in this wallet.";
  }

  return message.split("\n")[0].slice(0, 160);
}
