# AJNA Burn Snapshot Pipeline

This repository is a standalone data-snapshot pipeline for AJNA ERC-20 burn
events. It retrieves burn transfers, converts them into a stable static
snapshot, and publishes the result as JSON for frontend consumers.

It is deliberately not a runtime API service. Vercel serves the generated
files directly at:

- `/data/summary.json`
- `/data/burns.json`

## Architecture

```text
scripts/sync-burns.ts
  -> EtherscanBurnProvider.fetchRawLogs()
  -> createBurnSnapshot(...)
  -> writeBurnSnapshotToDisk(...)
  -> data/summary.json + data/burns.json
```

The boundaries are intentional:

- `src/providers/etherscan/EtherscanBurnProvider.ts` owns all Etherscan REST
  concerns: API-key validation, request URLs, request pacing, timeouts,
  bounded retries, response handling, filtering, finality, and pagination.
- `src/providers/burnLogProvider.ts` is the source-neutral provider contract.
  A future GraphQL, JSON-RPC, REST, or fixture provider can implement it
  without changing snapshot logic.
- `src/lib/format.ts` contains argument-driven, deterministic burn grouping,
  supply math, and display formatting. It has no environment or network
  dependency.
- `scripts/lib/burnSnapshotStore.ts` receives its output directory explicitly;
  it stages both artifacts, promotes them with rollback protection, and does
  not depend on the current working directory.
- `src/config/ajna.ts` creates the module's static AJNA configuration. The
  entrypoint supplies and validates runtime configuration, including the
  Etherscan key.

`summary.json` exposes `indexedFromBlock` and `indexedThroughBlock`, the
inclusive source-coverage boundary for the snapshot. The `etherscanUrl`
transaction-link field remains unchanged.

## Data-integrity guarantees

- The provider indexes AJNA's configured supply-reduction burn series from
  block `18,078,582` and only through a 64-block confirmation boundary.
  Earlier transfers to the zero address are allocation movements and are not
  part of the 1B launch-supply burn accounting.
- It reads `totalSupply()` at that same finalized block independently of the
  transfer-log query. A supply/log discrepancy fails the sync before either
  public JSON file is published.
- Transient Etherscan errors (network failures, request timeouts, HTTP 429 or
  5xx responses, and documented transient API messages) use bounded,
  provider-owned retries. Permanent payload and configuration errors fail
  immediately with a sanitized error message.
- All pagination and range splitting is bounded. Repeated pages and
  incomplete ranges fail closed instead of publishing partial data.
- The store writes temporary files first and restores the prior pair if a
  promotion fails. The subsequent Git commit remains the atomic deployment
  boundary for the two static files.

## Local development

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `ETHERSCAN_API_KEY`. The endpoint
   defaults to the canonical Etherscan V2 API and is validated before any
   network request.

3. Generate a local snapshot.

   ```bash
   npm run sync:burns
   ```

4. Verify the pipeline.

   ```bash
   npm run verify
   ```

Node.js 20.12.0 or newer is required; `.nvmrc` and the CI workflows use the
same minimum version.

## Monorepo readiness

This repository is the reference implementation for an independently deployable
snapshot module. Its machine-readable [module manifest](./module.json) declares
ownership, source class, finality, cadence, runtime commands, and versioned
public output schemas without exposing source credentials or request details.

The eventual monorepo can place it directly under `apps/`, for example:

```text
apps/
  burn-pipeline/
    src/
    scripts/
    data/
```

No core module reads `process.env`, uses `process.cwd()`, or imports an
Etherscan implementation. Only `scripts/sync-burns.ts` is a composition root
that connects the configured provider, current time, filesystem output, and
environment.

The [Snapshot Module Contract](./docs/snapshot-module-contract.md) defines the
portable boundaries every future pipeline follows. The
[new-module guide](./docs/new-snapshot-module.md) provides the reusable module
shape while deliberately avoiding a premature shared runtime package.

## Deployment

GitHub Actions runs the refresh workflow daily and on demand. It provides
`ETHERSCAN_API_KEY`, runs `npm run sync:burns`, and commits changed JSON files.
Vercel then serves the repository root as a static site.

Before the first production deployment of this hardening release, run the
**Refresh burn snapshot** workflow manually. This regenerates the checked-in
artifacts with burn-series-to-finality coverage, correctly ordered cumulative
values, and the independent supply reconciliation check.
