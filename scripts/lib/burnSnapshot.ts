import { AJNA_CONFIG } from '../../src/lib/ajnaConfig.js';
import {
  buildBurnTransactions,
  calculateBurnSummary,
  calculateRemainingSupplyRaw,
  groupBurnLogsByTransaction,
  sortBurnTransactionsChronologically,
} from '../../src/lib/burns.js';
import type { BurnSummary, BurnTransaction } from '../../src/types/burn.js';
import { fetchBurnLogs } from './fetchBurnLogs.js';

export interface BurnSnapshot {
  generatedAt: string;
  executionId: string;
  summary: BurnSummary;
  burns: BurnTransaction[];
}

export async function buildBurnSnapshot(): Promise<BurnSnapshot> {
  const generatedAt = new Date().toISOString();
  const originalSupplyRaw = BigInt(AJNA_CONFIG.launchSupplyRaw);

  const burnHistory = await fetchBurnLogs();
  const groupedBurns = groupBurnLogsByTransaction(burnHistory.burnLogs);
  const burnTransactionsAscending = sortBurnTransactionsChronologically(
    buildBurnTransactions(
      groupedBurns,
      burnHistory.timestampsByBlock,
      originalSupplyRaw,
    ),
  );

  const indexedBurnTotalRaw = burnTransactionsAscending.reduce(
    (total, transaction) => {
      return total + BigInt(transaction.amountBurnedRaw);
    },
    0n,
  );
  const currentTotalSupplyRaw = calculateRemainingSupplyRaw(
    originalSupplyRaw,
    indexedBurnTotalRaw,
  );

  const summary = calculateBurnSummary(
    burnTransactionsAscending,
    AJNA_CONFIG.chainId,
    AJNA_CONFIG.contractAddress,
    originalSupplyRaw,
    currentTotalSupplyRaw,
    AJNA_CONFIG.deploymentBlock,
    AJNA_CONFIG.deploymentTimestamp,
    generatedAt,
    burnTransactionsAscending.at(-1)?.blockNumber ??
      AJNA_CONFIG.deploymentBlock,
  );

  return {
    generatedAt,
    executionId: burnHistory.executionId,
    summary,
    burns: burnTransactionsAscending,
  };
}
