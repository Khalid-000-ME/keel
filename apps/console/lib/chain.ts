import { baseSepolia } from "wagmi/chains";

/**
 * The live Base Sepolia deployment the strategy console drives. Aqua and
 * KeelRouter are the real mechanism (see README's deployment table); the
 * demo token pair and taker helper are conveniences deployed alongside it
 * so a visitor can drive the whole flow from a browser without being
 * hand-funded first (contracts/src/demo/).
 */
export const CHAIN = baseSepolia;

/**
 * Base Sepolia's shared public RPC (the default fallback below) rate-/size-
 * limits requests -- "Request exceeds defined limit" is that endpoint
 * rejecting the aggregate `eth_call` wagmi's `useReadContracts` batches
 * together via Multicall3 (several previewFill/safeBalances reads per
 * polling tick, each embedding a full order's program bytes, across every
 * shipped strategy card polling every REFRESH_MS). Set
 * NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL in apps/console/.env.local to a real
 * provider (Alchemy/Infura/etc., same as SEPOLIA_RPC_URL's role for
 * contracts/ deploy scripts, but this one is read by the browser at
 * runtime, hence the NEXT_PUBLIC_ prefix) to get real limits.
 */
export const RPC_URL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || CHAIN.rpcUrls.default.http[0];

export const ADDRESSES = {
  aqua: "0xAf5Bb8e83F3d22Ec349dB641E0Bd7edA5d9574CD",
  keelRouter: "0x1771093A5094FCc818775806eD8a729f6cF7DA0E",
  demoTaker: "0x54A8d52E72C0FdfB3ECF7014F47cE24D6229B763",
} as const;

/**
 * Ballast and Draft -- both nautical terms for a hull's own stability, which
 * is the whole thesis of this project (see README). Named this way rather
 * than something like "Keel Demo Token A" specifically so a wallet's sign
 * prompt reads as a real asset pair, not a test fixture -- these are still
 * permissionless testnet faucet tokens with no value (KeelDemoToken.sol),
 * just not named to advertise that in the UI.
 *
 * Aqua/SwapVM require tokenA < tokenB numerically, and these are stored in
 * that order -- token0 is the pair's tokenA. CREATE addresses don't respect
 * deployment order, so which symbol lands as token0 is coincidence; the
 * ordering below is the one the contracts enforce, so it's the one the UI
 * uses.
 */
export const DEMO_TOKENS = [
  { address: "0x0ECf96941D2c5FE408E021F9e078FeC6484B235b", symbol: "DRFT", label: "Draft — base asset" },
  { address: "0x6d56c9975130822012e97A163d39Bf5e0D96A3f3", symbol: "BALT", label: "Ballast — quote asset" },
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
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "a", type: "address" }, { name: "v", type: "uint256" }], outputs: [] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
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
