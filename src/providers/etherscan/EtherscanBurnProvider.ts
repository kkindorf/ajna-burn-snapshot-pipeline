import type { BurnLogProvider } from '../burnLogProvider.js';
import type {
  BurnLogRecord,
  HexAddress,
  RawBurnLogs,
  TransactionHash,
} from '../../types/burn.js';

const TRANSFER_EVENT_TOPIC0 =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TOTAL_SUPPLY_SELECTOR = '0x18160ddd';
const ADDRESS_PATTERN = /^0x[\da-f]{40}$/i;
const HEX_WORD_PATTERN = /^0x[\da-f]{64}$/i;
const TRANSACTION_HASH_PATTERN = /^0x[\da-f]{64}$/i;
const UNSIGNED_INTEGER_PATTERN = /^(?:0x[\da-f]+|\d+)$/i;
const MAX_UINT256 = (1n << 256n) - 1n;

export interface EtherscanHeaders {
  get(name: string): string | null;
}

export interface EtherscanFetchResponse {
  headers?: EtherscanHeaders;
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
  statusText: string;
}

export type EtherscanFetch = (
  url: string,
  init: {
    headers: { accept: string };
    method: 'GET';
    redirect: 'error';
    signal: AbortSignal;
  },
) => Promise<EtherscanFetchResponse>;

export type EtherscanSleep = (milliseconds: number) => Promise<void>;

export interface EtherscanRequestPolicy {
  maxAttempts: number;
  maxRetryDelayMs: number;
  minimumRequestIntervalMs: number;
  requestTimeoutMs: number;
  retryBaseDelayMs: number;
}

export interface EtherscanBurnProviderOptions {
  apiBaseUrl: string;
  apiKey: string;
  chainId: number;
  confirmationBlocks: number;
  contractAddress: HexAddress;
  fetch?: EtherscanFetch;
  historyStartBlock: number;
  maxBlockRange: number;
  maxPagesPerRange: number;
  now?: () => number;
  pageSize: number;
  random?: () => number;
  requestPolicy: EtherscanRequestPolicy;
  sleep?: EtherscanSleep;
  zeroAddress: HexAddress;
}

export interface EtherscanBurnLogParsingOptions {
  contractAddress: HexAddress;
  maximumBlock?: number;
  minimumBlock?: number;
  zeroAddress: HexAddress;
}

interface NormalizedEtherscanBurnProviderOptions extends Omit<
  EtherscanBurnProviderOptions,
  'fetch' | 'now' | 'random' | 'sleep'
> {
  fetch: EtherscanFetch;
  now: () => number;
  random: () => number;
  sleep: EtherscanSleep;
}

type UnknownRecord = Record<string, unknown>;

