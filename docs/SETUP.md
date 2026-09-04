# Setup

## Contracts

`contracts/lib/swap-vm` and `contracts/lib/aqua` (the real, unmodified
1inch contracts Keel builds on) are **not committed to this repo** and are
not git submodules — only code authored in this repo is tracked. Fetch them
once, locally, before building:

```bash
cd contracts/lib
git clone https://github.com/1inch/swap-vm.git
git clone https://github.com/1inch/aqua.git
cd swap-vm && npm install --ignore-scripts && cd ..
```

`contracts/remappings.txt` points at `swap-vm`'s own `node_modules` for the
shared dependency tree (OpenZeppelin, forge-std, `@1inch/solidity-utils`,
`@1inch/aqua`) — the `npm install` above is what populates it. `contracts/lib/`
is gitignored, so this step needs to be repeated on any fresh clone or CI
runner.

Then, from `contracts/`:

```bash
forge build
forge test
```

See `docs/ARCHITECTURE.md` for what's actually in those two dependencies and
how Keel's own code is wired into them.
