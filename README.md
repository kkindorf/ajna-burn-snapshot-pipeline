# AJNA Burn Monitor API

This repo produces the static AJNA burn snapshot that powers the frontend.

It:

- pulls AJNA burn logs from Etherscan
- normalizes them into a stable snapshot
- writes `data/summary.json` and `data/burns.json`
- deploys as a static site on Vercel

The snapshot tracks raw AJNA ERC-20 burn transfers to the zero address, not subgraph summary entities.

The frontend reads the JSON directly from the deployed origin at:

- `/data/summary.json`
- `/data/burns.json`

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up environment variables:

   - Copy `.env.example` to `.env`
   - Set `ETHERSCAN_API_KEY`
   - Optionally override `ETHERSCAN_API_BASE_URL` if you want to point at a different Etherscan endpoint
   - The sync script loads `.env` automatically from the repo root

3. Refresh the local snapshot:

   ```bash
   npm run sync:burns
   ```

4. Run checks:

   ```bash
   npm test
   npm run typecheck
   npm run lint
   ```

## Scripts

- `npm run sync:burns` - fetch AJNA burn data from Etherscan and write the JSON snapshot
- `npm test` - run the Vitest suite
- `npm run typecheck` - run TypeScript checks
- `npm run lint` - run ESLint
- `npm run format` - format the codebase with Prettier
- `npm run format:check` - check formatting without writing changes

## Deployment

The deployed API is intentionally simple:

1. GitHub Actions runs the sync job once per day, and on demand through `workflow_dispatch`.
2. The workflow refreshes the `data/` directory from Etherscan logs.
3. Vercel serves the repo root as a static site.
4. The frontend consumes the refreshed JSON snapshot directly.

The refresh workflow uses an Etherscan API key. Set `ETHERSCAN_API_KEY` in your GitHub Actions secrets, and the job will use the Etherscan logs API to refresh the snapshot.

## Data

- The burn series starts on September 6, 2023.
- The snapshot is stored in `data/` so Vercel can serve it directly.
- The repo root includes a small `index.html` that links to the JSON endpoints for quick inspection.

## Notes

- The API repo does not calculate burn totals in the browser.
- The frontend reads the snapshot at runtime and keeps the UI separate from the refresh pipeline.
- AJNA burns are raw ERC-20 `Transfer` events to `0x0000000000000000000000000000000000000000`.
