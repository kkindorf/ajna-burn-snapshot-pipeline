import { AJNA } from '../config/ajna.js';
import type { BurnData, BurnLog } from '../types/burnData.js';
import type { BurnSnapshot, BurnTransaction } from '../types/burnSnapshot.js';

const SMALL_AMOUNT_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  notation: 'compact',
});
const LARGE_AMOUNT_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  notation: 'compact',
});
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

function formatAjnaAmount(raw: bigint): string {
  // Raw snapshot fields remain exact bigint strings. Number is used only for
  // compact display labels such as "1.5K AJNA" and "989.3M AJNA". The
  // standard formatter also promotes rounded values from 1,000K to 1M.
  const amount = Number(raw) / 1e18;
  const formatter =
    amount < 100 ? SMALL_AMOUNT_FORMATTER : LARGE_AMOUNT_FORMATTER;
  return `${formatter.format(amount)} AJNA`;
}

function formatPercent(burnedRaw: bigint): string {
  const percent = (Number(burnedRaw) / Number(AJNA.launchSupplyRaw)) * 100;
  return `${percent.toFixed(3)}%`;
}

function groupLogsByTransaction(logs: readonly BurnLog[]): BurnLog[] {
  const sortedLogs = [...logs].sort(
    (left, right) =>
      left.blockNumber - right.blockNumber || left.logIndex - right.logIndex,
  );
  const transactions = new Map<string, BurnLog>();

  for (const log of sortedLogs) {
    const transaction = transactions.get(log.transactionHash);
    if (transaction) {
      transaction.amountBurnedRaw += log.amountBurnedRaw;
    } else {
      transactions.set(log.transactionHash, { ...log });
    }
  }

  return [...transactions.values()];
}

/** Turns Etherscan burn data into the two public snapshot files. */
export function createBurnSnapshot(
  data: BurnData,
  generatedAt: string,
): BurnSnapshot {
  const transactions = groupLogsByTransaction(data.logs);
  const burnTotalRaw = transactions.reduce(
    (total, burn) => total + burn.amountBurnedRaw,
    0n,
  );
  const supplyReductionRaw = AJNA.launchSupplyRaw - data.currentTotalSupplyRaw;

  if (burnTotalRaw !== supplyReductionRaw) {
    throw new Error('AJNA burn records do not match totalSupply.');
  }

  let cumulativeBurnedRaw = 0n;
  const burns: BurnTransaction[] = transactions.map((burn) => {
    cumulativeBurnedRaw += burn.amountBurnedRaw;
    const remainingSupplyRaw = AJNA.launchSupplyRaw - cumulativeBurnedRaw;

    return {
      transactionHash: burn.transactionHash,
      blockNumber: burn.blockNumber,
      timestamp: burn.timestamp,
      date: DATE_FORMATTER.format(new Date(burn.timestamp * 1_000)),
      amountBurnedRaw: burn.amountBurnedRaw.toString(),
      amountBurnedFormatted: formatAjnaAmount(burn.amountBurnedRaw),
      cumulativeBurnedRaw: cumulativeBurnedRaw.toString(),
      cumulativeBurnedFormatted: formatAjnaAmount(cumulativeBurnedRaw),
      remainingSupplyRaw: remainingSupplyRaw.toString(),
      remainingSupplyFormatted: formatAjnaAmount(remainingSupplyRaw),
      etherscanUrl: `https://etherscan.io/tx/${burn.transactionHash}`,
    };
  });

  const burnTotalFormatted = formatAjnaAmount(burnTotalRaw);
  const latestBurn = burns.at(-1);

  // The public schema retains both indexed and calculated burn fields. The
  // reconciliation above guarantees they contain the same values.
  return {
    burns,
    summary: {
      chainId: AJNA.chainId,
      contractAddress: AJNA.contractAddress,
      originalSupplyRaw: AJNA.launchSupplyRaw.toString(),
      originalSupplyFormatted: formatAjnaAmount(AJNA.launchSupplyRaw),
      currentTotalSupplyRaw: data.currentTotalSupplyRaw.toString(),
      currentTotalSupplyFormatted: formatAjnaAmount(data.currentTotalSupplyRaw),
      indexedBurnTotalRaw: burnTotalRaw.toString(),
      indexedBurnTotalFormatted: burnTotalFormatted,
      calculatedBurnTotalRaw: burnTotalRaw.toString(),
      calculatedBurnTotalFormatted: burnTotalFormatted,
      percentSupplyBurned: formatPercent(burnTotalRaw),
      burnTransactionCount: burns.length,
      latestBurnTimestamp: latestBurn?.timestamp ?? null,
      latestBurnAmountFormatted: latestBurn?.amountBurnedFormatted ?? null,
      lastIndexedBlock: latestBurn?.blockNumber ?? AJNA.deploymentBlock,
      generatedAt,
      indexedFromBlock: AJNA.burnSeriesStartBlock,
      indexedThroughBlock: data.indexedThroughBlock,
      dataConsistent: true,
      discrepancyRaw: '0',
      deploymentBlock: AJNA.deploymentBlock,
      deploymentTimestamp: AJNA.deploymentTimestamp,
    },
  };
}
