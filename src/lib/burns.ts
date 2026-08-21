import type {
  BurnLogRecord,
  BurnSummary,
  BurnTransaction,
} from '../types/burn.js';
import { buildEtherscanTxUrl } from './ajnaConfig.js';
import {
  formatCompactTokenAmount,
  formatPercentBurned,
  formatUtcDate,
} from './format.js';

function toSortedDedupedLogs(logs: BurnLogRecord[]): BurnLogRecord[] {
  const seen = new Set<string>();
  const deduped: BurnLogRecord[] = [];

  for (const log of logs) {
    const key = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(log);
  }

  deduped.sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }
    if (left.logIndex !== right.logIndex) {
      return left.logIndex - right.logIndex;
    }
    return left.transactionHash.localeCompare(right.transactionHash);
  });

  return deduped;
}

export interface BurnGroup {
  transactionHash: `0x${string}`;
  blockNumber: number;
  amountBurnedRaw: bigint;
  logIndex: number;
}

export function calculateRemainingSupplyRaw(
  originalSupplyRaw: bigint,
  burnedRaw: bigint,
): bigint {
  const remainingSupplyRaw = originalSupplyRaw - burnedRaw;
  return remainingSupplyRaw > 0n ? remainingSupplyRaw : 0n;
}

export function groupBurnLogsByTransaction(logs: BurnLogRecord[]): BurnGroup[] {
  const grouped = new Map<string, BurnGroup>();

  for (const log of toSortedDedupedLogs(logs)) {
    const existing = grouped.get(log.transactionHash);
    if (!existing) {
      grouped.set(log.transactionHash, {
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        amountBurnedRaw: log.amountBurnedRaw,
        logIndex: log.logIndex,
      });
      continue;
    }

    existing.amountBurnedRaw += log.amountBurnedRaw;
    existing.logIndex = Math.min(existing.logIndex, log.logIndex);
    existing.blockNumber = Math.min(existing.blockNumber, log.blockNumber);
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }
    if (left.logIndex !== right.logIndex) {
      return left.logIndex - right.logIndex;
    }
    return left.transactionHash.localeCompare(right.transactionHash);
  });
}

export function buildBurnTransactions(
  burnGroups: BurnGroup[],
  timestampsByBlock: Map<number, number>,
  originalSupplyRaw: bigint,
): BurnTransaction[] {
  const ordered = [...burnGroups].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }
    if (left.logIndex !== right.logIndex) {
      return left.logIndex - right.logIndex;
    }
    return left.transactionHash.localeCompare(right.transactionHash);
  });

  let cumulativeBurnedRaw = 0n;

  return ordered.map((burn) => {
    cumulativeBurnedRaw += burn.amountBurnedRaw;
    const remainingSupplyRaw = calculateRemainingSupplyRaw(
      originalSupplyRaw,
      cumulativeBurnedRaw,
    );
    const timestamp = timestampsByBlock.get(burn.blockNumber);

    if (typeof timestamp !== 'number') {
      throw new Error(`Missing timestamp for block ${burn.blockNumber}`);
    }

    return {
      transactionHash: burn.transactionHash,
      blockNumber: burn.blockNumber,
      timestamp,
      date: formatUtcDate(timestamp),
      amountBurnedRaw: burn.amountBurnedRaw.toString(),
      amountBurnedFormatted: formatCompactTokenAmount(burn.amountBurnedRaw),
      cumulativeBurnedRaw: cumulativeBurnedRaw.toString(),
      cumulativeBurnedFormatted: formatCompactTokenAmount(cumulativeBurnedRaw),
      remainingSupplyRaw: remainingSupplyRaw.toString(),
      remainingSupplyFormatted: formatCompactTokenAmount(remainingSupplyRaw),
      etherscanUrl: buildEtherscanTxUrl(burn.transactionHash),
    };
  });
}

export function sortBurnTransactionsChronologically(
  transactions: BurnTransaction[],
): BurnTransaction[] {
  return [...transactions].sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }
    return left.transactionHash.localeCompare(right.transactionHash);
  });
}

export function calculateBurnSummary(
  transactions: BurnTransaction[],
  chainId: number,
  contractAddress: `0x${string}`,
  originalSupplyRaw: bigint,
  currentTotalSupplyRaw: bigint,
  deploymentBlock: number,
  deploymentTimestamp: number,
  generatedAt: string,
  lastIndexedBlock: number,
): BurnSummary {
  const indexedBurnTotalRaw = transactions.reduce((total, transaction) => {
    return total + BigInt(transaction.amountBurnedRaw);
  }, 0n);
  const calculatedBurnTotalRaw = originalSupplyRaw - currentTotalSupplyRaw;
  const discrepancyRaw = calculatedBurnTotalRaw - indexedBurnTotalRaw;
  const latestBurn = transactions.at(-1) ?? null;

  return {
    chainId,
    contractAddress,
    originalSupplyRaw: originalSupplyRaw.toString(),
    originalSupplyFormatted: formatCompactTokenAmount(originalSupplyRaw),
    currentTotalSupplyRaw: currentTotalSupplyRaw.toString(),
    currentTotalSupplyFormatted: formatCompactTokenAmount(
      currentTotalSupplyRaw,
    ),
    indexedBurnTotalRaw: indexedBurnTotalRaw.toString(),
    indexedBurnTotalFormatted: formatCompactTokenAmount(indexedBurnTotalRaw),
    calculatedBurnTotalRaw: calculatedBurnTotalRaw.toString(),
    calculatedBurnTotalFormatted: formatCompactTokenAmount(
      calculatedBurnTotalRaw,
    ),
    percentSupplyBurned: formatPercentBurned(
      indexedBurnTotalRaw,
      originalSupplyRaw,
    ),
    burnTransactionCount: transactions.length,
    latestBurnTimestamp: latestBurn?.timestamp ?? null,
    latestBurnAmountFormatted: latestBurn?.amountBurnedFormatted ?? null,
    lastIndexedBlock,
    generatedAt,
    dataConsistent: discrepancyRaw === 0n,
    discrepancyRaw: discrepancyRaw.toString(),
    deploymentBlock,
    deploymentTimestamp,
  };
}
