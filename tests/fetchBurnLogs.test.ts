import { AJNA_CONFIG, AJNA_ZERO_ADDRESS } from '../src/lib/ajnaConfig.js';
import {
  buildAjnaBurnTransferLogsUrl,
  collectBurnTransferLogs,
  fetchBurnLogs,
  normalizeBurnTransferLogs,
  type BurnEtherscanClient,
  type EtherscanLogEntity,
} from '../scripts/lib/fetchBurnLogs.js';

const AJNA = 10n ** 18n;
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_ADDRESS_TOPIC = `0x${AJNA_ZERO_ADDRESS.slice(2).padStart(64, '0')}`;
const SENDER_TOPIC =
  '0x0000000000000000000000001111111111111111111111111111111111111111';
const FIRST_HASH =
  '0xaaa0000000000000000000000000000000000000000000000000000000000001';
const SECOND_HASH =
  '0xbbb0000000000000000000000000000000000000000000000000000000000002';

function transferLog({
  transactionHash = FIRST_HASH,
  logIndex = 0,
  blockNumber = 100,
  timestamp = 1_700_000_000,
  amount = 1n * AJNA,
}: Partial<{
  transactionHash: `0x${string}`;
  logIndex: number;
  blockNumber: number;
  timestamp: number;
  amount: bigint;
}> = {}): EtherscanLogEntity {
  return {
    address: AJNA_CONFIG.contractAddress,
    topics: [TRANSFER_TOPIC, SENDER_TOPIC, ZERO_ADDRESS_TOPIC],
    data: `0x${amount.toString(16)}`,
    blockNumber: `0x${blockNumber.toString(16)}`,
    timeStamp: `0x${timestamp.toString(16)}`,
    logIndex: logIndex === 0 ? '0x' : `0x${logIndex.toString(16)}`,
    transactionHash,
  };
}

describe('Etherscan burn log ingestion', () => {
  it('normalizes, sorts, and deduplicates burn transfer logs', () => {
    const laterLog = transferLog({
      transactionHash: SECOND_HASH,
      blockNumber: 130,
      timestamp: 1_700_000_030,
      amount: 3n * AJNA,
    });
    const snapshot = normalizeBurnTransferLogs([
      laterLog,
      transferLog(),
      laterLog,
    ]);

    expect(snapshot.burnLogs).toEqual([
      {
        transactionHash: FIRST_HASH,
        logIndex: 0,
        blockNumber: 100,
        amountBurnedRaw: 1n * AJNA,
      },
      {
        transactionHash: SECOND_HASH,
        logIndex: 0,
        blockNumber: 130,
        amountBurnedRaw: 3n * AJNA,
      },
    ]);
    expect(snapshot.timestampsByBlock).toEqual(
      new Map([
        [100, 1_700_000_000],
        [130, 1_700_000_030],
      ]),
    );
  });

  it('rejects transfers that do not send AJNA to the zero address', () => {
    const nonBurn = transferLog();
    nonBurn.topics[2] = SENDER_TOPIC;

    expect(() => normalizeBurnTransferLogs([nonBurn])).toThrow(
      'Unexpected transfer recipient',
    );
  });

  it('collects all Etherscan pages until a partial page is returned', async () => {
    const pages = [
      [
        transferLog(),
        transferLog({ transactionHash: SECOND_HASH, logIndex: 1 }),
      ],
      [transferLog({ transactionHash: SECOND_HASH, blockNumber: 130 })],
    ];
    const requestedPages: number[] = [];
    const client: BurnEtherscanClient = {
      async getHeadBlockNumber() {
        return 130;
      },
      async getBurnTransfers({ page = 1 }) {
        requestedPages.push(page);
        return pages[page - 1] ?? [];
      },
    };

    const logs = await collectBurnTransferLogs(client, 100, 130, 2);

    expect(requestedPages).toEqual([1, 2]);
    expect(logs).toHaveLength(3);
  });

  it('queries the AJNA Transfer topic with the zero-address recipient filter', () => {
    const url = new URL(
      buildAjnaBurnTransferLogsUrl({
        fromBlock: AJNA_CONFIG.chartHistoryStartBlock,
        toBlock: AJNA_CONFIG.chartHistoryStartBlock + 1_000,
        page: 2,
        pageSize: 250,
      }),
    );

    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      chainid: String(AJNA_CONFIG.chainId),
      module: 'logs',
      action: 'getLogs',
      address: AJNA_CONFIG.contractAddress,
      fromBlock: String(AJNA_CONFIG.chartHistoryStartBlock),
      toBlock: String(AJNA_CONFIG.chartHistoryStartBlock + 1_000),
      page: '2',
      offset: '250',
      topic0: TRANSFER_TOPIC,
      topic0_2_opr: 'and',
      topic2: ZERO_ADDRESS_TOPIC,
    });
    expect(url.searchParams.has('apikey')).toBe(false);
  });

  it('uses the Etherscan head block in the sync execution id', async () => {
    const client: BurnEtherscanClient = {
      async getHeadBlockNumber() {
        return 25_805_910;
      },
      async getBurnTransfers() {
        return [
          transferLog({
            transactionHash:
              '0xe9e4955c2da10c5861eabea078bc736213ad2445c97544420f1f85e677438e48',
            blockNumber: 24_521_775,
            timestamp: 1_771_876_055,
            amount: 1_149n * AJNA,
          }),
        ];
      },
    };

    const snapshot = await fetchBurnLogs(client);

    expect(snapshot.executionId).toBe('etherscan:1:25805910');
    expect(snapshot.burnLogs).toHaveLength(1);
    expect(snapshot.timestampsByBlock.get(24_521_775)).toBe(1_771_876_055);
  });
});
