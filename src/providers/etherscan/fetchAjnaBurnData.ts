import { AJNA } from '../../config/ajna.js';
import type { BurnData, BurnLog } from '../../types/burnData.js';

const ETHERSCAN_API_URL = 'https://api.etherscan.io/v2/api';
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_ADDRESS_TOPIC = `0x${'0'.repeat(64)}`;
const PAGE_SIZE = 1_000;

interface EtherscanLog {
  blockNumber: string;
  data: string;
  logIndex: string;
  timeStamp: string;
  transactionHash: string;
}

interface EtherscanResponse<Result> {
  message?: string;
  result: Result;
}

type Fetcher = (url: URL) => Promise<Response>;
type Query = Record<string, string | number>;

function hexToNumber(value: string): number {
  return Number(BigInt(value === '0x' ? 0 : value));
}

/** Fetches AJNA burn transfers and total supply from Etherscan. */
export async function fetchAjnaBurnData(
  apiKey: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<BurnData> {
  async function request<Result>(
    query: Query,
  ): Promise<EtherscanResponse<Result>> {
    const url = new URL(ETHERSCAN_API_URL);
    for (const [key, value] of Object.entries({
      apikey: apiKey,
      chainid: AJNA.chainId,
      ...query,
    })) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetcher(url);
    if (!response.ok) {
      throw new Error(`Etherscan request failed: HTTP ${response.status}.`);
    }

    return (await response.json()) as EtherscanResponse<Result>;
  }

  const head = await request<string>({
    action: 'eth_blockNumber',
    module: 'proxy',
  });
  const indexedThroughBlock = hexToNumber(head.result);
  const logs: BurnLog[] = [];

  for (let page = 1; ; page += 1) {
    const response = await request<EtherscanLog[] | string>({
      action: 'getLogs',
      address: AJNA.contractAddress,
      fromBlock: AJNA.burnSeriesStartBlock,
      module: 'logs',
      offset: PAGE_SIZE,
      page,
      toBlock: indexedThroughBlock,
      topic0: TRANSFER_TOPIC,
      topic0_2_opr: 'and',
      topic2: ZERO_ADDRESS_TOPIC,
    });

    if (typeof response.result === 'string') {
      if (response.message === 'No records found') break;
      throw new Error(`Etherscan logs request failed: ${response.result}.`);
    }

    for (const log of response.result) {
      const amountBurnedRaw = BigInt(log.data);
      if (amountBurnedRaw === 0n) continue;

      logs.push({
        amountBurnedRaw,
        blockNumber: hexToNumber(log.blockNumber),
        logIndex: hexToNumber(log.logIndex),
        timestamp: hexToNumber(log.timeStamp),
        transactionHash: log.transactionHash,
      });
    }

    if (response.result.length < PAGE_SIZE) break;
  }

  const totalSupply = await request<string>({
    action: 'eth_call',
    data: '0x18160ddd',
    module: 'proxy',
    tag: `0x${indexedThroughBlock.toString(16)}`,
    to: AJNA.contractAddress,
  });

  return {
    currentTotalSupplyRaw: BigInt(totalSupply.result),
    indexedThroughBlock,
    logs,
  };
}
