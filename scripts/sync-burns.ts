import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';

import { createBurnSnapshot } from '../src/lib/createBurnSnapshot.js';
import { fetchAjnaBurnData } from '../src/providers/etherscan/fetchAjnaBurnData.js';

const ENV_FILE = new URL('../.env', import.meta.url);
const DATA_DIRECTORY = new URL('../data/', import.meta.url);

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main(): Promise<void> {
  if (existsSync(ENV_FILE)) loadEnvFile(ENV_FILE);

  const apiKey = process.env.ETHERSCAN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Missing required environment variable: ETHERSCAN_API_KEY.',
    );
  }

  console.log('AJNA burn sync starting');
  const burnData = await fetchAjnaBurnData(apiKey);
  console.log(
    `Fetched ${burnData.logs.length} burn logs through block ${burnData.indexedThroughBlock}.`,
  );

  const snapshot = createBurnSnapshot(burnData, new Date().toISOString());

  await mkdir(DATA_DIRECTORY, { recursive: true });
  await Promise.all([
    writeFile(new URL('burns.json', DATA_DIRECTORY), json(snapshot.burns)),
    writeFile(new URL('summary.json', DATA_DIRECTORY), json(snapshot.summary)),
  ]);

  console.log(`Burn transactions: ${snapshot.burns.length}`);
  console.log(
    `Current total supply: ${snapshot.summary.currentTotalSupplyFormatted}`,
  );
  console.log(`Burn total: ${snapshot.summary.indexedBurnTotalFormatted}`);
  console.log('AJNA burn sync complete');
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unexpected failure.';
  console.error(`AJNA burn sync failed: ${message}`);
  process.exitCode = 1;
});
