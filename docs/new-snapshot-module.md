# Starting a New Snapshot Module

Start each app with the same recognizable package shape:

```text
apps/<module-id>/
├── data/
├── scripts/
│   └── sync.ts
├── src/
│   ├── config/
│   ├── lib/
│   ├── providers/
│   │   └── <source>/
│   └── types/
├── tests/
│   └── fixtures/
├── module.json
└── package.json
```

1. Pick the source that fits that module: a subgraph, JSON-RPC, a REST API, or
   something else entirely.
2. Put protocol facts in `src/config/` and keep secrets in the sync script's
   environment boundary.
3. Put source-specific requests and response parsing in
   `src/providers/<source>/`.
4. Split `src/types/` by real usage boundaries, such as normalized source data
   and published snapshot data.
5. Keep deterministic transformations in `src/lib/` and file/network access
   out of those functions.
6. Cover the transformation and source parsing with local fixtures.
7. Expose `sync` and `verify` commands, then add a scoped refresh workflow.

Use the [module contract](./snapshot-module-contract.md) for the portable
boundaries. Do not copy AJNA's Etherscan details into another module unless
they are genuinely needed there. Add a `contracts/` directory only when a
module actually owns an ABI or generated contract binding.
