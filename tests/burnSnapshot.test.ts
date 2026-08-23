import {
  calculateRemainingSupplyRaw,
  createBurnSnapshot,
  dedupeAndSortBurnLogs,
  formatCompactTokenAmount,
  formatPercentBurned,
} from '../src/lib/format.js';
import type {
  BurnSnapshotConfiguration,
  TokenMetadata,
} from '../src/types/burn.js';
import { parseRawBurnLogsFixture } from './fixtures/domainFixture.js';
import {
  loadJsonFixture,
  requireArray,
  requireInteger,
  requireProperty,
  requireRecord,
  requireString,
} from './fixtures/loadJsonFixture.js';

const TEST_CONFIGURATION: BurnSnapshotConfiguration = {
  chainId: 1,
  contractAddress: '0x9a96ec9b57fb64fbc60b423d1f4da7691bd35079',
  deploymentBlock: 1,
  deploymentTimestamp: 1,
  launchSupplyRaw: 10n * 10n ** 18n,
  token: {
    decimals: 18,
    symbol: 'AJNA',
  },
  transactionUrlForHash(transactionHash): string {
    return `https://explorer.fixture.test/tx/${transactionHash}`;
  },
};

async function loadCoreCase(name: string) {
  const fixture = requireRecord(
    await loadJsonFixture('./domain/core-cases.json'),
    'core cases fixture',
  );
  return parseRawBurnLogsFixture(
    requireProperty(fixture, name, 'core cases fixture'),
  );
}

function toJsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function tokenFromFixture(value: unknown): TokenMetadata {
  const token = requireRecord(value, 'formatting token');
  return {
    decimals: requireInteger(
      requireProperty(token, 'decimals', 'formatting token'),
      'formatting token.decimals',
    ),
    symbol: requireString(
      requireProperty(token, 'symbol', 'formatting token'),
      'formatting token.symbol',
    ),
  };
}

