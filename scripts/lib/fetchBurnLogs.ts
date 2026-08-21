import { AJNA_CONFIG, AJNA_ZERO_ADDRESS } from '../../src/lib/ajnaConfig.js';
import type { BurnLogRecord } from '../../src/types/burn.js';

const DEFAULT_ETHERSCAN_API_BASE_URL = 'https://api.etherscan.io/v2/api';
const DEFAULT_PAGE_SIZE = 1000;
const TRANSFER_EVENT_TOPIC0 =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_ADDRESS_TOPIC = `0x${AJNA_ZERO_ADDRESS.slice(2).padStart(64, '0')}`;

export interface EtherscanLogEntity {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  logIndex: string;
  transactionHash: `0x${string}`;
}

interface EtherscanLogsResponse {
  status: string;
  message: string;
  result: EtherscanLogEntity[] | string;
}

interface EtherscanProxyResponse<TResult> {
  jsonrpc: '2.0';
  id: number;
  result: TResult;
}

export interface BurnHistorySnapshot {
  burnLogs: BurnLogRecord[];
  executionId: string;
  timestampsByBlock: Map<number, number>;
}

export interface BurnEtherscanClient {
  getHeadBlockNumber(): Promise<number>;
  getBurnTransfers(args: {
    fromBlock: number;
    toBlock: number;
    page?: number;
    pageSize?: number;
  }): Promise<EtherscanLogEntity[]>;
}

function getEtherscanApiKey(): string {
  const key = process.env.ETHERSCAN_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'No Etherscan API key is configured. Set ETHERSCAN_API_KEY.',
    );
  }

  return key;
}

function getEtherscanApiBaseUrl(): string {
  return (
    process.env.ETHERSCAN_API_BASE_URL?.trim() || DEFAULT_ETHERSCAN_API_BASE_URL
  );
}

