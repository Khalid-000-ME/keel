import { baseSepolia } from "wagmi/chains";

/**
 * Endpoints this app uses for **reads**. NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
 * (apps/console/.env.local) takes a comma-separated list, wired into a
 * `fallback([...])` transport rather than a single `http()` -- wagmi tries
 * them in order per request and moves to the next on error, so no single
 * public RPC's rate limit or downtime is the whole story. Falls back to
 * Base Sepolia's own default public RPC if the env var is unset.
 *
 * @dev This list does **not** govern writes. `writeContract` goes through
 *      `getConnectorClient()` -- a wallet client over the injected
 *      provider -- so `eth_sendTransaction` and the wallet's own gas
 *      estimation run against whatever RPC *MetaMask* has configured for
 *      this chain, which the page cannot override. A wallet-side rate
 *      limit therefore surfaces on the fill/dock/ship buttons while every
 *      read on the same screen keeps working; the fix for that is to
 *      change the network's RPC inside the wallet. CHAIN below at least
 *      hands these endpoints over when the wallet *adds* the network.
 */
export const RPC_URLS: readonly [string, ...string[]] = (() => {
  const configured = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL?.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  // Typed as a non-empty tuple because it is one by construction, and
  // viem's Chain wants `rpcUrls.default.http` to guarantee at least one.
  return configured?.length ? (configured as [string, ...string[]]) : baseSepolia.rpcUrls.default.http;
})();

/**
 * The live Base Sepolia deployment the strategy console drives. Aqua and
 * KeelRouter are the real mechanism (see README's deployment table); the
 * demo token pair and taker helper are conveniences deployed alongside it
 * so a visitor can drive the whole flow from a browser without being
 * hand-funded first (contracts/src/demo/).
 *
 * Declares RPC_URLS as the chain's own endpoints so that when a wallet
 * adds this network through the app (`wallet_addEthereumChain`, which
 * wagmi issues on a chain switch the wallet doesn't already know), it's
 * handed the same vetted list the app reads through -- rather than viem's
 * single default public URL. The spread keeps `id` a literal 84532, which
 * wagmi's chain-id generics depend on.
 */
export const CHAIN = {
  ...baseSepolia,
  rpcUrls: { ...baseSepolia.rpcUrls, default: { http: RPC_URLS } },
};

export const ADDRESSES = {
  aqua: "0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD",
  keelRouter: "0x9520b1F0Cbb14F0939041a16E12D9Bc857c50ea2",
  demoTaker: "0x54A8d52E72C0FdfB3ECF7014F47cE24D6229B763",
} as const;

/**
 * Real WETH/USDC on Base Sepolia -- replaces the DRFT/BALT mock pair now
 * that KeelInventorySkew normalizes non-18-decimal tokens to WAD itself
 * (KeelInstructions.sol's tokenInDecimals/tokenOutDecimals), so a real,
 * 6-decimal USDC is safe to quote against.
 *
 * Aqua/SwapVM require tokenA < tokenB numerically, and these are stored in
 * that order -- token0 is the pair's tokenA, and USDC happens to sort
 * first on this chain (not a choice, an address-comparison fact), which
 * makes USDC the inventory-tracked ("in") side and WETH the quoted
 * ("out") side. `decimals` is what lets every amount field below format
 * and parse each token correctly instead of assuming 18 for both.
 */
export const DEMO_TOKENS = [
  { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", symbol: "USDC", label: "USDC — quote asset", decimals: 6 },
  { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", label: "Wrapped ETH — base asset", decimals: 18 },
] as const;

export const explorerTx = (hash: string) => `${CHAIN.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (address: string) => `${CHAIN.blockExplorers.default.url}/address/${address}`;

// --------------------------------------------------------------------- ABIs
// Hand-written minimal fragments rather than full artifacts: only the calls
// the console actually makes, so a reader can see the whole surface it
// touches on one screen.

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  // WETH9-only -- deposit() wraps msg.value 1:1, standing in for a "faucet"
  // mint since real WETH has no permissionless mint. Harmless to include in
  // the shared ABI for USDC reads/writes, which never call it.
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
] as const;

export const AQUA_ABI = [
  {
    type: "function",
    name: "ship",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategy", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ name: "strategyHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "dock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "tokens", type: "address[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "safeBalances",
    stateMutability: "view",
    inputs: [
      { name: "maker", type: "address" },
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
    ],
    outputs: [
      { name: "balance0", type: "uint256" },
      { name: "balance1", type: "uint256" },
    ],
  },
] as const;

/** ISwapVM.Order as a viem tuple -- MakerTraits is a uint256 value type. */
const ORDER_TUPLE = {
  name: "order",
  type: "tuple",
  components: [
    { name: "maker", type: "address" },
    { name: "traits", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
} as const;

export const DEMO_TAKER_ABI = [
  {
    type: "function",
    name: "previewFill",
    stateMutability: "view",
    inputs: [
      { name: "router", type: "address" },
      ORDER_TUPLE,
      { name: "amountIn", type: "uint256" },
      { name: "isAToB", type: "bool" },
    ],
    outputs: [
      { name: "amountIn_", type: "uint256" },
      { name: "amountOut_", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "fill",
    stateMutability: "nonpayable",
    inputs: [
      { name: "router", type: "address" },
      ORDER_TUPLE,
      { name: "amountIn", type: "uint256" },
      { name: "isAToB", type: "bool" },
    ],
    outputs: [
      { name: "amountIn_", type: "uint256" },
      { name: "amountOut_", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "hashOf",
    stateMutability: "view",
    inputs: [{ name: "router", type: "address" }, ORDER_TUPLE],
    outputs: [{ type: "bytes32" }],
  },
] as const;
