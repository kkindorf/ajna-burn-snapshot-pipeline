import { createAjnaBurnPipelineConfiguration } from '../src/config/ajna.js';
import {
  EtherscanBurnProvider,
  parseEtherscanBurnLogs,
  type EtherscanBurnProviderOptions,
  type EtherscanFetch,
  type EtherscanFetchResponse,
  type EtherscanHeaders,
  type EtherscanRequestPolicy,
} from '../src/providers/etherscan/EtherscanBurnProvider.js';
import {
  loadJsonFixture,
  requireArray,
  requireInteger,
  requireProperty,
  requireRecord,
  requireString,
  type JsonRecord,
} from './fixtures/loadJsonFixture.js';

const CONFIGURATION = createAjnaBurnPipelineConfiguration();

const DEFAULT_REQUEST_POLICY: EtherscanRequestPolicy = {
  maxAttempts: 2,
  maxRetryDelayMs: 5_000,
  minimumRequestIntervalMs: 0,
  requestTimeoutMs: 100,
  retryBaseDelayMs: 10,
};

type ProviderOverrides = Partial<Omit<EtherscanBurnProviderOptions, 'fetch'>>;

function createProvider(
  fetch: EtherscanFetch,
  overrides: ProviderOverrides = {},
): EtherscanBurnProvider {
  return new EtherscanBurnProvider({
    apiBaseUrl: 'https://etherscan.fixture.test/v2/api',
    apiKey: 'fixture-api-key',
    chainId: CONFIGURATION.snapshot.chainId,
    confirmationBlocks: 5,
    contractAddress: CONFIGURATION.snapshot.contractAddress,
    historyStartBlock: 100,
    maxBlockRange: 31,
    maxPagesPerRange: 4,
    pageSize: 3,
    requestPolicy: DEFAULT_REQUEST_POLICY,
    zeroAddress: CONFIGURATION.etherscan.zeroAddress,
    ...overrides,
    fetch,
  });
}

function assertFetchInit(init: Parameters<EtherscanFetch>[1]): void {
  expect(init.headers).toEqual({ accept: 'application/json' });
  expect(init.method).toBe('GET');
  expect(init.redirect).toBe('error');
  expect(init.signal).toBeInstanceOf(AbortSignal);
}

function fixtureValue(fixture: JsonRecord, name: string): unknown {
  return requireProperty(fixture, name, 'Etherscan provider fixture');
}

function pageRecords(value: unknown, label: string): unknown[] {
  const page = requireRecord(value, label);
  return requireArray(
    requireProperty(page, 'result', label),
    `${label}.result`,
  );
}

function jsonResponse(payload: unknown): EtherscanFetchResponse {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
    statusText: 'OK',
  };
}

function headersFromFixture(value: unknown): EtherscanHeaders {
  const headers = new Map<string, string>();
  const fixtureHeaders = requireRecord(value, 'HTTP response headers');

  for (const [name, headerValue] of Object.entries(fixtureHeaders)) {
    headers.set(
      name.toLowerCase(),
      requireString(headerValue, `HTTP response header ${name}`),
    );
  }

  return {
    get(name: string): string | null {
      return headers.get(name.toLowerCase()) ?? null;
    },
  };
}

function httpResponse(value: unknown): EtherscanFetchResponse {
  const response = requireRecord(value, 'HTTP response fixture');
  const ok = requireProperty(response, 'ok', 'HTTP response fixture');
  if (typeof ok !== 'boolean') {
    throw new Error('HTTP response fixture.ok must be a boolean.');
  }

  return {
    headers: headersFromFixture(
      requireProperty(response, 'headers', 'HTTP response fixture'),
    ),
    json: async () =>
      requireProperty(response, 'body', 'HTTP response fixture'),
    ok,
    status: requireInteger(
      requireProperty(response, 'status', 'HTTP response fixture'),
      'HTTP response fixture.status',
    ),
    statusText: requireString(
      requireProperty(response, 'statusText', 'HTTP response fixture'),
      'HTTP response fixture.statusText',
    ),
  };
}

