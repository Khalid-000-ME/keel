# Setup

## Contracts

`contracts/lib/{swap-vm,aqua,v4-core,v4-periphery}` (the real, unmodified
1inch and Uniswap contracts Keel builds on) are **not committed to this
repo** and are not git submodules — only code authored in this repo is
tracked. Fetch them once, locally, before building:

```bash
cd contracts/lib
git clone https://github.com/1inch/swap-vm.git
git clone https://github.com/1inch/aqua.git
git clone https://github.com/Uniswap/v4-core.git
git clone https://github.com/Uniswap/v4-periphery.git

cd swap-vm && npm install --ignore-scripts && cd ..
cd v4-core && git submodule update --init --recursive --depth 1 && cd ..
# v4-periphery's own repo removed BaseHook.sol upstream (moved to a
# separate hooks repo); pin to the last commit that still has it at
# src/utils/BaseHook.sol, which is what contracts/src/uniswap/KeelSkewHook.sol
# and contracts/test/KeelSkewHook.t.sol are written against.
cd v4-periphery && git checkout 3779387e && cd ..
```

`contracts/remappings.txt` points at `swap-vm`'s own `node_modules` for the
shared 1inch dependency tree (OpenZeppelin, forge-std, `@1inch/solidity-utils`,
`@1inch/aqua`), and at `v4-core`'s own nested submodules (forge-std, solmate,
openzeppelin-contracts) for the Uniswap side — the commands above are what
populate both. `contracts/lib/` is gitignored, so this step needs to be
repeated on any fresh clone or CI runner.

Then, from `contracts/`:

```bash
forge build
forge test
```

`contracts/foundry.toml` doesn't pin a single `solc_version` — it uses
`auto_detect_solc` because `swap-vm`/`aqua` pin exactly `0.8.30` and
`v4-core` pins exactly `0.8.26`, and a `compilation_restrictions` entry
gives `v4-core`'s own files the much higher `optimizer_runs` their `Pool.sol`
needs to avoid a stack-too-deep error under `via_ir` (matching what
`v4-core`'s own `foundry.toml` uses for itself). See `docs/ARCHITECTURE.md`
§6 for why.

See `docs/ARCHITECTURE.md` for what's actually in those two dependencies and
how Keel's own code is wired into them.
