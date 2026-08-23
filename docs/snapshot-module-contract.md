# Snapshot Module Contract

Each future monorepo app is an independent snapshot job. It owns its source,
its transformation, its published files, and its schedule.

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

Keep the path easy to follow:

```text
source provider -> typed records -> pure snapshot function -> JSON files
```

- Put protocol facts in `src/config/` and secrets at the script boundary.
- Keep source-specific URLs, pagination, and parsing inside that module's
  `src/providers/<source>/` directory. Add retries, finality rules, or other
  machinery only when the source and product actually need them.
- Define normalized source data and public snapshot shapes in separate files
  under `src/types/`.
- Keep snapshot math in `src/lib/`, free of network and filesystem calls.
- Keep orchestration, environment access, and file writing in `scripts/`.
- Keep one local `npm run verify` command with fixture-backed tests and type
  checking.
- Add `src/contracts/` only if the module owns an ABI or generated contract
  binding. A contract address by itself belongs in configuration.

`module.json` is catalog metadata: identity, commands, source, schedule,
environment-variable names, and public output schemas. Include a finality rule
only when a module needs one. Do not extract shared provider or runtime code
until two real modules share the same problem.