function buildEtherscanUrl(
  params: Record<string, string | number>,
  options: { includeApiKey?: boolean } = {},
): string {
  const url = new URL(getEtherscanApiBaseUrl());
  url.searchParams.set('chainid', String(AJNA_CONFIG.chainId));

  if (options.includeApiKey !== false) {
    url.searchParams.set('apikey', getEtherscanApiKey());
  }

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function parseNumberLike(value: string, label: string): number {
  const normalized = value.trim();
  if (!normalized || normalized === '0x' || normalized === '0X') {
    throw new Error(`Missing ${label}.`);
  }

  const parsed = BigInt(normalized);
  const number = Number(parsed);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return number;
}

function parseAmountRaw(value: string, label: string): bigint {
  const normalized = value.trim();
  if (!normalized || normalized === '0x' || normalized === '0X') {
    throw new Error(`Missing ${label}.`);
  }

  return BigInt(normalized);
}

function parseLogIndex(value: string): number {
  const normalized = value.trim();
  return normalized === '0x' || normalized === '0X'
    ? 0
    : parseNumberLike(normalized, 'log index');
}

function validateTransferLogEntity(entity: EtherscanLogEntity): void {
  if (!entity.address) {
    throw new Error('Missing burn transfer address.');
  }

  if (
    entity.address.toLowerCase() !== AJNA_CONFIG.contractAddress.toLowerCase()
  ) {
    throw new Error(
      `Unexpected burn transfer contract address: ${entity.address}`,
    );
  }

  if (!Array.isArray(entity.topics) || entity.topics.length < 3) {
    throw new Error('Missing transfer topics.');
  }

  if (entity.topics[0].toLowerCase() !== TRANSFER_EVENT_TOPIC0) {
    throw new Error(`Unexpected transfer topic0 for ${entity.transactionHash}`);
  }

  if (entity.topics[2].toLowerCase() !== ZERO_ADDRESS_TOPIC.toLowerCase()) {
    throw new Error(
      `Unexpected transfer recipient for ${entity.transactionHash}`,
    );
  }

  if (!entity.transactionHash.startsWith('0x')) {
    throw new Error(
      `Missing transaction hash for burn transfer ${entity.blockNumber}`,
    );
  }

  if (!entity.blockNumber) {
    throw new Error(
      `Missing block number for burn transfer ${entity.transactionHash}`,
    );
  }

  if (!entity.timeStamp) {
    throw new Error(
      `Missing timestamp for burn transfer ${entity.transactionHash}`,
    );
  }

  if (!entity.data) {
    throw new Error(
      `Missing transfer amount for burn transfer ${entity.transactionHash}`,
    );
  }

  if (!entity.logIndex) {
    throw new Error(
      `Missing log index for burn transfer ${entity.transactionHash}`,
    );
  }
}

function normalizeTransferEntity(entity: EtherscanLogEntity): BurnLogRecord {
  validateTransferLogEntity(entity);

  return {
    transactionHash: entity.transactionHash,
    logIndex: parseLogIndex(entity.logIndex),
    blockNumber: parseNumberLike(entity.blockNumber, 'block number'),
    amountBurnedRaw: parseAmountRaw(entity.data, 'transfer amount'),
  };
}

function dedupeAndSortBurnLogs(logs: BurnLogRecord[]): BurnLogRecord[] {
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

function buildExecutionId(latestBlock: number): string {
  return `etherscan:${AJNA_CONFIG.chainId}:${latestBlock}`;
}

function buildBurnTransferQueryUrl(
  args: {
    fromBlock: number;
    toBlock: number;
    page?: number;
    pageSize?: number;
  },
  includeApiKey = true,
): string {
  const { fromBlock, toBlock, page = 1, pageSize = DEFAULT_PAGE_SIZE } = args;

  return buildEtherscanUrl(
    {
      module: 'logs',
      action: 'getLogs',
      address: AJNA_CONFIG.contractAddress,
      fromBlock,
      toBlock,
      page,
      offset: pageSize,
      topic0: TRANSFER_EVENT_TOPIC0,
      topic0_2_opr: 'and',
      topic2: ZERO_ADDRESS_TOPIC,
    },
    { includeApiKey },
  );
}

function buildLatestBlockUrl(): string {
  return buildEtherscanUrl({
    module: 'proxy',
    action: 'eth_blockNumber',
  });
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Etherscan request failed (${response.status} ${response.statusText}).`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error('Etherscan returned an invalid JSON response.');
  }
}

async function getLatestBlockNumber(): Promise<number> {
  const body = await getJson<EtherscanProxyResponse<string>>(
    buildLatestBlockUrl(),
  );
  if (typeof body.result !== 'string') {
    throw new Error(
      'The Etherscan proxy response did not include a head block number.',
    );
  }

  return parseNumberLike(body.result, 'head block number');
}

async function getBurnTransferPage(args: {
  fromBlock: number;
  toBlock: number;
  page?: number;
  pageSize?: number;
}): Promise<EtherscanLogEntity[]> {
  const body = await getJson<EtherscanLogsResponse>(
    buildBurnTransferQueryUrl(args),
  );

  if (body.status === '1' && Array.isArray(body.result)) {
    return body.result;
  }

  if (
    body.status === '0' &&
    typeof body.message === 'string' &&
    /no records found/i.test(body.message)
  ) {
    return [];
  }

  const details =
    typeof body.result === 'string' && body.result.length > 0
      ? `: ${body.result}`
      : '';
  const message = body.message || 'Unexpected Etherscan response.';
  throw new Error(`Etherscan logs request failed: ${message}${details}`);
}

export function createEtherscanBurnClient(): BurnEtherscanClient {
  return {
    async getHeadBlockNumber(): Promise<number> {
      return getLatestBlockNumber();
    },

    async getBurnTransfers({
      fromBlock,
      toBlock,
      page = 1,
      pageSize = DEFAULT_PAGE_SIZE,
    }): Promise<EtherscanLogEntity[]> {
      return getBurnTransferPage({
        fromBlock,
        toBlock,
        page,
        pageSize,
      });
    },
  };
}

export async function collectBurnTransferLogs(
  client: BurnEtherscanClient,
  fromBlock: number,
  toBlock: number,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<EtherscanLogEntity[]> {
  const logs: EtherscanLogEntity[] = [];
  let page = 1;

  while (true) {
    const currentPage = await client.getBurnTransfers({
      fromBlock,
      toBlock,
      page,
      pageSize,
    });

    if (currentPage.length === 0) {
      break;
    }

    logs.push(...currentPage);

    if (currentPage.length < pageSize) {
      break;
    }

    page += 1;
  }

  return logs;
}

export function normalizeBurnTransferLogs(
  logs: EtherscanLogEntity[],
): Omit<BurnHistorySnapshot, 'executionId'> {
  const burnLogs = dedupeAndSortBurnLogs(logs.map(normalizeTransferEntity));
  const timestampsByBlock = new Map<number, number>();

  for (const log of logs) {
    validateTransferLogEntity(log);
    timestampsByBlock.set(
      parseNumberLike(log.blockNumber, 'block number'),
      parseNumberLike(log.timeStamp, 'timestamp'),
    );
  }

  return {
    burnLogs,
    timestampsByBlock,
  };
}

export function buildAjnaBurnTransferLogsUrl(args: {
  fromBlock: number;
  toBlock: number;
  page?: number;
  pageSize?: number;
}): string {
  return buildBurnTransferQueryUrl(args, false);
}

export async function fetchBurnLogs(
  client: BurnEtherscanClient = createEtherscanBurnClient(),
): Promise<BurnHistorySnapshot> {
  const headBlock = await client.getHeadBlockNumber();

  console.log(
    `Fetching AJNA burn transfers from Etherscan starting at block ${AJNA_CONFIG.chartHistoryStartBlock} (head ${headBlock})`,
  );

  const rawLogs = await collectBurnTransferLogs(
    client,
    AJNA_CONFIG.chartHistoryStartBlock,
    headBlock,
  );
  console.log(`Fetched ${rawLogs.length} burn transfer logs`);

  const normalizedLogs = normalizeBurnTransferLogs(rawLogs);
  console.log(
    `Resolved timestamps for ${normalizedLogs.timestampsByBlock.size} blocks`,
  );

  return {
    executionId: buildExecutionId(headBlock),
    ...normalizedLogs,
  };
}
