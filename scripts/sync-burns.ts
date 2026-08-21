import { loadEnvFile } from 'node:process';

import { buildBurnSnapshot } from './lib/burnSnapshot.js';
import { writeBurnSnapshotToDisk } from './lib/burnSnapshotStore.js';

function loadLocalEnv(): void {
  try {
    loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  console.log('AJNA burn sync starting');
  console.log('Source: Etherscan logs');
  const snapshot = await buildBurnSnapshot();
  await writeBurnSnapshotToDisk(snapshot);

  console.log(`Sync id: ${snapshot.executionId}`);
  console.log(`Burn transactions: ${snapshot.burns.length}`);
  console.log(
    `Current total supply: ${snapshot.summary.currentTotalSupplyFormatted}`,
  );
  console.log(
    `Indexed burn total: ${snapshot.summary.indexedBurnTotalFormatted}`,
  );
  console.log(
    `Supply-reduction burn total: ${snapshot.summary.calculatedBurnTotalFormatted}`,
  );

  if (!snapshot.summary.dataConsistent) {
    console.warn(
      `Data mismatch detected: discrepancy raw ${snapshot.summary.discrepancyRaw}`,
    );
  }

  console.log('AJNA burn sync complete');
}

main().catch((error) => {
  console.error('AJNA burn sync failed');
  console.error(error);
  process.exitCode = 1;
});