function successfulFixtureResponse(
  fixture: JsonRecord,
  request: URL,
): EtherscanFetchResponse {
  switch (request.searchParams.get('action')) {
    case 'eth_blockNumber':
      return jsonResponse(fixtureValue(fixture, 'headBlock'));
    case 'eth_call':
      return jsonResponse(fixtureValue(fixture, 'totalSupply'));
    case 'getLogs':
      return jsonResponse(
        request.searchParams.get('page') === '1'
          ? fixtureValue(fixture, 'fullPage')
          : request.searchParams.get('page') === '2'
            ? fixtureValue(fixture, 'partialPage')
            : fixtureValue(fixture, 'noRecords'),
      );
    default:
      throw new Error(`Unexpected fixture request: ${request.toString()}`);
  }
}

function createSuccessfulFixtureFetch(
  fixture: JsonRecord,
  requests: URL[],
): EtherscanFetch {
  return async (url, init) => {
    assertFetchInit(init);
    const request = new URL(url);
    requests.push(request);
    return successfulFixtureResponse(fixture, request);
  };
}

function createFetchThatFailsOnce(
  fixture: JsonRecord,
  failureAction: string,
  failureResponse: EtherscanFetchResponse,
  requests: URL[],
): EtherscanFetch {
  let didFail = false;

  return async (url, init) => {
    assertFetchInit(init);
    const request = new URL(url);
    requests.push(request);

    if (!didFail && request.searchParams.get('action') === failureAction) {
      didFail = true;
      return failureResponse;
    }

    return successfulFixtureResponse(fixture, request);
  };
}

async function loadProviderFixture(): Promise<JsonRecord> {
  return requireRecord(
    await loadJsonFixture('./etherscan/provider-responses.json'),
    'Etherscan provider fixture',
  );
}

function parsingOptions() {
  return {
    contractAddress: CONFIGURATION.snapshot.contractAddress,
    maximumBlock: 130,
    minimumBlock: 100,
    zeroAddress: CONFIGURATION.etherscan.zeroAddress,
  };
}