describe('burn snapshot core', () => {
  it('creates the complete deterministic public snapshot from a local domain fixture', async () => {
    const [rawFixture, expectedSnapshot] = await Promise.all([
      loadJsonFixture('./domain/raw-burn-logs.json'),
      loadJsonFixture('./domain/expected-snapshot.json'),
    ]);

    const snapshot = createBurnSnapshot({
      configuration: TEST_CONFIGURATION,
      generatedAt: '2026-08-02T12:00:00.000Z',
      rawLogs: parseRawBurnLogsFixture(rawFixture),
    });

    expect(toJsonValue(snapshot)).toEqual(expectedSnapshot);
  });

  it('keeps same-block burns in log-index order while calculating cumulative values', async () => {
    const snapshot = createBurnSnapshot({
      configuration: TEST_CONFIGURATION,
      generatedAt: '2026-08-02T12:00:00.000Z',
      rawLogs: await loadCoreCase('sameBlock'),
    });

    expect(
      snapshot.burns.map((burn) => ({
        cumulativeBurnedRaw: burn.cumulativeBurnedRaw,
        transactionHash: burn.transactionHash,
      })),
    ).toEqual([
      {
        cumulativeBurnedRaw: '2000000000000000000',
        transactionHash:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      {
        cumulativeBurnedRaw: '5000000000000000000',
        transactionHash:
          '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      },
    ]);
  });

  it('preserves independent supply reconciliation mismatches in the summary', async () => {
    const snapshot = createBurnSnapshot({
      configuration: TEST_CONFIGURATION,
      generatedAt: '2026-08-02T12:00:00.000Z',
      rawLogs: await loadCoreCase('mismatchedSupply'),
    });

    expect(snapshot.summary).toMatchObject({
      calculatedBurnTotalRaw: '5000000000000000000',
      dataConsistent: false,
      discrepancyRaw: '-1000000000000000000',
      indexedBurnTotalRaw: '6000000000000000000',
    });
  });

  it('fails closed for invalid, conflicting, and over-burn fixture data', async () => {
    const [
      invalidBurn,
      conflictingDuplicate,
      conflictingBlockLogPosition,
      beforeIndexedRange,
      outsideSnapshotRange,
      overburn,
    ] = await Promise.all([
      loadCoreCase('invalidBurn'),
      loadCoreCase('conflictingDuplicate'),
      loadCoreCase('conflictingBlockLogPosition'),
      loadCoreCase('beforeIndexedRange'),
      loadCoreCase('outsideSnapshotRange'),
      loadCoreCase('overburn'),
    ]);

    expect(() =>
      createBurnSnapshot({
        configuration: TEST_CONFIGURATION,
        generatedAt: '2026-08-02T12:00:00.000Z',
        rawLogs: invalidBurn,
      }),
    ).toThrow('zero-value burn logs are not allowed');
    expect(() => dedupeAndSortBurnLogs(conflictingDuplicate.logs)).toThrow(
      'Conflicting duplicate burn log',
    );
    expect(() =>
      dedupeAndSortBurnLogs(conflictingBlockLogPosition.logs),
    ).toThrow('Conflicting burn logs at block/log position: 100:0');
    expect(() =>
      createBurnSnapshot({
        configuration: TEST_CONFIGURATION,
        generatedAt: '2026-08-02T12:00:00.000Z',
        rawLogs: beforeIndexedRange,
      }),
    ).toThrow('outside the configured snapshot range');
    expect(() =>
      createBurnSnapshot({
        configuration: TEST_CONFIGURATION,
        generatedAt: '2026-08-02T12:00:00.000Z',
        rawLogs: outsideSnapshotRange,
      }),
    ).toThrow('outside the configured snapshot range');
    expect(() =>
      createBurnSnapshot({
        configuration: TEST_CONFIGURATION,
        generatedAt: '2026-08-02T12:00:00.000Z',
        rawLogs: overburn,
      }),
    ).toThrow('Indexed burns exceed launch supply');
  });

  it('returns a deterministic empty history and rejects indexing before deployment', async () => {
    const emptySnapshot = createBurnSnapshot({
      configuration: TEST_CONFIGURATION,
      generatedAt: '2026-08-02T12:00:00.000Z',
      rawLogs: await loadCoreCase('empty'),
    });

    expect(emptySnapshot.burns).toEqual([]);
    expect(emptySnapshot.summary).toMatchObject({
      burnTransactionCount: 0,
      indexedFromBlock: 100,
      indexedThroughBlock: 130,
      lastIndexedBlock: 1,
      latestBurnAmountFormatted: null,
      latestBurnTimestamp: null,
      percentSupplyBurned: '0.000%',
    });

    const beforeDeployment = await loadCoreCase('empty');
    const invalidRawLogs = {
      ...beforeDeployment,
      indexedFromBlock: 0,
      indexedThroughBlock: 0,
    };
    expect(() =>
      createBurnSnapshot({
        configuration: TEST_CONFIGURATION,
        generatedAt: '2026-08-02T12:00:00.000Z',
        rawLogs: invalidRawLogs,
      }),
    ).toThrow(
      'Indexed-through block cannot precede the configured deployment block',
    );
  });

  it('formats fixture-driven token values exactly with bigint arithmetic', async () => {
    const fixture = requireRecord(
      await loadJsonFixture('./domain/formatting-cases.json'),
      'formatting fixture',
    );
    const token = tokenFromFixture(
      requireProperty(fixture, 'token', 'formatting fixture'),
    );

    for (const value of requireArray(
      requireProperty(fixture, 'compactAmounts', 'formatting fixture'),
      'formatting fixture.compactAmounts',
    )) {
      const testCase = requireRecord(value, 'compact amount case');
      expect(
        formatCompactTokenAmount(
          requireString(
            requireProperty(testCase, 'raw', 'compact amount case'),
            'compact amount case.raw',
          ),
          token,
        ),
      ).toBe(
        requireString(
          requireProperty(testCase, 'expected', 'compact amount case'),
          'compact amount case.expected',
        ),
      );
    }

    for (const value of requireArray(
      requireProperty(fixture, 'percentages', 'formatting fixture'),
      'formatting fixture.percentages',
    )) {
      const testCase = requireRecord(value, 'percentage case');
      const indexed = BigInt(
        requireString(
          requireProperty(testCase, 'indexed', 'percentage case'),
          'percentage case.indexed',
        ),
      );
      const original = BigInt(
        requireString(
          requireProperty(testCase, 'original', 'percentage case'),
          'percentage case.original',
        ),
      );
      const expected = testCase.expected;

      if (typeof expected === 'string') {
        expect(formatPercentBurned(indexed, original)).toBe(expected);
      } else {
        expect(() => formatPercentBurned(indexed, original)).toThrow(
          requireString(
            requireProperty(testCase, 'error', 'percentage case'),
            'percentage case.error',
          ),
        );
      }
    }

    for (const value of requireArray(
      requireProperty(fixture, 'remainingSupply', 'formatting fixture'),
      'formatting fixture.remainingSupply',
    )) {
      const testCase = requireRecord(value, 'remaining supply case');
      expect(() =>
        calculateRemainingSupplyRaw(
          BigInt(
            requireString(
              requireProperty(testCase, 'original', 'remaining supply case'),
              'remaining supply case.original',
            ),
          ),
          BigInt(
            requireString(
              requireProperty(testCase, 'burned', 'remaining supply case'),
              'remaining supply case.burned',
            ),
          ),
        ),
      ).toThrow('Burned supply cannot exceed original supply');
    }
  });
});
