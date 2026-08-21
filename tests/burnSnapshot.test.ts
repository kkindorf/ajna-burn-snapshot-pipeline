import {
  buildBurnTransactions,
  calculateBurnSummary,
  calculateRemainingSupplyRaw,
  groupBurnLogsByTransaction,
} from '../src/lib/burns.js';
import {
  formatCompactTokenAmount,
  formatPercentBurned,
} from '../src/lib/format.js';
import type { BurnLogRecord } from '../src/types/burn.js';

const AJNA = 10n ** 18n;
const ORIGINAL_SUPPLY = 10n * AJNA;
const FIRST_HASH =
  '0xaaa0000000000000000000000000000000000000000000000000000000000001';
const SECOND_HASH =
  '0xbbb0000000000000000000000000000000000000000000000000000000000002';

const burnLogs: BurnLogRecord[] = [
  {
    transactionHash: FIRST_HASH,
    logIndex: 0,
    blockNumber: 100,
    amountBurnedRaw: 1n * AJNA,
  },
  {
    transactionHash: FIRST_HASH,
    logIndex: 1,
    blockNumber: 100,
    amountBurnedRaw: 2n * AJNA,
  },
  {
    transactionHash: SECOND_HASH,
    logIndex: 0,
    blockNumber: 130,
    amountBurnedRaw: 3n * AJNA,
  },
  {
    transactionHash: SECOND_HASH,
    logIndex: 0,
    blockNumber: 130,
    amountBurnedRaw: 3n * AJNA,
  },
];

const timestampsByBlock = new Map<number, number>([
  [100, 1_690_000_000],
  [130, 1_700_000_000],
]);

function buildTransactions(originalSupplyRaw = ORIGINAL_SUPPLY) {
  return buildBurnTransactions(
    groupBurnLogsByTransaction(burnLogs),
    timestampsByBlock,
    originalSupplyRaw,
  );
}

describe('burn snapshot construction', () => {
  it('deduplicates logs and aggregates multiple transfers from the same transaction', () => {
    const transactions = buildTransactions();

    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toEqual({
      transactionHash: FIRST_HASH,
      blockNumber: 100,
      timestamp: 1_690_000_000,
      date: 'Jul 22, 2023',
      amountBurnedRaw: (3n * AJNA).toString(),
      amountBurnedFormatted: '3 AJNA',
      cumulativeBurnedRaw: (3n * AJNA).toString(),
      cumulativeBurnedFormatted: '3 AJNA',
      remainingSupplyRaw: (7n * AJNA).toString(),
      remainingSupplyFormatted: '7 AJNA',
      etherscanUrl: `https://etherscan.io/tx/${FIRST_HASH}`,
    });
    expect(transactions[1].cumulativeBurnedRaw).toBe((6n * AJNA).toString());
    expect(transactions[1].remainingSupplyRaw).toBe((4n * AJNA).toString());
  });

  it('produces the existing summary contract and consistency values', () => {
    const transactions = buildTransactions();
    const summary = calculateBurnSummary(
      transactions,
      1,
      '0x9a96ec9b57fb64fbc60b423d1f4da7691bd35079',
      ORIGINAL_SUPPLY,
      4n * AJNA,
      15_478_977,
      1_662_397_146,
      '2026-08-02T12:00:00.000Z',
      130,
    );

    expect(summary).toMatchObject({
      originalSupplyRaw: ORIGINAL_SUPPLY.toString(),
      currentTotalSupplyRaw: (4n * AJNA).toString(),
      indexedBurnTotalRaw: (6n * AJNA).toString(),
      calculatedBurnTotalRaw: (6n * AJNA).toString(),
      percentSupplyBurned: '60.000%',
      burnTransactionCount: 2,
      latestBurnTimestamp: 1_700_000_000,
      lastIndexedBlock: 130,
      dataConsistent: true,
      discrepancyRaw: '0',
    });
  });

  it('requires a timestamp for every burn block', () => {
    expect(() =>
      buildBurnTransactions(
        groupBurnLogsByTransaction(burnLogs),
        new Map(),
        ORIGINAL_SUPPLY,
      ),
    ).toThrow('Missing timestamp for block 100');
  });

  it('keeps supply math and formatting safe at boundary values', () => {
    expect(calculateRemainingSupplyRaw(4n * AJNA, 6n * AJNA)).toBe(0n);
    expect(formatCompactTokenAmount(403_437_095_453_346_600_523n)).toBe(
      '403.4 AJNA',
    );
    expect(formatCompactTokenAmount(1_000_000_000n * AJNA)).toBe('1B AJNA');
    expect(formatPercentBurned(12n * AJNA, 10n * AJNA)).toBe('100.000%');
  });
});
