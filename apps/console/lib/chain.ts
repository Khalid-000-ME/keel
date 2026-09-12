import { arbitrumSepolia, baseSepolia, sepolia } from "wagmi/chains";
import type { Chain } from "viem";

/**
 * Endpoints this app uses for **reads** on Base Sepolia specifically.
 * NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL (apps/console/.env.local) takes a
 * comma-separated list, wired into a `fallback([...])` transport rather than
 * a single `http()` -- wagmi tries them in order per request and moves to
 * the next on error, so no single public RPC's rate limit or downtime is
 * the whole story. Falls back to Base Sepolia's own default public RPC if
 * the env var is unset. Ethereum Sepolia and Arbitrum Sepolia aren't
 * console-primary yet (see README's "What's deferred"), so they use their
 * chain package's default RPC list as-is rather than a configurable one.
 *
 * @dev This list does **not** govern writes. `writeContract` goes through
 *      `getConnectorClient()` -- a wallet client over the injected
 *      provider -- so `eth_sendTransaction` and the wallet's own gas
 *      estimation run against whatever RPC *MetaMask* has configured for
 *      that chain, which the page cannot override. A wallet-side rate
 *      limit therefore surfaces on the fill/dock/ship buttons while every
 *      read on the same screen keeps working; the fix for that is to
 *      change the network's RPC inside the wallet. The chain object below
 *      at least hands these endpoints over when the wallet *adds* the
 *      network.
 */
export const BASE_SEPOLIA_RPC_URLS: readonly [string, ...string[]] = (() => {
  const configured = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL?.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  // Typed as a non-empty tuple because it is one by construction, and
  // viem's Chain wants `rpcUrls.default.http` to guarantee at least one.
  return configured?.length ? (configured as [string, ...string[]]) : baseSepolia.rpcUrls.default.http;
})();

const BASE_SEPOLIA_CHAIN: Chain = {
  ...baseSepolia,
  rpcUrls: { ...baseSepolia.rpcUrls, default: { http: BASE_SEPOLIA_RPC_URLS } },
};

export interface TokenDef {
  address: `0x${string}`;
  symbol: string;
  label: string;
  decimals: number;
}

export interface NetworkAddresses {
  aqua: `0x${string}`;
  keelRouter: `0x${string}`;
  demoTaker: `0x${string}`;
}

export interface Network {
  chain: Chain;
  addresses: NetworkAddresses;
  /** [token0, token1] as Aqua/SwapVM order them -- tokenA < tokenB numerically. */
  tokens: readonly [TokenDef, TokenDef];
}

/**
 * Every chain Keel is actually deployed on (see README's deployment table),
 * each with its own Aqua/KeelRouter/KeelDemoTaker and its own real
 * WETH/USDC pair -- these are three separate token contracts per chain, not
 * one pair referenced three times. Base Sepolia is first/default because
 * it's the only one the maker console has shipped a position against so
 * far; the network switcher in the navbar (`lib/use-network.ts`) is what
 * lets a visitor point the whole app at either of the other two instead.
 */
export const NETWORKS: readonly Network[] = [
  {
    chain: BASE_SEPOLIA_CHAIN,
    addresses: {
      aqua: "0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD",
      keelRouter: "0x9520b1F0Cbb14F0939041a16E12D9Bc857c50ea2",
      demoTaker: "0x54A8d52E72C0FdfB3ECF7014F47cE24D6229B763",
    },
    tokens: [
      { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", symbol: "USDC", label: "USDC — quote asset", decimals: 6 },
      { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", label: "Wrapped ETH — base asset", decimals: 18 },
    ],
  },
  {
    chain: sepolia,
    addresses: {
      aqua: "0x20592B28fCaa6ADa4097bDB03f31d76bE13669cE",
      keelRouter: "0x2854Fa991680bd7bBfC660D197B883e025C16fBb",
      demoTaker: "0x9d8219a05C14a5232502da77F93227615b750a6a",
    },
    tokens: [
      { address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", symbol: "USDC", label: "USDC — quote asset", decimals: 6 },
      { address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", symbol: "WETH", label: "Wrapped ETH — base asset", decimals: 18 },
    ],
  },
  {
    chain: arbitrumSepolia,
    addresses: {
      aqua: "0x2dDc814a107e8F982f356E3b409DC2D00F68b1b3",
      keelRouter: "0x2e8697EfCe447002d0056445645932020023B744",
      demoTaker: "0x6559F59dC0Bc3Fa80B2E33B1957D30ed17507Ab8",
    },
    tokens: [
      { address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", symbol: "USDC", label: "USDC — quote asset", decimals: 6 },
      { address: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", symbol: "WETH", label: "Wrapped ETH — base asset", decimals: 18 },
    ],
  },
];

export const DEFAULT_NETWORK: Network = NETWORKS[0];

export function networkForChainId(chainId: number | undefined): Network {
  return NETWORKS.find((n) => n.chain.id === chainId) ?? DEFAULT_NETWORK;
}

export const explorerTx = (network: Network, hash: string) => `${network.chain.blockExplorers?.default.url}/tx/${hash}`;
export const explorerAddress = (network: Network, address: string) =>
  `${network.chain.blockExplorers?.default.url}/address/${address}`;

// --------------------------------------------------------------------- ABIs
// Hand-written minimal fragments rather than full artifacts: only the calls
// the console actually makes, so a reader can see the whole surface it
// touches on one screen. Identical across every network above -- same
// contract source deployed to each -- so these stay chain-agnostic.

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
