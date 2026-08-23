# Snapshot Module Contract

This contract describes the portable boundary of one independently deployable
snapshot module. It standardizes discovery, reliability expectations, and
output compatibility without standardizing a module's data source or domain
logic.

The AJNA Burn Snapshot is the reference implementation for an API-backed,
finality-aware chain indexer. A Subgraph, JSON-RPC, REST, or off-chain module
must follow these boundaries but is free to use a different provider and a
different normalized domain model.

## 1. Module identity and placement

In the future monorepo, every module lives at `apps/<module-id>/`. The module
ID is lowercase kebab case and matches `module.json`.

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

Modules may add domain-specific directories, but they must retain their own
configuration, provider, executable sync entrypoint, fixture tests, and
published artifact directory. A module must remain runnable when copied into
its own workspace folder. GitHub Actions workflows live at the monorepo root
under `.github/workflows/`, where each workflow is named and scoped to one
module.

## 2. `module.json` catalog manifest

`module.json` is declarative catalog metadata. It is not runtime configuration
and must never include API keys, URLs containing credentials, or source-specific
request policy values that belong in `src/config/`.

Every manifest includes:

- `contractVersion`, `id`, `kind`, `displayName`, and `owner`;
- local `syncCommand`, `verifyCommand`, and Node.js requirement;
- source adapter, network, and optional chain ID;
- explicit finality strategy and confirmation depth when applicable;
- refresh cadence and manual-dispatch capability;
- required and optional environment-variable names only;
- publication mode and generated artifact directory; and
- every output path with a stable schema ID, semantic schema version, and
  public/internal stability.

The manifest is the future monorepo discovery surface: a catalog or workflow
can enumerate `apps/*/module.json` without importing application code.

## 3. Code boundaries

```text
provider -> normalized raw records -> pure transformation -> artifact writer
```

- `src/config/` contains static protocol and module configuration.
- Runtime environment validation happens at the executable boundary only.
- `src/providers/` owns source URLs, transport, authentication, retry policy,
  pagination, rate limiting, and raw-payload validation.
- `src/lib/` contains deterministic, argument-driven domain transformations.
  It must not read the environment, perform network calls, write files, or
  depend on the working directory.
- `scripts/lib/` owns explicit artifact publication. Writers receive output
  paths as arguments and stage related files before publishing them.
- `scripts/sync.ts` is the composition root. It assembles validated runtime
  configuration, one provider, the pure transformation, and the writer.

Do not introduce a shared provider base class or a common runtime package until
at least two materially different modules demonstrate a real common need.

## 4. Output compatibility and freshness

Each declared output has a `schemaId` and semantic `schemaVersion` in
`module.json`.

- Patch: a correction that preserves the output's fields and meaning.
- Minor: an additive, backward-compatible field or record attribute.
- Major: a removed field or changed semantic meaning.

Public outputs must provide or be paired with a freshness and coverage signal
appropriate to their domain. For example, AJNA's `summary.json` supplies
`generatedAt` and `indexedThroughBlock`; these bind `burns.json` to a specific
finalized coverage boundary.

Do not silently repurpose a public output path. Publish a major schema version
and coordinate consumer migration when compatibility cannot be preserved.

## 5. Required validation

Every module exposes one package-local verification command:

```bash
npm run verify
```

It runs linting, formatting verification, fixture-only tests, and type checking.
The CI workflow may present those checks as separate steps, but all modules
must retain the single local command for monorepo orchestration.

The test suite must cover, at minimum:

- deterministic pure transformations and output fixtures;
- malformed or out-of-range provider payloads;
- transient source failures, retry exhaustion, and timeout behavior;
- runtime environment validation;
- data-integrity failures before publication; and
- artifact staging and rollback when a multi-file publication fails.

Tests must use local fixtures and injected transports. They must not require a
live API, an intercepted global request, or an API key.

## 6. Refresh workflow convention

Each module owns a refresh workflow definition at the monorepo root (for
example, `.github/workflows/<module-id>-refresh.yml`) with:

- per-module concurrency;
- only the secrets declared by its `module.json` manifest;
- a non-zero failure when source acquisition or integrity checks fail; and
- commits limited to that module's generated artifact directory.

Modules may use different source adapters and refresh cadence. The monorepo
coordinates them by the manifest and package commands, not by forcing a common
data-access layer.
