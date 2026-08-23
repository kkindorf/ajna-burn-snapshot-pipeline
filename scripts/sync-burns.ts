import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAjnaBurnPipelineConfiguration } from '../src/config/ajna.js';
import { createBurnPipelineRuntimeConfiguration } from '../src/config/runtime.js';
import { createBurnSnapshot } from '../src/lib/format.js';
import { EtherscanBurnProvider } from '../src/providers/etherscan/EtherscanBurnProvider.js';
import type { BurnLogProvider } from '../src/providers/burnLogProvider.js';
import { writeBurnSnapshotToDisk } from './lib/burnSnapshotStore.js';

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (typeof error.code === 'string' || error.code === undefined)
  );
}

function loadOptionalEnvironmentFile(path: string): void {
  try {
    loadEnvFile(path);
  } catch (error) {
    if (!isErrnoException(error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unexpected non-error failure.';
}

export async function syncBurns(environment: NodeJS.ProcessEnv): Promise<void> {
  const configuration = createAjnaBurnPipelineConfiguration();
  const runtime = createBurnPipelineRuntimeConfiguration(
    environment,
    configuration.etherscan,
  );
  const provider: BurnLogProvider = new EtherscanBurnProvider({
    apiBaseUrl: runtime.etherscanApiBaseUrl,
    apiKey: runtime.etherscanApiKey,
    chainId: configuration.snapshot.chainId,
    confirmationBlocks: configuration.etherscan.confirmationBlocks,
    contractAddress: configuration.snapshot.contractAddress,
    historyStartBlock: configuration.etherscan.historyStartBlock,
    maxBlockRange: configuration.etherscan.maxBlockRange,
    maxPagesPerRange: configuration.etherscan.maxPagesPerRange,
    pageSize: configuration.etherscan.pageSize,
    requestPolicy: configuration.etherscan.requestPolicy,
    zeroAddress: configuration.etherscan.zeroAddress,
  });

  console.log('AJNA burn sync starting');
  const rawLogs = await provider.fetchRawLogs();
  console.log(
    `Fetched ${rawLogs.logs.length} raw burn logs from ${rawLogs.source} through finalized block ${rawLogs.indexedThroughBlock} (observed head ${rawLogs.headBlock}).`,
  );

  const snapshot = createBurnSnapshot({
    configuration: configuration.snapshot,
    generatedAt: new Date().toISOString(),
    rawLogs,
  });

  if (!snapshot.summary.dataConsistent) {
    throw new Error(
      `Refusing to publish an inconsistent snapshot: supply discrepancy raw ${snapshot.summary.discrepancyRaw}.`,
    );
  }

  const outputDirectory = fileURLToPath(new URL('../data/', import.meta.url));
  await writeBurnSnapshotToDisk({
    outputDirectory,
    snapshot,
  });

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
  console.log('AJNA burn sync complete');
}

async function run(): Promise<void> {
  const localEnvironmentPath = fileURLToPath(
    new URL('../.env', import.meta.url),
  );
  loadOptionalEnvironmentFile(localEnvironmentPath);
  await syncBurns(process.env);
}

function isExecutedDirectly(): boolean {
  const entryPoint = process.argv[1];
  return (
    typeof entryPoint === 'string' &&
    resolve(entryPoint) === fileURLToPath(import.meta.url)
  );
}

if (isExecutedDirectly()) {
  run().catch((error: unknown) => {
    console.error(`AJNA burn sync failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
