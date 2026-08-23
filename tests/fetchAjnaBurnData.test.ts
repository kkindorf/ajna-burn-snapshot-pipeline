import { describe, expect, it } from 'vitest';

import fixture from './fixtures/etherscan/provider-responses.json' with { type: 'json' };

import { AJNA } from '../src/config/ajna.js';
import { fetchAjnaBurnData } from '../src/providers/etherscan/fetchAjnaBurnData.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

function responseQueue(
  bodies: unknown[],
  requests: URL[] = [],
): (url: URL) => Promise<Response> {
  let index = 0;
  return async (url) => {
    requests.push(url);
    return jsonResponse(bodies[index++]);
  };
}

describe('fetchAjnaBurnData', () => {
  it('fetches every log page and totalSupply at the indexed block', async () => {
    const requests: URL[] = [];
    const firstPage = {
      message: 'OK',
      status: '1',
      result: Array.from({ length: 1_000 }, (_, index) => ({
        ...fixture.logTemplate,
        logIndex: `0x${index.toString(16)}`,
      })),
    };

    const data = await fetchAjnaBurnData(
      'fixture-api-key',
      responseQueue(
        [fixture.headBlock, firstPage, fixture.lastPage, fixture.totalSupply],
        requests,
      ),
    );

    expect(data.currentTotalSupplyRaw).toBe(4n * 10n ** 18n);
    expect(data.indexedThroughBlock).toBe(18_078_700);
    expect(data.logs).toHaveLength(1_001);
    expect(data.logs.at(-1)).toMatchObject({
      blockNumber: 18_078_630,
      logIndex: 0,
      transactionHash:
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    });

    expect(
      requests.map((request) => request.searchParams.get('action')),
    ).toEqual(['eth_blockNumber', 'getLogs', 'getLogs', 'eth_call']);
    expect(Object.fromEntries(requests[1]?.searchParams ?? [])).toMatchObject({
      action: 'getLogs',
      fromBlock: String(AJNA.burnSeriesStartBlock),
      page: '1',
      toBlock: '18078700',
      topic2: `0x${'0'.repeat(64)}`,
    });
    expect(requests[3]?.searchParams.get('tag')).toBe('0x113dbec');
  });

  it('omits zero-value transfers', async () => {
    const data = await fetchAjnaBurnData(
      'fixture-api-key',
      responseQueue([
        fixture.headBlock,
        { message: 'OK', result: [fixture.zeroValueLog], status: '1' },
        fixture.totalSupply,
      ]),
    );

    expect(data.logs).toEqual([]);
  });

  it('surfaces an Etherscan API error', async () => {
    await expect(
      fetchAjnaBurnData(
        'fixture-api-key',
        responseQueue([fixture.headBlock, fixture.apiError]),
      ),
    ).rejects.toThrow('Max rate limit reached');
  });
});