class EtherscanRequestError extends Error {
  public constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
    public readonly shouldSplitRange = false,
  ) {
    super(message);
    this.name = 'EtherscanRequestError';
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTransactionHash(value: string): value is TransactionHash {
  return TRANSACTION_HASH_PATTERN.test(value);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const defaultFetch: EtherscanFetch = (url, init) => fetch(url, init);

function readRequiredString(
  value: unknown,
  label: string,
  context?: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    const suffix = context ? ` for ${context}` : '';
    throw new Error(`Missing ${label}${suffix}.`);
  }

  return value.trim();
}

function parseUnsignedInteger(value: string, label: string): bigint {
  const normalized = value.trim();
  if (!normalized || !UNSIGNED_INTEGER_PATTERN.test(normalized)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  let parsed: bigint;
  try {
    parsed = BigInt(normalized);
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  if (parsed < 0n) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

function parseNonNegativeSafeInteger(value: string, label: string): number {
  const parsed = parseUnsignedInteger(value, label);
  const number = Number(parsed);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return number;
}

function parseLogIndex(value: string): number {
  const normalized = value.trim();
  return normalized === '0x' || normalized === '0X'
    ? 0
    : parseNonNegativeSafeInteger(normalized, 'log index');
}

function parseUint256HexWord(value: string, label: string): bigint {
  const normalized = value.trim();
  if (!HEX_WORD_PATTERN.test(normalized)) {
    throw new Error(`Invalid ${label}: expected a 32-byte hexadecimal word.`);
  }

  const parsed = BigInt(normalized);
  if (parsed > MAX_UINT256) {
    throw new Error(`Invalid ${label}: value exceeds uint256.`);
  }

  return parsed;
}

function normalizeTransactionHash(value: string): TransactionHash {
  const normalized = value.toLowerCase();
  if (!isTransactionHash(normalized)) {
    throw new Error(`Invalid transaction hash: ${value}`);
  }

  return normalized;
}

function zeroAddressTopic(zeroAddress: HexAddress): string {
  return `0x${zeroAddress.slice(2).padStart(64, '0')}`;
}

function validateAddress(address: string, label: string): void {
  if (!ADDRESS_PATTERN.test(address)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function validateSafeInteger(
  value: number,
  label: string,
  minimum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function validateRequestPolicy(policy: EtherscanRequestPolicy): void {
  validateSafeInteger(policy.maxAttempts, 'Etherscan max attempts', 1);
  validateSafeInteger(
    policy.maxRetryDelayMs,
    'Etherscan maximum retry delay',
    0,
  );
  validateSafeInteger(
    policy.minimumRequestIntervalMs,
    'Etherscan minimum request interval',
    0,
  );
  validateSafeInteger(policy.requestTimeoutMs, 'Etherscan request timeout', 1);
  validateSafeInteger(policy.retryBaseDelayMs, 'Etherscan retry base delay', 0);

  if (policy.retryBaseDelayMs > policy.maxRetryDelayMs) {
    throw new Error(
      'Etherscan retry base delay cannot exceed the maximum retry delay.',
    );
  }
}

function validateProviderOptions(options: EtherscanBurnProviderOptions): void {
  if (options.fetch !== undefined && typeof options.fetch !== 'function') {
    throw new Error('Etherscan fetch must be a function when provided.');
  }

  if (options.sleep !== undefined && typeof options.sleep !== 'function') {
    throw new Error('Etherscan sleep must be a function when provided.');
  }

  if (options.random !== undefined && typeof options.random !== 'function') {
    throw new Error('Etherscan random must be a function when provided.');
  }

  if (options.now !== undefined && typeof options.now !== 'function') {
    throw new Error('Etherscan now must be a function when provided.');
  }

  if (
    typeof options.apiKey !== 'string' ||
    options.apiKey.trim().length === 0
  ) {
    throw new Error(
      'No Etherscan API key is configured. Set ETHERSCAN_API_KEY.',
    );
  }

  if (typeof options.apiBaseUrl !== 'string') {
    throw new Error('Invalid Etherscan API base URL.');
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(options.apiBaseUrl);
  } catch {
    throw new Error('Invalid Etherscan API base URL.');
  }

  if (
    apiUrl.protocol !== 'https:' ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.searchParams.has('apikey')
  ) {
    throw new Error('Invalid Etherscan API base URL configuration.');
  }

  validateAddress(options.contractAddress, 'AJNA contract address');
  validateAddress(options.zeroAddress, 'burn recipient address');
  if (!/^0x0{40}$/i.test(options.zeroAddress)) {
    throw new Error('The burn recipient address must be the zero address.');
  }

  validateSafeInteger(options.chainId, 'Etherscan chain id', 1);
  validateSafeInteger(
    options.confirmationBlocks,
    'Etherscan confirmation blocks',
    0,
  );
  validateSafeInteger(
    options.historyStartBlock,
    'Etherscan history start block',
    0,
  );
  validateSafeInteger(
    options.maxBlockRange,
    'Etherscan maximum block range',
    1,
  );
  validateSafeInteger(
    options.maxPagesPerRange,
    'Etherscan maximum pages per range',
    1,
  );
  validateSafeInteger(options.pageSize, 'Etherscan page size', 1);
  if (options.pageSize > 1_000) {
    throw new Error('Etherscan page size cannot exceed 1000 records.');
  }
  validateRequestPolicy(options.requestPolicy);
}

function isTransientEtherscanMessage(message: string): boolean {
  return /rate\s*limit|too many requests|throttl|temporar|server busy|query timeout|timeout occurred|try again/i.test(
    message,
  );
}

function isRangeTimeoutMessage(message: string): boolean {
  return /query timeout|select a smaller (?:result dataset|block range)/i.test(
    message,
  );
}

function responseErrorMessage(payload: UnknownRecord): string | undefined {
  if (typeof payload.status === 'string' && payload.status !== '1') {
    const message = typeof payload.message === 'string' ? payload.message : '';
    const result = typeof payload.result === 'string' ? payload.result : '';
    return [message, result].filter(Boolean).join(': ');
  }

  if (isRecord(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message;
  }

  return undefined;
}

function createResponseError(
  payload: UnknownRecord,
): EtherscanRequestError | null {
  const message = responseErrorMessage(payload);
  if (!message) {
    return null;
  }

  return new EtherscanRequestError(
    `Etherscan API request failed: ${message}`,
    isTransientEtherscanMessage(message),
    undefined,
    isRangeTimeoutMessage(message),
  );
}

function parseEtherscanLogEntity(
  value: unknown,
  options: EtherscanBurnLogParsingOptions,
): BurnLogRecord {
  if (!isRecord(value)) {
    throw new Error('Invalid Etherscan burn transfer record.');
  }

  const transactionHash = normalizeTransactionHash(
    readRequiredString(value.transactionHash, 'transaction hash'),
  );
  const address = readRequiredString(
    value.address,
    'burn transfer address',
    transactionHash,
  );
  const blockNumber = readRequiredString(
    value.blockNumber,
    'block number',
    transactionHash,
  );
  const timeStamp = readRequiredString(
    value.timeStamp,
    'timestamp',
    transactionHash,
  );
  const data = readRequiredString(
    value.data,
    'transfer amount',
    transactionHash,
  );
  const logIndex = readRequiredString(
    value.logIndex,
    'log index',
    transactionHash,
  );

  if (address.toLowerCase() !== options.contractAddress.toLowerCase()) {
    throw new Error(`Unexpected burn transfer contract address: ${address}`);
  }

  if (!Array.isArray(value.topics) || value.topics.length < 3) {
    throw new Error('Missing transfer topics.');
  }

  const topic0 = readRequiredString(
    value.topics[0],
    'transfer topic 0',
    transactionHash,
  );
  const topic1 = readRequiredString(
    value.topics[1],
    'transfer topic 1',
    transactionHash,
  );
  const topic2 = readRequiredString(
    value.topics[2],
    'transfer topic 2',
    transactionHash,
  );
  if (topic0.toLowerCase() !== TRANSFER_EVENT_TOPIC0) {
    throw new Error(`Unexpected transfer topic0 for ${transactionHash}`);
  }

  if (!HEX_WORD_PATTERN.test(topic1) || !HEX_WORD_PATTERN.test(topic2)) {
    throw new Error(`Invalid transfer address topic for ${transactionHash}`);
  }

  if (topic2.toLowerCase() !== zeroAddressTopic(options.zeroAddress)) {
    throw new Error(`Unexpected transfer recipient for ${transactionHash}`);
  }

  const parsedBlockNumber = parseNonNegativeSafeInteger(
    blockNumber,
    'block number',
  );
  if (
    (options.minimumBlock !== undefined &&
      parsedBlockNumber < options.minimumBlock) ||
    (options.maximumBlock !== undefined &&
      parsedBlockNumber > options.maximumBlock)
  ) {
    throw new Error(
      `Burn transfer block ${parsedBlockNumber} is outside the requested range.`,
    );
  }

  const amountBurnedRaw = parseUint256HexWord(data, 'transfer amount');
  if (amountBurnedRaw === 0n) {
    throw new Error(
      `Zero-value burn transfer is not indexable: ${transactionHash}`,
    );
  }

  return {
    amountBurnedRaw,
    blockNumber: parsedBlockNumber,
    logIndex: parseLogIndex(logIndex),
    timestamp: parseNonNegativeSafeInteger(timeStamp, 'timestamp'),
    transactionHash,
  };
}

/**
 * Parses native Etherscan records into the source-neutral provider contract.
 * Deduplication and cumulative arithmetic intentionally remain in the pure
 * snapshot formatter.
 */
export function parseEtherscanBurnLogs(
  records: readonly unknown[],
  options: EtherscanBurnLogParsingOptions,
): BurnLogRecord[] {
  validateAddress(options.contractAddress, 'AJNA contract address');
  validateAddress(options.zeroAddress, 'burn recipient address');
  if (!/^0x0{40}$/i.test(options.zeroAddress)) {
    throw new Error('The burn recipient address must be the zero address.');
  }

  if (
    options.minimumBlock !== undefined &&
    options.maximumBlock !== undefined &&
    options.minimumBlock > options.maximumBlock
  ) {
    throw new Error('Invalid Etherscan burn log block range.');
  }

  return records.map((record) => parseEtherscanLogEntity(record, options));
}

function parseHeadBlockResponse(payload: unknown): number {
  if (!isRecord(payload)) {
    throw new Error(
      'The Etherscan proxy response did not include a head block number.',
    );
  }

  const apiError = createResponseError(payload);
  if (apiError) {
    throw apiError;
  }

  if (typeof payload.result !== 'string') {
    throw new Error(
      'The Etherscan proxy response did not include a head block number.',
    );
  }

  return parseNonNegativeSafeInteger(payload.result, 'head block number');
}

function parseBurnLogPageResponse(payload: unknown): unknown[] {
  if (!isRecord(payload)) {
    throw new Error('Unexpected Etherscan logs response.');
  }

  const status = typeof payload.status === 'string' ? payload.status : '';
  const message = typeof payload.message === 'string' ? payload.message : '';
  const result = payload.result;

  if (status === '1' && Array.isArray(result)) {
    return result;
  }

  if (status === '0' && /no (?:records|transactions) found/i.test(message)) {
    return [];
  }

  const apiError = createResponseError(payload);
  if (apiError) {
    throw apiError;
  }

  throw new Error('Unexpected Etherscan logs response.');
}

function parseTotalSupplyResponse(payload: unknown): bigint {
  if (!isRecord(payload)) {
    throw new Error('The Etherscan totalSupply response was invalid.');
  }

  const apiError = createResponseError(payload);
  if (apiError) {
    throw apiError;
  }

  if (typeof payload.result !== 'string') {
    throw new Error('The Etherscan totalSupply response was invalid.');
  }

  return parseUint256HexWord(payload.result, 'totalSupply result');
}

function pageFingerprint(records: readonly unknown[]): string {
  try {
    return JSON.stringify(records);
  } catch {
    throw new Error('Etherscan returned a non-serializable page payload.');
  }
}

function parseRetryAfterMilliseconds(
  response: EtherscanFetchResponse,
  now: () => number,
): number | undefined {
  const value = response.headers?.get('retry-after')?.trim();
  if (!value) {
    return undefined;
  }

  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    const milliseconds = seconds * 1_000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, date - now());
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class EtherscanBurnProvider implements BurnLogProvider {
  private readonly options: NormalizedEtherscanBurnProviderOptions;

  public constructor(options: EtherscanBurnProviderOptions) {
    validateProviderOptions(options);
    this.options = {
      ...options,
      apiBaseUrl: options.apiBaseUrl.trim(),
      apiKey: options.apiKey.trim(),
      fetch: options.fetch ?? defaultFetch,
      now: options.now ?? Date.now,
      random: options.random ?? Math.random,
      requestPolicy: { ...options.requestPolicy },
      sleep: options.sleep ?? defaultSleep,
    };
  }

  public async fetchRawLogs(): Promise<RawBurnLogs> {
    const headBlock = await this.fetchHeadBlockNumber();
    if (headBlock < this.options.confirmationBlocks) {
      throw new Error(
        `Etherscan head block ${headBlock} is below the configured confirmation depth.`,
      );
    }

    const indexedThroughBlock = headBlock - this.options.confirmationBlocks;
    if (indexedThroughBlock < this.options.historyStartBlock) {
      throw new Error(
        `Finalized Etherscan head block ${indexedThroughBlock} precedes history start block ${this.options.historyStartBlock}.`,
      );
    }

    const records = await this.fetchAllBurnTransferRecords(indexedThroughBlock);
    const logs = parseEtherscanBurnLogs(records, {
      contractAddress: this.options.contractAddress,
      maximumBlock: indexedThroughBlock,
      minimumBlock: this.options.historyStartBlock,
      zeroAddress: this.options.zeroAddress,
    });
    const currentTotalSupplyRaw =
      await this.fetchTotalSupply(indexedThroughBlock);

    return {
      currentTotalSupplyRaw,
      executionId: `etherscan:${this.options.chainId}:${indexedThroughBlock}`,
      headBlock,
      indexedThroughBlock,
      logs,
      source: 'etherscan',
    };
  }

  private buildUrl(params: Record<string, string | number>): string {
    const url = new URL(this.options.apiBaseUrl);
    url.searchParams.set('chainid', String(this.options.chainId));
    url.searchParams.set('apikey', this.options.apiKey);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }

  private buildBurnTransferUrl(
    fromBlock: number,
    toBlock: number,
    page: number,
  ): string {
    return this.buildUrl({
      action: 'getLogs',
      address: this.options.contractAddress,
      fromBlock,
      module: 'logs',
      offset: this.options.pageSize,
      page,
      topic0: TRANSFER_EVENT_TOPIC0,
      topic0_2_opr: 'and',
      topic2: zeroAddressTopic(this.options.zeroAddress),
      toBlock,
    });
  }

  private buildHeadBlockUrl(): string {
    return this.buildUrl({
      action: 'eth_blockNumber',
      module: 'proxy',
    });
  }

  private buildTotalSupplyUrl(blockNumber: number): string {
    return this.buildUrl({
      action: 'eth_call',
      data: TOTAL_SUPPLY_SELECTOR,
      module: 'proxy',
      tag: `0x${blockNumber.toString(16)}`,
      to: this.options.contractAddress,
    });
  }

  private async fetchAllBurnTransferRecords(
    indexedThroughBlock: number,
  ): Promise<unknown[]> {
    const records: unknown[] = [];
    let fromBlock = this.options.historyStartBlock;

    while (fromBlock <= indexedThroughBlock) {
      const toBlock = Math.min(
        indexedThroughBlock,
        fromBlock + this.options.maxBlockRange - 1,
      );
      records.push(...(await this.fetchBurnTransferRange(fromBlock, toBlock)));
      fromBlock = toBlock + 1;
    }

    return records;
  }

  private async fetchBurnTransferRange(
    fromBlock: number,
    toBlock: number,
  ): Promise<unknown[]> {
    try {
      return await this.fetchBurnTransferPages(fromBlock, toBlock);
    } catch (error) {
      if (
        error instanceof EtherscanRequestError &&
        error.shouldSplitRange &&
        fromBlock < toBlock
      ) {
        const midpoint = fromBlock + Math.floor((toBlock - fromBlock) / 2);
        const lowerRange = await this.fetchBurnTransferRange(
          fromBlock,
          midpoint,
        );
        const upperRange = await this.fetchBurnTransferRange(
          midpoint + 1,
          toBlock,
        );
        return [...lowerRange, ...upperRange];
      }

      throw error;
    }
  }

  private async fetchBurnTransferPages(
    fromBlock: number,
    toBlock: number,
  ): Promise<unknown[]> {
    const records: unknown[] = [];
    const seenPageFingerprints = new Set<string>();

    for (let page = 1; page <= this.options.maxPagesPerRange; page += 1) {
      const currentPage = await this.fetchBurnTransferPage(
        fromBlock,
        toBlock,
        page,
      );

      if (currentPage.length === 0) {
        return records;
      }

      if (currentPage.length > this.options.pageSize) {
        throw new Error(
          `Etherscan returned ${currentPage.length} records for a page limited to ${this.options.pageSize}.`,
        );
      }

      const currentPageFingerprint = pageFingerprint(currentPage);
      if (seenPageFingerprints.has(currentPageFingerprint)) {
        throw new Error(
          `Etherscan pagination repeated a page for blocks ${fromBlock}-${toBlock}.`,
        );
      }
      seenPageFingerprints.add(currentPageFingerprint);

      records.push(...currentPage);
    }

    throw new EtherscanRequestError(
      `Etherscan pagination exceeded ${this.options.maxPagesPerRange} pages for blocks ${fromBlock}-${toBlock}.`,
      false,
      undefined,
      true,
    );
  }

  private async fetchBurnTransferPage(
    fromBlock: number,
    toBlock: number,
    page: number,
  ): Promise<unknown[]> {
    return this.request(
      `burn-log page ${page} for blocks ${fromBlock}-${toBlock}`,
      this.buildBurnTransferUrl(fromBlock, toBlock, page),
      parseBurnLogPageResponse,
    );
  }

  private async fetchHeadBlockNumber(): Promise<number> {
    return this.request(
      'head block request',
      this.buildHeadBlockUrl(),
      parseHeadBlockResponse,
    );
  }

  private async fetchTotalSupply(blockNumber: number): Promise<bigint> {
    return this.request(
      `totalSupply request at block ${blockNumber}`,
      this.buildTotalSupplyUrl(blockNumber),
      parseTotalSupplyResponse,
    );
  }

  private async request<TResult>(
    operation: string,
    url: string,
    parse: (payload: unknown) => TResult,
  ): Promise<TResult> {
    for (
      let attempt = 1;
      attempt <= this.options.requestPolicy.maxAttempts;
      attempt += 1
    ) {
      try {
        await this.waitForRequestSlot();
        return parse(await this.requestJsonOnce(url));
      } catch (error) {
        if (!(error instanceof EtherscanRequestError)) {
          throw error;
        }

        if (
          !error.retryable ||
          attempt === this.options.requestPolicy.maxAttempts
        ) {
          throw new EtherscanRequestError(
            `${operation} failed after ${attempt} attempt${attempt === 1 ? '' : 's'}: ${error.message}`,
            false,
            error.retryAfterMs,
            error.shouldSplitRange,
          );
        }

        await this.options.sleep(this.retryDelayMilliseconds(error, attempt));
      }
    }

    throw new Error(`Etherscan ${operation} exhausted its retry loop.`);
  }

  private async requestJsonOnce(url: string): Promise<unknown> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const request = (async (): Promise<unknown> => {
      let response: EtherscanFetchResponse;
      try {
        response = await this.options.fetch(url, {
          headers: { accept: 'application/json' },
          method: 'GET',
          redirect: 'error',
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof EtherscanRequestError) {
          throw error;
        }

        if (controller.signal.aborted) {
          throw new EtherscanRequestError(
            `Etherscan request timed out after ${this.options.requestPolicy.requestTimeoutMs}ms.`,
            true,
          );
        }

        throw new EtherscanRequestError(
          'Etherscan network request failed.',
          true,
        );
      }

      try {
        if (!response.ok) {
          throw new EtherscanRequestError(
            `Etherscan request returned HTTP ${response.status}.`,
            isRetryableHttpStatus(response.status),
            parseRetryAfterMilliseconds(response, this.options.now),
          );
        }

        return await response.json();
      } catch (error) {
        if (error instanceof EtherscanRequestError) {
          throw error;
        }

        if (controller.signal.aborted) {
          throw new EtherscanRequestError(
            `Etherscan request timed out after ${this.options.requestPolicy.requestTimeoutMs}ms.`,
            true,
          );
        }

        throw new EtherscanRequestError(
          'Etherscan returned an invalid JSON response.',
          false,
        );
      }
    })();

    const timeoutRequest = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(
          new EtherscanRequestError(
            `Etherscan request timed out after ${this.options.requestPolicy.requestTimeoutMs}ms.`,
            true,
          ),
        );
      }, this.options.requestPolicy.requestTimeoutMs);
    });

    try {
      return await Promise.race([request, timeoutRequest]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  private retryDelayMilliseconds(
    error: EtherscanRequestError,
    failedAttempt: number,
  ): number {
    const exponentialDelay = Math.min(
      this.options.requestPolicy.maxRetryDelayMs,
      this.options.requestPolicy.retryBaseDelayMs * 2 ** (failedAttempt - 1),
    );
    const randomValue = this.options.random();
    const random = Number.isFinite(randomValue)
      ? Math.min(1, Math.max(0, randomValue))
      : 0;
    const jitteredDelay = Math.min(
      this.options.requestPolicy.maxRetryDelayMs,
      exponentialDelay + Math.floor(exponentialDelay * random * 0.2),
    );
    const retryAfterMs = error.retryAfterMs ?? 0;

    return Math.min(
      this.options.requestPolicy.maxRetryDelayMs,
      Math.max(jitteredDelay, retryAfterMs),
    );
  }

  private async waitForRequestSlot(): Promise<void> {
    if (this.options.requestPolicy.minimumRequestIntervalMs > 0) {
      await this.options.sleep(
        this.options.requestPolicy.minimumRequestIntervalMs,
      );
    }
  }
}
