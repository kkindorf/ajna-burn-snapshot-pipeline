import { describe, expect, it } from 'vitest';

import cases from './fixtures/domain/burn-snapshot-cases.json' with { type: 'json' };
import expectedSnapshot from './fixtures/domain/expected-snapshot.json' with { type: 'json' };

import { createBurnSnapshot } from '../src/lib/createBurnSnapshot.js';
import type { BurnData } from '../src/types/burnData.js';

const GENERATED_AT = '2026-08-02T12:00:00.000Z';

function burnData(fixture: (typeof cases)['main']): BurnData {
  return {
    ...fixture,
    currentTotalSupplyRaw: BigInt(fixture.currentTotalSupplyRaw),
    logs: fixture.logs.map((log) => ({
      ...log,
      amountBurnedRaw: BigInt(log.amountBurnedRaw),
    })),
  };
}

describe('createBurnSnapshot', () => {
  it('creates the exact public snapshot from local burn data', () => {
    expect(createBurnSnapshot(burnData(cases.main), GENERATED_AT)).toEqual(
      expectedSnapshot,
    );
  });

  it('keeps same-block burns in log-index order', () => {
    const snapshot = createBurnSnapshot(
      burnData(cases.sameBlock),
      GENERATED_AT,
    );

    expect(
      snapshot.burns.map((burn) => ({
        cumulativeBurnedRaw: burn.cumulativeBurnedRaw,
        transactionHash: burn.transactionHash,
      })),
    ).toEqual([
      {
        cumulativeBurnedRaw: '2000000000000000000000000',
        transactionHash:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      {
        cumulativeBurnedRaw: '5000000000000000000000000',
        transactionHash:
          '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      },
    ]);
  });

  it('refuses burn logs that disagree with totalSupply', () => {
    const mismatchedData = burnData(cases.main);
    mismatchedData.currentTotalSupplyRaw += 1n;

    expect(() => createBurnSnapshot(mismatchedData, GENERATED_AT)).toThrow(
      'do not match totalSupply',
    );
  });
});
