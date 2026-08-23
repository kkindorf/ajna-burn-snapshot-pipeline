# Starting a New Snapshot Module

Use this guide when adding a second snapshot module to the future monorepo.
Copy the module shape and contract from AJNA; do not copy its Etherscan provider
or burn-domain logic unless the new module genuinely needs them.

## Start with the package boundary

Create the new application at `apps/<module-id>/` using this layout:

```text
apps/<module-id>/
├── module.json
├── package.json
├── .env.example
├── src/
│   ├── config/
│   ├── lib/
│   ├── providers/
│   └── types/
├── scripts/
│   ├── lib/
│   └── sync.ts
├── tests/
│   └── fixtures/
└── data/
```

The AJNA package is the working reference for this structure. Its boundaries
are portable; its protocol configuration, output schemas, and Etherscan
implementation are intentionally local.

## Creation checklist

1. Choose the source best suited to the module: Subgraph, JSON-RPC, REST,
   Etherscan, a database export, or another source-specific adapter.
2. Define normalized source-neutral records in `src/types/` before writing
   formatting or artifact code.
3. Put only static protocol settings in `src/config/`; validate secrets and
   runtime overrides in the executable entrypoint.
4. Keep all network transport, pagination, retry, and payload parsing inside
   the selected provider.
5. Make transformations in `src/lib/` deterministic and explicit about every
   input, including time and configuration.
6. Declare public artifacts, schema IDs, schema versions, source metadata,
   cadence, finality, and ownership in `module.json`.
7. Add fixture-backed tests before connecting the module to a live source.
8. Expose `sync` and `verify` package commands. `verify` must run lint,
   formatting verification, tests, and type checking.
9. Add a root-level workflow named `.github/workflows/<module-id>-refresh.yml`
   with a module-specific concurrency group and minimal secret set.
10. Document the freshness and coverage fields consumers should use when
    reading the published data.

## Before extracting shared code

Keep module code local until a second real module proves the same behavior is
needed. A common provider interface, retry utility, release manifest, or
workspace package should be extracted only when it reduces duplicated behavior
without hiding source-specific correctness rules.

Read the full [Snapshot Module Contract](./snapshot-module-contract.md) before
opening the module for consumer use.
