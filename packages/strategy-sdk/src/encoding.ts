/**
 * Browser-safe entry point: the pure, dependency-free encoders only.
 *
 * The package root (`index.ts`) also exports `ship`/`dock`, which pull in
 * `@1inch/aqua-sdk` to build `Aqua.ship()`/`Aqua.dock()` calldata. Those two
 * are plain ABI calls with published signatures, so a browser client can
 * make them through its own wallet library instead of bundling a Node-
 * oriented SDK -- but the *strategy* bytes are SwapVM-specific and must come
 * from these encoders, which are the ones verified byte-for-byte against
 * live Solidity fixtures in encoding.test.ts.
 */
export * from "./hex";
export * from "./instructions";
export * from "./order";
export * from "./abi";
