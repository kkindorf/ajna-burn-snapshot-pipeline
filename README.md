# AJNA Burn Snapshot Pipeline

This is a small scheduled job that turns AJNA burn transfers into two static
JSON files for frontend use. It is not a runtime API.

```text
AJNA config -> Etherscan provider -> snapshot math -> data/*.json
```

## Read these files first

1. [`src/config/ajna.ts`](./src/config/ajna.ts) — the AJNA address, launch
   supply, and the first block that belongs to the public burn series.
2. [`scripts/sync-burns.ts`](./scripts/sync-burns.ts) — the whole job wired
   together.
3. [`src/providers/etherscan/fetchAjnaBurnData.ts`](./src/providers/etherscan/fetchAjnaBurnData.ts)
   — the small AJNA-specific Etherscan request function.
4. [`src/lib/createBurnSnapshot.ts`](./src/lib/createBurnSnapshot.ts) —
   ordering, transaction grouping, supply reconciliation, and JSON-ready
   formatting.
5. [`src/types/`](./src/types/) — normalized provider data and the public
   snapshot shapes, separated by how the pipeline uses them.

## What the sync checks

- It starts at block `18,078,582`. Earlier zero-address transfers are AJNA
  allocation movements, not burns against the 1B launch-supply baseline.
- It ignores valid zero-value ERC-20 transfer events.
- It groups multiple burn logs from the same transaction and keeps them in
  block/log order.
- It compares the indexed burn total with `totalSupply()` before writing files.
  If they disagree, the command fails and leaves deployment to the workflow.

The Etherscan source function deliberately stays simple: it makes one historical
query and follows normal API pages. A failed request fails the run; the next
scheduled workflow run can try again.

## Run it

Set `ETHERSCAN_API_KEY` in `.env` or your shell, then run:

```bash
npm install
npm run sync:burns
npm run verify
```

The generated public files are:

- `data/summary.json`
- `data/burns.json`

## Future monorepo

This repository can become `apps/burn-pipeline/` without sharing runtime code
with other data modules. Each module should own its source choice and its own
small pipeline while following the same recognizable directory pattern:

```text
apps/burn-pipeline/
├── data/
├── scripts/
├── src/
│   ├── config/
│   ├── lib/
│   ├── providers/
│   └── types/
├── tests/
├── module.json
└── package.json
```

[`module.json`](./module.json) is the catalog entry point; the short
[module contract](./docs/snapshot-module-contract.md) explains the few portable
conventions.