describe('EtherscanBurnProvider', () => {
  it('parses local Etherscan records into canonical source-neutral logs', async () => {
    const fixture = await loadProviderFixture();
    const logs = parseEtherscanBurnLogs(
      pageRecords(fixtureValue(fixture, 'fullPage'), 'full page'),
      parsingOptions(),
    );

    expect(
      logs.map((log) => ({
        amountBurnedRaw: log.amountBurnedRaw.toString(),
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        timestamp: log.timestamp,
        transactionHash: log.transactionHash,
      })),
    ).toEqual([
      {
        amountBurnedRaw: '3000000000000000000',
        blockNumber: 130,
        logIndex: 0,
        timestamp: 1700000000,
        transactionHash:
          '0xbbb0000000000000000000000000000000000000000000000000000000000002',
      },
      {
        amountBurnedRaw: '2000000000000000000',
        blockNumber: 100,
        logIndex: 1,
        timestamp: 1690000000,
        transactionHash:
          '0xaaa0000000000000000000000000000000000000000000000000000000000001',
      },
      {
        amountBurnedRaw: '1000000000000000000',
        blockNumber: 100,
        logIndex: 0,
        timestamp: 1690000000,
        transactionHash:
          '0xaaa0000000000000000000000000000000000000000000000000000000000001',
      },
    ]);
  });

  it('rejects malformed Etherscan source records from local fixtures', async () => {
    const fixture = await loadProviderFixture();
    const invalidCases = [
      {
        error: 'Unexpected transfer recipient',
        fixtureName: 'invalidRecipientRecord',
      },
      {
        error: 'outside the requested range',
        fixtureName: 'outOfRangeRecord',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseEtherscanBurnLogs(
          [fixtureValue(fixture, invalidCase.fixtureName)],
          parsingOptions(),
        ),
      ).toThrow(invalidCase.error);
    }
  });

  it('ignores zero-value transfer events that do not change supply', async () => {
    const fixture = await loadProviderFixture();

    expect(
      parseEtherscanBurnLogs(
        [fixtureValue(fixture, 'zeroAmountRecord')],
        parsingOptions(),
      ),
    ).toEqual([]);
  });

  it('uses the finalized head, page sequence, and independent totalSupply call', async () => {
    const fixture = await loadProviderFixture();
    const requests: URL[] = [];
    const provider = createProvider(
      createSuccessfulFixtureFetch(fixture, requests),
    );

    const rawLogs = await provider.fetchRawLogs();

    expect(rawLogs).toMatchObject({
      currentTotalSupplyRaw: 4n * 10n ** 18n,
      executionId: 'etherscan:1:130',
      headBlock: 135,
      indexedFromBlock: 100,
      indexedThroughBlock: 130,
      source: 'etherscan',
    });
    expect(rawLogs.logs).toHaveLength(4);
    expect(
      requests.map((request) => request.searchParams.get('action')),
    ).toEqual(['eth_blockNumber', 'getLogs', 'getLogs', 'getLogs', 'eth_call']);

    const logRequests = requests.filter(
      (request) => request.searchParams.get('action') === 'getLogs',
    );
    expect(logRequests).toHaveLength(3);
    expect(Object.fromEntries(logRequests[0].searchParams)).toMatchObject({
      action: 'getLogs',
      address: CONFIGURATION.snapshot.contractAddress,
      apikey: 'fixture-api-key',
      chainid: '1',
      fromBlock: '100',
      module: 'logs',
      offset: '3',
      page: '1',
      toBlock: '130',
      topic0:
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      topic0_2_opr: 'and',
      topic2:
        '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
    expect(logRequests[1].searchParams.get('page')).toBe('2');
    expect(logRequests[2].searchParams.get('page')).toBe('3');

    const supplyRequest = requests.find(
      (request) => request.searchParams.get('action') === 'eth_call',
    );
    expect(supplyRequest?.searchParams).toMatchObject({
      get: expect.any(Function),
    });
    expect(supplyRequest?.searchParams.get('data')).toBe('0x18160ddd');
    expect(supplyRequest?.searchParams.get('tag')).toBe('0x82');
    expect(supplyRequest?.searchParams.get('to')).toBe(
      CONFIGURATION.snapshot.contractAddress,
    );
  });

  it('treats a local no-records page as an empty finalized result while still reading totalSupply', async () => {
    const fixture = await loadProviderFixture();
    const requests: URL[] = [];
    const fetch: EtherscanFetch = async (url, init) => {
      assertFetchInit(init);
      const request = new URL(url);
      requests.push(request);

      if (request.searchParams.get('action') === 'eth_blockNumber') {
        return jsonResponse(fixtureValue(fixture, 'headBlock'));
      }
      if (request.searchParams.get('action') === 'getLogs') {
        return jsonResponse(fixtureValue(fixture, 'noRecords'));
      }
      return jsonResponse(fixtureValue(fixture, 'totalSupply'));
    };

    await expect(createProvider(fetch).fetchRawLogs()).resolves.toMatchObject({
      currentTotalSupplyRaw: 4n * 10n ** 18n,
      indexedFromBlock: 100,
      indexedThroughBlock: 130,
      logs: [],
    });
    expect(
      requests.map((request) => request.searchParams.get('action')),
    ).toEqual(['eth_blockNumber', 'getLogs', 'eth_call']);
  });

  it('fails before querying logs when the source head cannot satisfy finality', async () => {
    const fixture = await loadProviderFixture();
    const requests: URL[] = [];
    const fetch: EtherscanFetch = async (url, init) => {
      assertFetchInit(init);
      requests.push(new URL(url));
      return jsonResponse(fixtureValue(fixture, 'headBelowFinality'));
    };

    await expect(createProvider(fetch).fetchRawLogs()).rejects.toThrow(
      'below the configured confirmation depth',
    );
    expect(requests).toHaveLength(1);
  });

  for (const retryCase of [
    { expectedDelay: 2_000, fixtureName: 'http429', label: 'HTTP 429' },
    { expectedDelay: 10, fixtureName: 'http503', label: 'HTTP 503' },
  ]) {
    it(`retries ${retryCase.label} using only an injected fixture transport`, async () => {
      const fixture = await loadProviderFixture();
      const requests: URL[] = [];
      const delays: number[] = [];
      const provider = createProvider(
        createFetchThatFailsOnce(
          fixture,
          'eth_blockNumber',
          httpResponse(fixtureValue(fixture, retryCase.fixtureName)),
          requests,
        ),
        {
          random: () => 0,
          sleep: async (milliseconds) => {
            delays.push(milliseconds);
          },
        },
      );

      await expect(provider.fetchRawLogs()).resolves.toMatchObject({
        indexedThroughBlock: 130,
      });
      expect(delays).toEqual([retryCase.expectedDelay]);
      expect(
        requests.filter(
          (request) => request.searchParams.get('action') === 'eth_blockNumber',
        ),
      ).toHaveLength(2);
    });
  }

  it('retries transient Etherscan status-zero payloads without any fetch mock', async () => {
    const fixture = await loadProviderFixture();
    const requests: URL[] = [];
    const delays: number[] = [];
    const provider = createProvider(
      createFetchThatFailsOnce(
        fixture,
        'getLogs',
        jsonResponse(fixtureValue(fixture, 'transientStatusZero')),
        requests,
      ),
      {
        random: () => 0,
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
      },
    );

    await expect(provider.fetchRawLogs()).resolves.toMatchObject({
      indexedThroughBlock: 130,
    });
    expect(delays).toEqual([10]);
    expect(
      requests.filter(
        (request) => request.searchParams.get('action') === 'getLogs',
      ),
    ).toHaveLength(4);
  });

  it('fails after retry exhaustion instead of silently continuing', async () => {
    const fixture = await loadProviderFixture();
    const delays: number[] = [];
    let attempts = 0;
    const fetch: EtherscanFetch = async (_url, init) => {
      assertFetchInit(init);
      attempts += 1;
      return httpResponse(fixtureValue(fixture, 'http503'));
    };
    const provider = createProvider(fetch, {
      random: () => 0,
      requestPolicy: {
        ...DEFAULT_REQUEST_POLICY,
        maxAttempts: 2,
      },
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    await expect(provider.fetchRawLogs()).rejects.toThrow(
      'head block request failed after 2 attempts',
    );
    expect(attempts).toBe(2);
    expect(delays).toEqual([10]);
  });

  it('aborts a timed-out injected request and reports the timeout after retry policy evaluation', async () => {
    const fetch: EtherscanFetch = async (_url, init) =>
      new Promise<EtherscanFetchResponse>((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(new Error('fixture transport observed abort')),
          { once: true },
        );
      });
    const provider = createProvider(fetch, {
      requestPolicy: {
        ...DEFAULT_REQUEST_POLICY,
        maxAttempts: 1,
        requestTimeoutMs: 5,
      },
    });

    await expect(provider.fetchRawLogs()).rejects.toThrow(
      'head block request failed after 1 attempt: Etherscan request timed out after 5ms',
    );
  });

  it('stops immediately when Etherscan repeats a full page', async () => {
    const fixture = await loadProviderFixture();
    let logPages = 0;
    const fetch: EtherscanFetch = async (url, init) => {
      assertFetchInit(init);
      const request = new URL(url);
      if (request.searchParams.get('action') === 'eth_blockNumber') {
        return jsonResponse(fixtureValue(fixture, 'headBlock'));
      }
      if (request.searchParams.get('action') === 'getLogs') {
        logPages += 1;
        return jsonResponse(fixtureValue(fixture, 'fullPage'));
      }
      throw new Error('The repeated-page guard must fail before totalSupply.');
    };

    await expect(createProvider(fetch).fetchRawLogs()).rejects.toThrow(
      'pagination repeated a page',
    );
    expect(logPages).toBe(2);
  });

  it('splits a timed-out range and continues with fixture-backed subranges', async () => {
    const fixture = await loadProviderFixture();
    const ranges: string[] = [];
    const fetch: EtherscanFetch = async (url, init) => {
      assertFetchInit(init);
      const request = new URL(url);
      const action = request.searchParams.get('action');
      if (action === 'eth_blockNumber') {
        return jsonResponse(fixtureValue(fixture, 'headBlock'));
      }
      if (action === 'eth_call') {
        return jsonResponse(fixtureValue(fixture, 'totalSupply'));
      }

      const range = `${request.searchParams.get('fromBlock')}-${request.searchParams.get('toBlock')}`;
      ranges.push(range);
      if (range === '100-130') {
        return jsonResponse(fixtureValue(fixture, 'rangeTimeout'));
      }
      return jsonResponse(fixtureValue(fixture, 'noRecords'));
    };
    const provider = createProvider(fetch, {
      requestPolicy: {
        ...DEFAULT_REQUEST_POLICY,
        maxAttempts: 1,
      },
    });

    await expect(provider.fetchRawLogs()).resolves.toMatchObject({
      logs: [],
    });
    expect(ranges).toEqual(['100-130', '100-115', '116-130']);
  });
});
