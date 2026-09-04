# Feedback — The Graph

Notes from building `subgraph/` against the real `@graphprotocol/graph-cli`/`graph-ts` toolchain (verified with an actual `graph codegen` + `graph build` run, not just written against docs).

## `BigInt.fromSignedBytes`/`fromUnsignedBytes` expecting little-endian input is a landmine

Every on-chain value a subgraph decodes from raw event/calldata bytes (which is most of what a mapping does) is big-endian, because that's how the EVM and Solidity's ABI encoding work. `graph-ts`'s `BigInt.fromSignedBytes`/`fromUnsignedBytes` silently expect little-endian input instead — get this wrong and you don't get an error, you get a *wrong number that still looks plausible*, which is a much worse failure mode than a revert. We only caught this because we cross-checked our AssemblyScript decoder against values we already knew from the Solidity side. This seems like exactly the kind of gotcha experienced subgraph developers all learn the hard way and never talk about — a `fromSignedBytesBE`/`fromUnsignedBytesBE` helper (or even just a prominent callout in the `BigInt` API docs) would remove a whole class of silent correctness bugs for anyone decoding packed on-chain data, which is a very common subgraph task, not an edge case.

## `@entity` now requires an explicit `immutable` argument, undocumented in older examples

Current `graph-cli` (0.97.x) rejects `type Foo @entity { ... }` with `@entity directive requires immutable argument` — it now has to be `@entity(immutable: true)` or `@entity(immutable: false)`. Reasonable schema-evolution choice, but every AssemblyScript mapping example we found while researching this (including patterns referenced secondhand from other qualification writeups) used the old bare `@entity` syntax, so this cost a debugging round-trip. A migration note surfaced more prominently (not just in a changelog) would help, since the error message itself is otherwise clear once you hit it.

## Decoding an opaque event payload has no worked example

Keel's subgraph needs to decode Aqua's `Shipped` event's `strategy: bytes` field — an arbitrary `abi.encode()`'d blob whose shape depends on the *app* that shipped it, not on anything Aqua's own ABI describes. `ethereum.decode(typeSignature, bytes)` handles this correctly once you know the exact tuple signature, but getting there required reading the emitting contract's Solidity source directly; nothing in Graph's own docs shows this "decode an app-specific payload nested inside a shared-infrastructure event" pattern. This is exactly the shape of problem The Graph's own qualification criteria point at (a solver needing routable state that isn't sitting in a single reserve) — a worked example for it would directly help builders on shared-liquidity-layer protocols like Aqua, not just Keel specifically.

## Deployment couldn't be verified end-to-end in this environment

`graph deploy --studio` needs an interactive Subgraph Studio account/API key this build environment doesn't have. We verified everything short of that (schema validity, ABI/mapping type-correctness, a full `graph build` producing a deployable WASM bundle) but couldn't confirm the final deploy step or query a live instance. A way to validate a subgraph's correctness against a public archive node without needing Studio credentials — even just for CI/sandboxed environments — would make this last mile independently verifiable.
