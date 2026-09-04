# Feedback — 1inch (Aqua / SwapVM)

Real friction points hit while building Keel against the actual `1inch/swap-vm` and `1inch/aqua` source, not a docs skim. Each one cost real build time; noting them in case they help future SwapVM builders.

## The opcode extension pattern isn't discoverable without reading `OpcodeList.sol` directly

Adding a custom instruction to SwapVM works by claiming an unallocated byte in the existing 256-slot `Opcode` enum (banked by family, e.g. `0x90`–`0xaf` for balance-tuning instructions) and overriding `_runOpcode` to intercept it before delegating to `super._runOpcode`. This is a clean, genuinely well-designed extension point — but the *only* place it's documented is a single doc comment on the enum itself (`"For new instructions take the next free slots of their family bank"`). There's no example custom-opcode repo, no section in whatever onboarding material exists, and nothing that explains the `_runOpcode` override pattern is even the intended mechanism versus, say, wrapping the router entirely. We initially assumed (from secondhand/derived documentation, not the source) that opcodes were dispatched via a dynamic function-pointer array a project could append to — the real mechanism (a fixed 256-slot table, if/else dispatch by raw byte) is different enough that this cost a full redesign after the fact. A short "extending SwapVM" doc with this exact pattern spelled out would have saved that.

## Where live inventory actually lives is undersold

The core Keel thesis depends on `ctx.swap.balanceIn`/`balanceOut` being a maker's *actual* live Aqua balance by the time any opcode runs — populated by `SwapVM.quote()`/`swap()` from `AQUA.safeBalances()` *before* the program even starts executing. This is a genuinely distinctive design property (no other AMM primitive exposes a maker's real wallet balance at quote time), but it's implicit in the code rather than called out anywhere as a first-class capability. It's worth being loud about — it's the single most interesting thing about building on Aqua versus a pool AMM.

## `@1inch/aqua-sdk`'s shape surprised us

We expected (based on naming conventions common to "SDK" packages) a stateful client with an async `.ship()` that submits a transaction. The real package (`AquaProtocolContract`) is a stateless calldata encoder — `buildShipTx()` returns `{to, data, value}` for the caller's own wallet/provider to submit. That's a perfectly reasonable, arguably better design (wallet-agnostic), but the naming and lack of a runnable end-to-end example (ship → decode the resulting event → dock) in the package itself meant we had to `npm pack` it and read the `.d.ts` files directly to find the real shape.

## Toolchain: npm-based deps for a Foundry project

`swap-vm` and `aqua` resolve their Solidity dependencies (OpenZeppelin, forge-std, `@1inch/solidity-utils`) via `npm install` into `node_modules`, referenced by `remappings.txt`, rather than Foundry's more common `forge install` submodule convention. Not wrong, just unusual enough to cost a few minutes figuring out why a fresh `forge build` failed with unresolved imports before realizing `npm install` was the missing step.
